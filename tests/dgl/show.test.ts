import { beforeEach, expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import type { Db } from "@/lib/dgl/db";
import { hashPasscode, login } from "@/lib/dgl/auth";
import { applyAction, readAdminState, readPublicState } from "@/lib/dgl/show";
import type { Action, Admin, Role } from "@/lib/dgl/types";
import { createTestDb } from "./pg";

const T0 = Date.parse("2026-10-03T12:00:00Z");
const sa = { id: "44444444-4444-4444-8444-444444444444", name: "Super", role: "SUPER_ADMIN" as const, track: null };
const KUBERNETES = "Explain Kubernetes to your grandmother";
const DEPRECATED = "Sell us a deprecated API";

let db: Db;
/** The current performance id once an act is on stage; a stray UUID before that. */
let p: string;

async function insertPrompt(text: string, active = true): Promise<string> {
  const [r] = await db.query<{ id: string }>(
    "INSERT INTO dgl_prompts (text, active) VALUES ($1, $2) RETURNING id",
    [text, active],
  );
  return r.id;
}

beforeEach(async () => {
  db = await createTestDb();
  await insertPrompt(KUBERNETES);
  await insertPrompt(DEPRECATED);
  p = crypto.randomUUID();
});

function admin(role: Role = "SUPER_ADMIN") {
  return readAdminState(db, { id: sa.id, name: sa.name, role, track: null }, "build", T0);
}

async function run(action: Action, now = T0) {
  const r = await applyAction(db, sa, "build", action, (await admin()).version, now);
  if (r.ok && r.state.performanceId) p = r.state.performanceId;
  return r;
}

async function runAs(role: Role, action: Action) {
  return applyAction(db, { id: sa.id, name: `As ${role}`, role, track: null }, "build", action, (await admin()).version, T0);
}

/** Like run, but the action must succeed. */
async function must(action: Action, now = T0) {
  const r = await run(action, now);
  if (!r.ok) throw new Error(`${action.type} failed: ${r.code}`);
  return r;
}

let voterSeq = 0;
async function addVotes(scores: number[], o: { flagged?: boolean; source?: "web" | "kiosk" } = {}) {
  for (const score of scores) {
    await db.query(
      `INSERT INTO dgl_votes (performance_id, voter_id, score, ip_hash, source, flagged, created_at)
       VALUES ($1, $2, $3, 'ip', $4, $5, to_timestamp($6::float8 / 1000.0))`,
      [p, `voter-${voterSeq++}`, score, o.source ?? "web", o.flagged ?? false, T0],
    );
  }
}

async function toVoting(o: { votes: number[]; self?: number; name?: string }) {
  await must({ type: "putOnStage", name: o.name ?? "Riya Sharma" });
  await must({ type: "startPerformance" });
  await must({ type: "startVoting" });
  if (o.self !== undefined) await must({ type: "setSelfScore", score: o.self });
  await addVotes(o.votes);
}

async function toVotingClosed(o: { votes: number[]; self?: number; name?: string }) {
  await toVoting(o);
  await must({ type: "stopVoting" });
}

async function count(table: string): Promise<number> {
  const [r] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return r.n;
}

test("full happy path", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  await must({ type: "spinWheel" });
  await must({ type: "startPerformance" });
  const s = await readPublicState(db, "build", T0 + 1000);
  expect(s.phase).toBe("PERFORMING");
  expect(s.contestant).toBe("Riya Sharma");
  expect(s.endsAtMs).toBe(T0 + DGL.performanceMs + DGL.startLeadMs);
  expect((await readPublicState(db, "build", T0 + DGL.performanceMs + DGL.startLeadMs)).phase).toBe("PERFORMED");
});

test("stale version is rejected and changes nothing", async () => {
  const v = (await admin()).version;
  await applyAction(db, sa, "build", { type: "putOnStage", name: "Riya Sharma" }, v, T0);
  const r = await applyAction(db, sa, "build", { type: "putOnStage", name: "Aman Gupta" }, v, T0);
  expect(r).toMatchObject({ ok: false, code: "stale" });
  expect(r.state.contestant).toBe("Riya Sharma");
  expect(await count("dgl_performances")).toBe(1);
});

/* Acts by name */

test("putOnStage creates a READY act with the trimmed name", async () => {
  const r = await must({ type: "putOnStage", name: "  Riya Sharma  " });
  expect(r.state).toMatchObject({
    phase: "READY",
    contestant: "Riya Sharma",
    prompt: null,
    spunAtMs: null,
    endsAtMs: null,
    votes: 0,
    version: 1,
  });
  const rows = await db.query<{ id: string; contestant_id: string | null; contestant_name: string; status: string; prompt: string | null }>(
    "SELECT id, contestant_id, contestant_name, status, prompt FROM dgl_performances",
  );
  expect(rows).toEqual([{ id: r.state.performanceId, contestant_id: null, contestant_name: "Riya Sharma", status: "READY", prompt: null }]);
  const [show] = await db.query<{ current_performance_id: string }>("SELECT current_performance_id FROM dgl_tracks WHERE track = 'build'");
  expect(show.current_performance_id).toBe(r.state.performanceId);
  expect(r.state.audit?.[0]).toEqual({ at: T0, adminName: "Super", action: "putOnStage", detail: { name: "Riya Sharma", track: "build" } });
  expect(await readPublicState(db, "build", T0)).toMatchObject({ phase: "READY", contestant: "Riya Sharma", prompt: null });
});

test("putOnStage refuses an empty, 81 character and control character name", async () => {
  expect(DGL.limits.nameMax).toBe(80);
  const bad = ["", "   ", "x".repeat(81), ` ${"x".repeat(81)} `, "Riya\u0000", "Ri\nya", "Ri\tya", "Ri\u001fya", "Riya\u007fSharma"];
  for (const name of bad) {
    expect(await run({ type: "putOnStage", name }), JSON.stringify(name)).toMatchObject({ ok: false, code: "invalid" });
  }
  for (const name of [42, null, undefined, ["Riya"]]) {
    expect(await run({ type: "putOnStage", name } as unknown as Action), String(name)).toMatchObject({ ok: false, code: "invalid" });
  }
  expect(await count("dgl_performances")).toBe(0);
  expect(await count("dgl_audit")).toBe(0);
  expect((await admin()).version).toBe(0);
  // 80 characters is a name, and the spaces around it do not count.
  expect((await must({ type: "putOnStage", name: ` ${"x".repeat(80)} ` })).state.contestant).toBe("x".repeat(80));
});

test("renameAct works in READY and paused voting and is not_allowed in VOTING", async () => {
  expect(await run({ type: "renameAct", name: "Nobody" })).toMatchObject({ ok: false, code: "not_allowed" }); // IDLE
  const on = await must({ type: "putOnStage", name: "Riya Shrma" });
  const fixed = await must({ type: "renameAct", name: "  Riya Sharma " });
  expect(fixed.state).toMatchObject({ phase: "READY", contestant: "Riya Sharma", performanceId: on.state.performanceId, version: on.state.version + 1 });
  expect(fixed.state.audit?.[0]).toMatchObject({ action: "renameAct", detail: { name: "Riya Sharma", track: "build" } });

  await must({ type: "startPerformance" });
  expect((await must({ type: "renameAct", name: "Riya Sharma" })).state.phase).toBe("PERFORMING");
  await must({ type: "startVoting" });
  await addVotes([7, 7, 7]);
  const audits = await count("dgl_audit");
  expect(await run({ type: "renameAct", name: "Aman Gupta" })).toMatchObject({ ok: false, code: "not_allowed" });
  expect(await count("dgl_audit")).toBe(audits);

  await must({ type: "pauseVoting" });
  const r = await must({ type: "renameAct", name: "Aman Gupta" });
  expect(r.state).toMatchObject({ phase: "VOTING_PAUSED", contestant: "Aman Gupta", performanceId: on.state.performanceId, votes: 3 });
  expect(await count("dgl_votes")).toBe(3);
  expect(await count("dgl_performances")).toBe(1);
  // A bad name is refused the same way as on putOnStage.
  expect(await run({ type: "renameAct", name: "x".repeat(81) })).toMatchObject({ ok: false, code: "invalid" });
});

/* The wheel */

test("spinWheel sets the prompt and spun_at from now", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  const r = await must({ type: "spinWheel" }, T0 + 5000);
  expect([KUBERNETES, DEPRECATED]).toContain(r.state.prompt);
  expect(r.state).toMatchObject({ phase: "READY", spunAtMs: T0 + 5000 });
  const [row] = await db.query<{ prompt: string; spun_ms: number }>(
    "SELECT prompt, round(extract(epoch FROM spun_at) * 1000)::float8 AS spun_ms FROM dgl_performances",
  );
  expect(row).toEqual({ prompt: r.state.prompt, spun_ms: T0 + 5000 });
  expect(r.state.audit?.[0]).toEqual({ at: T0 + 5000, adminName: "Super", action: "spinWheel", detail: { text: r.state.prompt, track: "build" } });
});

test("spinWheel prefers an unused prompt", async () => {
  await insertPrompt("An inactive prompt", false);
  // An earlier act already used the first prompt.
  await db.query(
    "INSERT INTO dgl_performances (contestant_name, prompt, status, track, created_at) VALUES ('Earlier act', $1, 'COMPLETED', 'build', to_timestamp($2::float8 / 1000.0))",
    [KUBERNETES, T0 - 60_000],
  );
  await must({ type: "putOnStage", name: "Riya Sharma" });
  for (let i = 0; i < 20; i++) {
    expect((await must({ type: "spinWheel" })).state.prompt).toBe(DEPRECATED);
    // Forget this act's draw, so the next spin chooses between the same two again.
    await db.query("UPDATE dgl_performances SET prompt = NULL, spun_at = NULL WHERE id = $1", [p]);
  }
});

test("a second spin replaces the first", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  const first = await must({ type: "spinWheel" }, T0 + 1000);
  const second = await must({ type: "spinWheel" }, T0 + 9000);
  // Two active prompts and no other act: the second spin takes the one the first did not.
  expect(second.state.prompt).not.toBe(first.state.prompt);
  expect([first.state.prompt, second.state.prompt].sort()).toEqual([KUBERNETES, DEPRECATED].sort());
  expect(second.state.spunAtMs).toBe(T0 + 9000);
  expect(second.state.version).toBe(first.state.version + 1);
  expect(await readPublicState(db, "build", T0 + 9000)).toMatchObject({ prompt: second.state.prompt, spunAtMs: T0 + 9000 });
  // With every active prompt used, it still spins (and takes a used one).
  const third = await must({ type: "spinWheel" }, T0 + 20_000);
  expect([KUBERNETES, DEPRECATED]).toContain(third.state.prompt);
  const rows = await db.query<{ detail: { text: string } }>("SELECT detail FROM dgl_audit WHERE action = 'spinWheel' ORDER BY id");
  expect(rows.map((r) => r.detail.text)).toEqual([first.state.prompt, second.state.prompt, third.state.prompt]);
});

test("spinWheel is not_allowed outside READY", async () => {
  const refused = async (now = T0) => {
    const audits = await count("dgl_audit");
    const r = await run({ type: "spinWheel" }, now);
    expect(r, r.state.phase).toMatchObject({ ok: false, code: "not_allowed" });
    expect(r.state).toMatchObject({ prompt: null, spunAtMs: null });
    expect(await count("dgl_audit")).toBe(audits);
  };
  await refused(); // IDLE
  await must({ type: "putOnStage", name: "Riya Sharma" });
  await must({ type: "startPerformance" });
  await refused(); // PERFORMING
  await refused(T0 + DGL.performanceMs + DGL.startLeadMs + 1); // PERFORMED
  await must({ type: "startVoting" });
  await refused(); // VOTING
  await must({ type: "pauseVoting" });
  await refused(); // VOTING_PAUSED
  await must({ type: "stopVoting" });
  await refused(); // VOTING_CLOSED
  await must({ type: "setSelfScore", score: 5 });
  await must({ type: "reveal" });
  await refused(); // REVEAL
  await must({ type: "complete" });
  await refused(); // COMPLETED
});

test("spinWheel is invalid with no active prompts", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  await db.query("UPDATE dgl_prompts SET active = false");
  const v = (await admin()).version;
  const audits = await count("dgl_audit");
  const r = await run({ type: "spinWheel" });
  expect(r).toMatchObject({ ok: false, code: "invalid" });
  expect(r.state).toMatchObject({ prompt: null, spunAtMs: null, version: v });
  expect(await count("dgl_audit")).toBe(audits);
  await db.query("DELETE FROM dgl_prompts");
  expect(await run({ type: "spinWheel" })).toMatchObject({ ok: false, code: "invalid" });
  expect(await count("dgl_audit")).toBe(audits);
});

test("startPerformance works without a prompt", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  const r = await must({ type: "startPerformance" });
  expect(r.state).toMatchObject({ phase: "PERFORMING", prompt: null, spunAtMs: null, endsAtMs: T0 + DGL.performanceMs + DGL.startLeadMs });
});

test("public state exposes spunAtMs", async () => {
  expect((await readPublicState(db, "build", T0)).spunAtMs).toBeNull();
  await must({ type: "putOnStage", name: "Riya Sharma" });
  expect((await readPublicState(db, "build", T0)).spunAtMs).toBeNull();
  await must({ type: "spinWheel" }, T0 + 2000);
  const s = await readPublicState(db, "build", T0 + 2500);
  // The server sends the prompt with the spin time; the screens hide it until the wheel stops.
  expect(s.spunAtMs).toBe(T0 + 2000);
  expect(s.prompt).not.toBeNull();
  // The next act starts unspun.
  await must({ type: "startPerformance" });
  await must({ type: "startVoting" });
  await must({ type: "stopVoting" });
  await must({ type: "setSelfScore", score: 5 });
  await must({ type: "reveal" });
  await must({ type: "complete" });
  await must({ type: "putOnStage", name: "Aman Gupta" });
  expect(await readPublicState(db, "build", T0)).toMatchObject({ contestant: "Aman Gupta", prompt: null, spunAtMs: null });
});

/* Scores */

test("hides self score until reveal", async () => {
  await toVotingClosed({ votes: [8, 8, 7, 9, 8], self: 8 });
  expect((await readPublicState(db, "build", T0)).reveal).toBeNull();
  await run({ type: "reveal" });
  expect((await readPublicState(db, "build", T0)).reveal).toEqual({ self: 8, audience: 8, result: { kind: "match" } });
});

test("a single vote is the public average", async () => {
  await toVoting({ votes: [10] });
  const s = await readPublicState(db, "build", T0);
  expect(s.votes).toBe(1);
  expect(s.average).toBe(10); // no minimum number of votes
  expect((await admin()).rawAverage).toBe(10);
});

test("average is a whole number", async () => {
  await toVoting({ votes: [8, 9] });
  expect((await readPublicState(db, "build", T0)).average).toBe(9); // 8.5 rounds up
  await addVotes([8]);
  expect((await readPublicState(db, "build", T0)).average).toBe(8); // 8.33 rounds down
});

test("staff keep the exact average while the public sees the whole one", async () => {
  await toVoting({ votes: [10, 9, 9, 10] });
  expect((await readPublicState(db, "build", T0)).average).toBe(10); // 9.5 rounds up
  const s = await admin();
  expect(s.average).toBe(10);
  expect(s.rawAverage).toBe(9.5);
});

test("no votes gives a null average and reveal audience null", async () => {
  await toVotingClosed({ votes: [], self: 7 });
  const open = await readPublicState(db, "build", T0);
  expect(open).toMatchObject({ votes: 0, average: null, reveal: null });
  await must({ type: "reveal" });
  const s = await readPublicState(db, "build", T0);
  expect(s).toMatchObject({ votes: 0, average: null });
  expect(s.reveal).toEqual({ self: 7, audience: null, result: { kind: "insufficient" } });
});

test("reveal results use whole-number diff", async () => {
  await toVotingClosed({ votes: [8, 9], self: 6 }); // 8.5 shows as 9
  await must({ type: "reveal" });
  expect((await readPublicState(db, "build", T0)).reveal).toEqual({ self: 6, audience: 9, result: { kind: "diff", diff: 3 } });
});

test("reveal is a perfect match when the own score equals the whole-number average", async () => {
  await toVotingClosed({ votes: [8, 9], self: 9 }); // 8.5 shows as 9
  await must({ type: "reveal" });
  expect((await readPublicState(db, "build", T0)).reveal).toEqual({ self: 9, audience: 9, result: { kind: "match" } });
});

test("reveal below the old minimum still compares, and a lone vote can be a miss", async () => {
  await toVotingClosed({ votes: [3], self: 8 });
  await must({ type: "reveal" });
  expect((await readPublicState(db, "build", T0)).reveal).toEqual({ self: 8, audience: 3, result: { kind: "diff", diff: 5 } });
});

test("reveal needs self score", async () => {
  await toVotingClosed({ votes: [5, 5, 5, 5, 5] });
  expect(await run({ type: "reveal" })).toMatchObject({ ok: false, code: "needs_self_score" });
});

/* Roles */

test("a HOST cannot touch the prompt pool, admins, moderation or reset", async () => {
  await toVoting({ votes: [5] });
  const audits = await count("dgl_audit");
  const setup: Action[] = [
    { type: "upsertPrompt", text: "X", active: true },
    { type: "upsertAdmin", track: null, name: "Sneaky", role: "SUPER_ADMIN", passcode: "123456", active: true },
    { type: "setFlaggedExcluded", performanceId: p, excluded: true },
    { type: "resetShow", confirm: "RESET" },
  ];
  for (const action of setup) expect(await runAs("HOST", action), action.type).toMatchObject({ ok: false, code: "forbidden" });
  expect(await count("dgl_audit")).toBe(audits);
  expect(await count("dgl_admins")).toBe(0);
});

test("a HOST runs every live step of an act", async () => {
  const host = async (action: Action) => {
    const r = await runAs("HOST", action);
    if (!r.ok) throw new Error(`${action.type} failed: ${r.code}`);
    return r;
  };
  await host({ type: "putOnStage", name: "Riya Shrma" });
  await host({ type: "renameAct", name: "Riya Sharma" });
  await host({ type: "spinWheel" });
  await host({ type: "setSelfScore", score: 7 });
  await host({ type: "startPerformance" });
  await host({ type: "startVoting" });
  await host({ type: "pauseVoting" });
  await host({ type: "resumeVoting" });
  await host({ type: "stopVoting" });
  await host({ type: "reopenVoting" });
  await host({ type: "stopVoting" });
  await host({ type: "reveal" });
  expect((await host({ type: "complete" })).state).toMatchObject({ phase: "COMPLETED", contestant: "Riya Sharma", me: { role: "HOST" } });
});

test("a legacy role reads as HOST", async () => {
  const id = await insertAdmin("Old operator", "OPERATOR" as Role, { pass: "operator pass" });
  const r = await login(db, "Old operator", "operator pass", T0);
  expect(r).toEqual({ ok: true, admin: { id, name: "Old operator", role: "HOST", track: null } });
  if (!r.ok) return;
  const v = (await readAdminState(db, r.admin, "build", T0)).version;
  const on = await applyAction(db, r.admin, "build", { type: "putOnStage", name: "Riya Sharma" }, v, T0);
  expect(on).toMatchObject({ ok: true, state: { phase: "READY", me: { name: "Old operator", role: "HOST" } } });
  expect(await applyAction(db, r.admin, "build", { type: "upsertPrompt", text: "X", active: true }, on.state.version, T0)).toMatchObject({
    ok: false,
    code: "forbidden",
  });
  // The super admin's list shows the row as HOST too.
  expect((await admin()).admins).toContainEqual({ id, name: "Old operator", role: "HOST", track: null, active: true });
});

test("excluding flagged votes changes the average, and is audited", async () => {
  await toVoting({ votes: [8, 8, 8, 8, 8] });
  await addVotes(Array(25).fill(1), { flagged: true });
  const before = await admin();
  expect(before.votes).toBe(30);
  expect(before.flagged).toBe(25);
  expect(before.rawAverage).toBeCloseTo(65 / 30);
  expect(before.average).toBe(2); // 2.17 shows as 2

  const r = await run({ type: "setFlaggedExcluded", performanceId: p, excluded: true });
  expect(r.ok).toBe(true);
  expect(r.state.rawAverage).toBeCloseTo(8);
  expect(r.state.votes).toBe(5);
  expect(r.state.excluded).toBe(25);
  expect(r.state.flagged).toBe(25);
  expect(r.state.average).toBe(8);
  expect((await readPublicState(db, "build", T0)).average).toBe(8);
  expect(r.state.audit?.[0]).toMatchObject({ action: "setFlaggedExcluded", adminName: "Super" });
  const [row] = await db.query<{ performance_id: string }>(
    "SELECT performance_id FROM dgl_audit WHERE action = 'setFlaggedExcluded'",
  );
  expect(row.performance_id).toBe(p);

  const back = await run({ type: "setFlaggedExcluded", performanceId: p, excluded: false });
  expect(back.state.rawAverage).toBeCloseTo(65 / 30);
});

test("every successful action writes one audit row", async () => {
  const before = await count("dgl_audit");
  await must({ type: "putOnStage", name: "Riya Sharma" });
  await must({ type: "spinWheel" });
  await must({ type: "renameAct", name: "Riya S." });
  await must({ type: "upsertPrompt", text: "Give a TED talk on tabs versus spaces", active: true });
  expect(await count("dgl_audit")).toBe(before + 4);
  // Refusals write nothing.
  expect((await runAs("HOST", { type: "resetShow", confirm: "RESET" })).ok).toBe(false);
  expect((await run({ type: "startVoting" })).ok).toBe(false);
  expect((await run({ type: "renameAct", name: "" })).ok).toBe(false);
  expect(await count("dgl_audit")).toBe(before + 4);
});

test("stale version on a live action is rejected and writes nothing", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  const v = (await admin()).version;
  expect((await applyAction(db, sa, "build", { type: "renameAct", name: "First" }, v, T0)).ok).toBe(true);
  const audits = await count("dgl_audit");
  const r = await applyAction(db, sa, "build", { type: "renameAct", name: "Second" }, v, T0);
  expect(r).toMatchObject({ ok: false, code: "stale" });
  expect(r.state.contestant).toBe("First");
  expect(r.state.version).toBe(v + 1);
  expect(await count("dgl_audit")).toBe(audits);
  // A spin rendered from the old version is stale too.
  expect(await applyAction(db, sa, "build", { type: "spinWheel" }, v, T0)).toMatchObject({ ok: false, code: "stale" });
  expect((await admin()).prompt).toBeNull();
});

test("an action the phase does not allow is not_allowed", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  expect(await run({ type: "startVoting" })).toMatchObject({ ok: false, code: "not_allowed" });
  // Another act cannot replace one that is up next: fix the name instead.
  expect(await run({ type: "putOnStage", name: "Aman Gupta" })).toMatchObject({ ok: false, code: "not_allowed" });
  expect(await admin()).toMatchObject({ phase: "READY", contestant: "Riya Sharma" });
});

test("input validation", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  expect(await run({ type: "setSelfScore", score: 7.5 })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "setSelfScore", score: 11 })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "renameAct", name: "   " })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "renameAct", name: "x".repeat(81) })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "resetShow", confirm: "reset" as "RESET" })).toMatchObject({ code: "invalid" });
  const r = await run({ type: "renameAct", name: "  Trimmed  " });
  expect(r.state.contestant).toBe("Trimmed");
  expect((await run({ type: "renameAct", name: ` ${"y".repeat(80)} ` })).state.contestant).toBe("y".repeat(80));
});

test("resetShow clears performances and votes and points the show at null", async () => {
  await toVotingClosed({ votes: [6, 6, 6, 6, 6], self: 6 });
  const r = await must({ type: "resetShow", confirm: "RESET" });
  expect(r.state.phase).toBe("IDLE");
  expect(r.state.performanceId).toBeNull();
  expect(await count("dgl_performances")).toBe(0);
  expect(await count("dgl_votes")).toBe(0);
  const [show] = await db.query<{ current_performance_id: string | null }>(
    "SELECT current_performance_id FROM dgl_tracks WHERE track = 'build'",
  );
  expect(show.current_performance_id).toBeNull();
  expect(await readPublicState(db, "build", T0)).toMatchObject({
    phase: "IDLE",
    contestant: null,
    prompt: null,
    spunAtMs: null,
    votes: 0,
    average: null,
    reveal: null,
  });
  // The prompt pool is kept, and a fresh show can start again.
  expect(r.state.prompts).toHaveLength(2);
  await must({ type: "putOnStage", name: "Aman Gupta" });
});

test("readAdminState gives admins and audit to SUPER_ADMIN only", async () => {
  await db.query(
    "INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ('Host one', 'HOST', 'secret-hash')",
  );
  await must({ type: "putOnStage", name: "Riya Sharma" });
  const s = await admin();
  expect(s.admins).toEqual([{ id: expect.any(String), name: "Host one", role: "HOST", track: null, active: true }]);
  expect(s.audit).toEqual([
    { at: T0, adminName: "Super", action: "putOnStage", detail: { name: "Riya Sharma", track: "build" } },
  ]);
  expect(JSON.stringify(s)).not.toContain("secret-hash");
  const host = await admin("HOST");
  expect("admins" in host).toBe(false);
  expect("audit" in host).toBe(false);
  expect("moderation" in host).toBe(false);
  expect(host.contestant).toBe("Riya Sharma");
});

test("admin state names the signed-in admin and their role, nothing more", async () => {
  expect((await admin()).me).toEqual({ name: "Super", role: "SUPER_ADMIN", track: null });
  expect((await admin("HOST")).me).toEqual({ name: "Super", role: "HOST", track: null });
  const r = await run({ type: "putOnStage", name: "Riya Sharma" });
  expect(r.state.me).toEqual({ name: "Super", role: "SUPER_ADMIN", track: null });
  // There is no contestant list any more.
  expect("contestants" in r.state).toBe(false);
});

test("upsertPrompt adds and edits", async () => {
  const pr = await must({ type: "upsertPrompt", text: "  New prompt  ", active: true });
  const id = pr.state.prompts.find((x) => x.text === "New prompt")!.id;
  const off = await must({ type: "upsertPrompt", id, text: "New prompt", active: false });
  expect(off.state.prompts.find((x) => x.id === id)).toEqual({ id, text: "New prompt", active: false });
  expect(await run({ type: "upsertPrompt", id: crypto.randomUUID(), text: "Ghost", active: true })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "upsertPrompt", text: "x".repeat(201), active: true })).toMatchObject({ code: "invalid" });
});

test("public state carries no voter or admin data", async () => {
  await toVotingClosed({ votes: [5, 6, 7, 8, 9], self: 3 });
  const s = await readPublicState(db, "build", T0);
  expect(Object.keys(s).sort()).toEqual(
    ["average", "contestant", "endsAtMs", "performanceId", "phase", "prompt", "reveal", "spunAtMs", "track", "votes", "winner"],
  );
  expect(JSON.stringify(s)).not.toContain("voter-");
  expect(s.votes).toBe(5);
  expect(s.average).toBe(7);
});

/* Setup actions leave the show version alone; the SQL version guard. */

test("a setup action does not change the version, so the host's next tap is not stale", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  const v = (await admin()).version;
  const before = await count("dgl_audit");
  await must({ type: "upsertPrompt", text: "Give a TED talk on tabs versus spaces", active: true });
  await must({ type: "upsertPrompt", text: "Roast your own GitHub profile", active: true });
  expect((await admin()).version).toBe(v);
  expect(await count("dgl_audit")).toBe(before + 2);
  // A live action rendered before the edit still goes through.
  expect((await applyAction(db, sa, "build", { type: "spinWheel" }, v, T0)).ok).toBe(true);
});

test("two stopVoting on the same version: the SQL guard lets one through", async () => {
  await toVoting({ votes: [] });
  const v = (await admin()).version;
  const audits = await count("dgl_audit");
  const results = await Promise.all([
    applyAction(db, sa, "build", { type: "stopVoting" }, v, T0),
    applyAction(db, sa, "build", { type: "stopVoting" }, v, T0),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok && r.code === "stale")).toHaveLength(1);
  expect(await count("dgl_audit")).toBe(audits + 1);
  const [row] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM dgl_audit WHERE action = 'stopVoting'");
  expect(row.n).toBe(1);
  expect((await admin()).version).toBe(v + 1);
});

test("two putOnStage on the same version: one act goes on stage", async () => {
  const v = (await admin()).version;
  const audits = await count("dgl_audit");
  const results = await Promise.all([
    applyAction(db, sa, "build", { type: "putOnStage", name: "Riya Sharma" }, v, T0),
    applyAction(db, sa, "build", { type: "putOnStage", name: "Aman Gupta" }, v, T0),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok && r.code === "stale")).toHaveLength(1);
  expect(await count("dgl_performances")).toBe(1);
  expect(await count("dgl_audit")).toBe(audits + 1);
  expect((await admin()).version).toBe(v + 1);
});

test("two spins on the same version: one goes through", async () => {
  await must({ type: "putOnStage", name: "Riya Sharma" });
  const v = (await admin()).version;
  const results = await Promise.all([
    applyAction(db, sa, "build", { type: "spinWheel" }, v, T0 + 1000),
    applyAction(db, sa, "build", { type: "spinWheel" }, v, T0 + 2000),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok && r.code === "stale")).toHaveLength(1);
  const [row] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM dgl_audit WHERE action = 'spinWheel'");
  expect(row.n).toBe(1);
});

/* upsertAdmin */

async function insertAdmin(name: string, role: Role, o: { id?: string; active?: boolean; pass?: string } = {}) {
  const [r] = await db.query<{ id: string }>(
    `INSERT INTO dgl_admins (id, name, role, passcode_hash, active)
     VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5) RETURNING id`,
    [o.id ?? null, name, role, await hashPasscode(o.pass ?? "starting passcode"), o.active ?? true],
  );
  return r.id;
}

const adminRow = async (id: string) =>
  (await db.query<{ name: string; role: Role; active: boolean }>("SELECT name, role, active FROM dgl_admins WHERE id = $1", [id]))[0];

test("upsertAdmin creates an admin who can then sign in", async () => {
  const r = await must({ type: "upsertAdmin", track: null, name: "  Neha  ", role: "HOST", passcode: "correct horse battery", active: true });
  expect(r.state.admins).toContainEqual({ id: expect.any(String), name: "Neha", role: "HOST", track: null, active: true });
  expect(await login(db, "Neha", "correct horse battery", T0)).toMatchObject({ ok: true, admin: { name: "Neha", role: "HOST" } });
  expect(await login(db, "Neha", "wrong passcode", T0)).toMatchObject({ ok: false });
});

test("upsertAdmin refuses a duplicate name, a short passcode, a retired role and bad fields", async () => {
  await must({ type: "upsertAdmin", track: null, name: "Neha", role: "HOST", passcode: "123456", active: true });
  const admins = await count("dgl_admins");
  const audits = await count("dgl_audit");
  const bad: Action[] = [
    { type: "upsertAdmin", track: null, name: "Neha", role: "SUPER_ADMIN", passcode: "abcdefgh", active: true },
    { type: "upsertAdmin", track: null, name: "Short", role: "HOST", passcode: "12345", active: true },
    { type: "upsertAdmin", track: null, name: "Nopass", role: "HOST", active: true },
    { type: "upsertAdmin", track: null, name: "Long", role: "HOST", passcode: "x".repeat(257), active: true },
    { type: "upsertAdmin", track: null, name: "   ", role: "HOST", passcode: "123456", active: true },
    { type: "upsertAdmin", track: null, name: "x".repeat(65), role: "HOST", passcode: "123456", active: true },
    { type: "upsertAdmin", track: null, name: "Bad\u0000name", role: "HOST", passcode: "123456", active: true },
    { type: "upsertAdmin", track: null, name: "Bad role", role: "ROOT" as Role, passcode: "123456", active: true },
    { type: "upsertAdmin", track: null, name: "Old operator", role: "OPERATOR" as Role, passcode: "123456", active: true },
    { type: "upsertAdmin", track: null, name: "Old volunteer", role: "VOLUNTEER" as Role, passcode: "123456", active: true },
    { type: "upsertAdmin", track: null, name: "Bad active", role: "HOST", passcode: "123456", active: "yes" as unknown as boolean },
    { type: "upsertAdmin", track: null, id: "not-a-uuid", name: "Bad id", role: "HOST", active: true },
    { type: "upsertAdmin", track: null, id: crypto.randomUUID(), name: "Ghost", role: "HOST", active: true },
  ];
  for (const action of bad) expect(await run(action), JSON.stringify(action)).toMatchObject({ ok: false, code: "invalid" });
  expect(await count("dgl_admins")).toBe(admins);
  expect(await count("dgl_audit")).toBe(audits);
});

test("upsertAdmin renaming onto a taken name is invalid, not an error", async () => {
  await insertAdmin("Neha", "HOST");
  const aman2 = await insertAdmin("Aman", "HOST");
  expect(await run({ type: "upsertAdmin", track: null, id: aman2, name: "Neha", role: "HOST", active: true })).toMatchObject({ ok: false, code: "invalid" });
  expect((await adminRow(aman2)).name).toBe("Aman");
});

test("upsertAdmin updates role and active, and keeps the passcode when none is given", async () => {
  const id = await insertAdmin("Neha", "HOST", { pass: "first passcode" });
  const r = await must({ type: "upsertAdmin", track: null, id, name: "Neha", role: "SUPER_ADMIN", active: false });
  expect(r.state.admins).toContainEqual({ id, name: "Neha", role: "SUPER_ADMIN", track: null, active: false });
  await must({ type: "upsertAdmin", track: null, id, name: "Neha", role: "SUPER_ADMIN", active: true });
  expect(await login(db, "Neha", "first passcode", T0)).toMatchObject({ ok: true, admin: { role: "SUPER_ADMIN" } });
});

test("upsertAdmin passcode change takes effect for login", async () => {
  const id = await insertAdmin("Neha", "HOST", { pass: "first passcode" });
  await must({ type: "upsertAdmin", track: null, id, name: "Neha", role: "HOST", passcode: "second passcode", active: true });
  expect(await login(db, "Neha", "first passcode", T0)).toMatchObject({ ok: false });
  expect(await login(db, "Neha", "second passcode", T0)).toMatchObject({ ok: true });
});

test("you cannot deactivate yourself", async () => {
  await insertAdmin(sa.name, "SUPER_ADMIN", { id: sa.id });
  await insertAdmin("Other super", "SUPER_ADMIN");
  const r = await run({ type: "upsertAdmin", track: null, id: sa.id, name: sa.name, role: "SUPER_ADMIN", active: false });
  expect(r).toMatchObject({ ok: false, code: "invalid" });
  expect((await adminRow(sa.id)).active).toBe(true);
});

test("you cannot demote yourself", async () => {
  await insertAdmin(sa.name, "SUPER_ADMIN", { id: sa.id });
  await insertAdmin("Other super", "SUPER_ADMIN");
  const r = await run({ type: "upsertAdmin", track: null, id: sa.id, name: sa.name, role: "HOST", active: true });
  expect(r).toMatchObject({ ok: false, code: "invalid" });
  expect((await adminRow(sa.id)).role).toBe("SUPER_ADMIN");
  // Changing your own passcode is fine.
  expect((await run({ type: "upsertAdmin", track: null, id: sa.id, name: sa.name, role: "SUPER_ADMIN", passcode: "new passcode", active: true })).ok).toBe(true);
});

test("the last active SUPER_ADMIN cannot be demoted or deactivated by anyone", async () => {
  const only = await insertAdmin("Only super", "SUPER_ADMIN");
  await insertAdmin("Retired super", "SUPER_ADMIN", { active: false });
  const audits = await count("dgl_audit");
  // `sa` is not in the table here, so the self guard does not apply: only the last-SUPER_ADMIN guard does.
  expect(await run({ type: "upsertAdmin", track: null, id: only, name: "Only super", role: "HOST", active: true })).toMatchObject({ ok: false, code: "invalid" });
  expect(await run({ type: "upsertAdmin", track: null, id: only, name: "Only super", role: "SUPER_ADMIN", active: false })).toMatchObject({ ok: false, code: "invalid" });
  expect(await adminRow(only)).toMatchObject({ role: "SUPER_ADMIN", active: true });
  expect(await count("dgl_audit")).toBe(audits);
  // With a second active one, the first can step down.
  await must({ type: "upsertAdmin", track: null, name: "Second super", role: "SUPER_ADMIN", passcode: "123456", active: true });
  expect((await run({ type: "upsertAdmin", track: null, id: only, name: "Only super", role: "HOST", active: true })).ok).toBe(true);
});

test("two SUPER_ADMINs demoting each other at once leave one SUPER_ADMIN", async () => {
  const x = await insertAdmin("Super X", "SUPER_ADMIN");
  const y = await insertAdmin("Super Y", "SUPER_ADMIN");
  const asX = { id: x, name: "Super X", role: "SUPER_ADMIN" as const, track: null };
  const asY = { id: y, name: "Super Y", role: "SUPER_ADMIN" as const, track: null };
  const v = (await admin()).version;
  const results = await Promise.all([
    applyAction(db, asX, "build", { type: "upsertAdmin", track: null, id: y, name: "Super Y", role: "HOST", active: true }, v, T0),
    applyAction(db, asY, "build", { type: "upsertAdmin", track: null, id: x, name: "Super X", role: "SUPER_ADMIN", active: false }, v, T0),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const [{ n }] = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM dgl_admins WHERE role = 'SUPER_ADMIN' AND active",
  );
  expect(n).toBe(1);
});

test("upsertAdmin is audited without the passcode or its hash", async () => {
  const r = await must({ type: "upsertAdmin", track: null, name: "Neha", role: "HOST", passcode: "correct horse battery", active: true });
  const id = r.state.admins!.find((x) => x.name === "Neha")!.id;
  expect(r.state.audit?.[0]).toEqual({
    at: T0,
    adminName: "Super",
    action: "upsertAdmin",
    detail: { id, name: "Neha", role: "HOST", adminTrack: null, track: "build", active: true, passcodeChanged: true },
  });
  const edit = await must({ type: "upsertAdmin", track: null, id, name: "Neha", role: "SUPER_ADMIN", active: true });
  expect(edit.state.audit?.[0].detail).toEqual({ id, name: "Neha", role: "SUPER_ADMIN", adminTrack: null, track: "build", active: true, passcodeChanged: false });

  const [{ hash }] = await db.query<{ hash: string }>("SELECT passcode_hash AS hash FROM dgl_admins WHERE id = $1", [id]);
  const rows = await db.query<{ detail: unknown }>("SELECT detail FROM dgl_audit");
  // The audit table, the action results (the API response bodies) and a fresh SUPER_ADMIN read.
  const everything = JSON.stringify(rows) + JSON.stringify(r) + JSON.stringify(edit) + JSON.stringify(await admin());
  for (const secret of ["correct horse battery", hash, "scrypt$"]) expect(everything).not.toContain(secret);
});

/* Moderation */

test("moderation lists performances with votes for SUPER_ADMIN only", async () => {
  // An earlier act with votes, then the current one; an act without votes is not listed.
  await toVotingClosed({ votes: [6, 6, 6, 6, 6], self: 6 });
  const first = p;
  await addVotes([1, 1, 1], { flagged: true });
  await must({ type: "reveal" });
  await must({ type: "complete" });
  await must({ type: "putOnStage", name: "Aman Gupta" }, T0 + 1000);
  const second = p;
  await must({ type: "startPerformance" }, T0 + 1000);
  await must({ type: "startVoting" }, T0 + 1000);
  await addVotes([9, 9]);
  await addVotes([2], { flagged: true });

  const s = await admin();
  expect(s.moderation).toEqual([
    { performanceId: second, contestant: "Aman Gupta", votes: 3, flagged: 1, excluded: 0 },
    { performanceId: first, contestant: "Riya Sharma", votes: 8, flagged: 3, excluded: 0 },
  ]);
  expect("moderation" in (await admin("HOST"))).toBe(false);

  // Toggling updates the counts and the live average.
  const r = await must({ type: "setFlaggedExcluded", performanceId: second, excluded: true });
  expect(r.state.moderation?.[0]).toEqual({ performanceId: second, contestant: "Aman Gupta", votes: 2, flagged: 1, excluded: 1 });
  expect(r.state.rawAverage).toBeCloseTo(9);
  const back = await must({ type: "setFlaggedExcluded", performanceId: second, excluded: false });
  expect(back.state.moderation?.[0]).toMatchObject({ votes: 3, excluded: 0 });
  expect(back.state.rawAverage).toBeCloseTo(20 / 3);
});

test("moderation keeps the 20 newest performances with votes", async () => {
  for (let i = 0; i < 22; i++) {
    const [row] = await db.query<{ id: string }>(
      "INSERT INTO dgl_performances (contestant_name, status, track, created_at) VALUES ('Riya Sharma', 'COMPLETED', 'build', to_timestamp($1::float8 / 1000.0)) RETURNING id",
      [T0 + i * 1000],
    );
    p = row.id;
    await addVotes([5]);
  }
  const m = (await admin()).moderation!;
  expect(m).toHaveLength(20);
  expect(m[0].performanceId).toBe(p);
});

test("HOST and SUPER_ADMIN get the self score, raw average, flags, kiosk count and prompts", async () => {
  await toVoting({ votes: [9, 8, 7], self: 6 });
  await addVotes([4], { flagged: true });
  await addVotes([5], { source: "kiosk" });
  for (const role of ["HOST", "SUPER_ADMIN"] as const) {
    const s = await admin(role);
    expect(s.selfScore).toBe(6);
    expect(s.rawAverage).toBeCloseTo(6.6);
    expect(s.flagged).toBe(1);
    expect(s.kiosk).toBe(1);
    expect(s.prompts.length).toBe(2);
  }
});

test("an action type that is not an admin action is invalid for every role and writes nothing", async () => {
  const before = await count("dgl_audit");
  // kioskVote has its own route; the rest are gone with the contestant lineup and the typed prompt.
  const types = ["kioskVote", "nope", "selectContestant", "reassignContestant", "setPrompt", "drawPrompt", "upsertContestant"];
  const fields = { contestantId: crypto.randomUUID(), text: "x", name: "x", sort: 1, active: true };
  for (const role of ["SUPER_ADMIN", "HOST"] as const) {
    for (const type of types) {
      expect(await runAs(role, { type, ...fields } as unknown as Action), `${role} ${type}`).toMatchObject({ ok: false, code: "invalid" });
    }
  }
  expect(await count("dgl_audit")).toBe(before);
  expect(await count("dgl_performances")).toBe(0);
  expect((await admin()).version).toBe(0);
});

/* Tracks and the winner. */

const onTrack = (t: "build" | "grow" | "think", a: Admin = sa) => ({
  state: () => readAdminState(db, a, t, T0),
  run: async (action: Action) => applyAction(db, a, t, action, (await readAdminState(db, a, t, T0)).version, T0),
});

test("two tracks run independently", async () => {
  const build = onTrack("build");
  const grow = onTrack("grow");
  expect((await build.run({ type: "putOnStage", name: "Build act" })).ok).toBe(true);
  expect((await grow.run({ type: "putOnStage", name: "Grow act" })).ok).toBe(true);
  expect(await readPublicState(db, "build", T0)).toMatchObject({ track: "build", contestant: "Build act" });
  expect(await readPublicState(db, "grow", T0)).toMatchObject({ track: "grow", contestant: "Grow act" });
  expect(await readPublicState(db, "think", T0)).toMatchObject({ phase: "IDLE", contestant: null });
  // Versions are independent: an action in one track never makes another stale.
  expect((await build.run({ type: "startPerformance" })).ok).toBe(true);
  expect((await grow.state()).version).toBe(1);
});

test("resetShow clears only its own track", async () => {
  const build = onTrack("build");
  const grow = onTrack("grow");
  await build.run({ type: "putOnStage", name: "Build act" });
  await grow.run({ type: "putOnStage", name: "Grow act" });
  expect((await build.run({ type: "resetShow", confirm: "RESET" })).ok).toBe(true);
  expect((await readPublicState(db, "build", T0)).phase).toBe("IDLE");
  expect((await readPublicState(db, "grow", T0)).contestant).toBe("Grow act");
});

test("a track admin is forbidden in another track, and writes nothing", async () => {
  const buildAdmin = { id: sa.id, name: "Build Admin", role: "SUPER_ADMIN" as const, track: "build" as const };
  const before = await count("dgl_audit");
  const r = await applyAction(db, buildAdmin, "grow", { type: "putOnStage", name: "Sneaky" }, 0, T0);
  expect(r).toMatchObject({ ok: false, code: "forbidden" });
  expect(await count("dgl_audit")).toBe(before);
  expect((await readPublicState(db, "grow", T0)).phase).toBe("IDLE");
  expect((await onTrack("build", buildAdmin).run({ type: "putOnStage", name: "Mine" })).ok).toBe(true);
});

test("only an all-track super admin manages accounts", async () => {
  const buildAdmin = { id: sa.id, name: "Build Admin", role: "SUPER_ADMIN" as const, track: "build" as const };
  const r = await onTrack("build", buildAdmin).run({ type: "upsertAdmin", name: "Hacker", role: "HOST", track: null, passcode: "correct horse battery", active: true });
  expect(r).toMatchObject({ ok: false, code: "forbidden" });
  const ok = await must({ type: "upsertAdmin", name: "Grow Admin", role: "SUPER_ADMIN", track: "grow", passcode: "correct horse battery", active: true });
  expect(ok.state.admins).toContainEqual({ id: expect.any(String), name: "Grow Admin", role: "SUPER_ADMIN", track: "grow", active: true });
  const login2 = await login(db, "Grow Admin", "correct horse battery", T0);
  expect(login2).toMatchObject({ ok: true, admin: { track: "grow" } });
});

test("winner: highest exact average, shown on request, cleared by the next act", async () => {
  await toVotingClosed({ votes: [8, 8, 9], self: 5, name: "Riya" }); // 8.33
  await must({ type: "reveal" });
  await must({ type: "complete" });
  expect(await must({ type: "showWinner" })).toMatchObject({ ok: true, state: { winnerShown: true, winner: { names: ["Riya"], audience: 8 } } });
  expect((await readPublicState(db, "build", T0)).winner).toEqual({ names: ["Riya"], audience: 8 });
  await must({ type: "hideWinner" });
  expect((await readPublicState(db, "build", T0)).winner).toBeNull();
  await must({ type: "showWinner" });
  await must({ type: "putOnStage", name: "Next" }, T0 + 1000);
  expect((await readPublicState(db, "build", T0)).winner).toBeNull();
  expect((await admin()).acts.map((a) => [a.name, a.audience])).toEqual([["Riya", 8], ["Next", null]]);
});

test("showWinner needs a revealed act with votes", async () => {
  await must({ type: "putOnStage", name: "Nobody" });
  expect(await run({ type: "showWinner" })).toMatchObject({ ok: false, code: "not_allowed" });
  await must({ type: "startPerformance" });
  await must({ type: "startVoting" });
  await must({ type: "setSelfScore", score: 5 });
  await must({ type: "stopVoting" });
  await must({ type: "reveal" });
  await must({ type: "complete" });
  expect(await run({ type: "showWinner" })).toMatchObject({ ok: false, code: "no_winner" });
});
