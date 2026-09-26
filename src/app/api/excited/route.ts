import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

/**
 * The rocket counter: one row per anonymous visitor who has launched.
 *
 * A launch is one-way (the button can't be un-pressed), so the only write is
 * an insert keyed on the visitor id: launching twice from one browser adds
 * nothing, and the count, `count(*)`, can only ever grow and never go
 * negative.
 *
 * Backed by Neon Postgres via DATABASE_URL (in `.env` locally; it must also be
 * set in the Vercel project's environment variables for production). The
 * table creates itself on first use. Without DATABASE_URL the route falls
 * back to an in-memory set, a LOCAL-DEV convenience only: on Vercel each
 * serverless instance would get its own copy and lose it on every cold start.
 */
const ID = /^[a-zA-Z0-9-]{8,64}$/;

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
const mem = new Set<string>();

let ready: Promise<unknown> | null = null;
function ensureTable() {
  if (!sql) return Promise.resolve();
  ready ??= sql`
    CREATE TABLE IF NOT EXISTS devfest_rockets (
      visitor_id  text PRIMARY KEY,
      launched_at timestamptz NOT NULL DEFAULT now()
    )`.catch((err) => {
    ready = null; // let the next request retry
    throw err;
  });
  return ready;
}

async function read(id: string | null) {
  if (!sql) return { count: mem.size, launched: id ? mem.has(id) : false };
  await ensureTable();
  const [row] = await sql`
    SELECT
      (SELECT count(*)::int FROM devfest_rockets) AS count,
      EXISTS (SELECT 1 FROM devfest_rockets WHERE visitor_id = ${id ?? ""}) AS launched`;
  return { count: row.count as number, launched: row.launched as boolean };
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("id");
  try {
    return NextResponse.json(await read(raw && ID.test(raw) ? raw : null));
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!ID.test(id)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    if (sql) {
      await ensureTable();
      await sql`INSERT INTO devfest_rockets (visitor_id) VALUES (${id}) ON CONFLICT (visitor_id) DO NOTHING`;
    } else {
      mem.add(id);
    }
    return NextResponse.json(await read(id));
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
