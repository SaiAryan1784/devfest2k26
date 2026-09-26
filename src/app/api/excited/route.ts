import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * "I'm excited" counter for the floating button, shared across every visitor.
 *
 * Stored as a *set of anonymous visitor ids*, not a number. The count is the
 * set's size, so it is idempotent by construction: liking twice from the same
 * browser adds nothing, un-liking something never liked removes nothing, and
 * the count can never go below zero. (The previous design was a bare counter
 * the client told to `incr`/`decr`; a client whose own liked state drifted
 * out of sync decremented it forever, which is how it went negative.)
 *
 * Backed by Upstash Redis (`Redis.fromEnv()` reads UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN, injected by Vercel's "Upstash for Redis"
 * Marketplace integration). Without those env vars it falls back to an
 * in-memory set, which is a LOCAL-DEV convenience only: on Vercel each
 * serverless instance gets its own copy and loses it on every cold start.
 */
const KEY = "devfest:excited:visitors";
const ID = /^[a-zA-Z0-9-]{8,64}$/;

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
const mem = new Set<string>();

async function count() {
  return redis ? await redis.scard(KEY) : mem.size;
}

async function has(id: string) {
  return redis ? (await redis.sismember(KEY, id)) === 1 : mem.has(id);
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const liked = id && ID.test(id) ? await has(id) : false;
  return NextResponse.json({ count: await count(), liked });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown; liked?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!ID.test(id) || typeof body?.liked !== "boolean") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (body.liked) {
    if (redis) await redis.sadd(KEY, id);
    else mem.add(id);
  } else if (redis) {
    await redis.srem(KEY, id);
  } else {
    mem.delete(id);
  }
  return NextResponse.json({ count: await count(), liked: body.liked });
}
