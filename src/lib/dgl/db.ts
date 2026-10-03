import { neon } from "@neondatabase/serverless";
import { SCHEMA, SCHEMA_PROBE } from "./schema";

/** The one database surface DGL code uses: parameterised text in, rows out. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

let cached: { url: string; db: Db } | null = null;

/**
 * Neon over HTTP, or null when DATABASE_URL is not set. The instance is cached
 * at module scope per URL, so handlers can call this on every request and
 * `ensureSchema`'s per-Db memo still hits instead of re-running the DDL.
 */
export function neonDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (cached?.url === url) return cached.db;
  const sql = neon(url);
  const db: Db = {
    query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) =>
      (await sql.query(text, params)) as unknown as T[],
  };
  cached = { url, db };
  return db;
}

const ready = new WeakMap<Db, Promise<void>>();

/**
 * Creates the tables on first use. One lock-free probe first (SCHEMA_PROBE):
 * when every table and index already exists, as on every cold instance once
 * the show is set up, that one read is all it costs, and no DDL lock queues
 * behind vote inserts while a burst scales out new instances. Otherwise the
 * DDL runs in order (each statement is idempotent, so a partial schema is
 * repaired). Memoised per Db instance; a failed attempt is forgotten so the
 * next call retries.
 */
export function ensureSchema(db: Db): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = (async () => {
      const [probe] = await db.query<{ ok: boolean | null }>(SCHEMA_PROBE);
      if (probe?.ok === true) return;
      for (const statement of SCHEMA) await db.query(statement);
    })().catch((err) => {
      ready.delete(db);
      throw err;
    });
    ready.set(db, p);
  }
  return p;
}
