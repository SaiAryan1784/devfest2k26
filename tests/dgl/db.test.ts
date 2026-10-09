import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ensureSchema, neonDb, type Db } from "@/lib/dgl/db";
import { SCHEMA, SCHEMA_OBJECTS, SCHEMA_PROBE } from "@/lib/dgl/schema";

afterEach(() => vi.unstubAllEnvs());

test("neonDb returns the same instance for the same URL", () => {
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost/db");
  const a = neonDb();
  expect(a).not.toBeNull();
  expect(neonDb()).toBe(a);
});

test("neonDb returns a fresh instance when the URL changes", () => {
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost/db");
  const a = neonDb();
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost/other");
  const b = neonDb();
  expect(b).not.toBeNull();
  expect(b).not.toBe(a);
});

test("neonDb returns null when DATABASE_URL is unset or empty", () => {
  vi.stubEnv("DATABASE_URL", "");
  expect(neonDb()).toBeNull();
  vi.stubEnv("DATABASE_URL", undefined);
  expect(neonDb()).toBeNull();
});

describe("ensureSchema", () => {
  /** A raw PGlite with no schema, and a Db wrapper over it that records every statement. */
  function counting(pg: PGlite) {
    const seen: string[] = [];
    const db: Db = {
      query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
        seen.push(text);
        return (await pg.query(text, params)).rows as T[];
      },
    };
    return { db, seen };
  }
  /** Every schema statement: the CREATEs, the dgl_show seed row, the ALTERs and the role UPDATE. */
  const isDdl = (s: string) => /^\s*(CREATE|INSERT|ALTER|UPDATE)\b/i.test(s);
  const probe = async (pg: PGlite) => (await pg.query<{ ok: boolean | null }>(SCHEMA_PROBE)).rows[0].ok;

  test("a fresh database runs the DDL once, and a second call on the same Db does nothing", async () => {
    const pg = new PGlite();
    const { db, seen } = counting(pg);
    await ensureSchema(db);
    expect(seen.filter(isDdl)).toHaveLength(SCHEMA.length);
    const after = seen.length;
    await ensureSchema(db);
    expect(seen).toHaveLength(after);
    await pg.close();
  });

  test("a NEW Db over a ready database runs exactly one query (the probe) and no DDL", async () => {
    const pg = new PGlite();
    await ensureSchema(counting(pg).db);
    const { db, seen } = counting(pg);
    await ensureSchema(db);
    expect(seen).toHaveLength(1);
    expect(seen.filter(isDdl)).toHaveLength(0);
    expect(seen[0]).toMatch(/to_regclass/);
    await pg.close();
  });

  test("a database missing only the votes index is repaired", async () => {
    const pg = new PGlite();
    await ensureSchema(counting(pg).db);
    const index = SCHEMA_OBJECTS.find((n) => n.endsWith("_idx"));
    expect(index).toBeDefined();
    await pg.query(`DROP INDEX ${index}`);
    const { db, seen } = counting(pg);
    await ensureSchema(db);
    expect(seen.filter(isDdl).length).toBeGreaterThan(0);
    const [r] = (await pg.query<{ ok: boolean }>(`SELECT to_regclass('public.${index}') IS NOT NULL AS ok`)).rows;
    expect(r.ok).toBe(true);
    await pg.close();
  });

  test("the probe names every table and index the DDL creates, and nothing else", () => {
    const created = SCHEMA.flatMap((s) => [...s.matchAll(/CREATE (?:TABLE|INDEX) IF NOT EXISTS (\w+)/g)].map((m) => m[1]));
    expect([...SCHEMA_OBJECTS].sort()).toEqual([...created].sort());
    expect(created).toContain("dgl_votes_ip_idx");
    expect(created).toHaveLength(10);
  });

  test("every schema statement is counted as DDL by these tests", () => {
    expect(SCHEMA.every(isDdl)).toBe(true);
  });

  test("the probe reads only the catalog, so it runs on an empty database", async () => {
    // Never FROM a DGL table: a table that does not exist yet would make the probe itself fail.
    expect(SCHEMA_PROBE).not.toMatch(/\b(FROM|JOIN)\s+dgl_/i);
    const pg = new PGlite();
    expect(await probe(pg)).toBe(false);
    await pg.close();
  });

  test("the probe sees each new column and the nullable contestant_id, and a database missing one is repaired", async () => {
    const breakers = [
      "ALTER TABLE dgl_performances DROP COLUMN contestant_name",
      "ALTER TABLE dgl_performances DROP COLUMN spun_at",
      "ALTER TABLE dgl_performances DROP COLUMN track",
      "ALTER TABLE dgl_admins DROP COLUMN track",
      // No row has a null contestant_id yet, so the old constraint can come back.
      "ALTER TABLE dgl_performances ALTER COLUMN contestant_id SET NOT NULL",
    ];
    for (const breaker of breakers) {
      const pg = new PGlite();
      await ensureSchema(counting(pg).db);
      expect(await probe(pg)).toBe(true);
      await pg.query(breaker);
      expect(await probe(pg), breaker).toBe(false);
      const { db, seen } = counting(pg);
      await ensureSchema(db);
      expect(seen.filter(isDdl).length, breaker).toBe(SCHEMA.length);
      expect(await probe(pg), breaker).toBe(true);
      await pg.close();
    }
  }, 30_000);

  test("the role update runs last, after every object it could depend on", () => {
    expect(SCHEMA.at(-1)).toMatch(/^UPDATE dgl_admins SET role = 'HOST' WHERE role IN \('OPERATOR', 'VOLUNTEER'\)$/);
    expect(SCHEMA.filter((x) => /^\s*UPDATE\b/i.test(x))).toHaveLength(1);
  });

  test("a failed attempt is forgotten so the next call retries", async () => {
    const pg = new PGlite();
    let fail = true;
    const db: Db = {
      query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
        if (fail) throw new Error("down");
        return (await pg.query(text, params)).rows as T[];
      },
    };
    await expect(ensureSchema(db)).rejects.toThrow("down");
    fail = false;
    await expect(ensureSchema(db)).resolves.toBeUndefined();
    await pg.close();
  });
});
