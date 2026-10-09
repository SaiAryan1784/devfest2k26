import { PGlite } from "@electric-sql/pglite";
import { afterEach, expect, test } from "vitest";
import { hashPasscode, login } from "@/lib/dgl/auth";
import { ensureSchema, type Db } from "@/lib/dgl/db";
import { SCHEMA } from "@/lib/dgl/schema";
import { readAdminState, readPublicState } from "@/lib/dgl/show";
import { SCHEMA_V1 } from "./fixtures/schema-v1";

const T0 = Date.parse("2026-10-08T12:00:00Z");

let pg: PGlite | null = null;
afterEach(async () => {
  await pg?.close();
  pg = null;
});

/** A Db wrapper over one PGlite that records every statement it runs. */
function counting(base: PGlite) {
  const seen: string[] = [];
  const db: Db = {
    query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
      seen.push(text);
      return (await base.query(text, params)).rows as T[];
    },
  };
  return { db, seen };
}

test("today's schema starts with the shipped statements, unchanged", () => {
  // Old and fresh databases take one path: the shipped CREATEs, then the additive steps.
  expect(SCHEMA.slice(0, SCHEMA_V1.length)).toEqual([...SCHEMA_V1]);
  expect(SCHEMA.length).toBeGreaterThan(SCHEMA_V1.length);
});

test("migrates the shipped schema in place", async () => {
  const old = new PGlite();
  pg = old;
  for (const statement of SCHEMA_V1) await old.query(statement);

  // The deployed data: an admin of each shipped role, a contestant, a performance with a contestant id and a vote, and the show row pointing at it.
  const pass = await hashPasscode("legacy passcode");
  const admins: Record<string, string> = {};
  for (const role of ["SUPER_ADMIN", "OPERATOR", "VOLUNTEER"]) {
    const [r] = (await old.query<{ id: string }>(
      "INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ($1, $2, $3) RETURNING id",
      [`Legacy ${role}`, role, pass],
    )).rows;
    admins[role] = r.id;
  }
  const [{ id: contestant }] = (await old.query<{ id: string }>(
    "INSERT INTO dgl_contestants (name, sort) VALUES ('Riya Sharma', 1) RETURNING id",
  )).rows;
  const [{ id: performance }] = (await old.query<{ id: string }>(
    `INSERT INTO dgl_performances (contestant_id, prompt, status, self_score, created_at)
     VALUES ($1, 'Sell us a deprecated API', 'VOTING_CLOSED', 7, to_timestamp($2::float8 / 1000.0)) RETURNING id`,
    [contestant, T0],
  )).rows;
  await old.query(
    `INSERT INTO dgl_votes (performance_id, voter_id, score, ip_hash, source, flagged, created_at)
     VALUES ($1, 'voter-1', 8, 'ip', 'web', false, to_timestamp($2::float8 / 1000.0))`,
    [performance, T0],
  );
  await old.query("UPDATE dgl_show SET current_performance_id = $1, version = 41 WHERE id = 1", [performance]);

  // The first request after the deploy: the probe fails, so the whole schema runs over the old database.
  const first = counting(old);
  await ensureSchema(first.db);
  expect(first.seen.slice(1)).toEqual(SCHEMA);

  // The new columns exist, and contestant_id may now be null.
  const columns = (await old.query<{ column_name: string; is_nullable: string; data_type: string }>(
    `SELECT column_name, is_nullable, data_type FROM information_schema.columns
     WHERE table_name = 'dgl_performances' AND column_name IN ('contestant_id', 'contestant_name', 'spun_at')
     ORDER BY column_name`,
  )).rows;
  expect(columns).toEqual([
    { column_name: "contestant_id", is_nullable: "YES", data_type: "uuid" },
    { column_name: "contestant_name", is_nullable: "YES", data_type: "text" },
    { column_name: "spun_at", is_nullable: "YES", data_type: "timestamp with time zone" },
  ]);

  // OPERATOR and VOLUNTEER are HOST now; SUPER_ADMIN is unchanged.
  const roles = (await old.query<{ id: string; role: string }>("SELECT id, role FROM dgl_admins ORDER BY name")).rows;
  expect(Object.fromEntries(roles.map((r) => [r.id, r.role]))).toEqual({
    [admins.SUPER_ADMIN]: "SUPER_ADMIN",
    [admins.OPERATOR]: "HOST",
    [admins.VOLUNTEER]: "HOST",
  });

  // The old rows are intact.
  expect((await old.query("SELECT id, name, sort, active FROM dgl_contestants")).rows).toEqual([
    { id: contestant, name: "Riya Sharma", sort: 1, active: true },
  ]);
  expect((await old.query("SELECT id, contestant_id, contestant_name, prompt, status, self_score, spun_at FROM dgl_performances")).rows).toEqual([
    {
      id: performance,
      contestant_id: contestant,
      contestant_name: null,
      prompt: "Sell us a deprecated API",
      status: "VOTING_CLOSED",
      self_score: 7,
      spun_at: null,
    },
  ]);
  expect((await old.query("SELECT performance_id, voter_id, score FROM dgl_votes")).rows).toEqual([
    { performance_id: performance, voter_id: "voter-1", score: 8 },
  ]);
  expect((await old.query("SELECT id, current_performance_id, version FROM dgl_show")).rows).toEqual([
    { id: 1, current_performance_id: performance, version: 41 },
  ]);

  // The next cold start: one lock-free probe and nothing else.
  const second = counting(old);
  await ensureSchema(second.db);
  expect(second.seen).toHaveLength(1);
  expect(second.seen[0]).toMatch(/to_regclass/);

  // A migrated HOST signs in, and the app reads the migrated database without an error.
  const signedIn = await login(second.db, "Legacy OPERATOR", "legacy passcode", T0);
  expect(signedIn).toEqual({ ok: true, admin: { id: admins.OPERATOR, name: "Legacy OPERATOR", role: "HOST", track: null } });
  expect(await login(second.db, "Legacy SUPER_ADMIN", "legacy passcode", T0)).toMatchObject({ ok: true, admin: { role: "SUPER_ADMIN" } });
  await expect(readPublicState(second.db, "build", T0)).resolves.toMatchObject({ phase: expect.any(String) });
  if (signedIn.ok) await expect(readAdminState(second.db, signedIn.admin, "build", T0)).resolves.toMatchObject({ me: { role: "HOST" } });
});

test("a database where the role update has not run yet still reads retired roles as HOST", async () => {
  // A deploy that stopped between the column changes and the role update: the probe is
  // true (it has no entry for the data step), so the update is not retried, and the
  // reads normalise the role instead.
  const base = new PGlite();
  pg = base;
  const { db } = counting(base);
  await ensureSchema(db);
  await base.query("INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ('Late operator', 'OPERATOR', $1)", [
    await hashPasscode("late passcode"),
  ]);
  const fresh = counting(base);
  await ensureSchema(fresh.db);
  expect(fresh.seen).toHaveLength(1);
  expect(await login(fresh.db, "Late operator", "late passcode", T0)).toMatchObject({ ok: true, admin: { role: "HOST" } });
});
