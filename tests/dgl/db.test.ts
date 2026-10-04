import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ensureSchema, neonDb, type Db } from "@/lib/dgl/db";
import { SCHEMA, SCHEMA_OBJECTS } from "@/lib/dgl/schema";

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
  const isDdl = (s: string) => /^\s*(CREATE|INSERT)\b/i.test(s);

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
    expect(created).toHaveLength(8);
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
