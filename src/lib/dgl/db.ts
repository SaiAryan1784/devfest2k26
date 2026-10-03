import { neon } from "@neondatabase/serverless";
import { SCHEMA } from "./schema";

/** The one database surface DGL code uses: parameterised text in, rows out. */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** Neon over HTTP, or null when DATABASE_URL is not set. */
export function neonDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const sql = neon(url);
  return {
    query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) =>
      (await sql.query(text, params)) as unknown as T[],
  };
}

const ready = new WeakMap<Db, Promise<void>>();

/**
 * Creates the tables on first use. Memoised per Db instance; a failed attempt
 * is forgotten so the next call retries.
 */
export function ensureSchema(db: Db): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = (async () => {
      for (const statement of SCHEMA) await db.query(statement);
    })().catch((err) => {
      ready.delete(db);
      throw err;
    });
    ready.set(db, p);
  }
  return p;
}
