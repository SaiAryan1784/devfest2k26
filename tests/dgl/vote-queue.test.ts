import { expect, test } from "vitest";
import { applyVoteResult, loadVote, mergeVotes, parseVote, queuedVotes, saveVote, toVoteResult, type LocalVote } from "@/lib/dgl/vote-queue";

const q = (score: number): LocalVote => ({ performanceId: "p", score, state: "queued", at: 1 });

const throwingStorage = {
  getItem() {
    throw new Error("denied");
  },
  setItem() {
    throw new Error("denied");
  },
} as unknown as Storage;

function fakeStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage & { data: Map<string, string> };
}

test("recorded takes the server score", () =>
  expect(applyVoteResult(q(3), { status: "recorded", score: 3 })).toMatchObject({ state: "recorded", score: 3 }));
test("duplicate becomes recorded with the server score", () =>
  expect(applyVoteResult(q(3), { status: "duplicate", score: 7 })).toMatchObject({ state: "recorded", score: 7 }));
test("closed becomes rejected", () =>
  expect(applyVoteResult(q(3), { status: "closed" })).toMatchObject({ state: "rejected", reason: "closed" }));
test("network keeps it queued", () => expect(applyVoteResult(q(3), { status: "network" }).state).toBe("queued"));
test("rate limited keeps it queued unchanged", () => expect(applyVoteResult(q(3), { status: "rate_limited" })).toEqual(q(3)));
test("paused stays queued with a reason", () =>
  expect(applyVoteResult(q(3), { status: "paused" })).toMatchObject({ state: "queued", reason: "paused", score: 3 }));
test("a later recorded result clears a paused reason", () => {
  const paused = applyVoteResult(q(3), { status: "paused" });
  expect(applyVoteResult(paused, { status: "recorded", score: 3 }).reason).toBeUndefined();
});
test("applyVoteResult does not mutate its input", () => {
  const v = q(3);
  applyVoteResult(v, { status: "closed" });
  expect(v).toEqual(q(3));
});

test("storage that throws does not crash", () => {
  expect(loadVote(throwingStorage, "p")).toBeNull();
  expect(() => saveVote(throwingStorage, q(3))).not.toThrow();
});

test("saveVote and loadVote round trip under dgl:vote:<id>", () => {
  const s = fakeStorage();
  const v: LocalVote = { performanceId: "perf-1", score: 8, state: "queued", reason: "paused", at: 5 };
  saveVote(s, v);
  expect(s.data.has("dgl:vote:perf-1")).toBe(true);
  expect(loadVote(s, "perf-1")).toEqual(v);
  expect(loadVote(s, "other")).toBeNull();
});

test("loadVote with corrupt or foreign JSON returns null", () => {
  const s = fakeStorage();
  s.data.set("dgl:vote:p", "{not json");
  expect(loadVote(s, "p")).toBeNull();
  s.data.set("dgl:vote:p", JSON.stringify({ performanceId: "p", score: 99, state: "queued", at: 1 }));
  expect(loadVote(s, "p")).toBeNull();
  s.data.set("dgl:vote:p", JSON.stringify({ performanceId: "other", score: 5, state: "queued", at: 1 }));
  expect(loadVote(s, "p")).toBeNull();
  s.data.set("dgl:vote:p", JSON.stringify({ performanceId: "p", score: 5, state: "weird", at: 1 }));
  expect(loadVote(s, "p")).toBeNull();
  s.data.set("dgl:vote:p", "null");
  expect(loadVote(s, "p")).toBeNull();
});

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("toVoteResult passes 200 and 409 bodies through", async () => {
  expect(await toVoteResult(res(200, { status: "recorded", score: 6 }))).toEqual({ status: "recorded", score: 6 });
  expect(await toVoteResult(res(409, { status: "duplicate", score: 4 }))).toEqual({ status: "duplicate", score: 4 });
  expect(await toVoteResult(res(409, { status: "paused" }))).toEqual({ status: "paused" });
  expect(await toVoteResult(res(409, { status: "closed" }))).toEqual({ status: "closed" });
});

test("toVoteResult maps 429 to rate_limited", async () =>
  expect(await toVoteResult(res(429, { status: "rate_limited" }))).toEqual({ status: "rate_limited" }));

test("toVoteResult treats 5xx, 400, 403 and a thrown fetch as network", async () => {
  for (const s of [400, 403, 500, 503]) expect(await toVoteResult(res(s, { error: "x" }))).toEqual({ status: "network" });
  expect(await toVoteResult(null)).toEqual({ status: "network" });
});

test("toVoteResult treats an unreadable or mismatched body as network", async () => {
  expect(await toVoteResult(new Response("<html>", { status: 200 }))).toEqual({ status: "network" });
  expect(await toVoteResult(res(200, { status: "paused" }))).toEqual({ status: "network" });
  expect(await toVoteResult(res(200, { status: "recorded" }))).toEqual({ status: "network" });
  expect(await toVoteResult(res(409, { status: "recorded", score: 3 }))).toEqual({ status: "network" });
});

test("parseVote checks the performance id", () => {
  const raw = JSON.stringify(q(4));
  expect(parseVote(raw, "p")).toEqual(q(4));
  expect(parseVote(raw, "other")).toBeNull();
  expect(parseVote(null, "p")).toBeNull();
});

test("queuedVotes finds queued votes for any performance and ignores the rest", () => {
  const s = fakeStorage();
  saveVote(s, { performanceId: "old", score: 6, state: "queued", at: 1 });
  saveVote(s, { performanceId: "done", score: 6, state: "recorded", at: 1 });
  saveVote(s, { performanceId: "no", score: 6, state: "rejected", reason: "closed", at: 1 });
  s.setItem("unrelated", "x");
  s.setItem("dgl:vote:bad", "{oops");
  expect(queuedVotes(s).map((v) => v.performanceId)).toEqual(["old"]);
  expect(queuedVotes(throwingStorage)).toEqual([]);
});

test("mergeVotes lets a decided vote win and never replaces this tab's decided vote", () => {
  const rec: LocalVote = { performanceId: "p", score: 7, state: "recorded", at: 2 };
  const rej: LocalVote = { performanceId: "p", score: 7, state: "rejected", reason: "closed", at: 2 };
  expect(mergeVotes(undefined, q(3))).toEqual(q(3));
  expect(mergeVotes(q(3), rec)).toEqual(rec);
  expect(mergeVotes(rec, q(3))).toEqual(rec);
  expect(mergeVotes(rec, rej)).toEqual(rec);
  expect(mergeVotes(q(3), q(5))).toEqual(q(3));
});
