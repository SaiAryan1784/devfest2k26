import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * "I'm excited" counter for the floating heart button, shared across every
 * visitor. Backed by Upstash Redis (`Redis.fromEnv()` reads the standard
 * `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` env vars that Vercel's
 * "Upstash for Redis" Marketplace integration injects once attached to this
 * project; nothing else changes when that happens). `@vercel/kv` is
 * deprecated upstream in favour of this package, so it is used directly.
 *
 * The in-memory fallback below is a **local-dev convenience only**: on
 * Vercel each serverless instance gets its own copy of `memCount`, so under
 * real concurrent traffic different requests can see different, silently
 * diverging counts. It is not a correct permanent behaviour, only a way for
 * `npm run dev` (and a preview before Upstash is attached) to work at all.
 */
const KEY = "devfest:excited";
const BASE = 0;
let memCount = BASE;

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;

export async function GET() {
  const count = redis ? ((await redis.get<number>(KEY)) ?? BASE) : memCount;
  return NextResponse.json({ count });
}

export async function POST(req: Request) {
  const { liked } = (await req.json()) as { liked: boolean };
  const count = redis ? await redis[liked ? "incr" : "decr"](KEY) : (memCount += liked ? 1 : -1);
  return NextResponse.json({ count });
}
