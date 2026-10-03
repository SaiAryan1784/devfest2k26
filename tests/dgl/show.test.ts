import { beforeEach, expect, test } from "vitest";
import type { Db } from "@/lib/dgl/db";
import { hashPasscode, login } from "@/lib/dgl/auth";
import { applyAction, readAdminState, readPublicState } from "@/lib/dgl/show";
import type { Action, Role } from "@/lib/dgl/types";
import { createTestDb } from "./pg";

const T0 = Date.parse("2026-10-03T12:00:00Z");
const sa = { id: "44444444-4444-4444-8444-444444444444", name: "Super", role: "SUPER_ADMIN" as const };

let db: Db;
let riya: string;
let aman: string;
/** The current performance id once one is selected; a stray UUID before that. */
let p: string;

async function insertContestant(name: string, sort: number): Promise<string> {
  const [r] = await db.query<{ id: string }>(
    "INSERT INTO dgl_contestants (name, sort) VALUES ($1, $2) RETURNING id",
    [name, sort],
  );
  return r.id;
}

async function insertPrompt(text: string, active = true): Promise<string> {
  const [r] = await db.query<{ id: string }>(
    "INSERT INTO dgl_prompts (text, active) VALUES ($1, $2) RETURNING id",
    [text, active],
  );
  return r.id;
}

beforeEach(async () => {
  db = await createTestDb();
  riya = await insertContestant("Riya Sharma", 1);
  aman = await insertContestant("Aman Gupta", 2);
  await insertPrompt("Explain Kubernetes to your grandmother");
  await insertPrompt("Sell us a deprecated API");
  p = crypto.randomUUID();
});

function admin(role: Role = "SUPER_ADMIN") {
  return readAdminState(db, { id: sa.id, name: sa.name, role }, T0);
}

async function run(action: Action, now = T0) {
  const r = await applyAction(db, sa, action, (await admin()).version, now);
  if (r.ok && r.state.performanceId) p = r.state.performanceId;
  return r;
}

async function runAs(role: Role, action: Action) {
  return applyAction(db, { id: sa.id, name: `As ${role}`, role }, action, (await admin()).version, T0);
}

/** Like run, but the action must succeed. */
async function must(action: Action) {
  const r = await run(action);
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

async function toVoting(o: { votes: number[]; self?: number }) {
  await must({ type: "selectContestant", contestantId: riya });
  await must({ type: "setPrompt", text: "Roast your own GitHub profile" });
  await must({ type: "startPerformance" });
  await must({ type: "startVoting" });
  if (o.self !== undefined) await must({ type: "setSelfScore", score: o.self });
  await addVotes(o.votes);
}

async function toVotingClosed(o: { votes: number[]; self?: number }) {
  await toVoting(o);
  await must({ type: "stopVoting" });
}

async function count(table: string): Promise<number> {
  const [r] = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return r.n;
}

test("full happy path", async () => {
  await run({ type: "selectContestant", contestantId: riya });
  expect((await run({ type: "startPerformance" })).ok).toBe(false); // needs_prompt
  await run({ type: "drawPrompt" }); await run({ type: "startPerformance" });
  const s = await readPublicState(db, T0 + 1000);
  expect(s.phase).toBe("PERFORMING"); expect(s.endsAtMs).toBe(T0 + 90_000);
  expect((await readPublicState(db, T0 + 90_000)).phase).toBe("PERFORMED");
});

test("stale version is rejected and changes nothing", async () => {
  const v = (await admin()).version;
  await applyAction(db, sa, { type: "selectContestant", contestantId: riya }, v, T0);
  const r = await applyAction(db, sa, { type: "selectContestant", contestantId: aman }, v, T0);
  expect(r).toMatchObject({ ok: false, code: "stale" });
  expect(r.state.contestant).toBe("Riya Sharma");
});

test("hides self score until reveal", async () => {
  await toVotingClosed({ votes: [8, 8, 7, 9, 8], self: 8 });
  expect((await readPublicState(db, T0)).reveal).toBeNull();
  await run({ type: "reveal" });
  expect((await readPublicState(db, T0)).reveal).toEqual({ self: 8, audience: 8, result: { kind: "match" } });
});

test("average null below MIN_VOTES in public, present for admin", async () => {
  await toVoting({ votes: [10, 9, 9, 10] });
  expect((await readPublicState(db, T0)).average).toBeNull();
  expect((await admin()).rawAverage).toBeCloseTo(9.5);
});

test("reveal needs self score", async () => {
  await toVotingClosed({ votes: [5, 5, 5, 5, 5] });
  expect(await run({ type: "reveal" })).toMatchObject({ ok: false, code: "needs_self_score" });
});

test("host cannot edit contestants; operator cannot moderate", async () => {
  expect(await runAs("HOST", { type: "upsertContestant", name: "X", sort: 9, active: true })).toMatchObject({ code: "forbidden" });
  expect(await runAs("OPERATOR", { type: "setFlaggedExcluded", performanceId: p, excluded: true })).toMatchObject({ code: "forbidden" });
});

test("excluding flagged votes changes the average, and is audited", async () => {
  await toVoting({ votes: [8, 8, 8, 8, 8] });
  await addVotes(Array(25).fill(1), { flagged: true });
  const before = await admin();
  expect(before.votes).toBe(30);
  expect(before.flagged).toBe(25);
  expect(before.rawAverage).toBeCloseTo(65 / 30);

  const r = await run({ type: "setFlaggedExcluded", performanceId: p, excluded: true });
  expect(r.ok).toBe(true);
  expect(r.state.rawAverage).toBeCloseTo(8);
  expect(r.state.votes).toBe(5);
  expect(r.state.excluded).toBe(25);
  expect(r.state.flagged).toBe(25);
  expect(r.state.average).toBe(8);
  expect((await readPublicState(db, T0)).average).toBe(8);
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
  await must({ type: "selectContestant", contestantId: riya });
  await must({ type: "drawPrompt" });
  await must({ type: "upsertPrompt", text: "Give a TED talk on tabs versus spaces", active: true });
  expect(await count("dgl_audit")).toBe(before + 3);
  // Refusals write nothing.
  expect((await runAs("HOST", { type: "resetShow", confirm: "RESET" })).ok).toBe(false);
  expect((await run({ type: "startVoting" })).ok).toBe(false);
  expect(await count("dgl_audit")).toBe(before + 3);
});

test("stale version on a live action is rejected and writes nothing", async () => {
  await must({ type: "selectContestant", contestantId: riya });
  const v = (await admin()).version;
  expect((await applyAction(db, sa, { type: "setPrompt", text: "First" }, v, T0)).ok).toBe(true);
  const audits = await count("dgl_audit");
  const r = await applyAction(db, sa, { type: "setPrompt", text: "Second" }, v, T0);
  expect(r).toMatchObject({ ok: false, code: "stale" });
  expect(r.state.prompt).toBe("First");
  expect(r.state.version).toBe(v + 1);
  expect(await count("dgl_audit")).toBe(audits);
});

test("an action the phase does not allow is not_allowed", async () => {
  await must({ type: "selectContestant", contestantId: riya });
  expect(await run({ type: "startVoting" })).toMatchObject({ ok: false, code: "not_allowed" });
  expect((await admin()).phase).toBe("READY");
});

test("input validation", async () => {
  await must({ type: "selectContestant", contestantId: riya });
  expect(await run({ type: "setSelfScore", score: 7.5 })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "setSelfScore", score: 11 })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "setPrompt", text: "   " })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "setPrompt", text: "x".repeat(201) })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "selectContestant", contestantId: "not-a-uuid" })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "upsertContestant", name: "", sort: 1, active: true })).toMatchObject({ code: "invalid" });
  expect(await run({ type: "resetShow", confirm: "reset" as "RESET" })).toMatchObject({ code: "invalid" });
  const r = await run({ type: "setPrompt", text: "  Trimmed  " });
  expect(r.state.prompt).toBe("Trimmed");
});

test("drawPrompt picks an unused active prompt", async () => {
  await insertPrompt("Inactive prompt", false);
  // A finished performance already used the first prompt.
  await db.query(
    "INSERT INTO dgl_performances (contestant_id, prompt, status, created_at) VALUES ($1, $2, 'COMPLETED', now())",
    [aman, "Explain Kubernetes to your grandmother"],
  );
  await must({ type: "selectContestant", contestantId: riya });
  for (let i = 0; i < 5; i++) {
    const r = await must({ type: "drawPrompt" });
    expect(r.state.prompt).toBe("Sell us a deprecated API");
    await must({ type: "setPrompt", text: "Placeholder" });
  }
  const r = await must({ type: "drawPrompt" });
  expect(r.state.audit?.[0]).toMatchObject({ action: "drawPrompt", detail: { text: "Sell us a deprecated API" } });
});

test("drawPrompt falls back to a used prompt, and is invalid with no active prompts", async () => {
  await db.query("UPDATE dgl_prompts SET active = false WHERE text <> 'Sell us a deprecated API'");
  await must({ type: "selectContestant", contestantId: riya });
  expect((await must({ type: "drawPrompt" })).state.prompt).toBe("Sell us a deprecated API");
  // Now every active prompt is used by a performance; it still draws one.
  expect((await must({ type: "drawPrompt" })).state.prompt).toBe("Sell us a deprecated API");

  await db.query("UPDATE dgl_prompts SET active = false");
  await must({ type: "setPrompt", text: "Manual" });
  const audits = await count("dgl_audit");
  const r = await run({ type: "drawPrompt" });
  expect(r).toMatchObject({ ok: false, code: "invalid" });
  expect(r.state.prompt).toBe("Manual");
  expect(await count("dgl_audit")).toBe(audits);
});

test("reassignContestant keeps the votes", async () => {
  await toVoting({ votes: [7, 7, 7, 7, 7] });
  const before = p;
  expect(await run({ type: "reassignContestant", contestantId: aman })).toMatchObject({ code: "not_allowed" });
  await must({ type: "pauseVoting" });
  const r = await must({ type: "reassignContestant", contestantId: aman });
  expect(r.state.contestant).toBe("Aman Gupta");
  expect(r.state.performanceId).toBe(before);
  expect(r.state.votes).toBe(5);
  expect(r.state.phase).toBe("VOTING_PAUSED");
  expect(await count("dgl_votes")).toBe(5);
});

test("resetShow clears performances and votes and points the show at null", async () => {
  await toVotingClosed({ votes: [6, 6, 6, 6, 6], self: 6 });
  const r = await must({ type: "resetShow", confirm: "RESET" });
  expect(r.state.phase).toBe("IDLE");
  expect(r.state.performanceId).toBeNull();
  expect(await count("dgl_performances")).toBe(0);
  expect(await count("dgl_votes")).toBe(0);
  const [show] = await db.query<{ current_performance_id: string | null }>(
    "SELECT current_performance_id FROM dgl_show WHERE id = 1",
  );
  expect(show.current_performance_id).toBeNull();
  expect(await readPublicState(db, T0)).toMatchObject({ phase: "IDLE", contestant: null, votes: 0, average: null, reveal: null });
  expect(r.state.contestants.every((c) => c.status === "upcoming")).toBe(true);
  // A fresh show can start again.
  await must({ type: "selectContestant", contestantId: aman });
});

test("contestant queue shows upcoming, current and done", async () => {
  await toVotingClosed({ votes: [5, 5, 5, 5, 5], self: 5 });
  let s = await admin();
  expect(s.contestants.map((c) => [c.name, c.status])).toEqual([
    ["Riya Sharma", "current"],
    ["Aman Gupta", "upcoming"],
  ]);
  await must({ type: "reveal" });
  await must({ type: "complete" });
  s = await admin();
  expect(s.phase).toBe("COMPLETED");
  expect(s.contestant).toBe("Riya Sharma");
  expect(s.contestants.map((c) => c.status)).toEqual(["done", "upcoming"]);
});

test("readAdminState gives admins and audit to SUPER_ADMIN only", async () => {
  await db.query(
    "INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ('Host one', 'HOST', 'secret-hash')",
  );
  await must({ type: "selectContestant", contestantId: riya });
  const s = await admin();
  expect(s.admins).toEqual([{ id: expect.any(String), name: "Host one", role: "HOST", active: true }]);
  expect(s.audit).toEqual([
    { at: T0, adminName: "Super", action: "selectContestant", detail: { contestantId: riya } },
  ]);
  expect(JSON.stringify(s)).not.toContain("secret-hash");
  for (const role of ["HOST", "OPERATOR"] as const) {
    const other = await admin(role);
    expect("admins" in other).toBe(false);
    expect("audit" in other).toBe(false);
    expect(other.contestant).toBe("Riya Sharma");
  }
});

test("admin state names the signed-in admin and their role, nothing more", async () => {
  expect((await admin()).me).toEqual({ name: "Super", role: "SUPER_ADMIN" });
  expect((await admin("HOST")).me).toEqual({ name: "Super", role: "HOST" });
  const r = await run({ type: "selectContestant", contestantId: riya });
  expect(r.state.me).toEqual({ name: "Super", role: "SUPER_ADMIN" });
});

test("upsertContestant and upsertPrompt add and edit", async () => {
  const add = await must({ type: "upsertContestant", name: "  Kabir  ", sort: 3, active: true });
  const kabir = add.state.contestants.find((c) => c.name === "Kabir");
  expect(kabir).toMatchObject({ sort: 3, active: true, status: "upcoming" });
  const edit = await must({ type: "upsertContestant", id: kabir!.id, name: "Kabir Rao", sort: 0, active: false });
  expect(edit.state.contestants[0]).toMatchObject({ id: kabir!.id, name: "Kabir Rao", active: false });
  expect(await run({ type: "upsertContestant", id: crypto.randomUUID(), name: "Ghost", sort: 1, active: true })).toMatchObject({ code: "invalid" });

  const pr = await must({ type: "upsertPrompt", text: "New prompt", active: true });
  const id = pr.state.prompts.find((x) => x.text === "New prompt")!.id;
  const off = await must({ type: "upsertPrompt", id, text: "New prompt", active: false });
  expect(off.state.prompts.find((x) => x.id === id)).toEqual({ id, text: "New prompt", active: false });
  // An inactive contestant cannot be selected.
  expect(await run({ type: "selectContestant", contestantId: kabir!.id })).toMatchObject({ code: "invalid" });
});

test("public state carries no voter or admin data", async () => {
  await toVotingClosed({ votes: [5, 6, 7, 8, 9], self: 3 });
  const s = await readPublicState(db, T0);
  expect(Object.keys(s).sort()).toEqual(
    ["average", "contestant", "endsAtMs", "performanceId", "phase", "prompt", "reveal", "votes"],
  );
  expect(JSON.stringify(s)).not.toContain("voter-");
  expect(s.votes).toBe(5);
  expect(s.average).toBe(7);
});

/* Setup actions leave the show version alone; the SQL version guard. */

test("a setup action does not change the version, so the host's next tap is not stale", async () => {
  await must({ type: "selectContestant", contestantId: riya });
  const v = (await admin()).version;
  const before = await count("dgl_audit");
  await must({ type: "upsertPrompt", text: "Give a TED talk on tabs versus spaces", active: true });
  await must({ type: "upsertContestant", name: "Kabir", sort: 3, active: true });
  expect((await admin()).version).toBe(v);
  expect(await count("dgl_audit")).toBe(before + 2);
  // A live action rendered before the edit still goes through.
  expect((await applyAction(db, sa, { type: "drawPrompt" }, v, T0)).ok).toBe(true);
});

test("two stopVoting on the same version: the SQL guard lets one through", async () => {
  await toVoting({ votes: [] });
  const v = (await admin()).version;
  const audits = await count("dgl_audit");
  const results = await Promise.all([
    applyAction(db, sa, { type: "stopVoting" }, v, T0),
    applyAction(db, sa, { type: "stopVoting" }, v, T0),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok && r.code === "stale")).toHaveLength(1);
  expect(await count("dgl_audit")).toBe(audits + 1);
  const [row] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM dgl_audit WHERE action = 'stopVoting'");
  expect(row.n).toBe(1);
  expect((await admin()).version).toBe(v + 1);
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
  const r = await must({ type: "upsertAdmin", name: "  Neha  ", role: "HOST", passcode: "correct horse battery", active: true });
  expect(r.state.admins).toContainEqual({ id: expect.any(String), name: "Neha", role: "HOST", active: true });
  expect(await login(db, "Neha", "correct horse battery", T0)).toMatchObject({ ok: true, admin: { name: "Neha", role: "HOST" } });
  expect(await login(db, "Neha", "wrong passcode", T0)).toMatchObject({ ok: false });
});

test("upsertAdmin refuses a duplicate name, a short passcode and bad fields", async () => {
  await must({ type: "upsertAdmin", name: "Neha", role: "HOST", passcode: "123456", active: true });
  const admins = await count("dgl_admins");
  const audits = await count("dgl_audit");
  const bad: Action[] = [
    { type: "upsertAdmin", name: "Neha", role: "OPERATOR", passcode: "abcdefgh", active: true },
    { type: "upsertAdmin", name: "Short", role: "HOST", passcode: "12345", active: true },
    { type: "upsertAdmin", name: "Nopass", role: "HOST", active: true },
    { type: "upsertAdmin", name: "Long", role: "HOST", passcode: "x".repeat(257), active: true },
    { type: "upsertAdmin", name: "   ", role: "HOST", passcode: "123456", active: true },
    { type: "upsertAdmin", name: "x".repeat(65), role: "HOST", passcode: "123456", active: true },
    { type: "upsertAdmin", name: "Bad\u0000name", role: "HOST", passcode: "123456", active: true },
    { type: "upsertAdmin", name: "Bad role", role: "ROOT" as Role, passcode: "123456", active: true },
    { type: "upsertAdmin", name: "Bad active", role: "HOST", passcode: "123456", active: "yes" as unknown as boolean },
    { type: "upsertAdmin", id: "not-a-uuid", name: "Bad id", role: "HOST", active: true },
    { type: "upsertAdmin", id: crypto.randomUUID(), name: "Ghost", role: "HOST", active: true },
  ];
  for (const action of bad) expect(await run(action), JSON.stringify(action)).toMatchObject({ ok: false, code: "invalid" });
  expect(await count("dgl_admins")).toBe(admins);
  expect(await count("dgl_audit")).toBe(audits);
});

test("upsertAdmin renaming onto a taken name is invalid, not an error", async () => {
  await insertAdmin("Neha", "HOST");
  const aman2 = await insertAdmin("Aman", "HOST");
  expect(await run({ type: "upsertAdmin", id: aman2, name: "Neha", role: "HOST", active: true })).toMatchObject({ ok: false, code: "invalid" });
  expect((await adminRow(aman2)).name).toBe("Aman");
});

test("upsertAdmin updates role and active, and keeps the passcode when none is given", async () => {
  const id = await insertAdmin("Neha", "HOST", { pass: "first passcode" });
  const r = await must({ type: "upsertAdmin", id, name: "Neha", role: "OPERATOR", active: false });
  expect(r.state.admins).toContainEqual({ id, name: "Neha", role: "OPERATOR", active: false });
  await must({ type: "upsertAdmin", id, name: "Neha", role: "OPERATOR", active: true });
  expect(await login(db, "Neha", "first passcode", T0)).toMatchObject({ ok: true, admin: { role: "OPERATOR" } });
});

test("upsertAdmin passcode change takes effect for login", async () => {
  const id = await insertAdmin("Neha", "HOST", { pass: "first passcode" });
  await must({ type: "upsertAdmin", id, name: "Neha", role: "HOST", passcode: "second passcode", active: true });
  expect(await login(db, "Neha", "first passcode", T0)).toMatchObject({ ok: false });
  expect(await login(db, "Neha", "second passcode", T0)).toMatchObject({ ok: true });
});

test("you cannot deactivate yourself", async () => {
  await insertAdmin(sa.name, "SUPER_ADMIN", { id: sa.id });
  await insertAdmin("Other super", "SUPER_ADMIN");
  const r = await run({ type: "upsertAdmin", id: sa.id, name: sa.name, role: "SUPER_ADMIN", active: false });
  expect(r).toMatchObject({ ok: false, code: "invalid" });
  expect((await adminRow(sa.id)).active).toBe(true);
});

test("you cannot demote yourself", async () => {
  await insertAdmin(sa.name, "SUPER_ADMIN", { id: sa.id });
  await insertAdmin("Other super", "SUPER_ADMIN");
  const r = await run({ type: "upsertAdmin", id: sa.id, name: sa.name, role: "OPERATOR", active: true });
  expect(r).toMatchObject({ ok: false, code: "invalid" });
  expect((await adminRow(sa.id)).role).toBe("SUPER_ADMIN");
  // Changing your own passcode is fine.
  expect((await run({ type: "upsertAdmin", id: sa.id, name: sa.name, role: "SUPER_ADMIN", passcode: "new passcode", active: true })).ok).toBe(true);
});

test("the last active SUPER_ADMIN cannot be demoted or deactivated by anyone", async () => {
  const only = await insertAdmin("Only super", "SUPER_ADMIN");
  await insertAdmin("Retired super", "SUPER_ADMIN", { active: false });
  const audits = await count("dgl_audit");
  // `sa` is not in the table here, so the self guard does not apply: only the last-SUPER_ADMIN guard does.
  expect(await run({ type: "upsertAdmin", id: only, name: "Only super", role: "HOST", active: true })).toMatchObject({ ok: false, code: "invalid" });
  expect(await run({ type: "upsertAdmin", id: only, name: "Only super", role: "SUPER_ADMIN", active: false })).toMatchObject({ ok: false, code: "invalid" });
  expect(await adminRow(only)).toMatchObject({ role: "SUPER_ADMIN", active: true });
  expect(await count("dgl_audit")).toBe(audits);
  // With a second active one, the first can step down.
  await must({ type: "upsertAdmin", name: "Second super", role: "SUPER_ADMIN", passcode: "123456", active: true });
  expect((await run({ type: "upsertAdmin", id: only, name: "Only super", role: "HOST", active: true })).ok).toBe(true);
});

test("two SUPER_ADMINs demoting each other at once leave one SUPER_ADMIN", async () => {
  const x = await insertAdmin("Super X", "SUPER_ADMIN");
  const y = await insertAdmin("Super Y", "SUPER_ADMIN");
  const asX = { id: x, name: "Super X", role: "SUPER_ADMIN" as const };
  const asY = { id: y, name: "Super Y", role: "SUPER_ADMIN" as const };
  const v = (await admin()).version;
  const results = await Promise.all([
    applyAction(db, asX, { type: "upsertAdmin", id: y, name: "Super Y", role: "HOST", active: true }, v, T0),
    applyAction(db, asY, { type: "upsertAdmin", id: x, name: "Super X", role: "SUPER_ADMIN", active: false }, v, T0),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const [{ n }] = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM dgl_admins WHERE role = 'SUPER_ADMIN' AND active",
  );
  expect(n).toBe(1);
});

test("upsertAdmin is audited without the passcode or its hash", async () => {
  const r = await must({ type: "upsertAdmin", name: "Neha", role: "HOST", passcode: "correct horse battery", active: true });
  const id = r.state.admins!.find((x) => x.name === "Neha")!.id;
  expect(r.state.audit?.[0]).toEqual({
    at: T0,
    adminName: "Super",
    action: "upsertAdmin",
    detail: { id, name: "Neha", role: "HOST", active: true, passcodeChanged: true },
  });
  const edit = await must({ type: "upsertAdmin", id, name: "Neha", role: "OPERATOR", active: true });
  expect(edit.state.audit?.[0].detail).toEqual({ id, name: "Neha", role: "OPERATOR", active: true, passcodeChanged: false });

  const [{ hash }] = await db.query<{ hash: string }>("SELECT passcode_hash AS hash FROM dgl_admins WHERE id = $1", [id]);
  const rows = await db.query<{ detail: unknown }>("SELECT detail FROM dgl_audit");
  // The audit table, the action results (the API response bodies) and a fresh SUPER_ADMIN read.
  const everything = JSON.stringify(rows) + JSON.stringify(r) + JSON.stringify(edit) + JSON.stringify(await admin());
  for (const secret of ["correct horse battery", hash, "scrypt$"]) expect(everything).not.toContain(secret);
});

test("HOST and OPERATOR cannot manage admins", async () => {
  for (const role of ["HOST", "OPERATOR"] as const) {
    expect(await runAs(role, { type: "upsertAdmin", name: "Sneaky", role: "SUPER_ADMIN", passcode: "123456", active: true }))
      .toMatchObject({ ok: false, code: "forbidden" });
  }
  expect(await count("dgl_admins")).toBe(0);
});

/* Moderation */

test("moderation lists performances with votes for SUPER_ADMIN only", async () => {
  // An earlier act with votes, then the current one; an act without votes is not listed.
  await toVotingClosed({ votes: [6, 6, 6, 6, 6], self: 6 });
  const first = p;
  await addVotes([1, 1, 1], { flagged: true });
  await must({ type: "reveal" });
  await must({ type: "complete" });
  await run({ type: "selectContestant", contestantId: aman }, T0 + 1000);
  const second = p;
  await run({ type: "setPrompt", text: "Any" }, T0 + 1000);
  await run({ type: "startPerformance" }, T0 + 1000);
  await run({ type: "startVoting" }, T0 + 1000);
  await addVotes([9, 9]);
  await addVotes([2], { flagged: true });

  const s = await admin();
  expect(s.moderation).toEqual([
    { performanceId: second, contestant: "Aman Gupta", votes: 3, flagged: 1, excluded: 0 },
    { performanceId: first, contestant: "Riya Sharma", votes: 8, flagged: 3, excluded: 0 },
  ]);
  for (const role of ["HOST", "OPERATOR"] as const) expect("moderation" in (await admin(role))).toBe(false);

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
      "INSERT INTO dgl_performances (contestant_id, status, created_at) VALUES ($1, 'COMPLETED', to_timestamp($2::float8 / 1000.0)) RETURNING id",
      [riya, T0 + i * 1000],
    );
    p = row.id;
    await addVotes([5]);
  }
  const m = (await admin()).moderation!;
  expect(m).toHaveLength(20);
  expect(m[0].performanceId).toBe(p);
});
