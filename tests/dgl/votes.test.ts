import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/lib/dgl/db";
import { castVote } from "@/lib/dgl/votes";
import { createTestDb } from "./pg";

const T0 = Date.parse("2026-10-03T12:00:00Z");
const PERF = "11111111-1111-4111-8111-111111111111";
const CONTESTANT = "22222222-2222-4222-8222-222222222222";

let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  await db.query(
    "INSERT INTO dgl_contestants (id, name, sort) VALUES ($1, 'Test contestant', 1)",
    [CONTESTANT],
  );
  await db.query(
    "INSERT INTO dgl_performances (id, contestant_id, status, created_at) VALUES ($1, $2, 'VOTING', now())",
    [PERF, CONTESTANT],
  );
  await db.query("UPDATE dgl_show SET current_performance_id = $1 WHERE id = 1", [PERF]);
});

function cast(
  o: Partial<{
    performanceId: string;
    voterId: string;
    score: number;
    ipHash: string;
    source: "web" | "kiosk";
    now: number;
  }> = {},
) {
  return castVote(db, {
    performanceId: PERF,
    voterId: "voter",
    score: 5,
    ipHash: "ip",
    source: "web",
    now: T0,
    ...o,
  });
}

async function count() {
  const [r] = await db.query<{ n: string }>("SELECT count(*) AS n FROM dgl_votes");
  return Number(r.n);
}

async function flaggedCount() {
  const [r] = await db.query<{ n: string }>(
    "SELECT count(*) AS n FROM dgl_votes WHERE flagged",
  );
  return Number(r.n);
}

async function setStatus(status: string) {
  await db.query("UPDATE dgl_performances SET status = $2 WHERE id = $1", [PERF, status]);
}

test("records a vote", async () =>
  expect(await cast({ voterId: "a", score: 7 })).toEqual({ status: "recorded", score: 7 }));

test("second vote from same voter returns duplicate with the first score", async () => {
  await cast({ voterId: "a", score: 7 });
  expect(await cast({ voterId: "a", score: 2 })).toEqual({ status: "duplicate", score: 7 });
  expect(await count()).toBe(1);
});

test("concurrent duplicates insert one row", async () => {
  const rs = await Promise.all([
    cast({ voterId: "a", score: 7 }),
    cast({ voterId: "a", score: 3 }),
  ]);
  expect(await count()).toBe(1);
  expect(rs.every((r) => r.status === "recorded" || r.status === "duplicate")).toBe(true);
}); // PGlite serialises queries, so this pins the invariant; the snapshot race path is exercised in Task 14 step 5

test("paused", async () => {
  await setStatus("VOTING_PAUSED");
  expect((await cast({ voterId: "b", score: 5 })).status).toBe("paused");
});

test("rejects a vote for a closed or non-current performance", async () => {
  await setStatus("VOTING_CLOSED");
  expect((await cast({ voterId: "b", score: 5 })).status).toBe("closed");
  expect((await cast({ performanceId: crypto.randomUUID(), voterId: "c", score: 5 })).status).toBe(
    "closed",
  );
});

test("rejects decimals and out-of-range", async () => {
  await expect(cast({ voterId: "d", score: 7.5 })).rejects.toThrow();
  await expect(cast({ voterId: "d", score: 11 })).rejects.toThrow();
});

test("flags votes past 25 from one IP inside 10 s but still counts them", async () => {
  for (let i = 0; i < 25; i++)
    await cast({ voterId: `v${i}`, score: 5, ipHash: "same", now: T0 + i * 100 });
  expect(await flaggedCount()).toBe(0);
  await cast({ voterId: "v25", score: 5, ipHash: "same", now: T0 + 2600 });
  expect(await flaggedCount()).toBe(1);
  expect(await count()).toBe(26);
});
