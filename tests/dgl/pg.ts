import { PGlite } from "@electric-sql/pglite";
import { ensureSchema, type Db } from "@/lib/dgl/db";

/** A fresh, isolated in-memory Postgres with the DGL schema applied. */
export async function createTestDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = {
    query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) =>
      (await pg.query(text, params)).rows as T[],
  };
  await ensureSchema(db);
  return db;
}
