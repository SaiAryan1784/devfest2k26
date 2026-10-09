import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DGL } from "@/data/dgl";
import { hashPasscode, signSession } from "@/lib/dgl/auth";
import type { Db } from "@/lib/dgl/db";
import { ACTION_STATUS, ipLimiter } from "@/lib/dgl/route";
import { applyAction, readAdminState } from "@/lib/dgl/show";
import type { Action, Role } from "@/lib/dgl/types";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/dgl/db", async () => ({
  ...(await vi.importActual<typeof import("@/lib/dgl/db")>("@/lib/dgl/db")),
  neonDb: () => holder.db,
}));

import { GET as stateGET } from "@/app/api/dgl/state/route";
import { GET as meGET } from "@/app/api/dgl/me/route";
import { POST as votePOST } from "@/app/api/dgl/vote/route";
import { POST as loginPOST } from "@/app/api/dgl/admin/login/route";
import { POST as logoutPOST } from "@/app/api/dgl/admin/logout/route";
import { GET as adminStateGET } from "@/app/api/dgl/admin/state/route";
import { POST as actionPOST } from "@/app/api/dgl/admin/action/route";
import { POST as kioskPOST } from "@/app/api/dgl/kiosk/vote/route";

const SECRET = "route-test-secret";
const ORIGIN = "http://dgl.test";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Init = { body?: unknown; cookie?: string; origin?: string | null; ip?: string };

function req(path: string, method: "GET" | "POST", o: Init = {}) {
  const headers: Record<string, string> = { host: "dgl.test" };
  if (o.origin !== null) headers.origin = o.origin ?? ORIGIN;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.ip) headers["x-forwarded-for"] = o.ip;
  let body: string | undefined;
  if (o.body !== undefined) {
    headers["content-type"] = "application/json";
    body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
  }
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body });
}

let db: Db;
let seq = 0;

const voter = () => `dgl_voter=${crypto.randomUUID()}`;
const ip = () => `10.0.${seq >> 8}.${seq++ & 255}`;

/** `role` is a string so a test can store a retired role (OPERATOR, VOLUNTEER) as an old database would have it. */
async function addAdmin(role: Role | "OPERATOR" | "VOLUNTEER", name = `${role}-${seq++}`) {
  const [r] = await db.query<{ id: string }>(
    "INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ($1, $2, $3) RETURNING id",
    [name, role, await hashPasscode("right")],
  );
  return { id: r.id, name, role, cookie: `dgl_admin=${signSession(r.id, Date.now() + 3_600_000, SECRET)}` };
}

async function run(action: Action) {
  const admin = { id: (await addAdmin("SUPER_ADMIN")).id, name: "Seed", role: "SUPER_ADMIN" as const };
  const { version } = await readAdminState(db, admin, Date.now());
  const r = await applyAction(db, admin, action, version, Date.now());
  if (!r.ok) throw new Error(`${action.type}: ${r.code}`);
  return r.state;
}

async function toVoting() {
  const s = await run({ type: "putOnStage", name: "Riya Sharma" });
  await run({ type: "startPerformance" });
  await run({ type: "startVoting" });
  return s.performanceId as string;
}

const vote = (performanceId: string, score: unknown, cookie = voter()) =>
  votePOST(req("/api/dgl/vote", "POST", { body: { performanceId, score }, cookie, ip: ip() }));

beforeEach(async () => {
  vi.stubEnv("DGL_SECRET", SECRET);
  db = await createTestDb();
  holder.db = db;
  await db.query("INSERT INTO dgl_prompts (text) VALUES ('Sell us a deprecated API')");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("state route", () => {
  test("sends CDN cache headers and no cookie", async () => {
    const res = await stateGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(res.headers.get("cdn-cache-control")).toBe("max-age=1, stale-while-revalidate=2");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toMatchObject({ phase: "IDLE", votes: 0, average: null, reveal: null });
  });

  test("one vote is already the audience score, and it is a whole number", async () => {
    const pid = await toVoting();
    expect(await (await stateGET()).json()).toMatchObject({ phase: "VOTING", votes: 0, average: null });
    expect((await vote(pid, 7)).status).toBe(200);
    expect(await (await stateGET()).json()).toMatchObject({ phase: "VOTING", votes: 1, average: 7 });
    expect((await vote(pid, 8)).status).toBe(200);
    expect(await (await stateGET()).json()).toMatchObject({ votes: 2, average: 8 }); // 7.5 shows as 8
  });

  test("503 when the database is not configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.db = null;
    const res = await stateGET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("503 when DGL_SECRET is unset or empty", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DGL_SECRET", "");
    expect((await stateGET()).status).toBe(503);
  });

  test("503 when the database throws, and the error never leaks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.db = { query: async () => { throw new Error("secret-host.neon.tech down"); } };
    const res = await stateGET();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("neon");
  });
});

describe("vote route", () => {
  test("a POST with no voter cookie casts nothing: 409 retry with a cookie, and the retry with it is recorded", async () => {
    const pid = await toVoting();
    const first = await votePOST(req("/api/dgl/vote", "POST", { body: { performanceId: pid, score: 7 }, ip: ip() }));
    expect(first.status).toBe(409);
    expect(await first.json()).toEqual({ status: "retry" });
    expect(first.headers.get("cache-control")).toBe("no-store");
    const set = first.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/dgl_voter=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Max-Age=31536000/);
    expect(set).toMatch(/Path=\//);
    expect(set).not.toMatch(/Secure/i);
    const id = first.cookies.get("dgl_voter")?.value ?? "";
    expect(id).toMatch(UUID);
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(0);

    const again = await votePOST(
      req("/api/dgl/vote", "POST", { body: { performanceId: pid, score: 7 }, cookie: `dgl_voter=${id}`, ip: ip() }),
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ status: "recorded", score: 7 });
    expect(again.headers.get("set-cookie")).toBeNull();
    const rows = await db.query("SELECT voter_id FROM dgl_votes");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ voter_id: id });
  });

  test("cookieless retries whose answers are lost never store a vote, so a phone cannot count twice", async () => {
    const pid = await toVoting();
    // The first answer (and its Set-Cookie) is lost; the resend again carries no cookie.
    for (let i = 0; i < 3; i++) {
      const res = await votePOST(req("/api/dgl/vote", "POST", { body: { performanceId: pid, score: 7 }, ip: ip() }));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ status: "retry" });
    }
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(0);
  });

  test("a cookieless POST does no database work", async () => {
    const pid = await toVoting();
    const spy = vi.spyOn(db, "query");
    const res = await votePOST(req("/api/dgl/vote", "POST", { body: { performanceId: pid, score: 7 }, ip: ip() }));
    expect(res.status).toBe(409);
    expect(spy).not.toHaveBeenCalled();
  });

  test("a POST with a valid voter cookie is recorded with no Set-Cookie", async () => {
    const pid = await toVoting();
    const id = crypto.randomUUID();
    const res = await vote(pid, 6, `dgl_voter=${id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded", score: 6 });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await db.query("SELECT voter_id FROM dgl_votes")).toEqual([{ voter_id: id }]);
  });

  test("409 duplicate carries the first score", async () => {
    const pid = await toVoting();
    const cookie = voter();
    expect((await vote(pid, 8, cookie)).status).toBe(200);
    const dup = await vote(pid, 2, cookie);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ status: "duplicate", score: 8 });
  });

  test("409 paused and closed", async () => {
    const pid = await toVoting();
    await run({ type: "pauseVoting" });
    const paused = await vote(pid, 5);
    expect(paused.status).toBe(409);
    expect(await paused.json()).toEqual({ status: "paused" });
    await run({ type: "resumeVoting" });
    await run({ type: "stopVoting" });
    const closed = await vote(pid, 5);
    expect(closed.status).toBe(409);
    expect(await closed.json()).toEqual({ status: "closed" });
  });

  test('400 on score "7" (a string) and on 0', async () => {
    const pid = await toVoting();
    for (const score of ["7", 0, 11, 7.5, null, undefined]) {
      const res = await vote(pid, score);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad request" });
    }
  });

  test("400 on a bad performanceId, a bad body and malformed JSON, before touching the db", async () => {
    holder.db = { query: async () => { throw new Error("must not be called"); } };
    for (const body of [{ performanceId: "nope", score: 5 }, { score: 5 }, [], null, "{bad", { performanceId: 5, score: 5 }]) {
      const res = await votePOST(req("/api/dgl/vote", "POST", { body: body as unknown, cookie: voter() }));
      expect(res.status).toBe(400);
    }
  });

  test("403 when Origin is missing or differs", async () => {
    const pid = await toVoting();
    const body = { performanceId: pid, score: 5 };
    expect((await votePOST(req("/api/dgl/vote", "POST", { body, origin: "http://evil.test" }))).status).toBe(403);
    expect((await votePOST(req("/api/dgl/vote", "POST", { body, origin: null }))).status).toBe(403);
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(0);
  });

  test("replaces a malformed voter cookie with a fresh uuid and asks for a retry", async () => {
    const pid = await toVoting();
    const res = await votePOST(
      req("/api/dgl/vote", "POST", { body: { performanceId: pid, score: 5 }, cookie: "dgl_voter=../../x", ip: ip() }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "retry" });
    expect(res.cookies.get("dgl_voter")?.value).toMatch(UUID);
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(0);
  });

  test("429 after votePerVoterPerMin attempts from one voter", async () => {
    const pid = await toVoting();
    const cookie = voter();
    const codes: number[] = [];
    for (let i = 0; i < DGL.limits.votePerVoterPerMin + 1; i++) codes.push((await vote(pid, 5, cookie)).status);
    expect(codes.slice(0, -1).every((c) => c === 200 || c === 409)).toBe(true);
    expect(codes.at(-1)).toBe(429);
    const last = await vote(pid, 5, cookie);
    expect(await last.json()).toEqual({ status: "rate_limited" });
  });

  test("one IP (a hall behind venue NAT) can cast votePerIpPerMin votes a minute, and that is at least 5000", () => {
    expect(DGL.limits.votePerIpPerMin).toBeGreaterThanOrEqual(5000);
    const key = `ip:hall-${crypto.randomUUID()}`;
    const t = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < DGL.limits.votePerIpPerMin; i++) if (ipLimiter.hit(key, t + i)) allowed++;
    expect(allowed).toBe(DGL.limits.votePerIpPerMin);
    expect(ipLimiter.hit(key, t + 59_000)).toBe(false);
    expect(ipLimiter.hit(key, t + 60_000)).toBe(true);
  });

  test("503 when the database is not configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    holder.db = null;
    const res = await vote(crypto.randomUUID(), 5);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});

describe("me route", () => {
  test("returns the stored vote for the current performance after a vote", async () => {
    const pid = await toVoting();
    const cookie = voter();
    await vote(pid, 9, cookie);
    const res = await meGET(req("/api/dgl/me", "GET", { cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.vote).toEqual({ performanceId: pid, score: 9 });
    expect(typeof body.serverNow).toBe("number");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("null vote, and sets dgl_voter when missing", async () => {
    await toVoting();
    const res = await meGET(req("/api/dgl/me", "GET"));
    expect((await res.json()).vote).toBeNull();
    expect(res.cookies.get("dgl_voter")?.value).toMatch(UUID);
    const other = await meGET(req("/api/dgl/me", "GET", { cookie: voter() }));
    expect((await other.json()).vote).toBeNull();
  });
});

describe("login and logout routes", () => {
  // A fresh address per call unless one is given: the per-IP login limiter lives for the whole file.
  const login = (body: unknown, extra: Init = {}) =>
    loginPOST(req("/api/dgl/admin/login", "POST", { body, ip: ip(), ...extra }));

  test("sets an HttpOnly SameSite=Strict dgl_admin cookie that works for admin/state", async () => {
    const a = await addAdmin("HOST", "Sai");
    const res = await login({ name: "Sai", passcode: "right" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/dgl_admin=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=strict/i);
    expect(set).toMatch(/Max-Age=43200/);
    expect(set).toMatch(/Path=\//);
    const token = res.cookies.get("dgl_admin")?.value ?? "";
    expect(token.startsWith(`${a.id}.`)).toBe(true);
    const state = await adminStateGET(req("/api/dgl/admin/state", "GET", { cookie: `dgl_admin=${token}` }));
    expect(state.status).toBe(200);
  });

  test("401 on a wrong passcode", async () => {
    await addAdmin("HOST", "Sai");
    const res = await login({ name: "Sai", passcode: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("423 when locked", async () => {
    await addAdmin("HOST", "Sai");
    for (let i = 0; i < DGL.limits.loginFailures; i++) {
      expect((await login({ name: "Sai", passcode: "wrong" })).status).toBe(401);
    }
    const locked = await login({ name: "Sai", passcode: "right" });
    expect(locked.status).toBe(423);
    expect(locked.headers.get("set-cookie")).toBeNull();
  });

  test("400 on malformed shapes, not 401", async () => {
    for (const body of [{ name: 1, passcode: "x" }, { name: "Sai" }, { passcode: "x" }, [], null, "{bad"]) {
      expect((await login(body)).status).toBe(400);
    }
  });

  test("403 when Origin differs", async () => {
    expect((await login({ name: "Sai", passcode: "x" }, { origin: "http://evil.test" })).status).toBe(403);
  });

  test("the attempt after loginPerIpPerMin from one IP within a minute is 429, and touches no database", async () => {
    await addAdmin("HOST", "Sai");
    const from = ip();
    const max = DGL.limits.loginPerIpPerMin;
    expect(max).toBe(10);
    // Random names: each one is its own lockout bucket, so only the IP limit can stop them.
    for (let i = 0; i < max; i++) {
      expect((await login({ name: `nobody-${i}`, passcode: "wrong" }, { ip: from })).status).toBe(401);
    }
    const failed = () => db.query("SELECT 1 FROM dgl_audit WHERE action = 'loginFailed'");
    expect(await failed()).toHaveLength(max);
    const spy = vi.spyOn(db, "query");
    const res = await login({ name: "Sai", passcode: "right" }, { ip: from });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too many attempts" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(await failed()).toHaveLength(max);
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'login'")).toHaveLength(0);
  });

  test("a 429 for one IP does not affect another", async () => {
    await addAdmin("HOST", "Sai");
    const x = ip();
    for (let i = 0; i < DGL.limits.loginPerIpPerMin; i++) await login({ name: `nobody-${i}`, passcode: "wrong" }, { ip: x });
    expect((await login({ name: "Sai", passcode: "right" }, { ip: x })).status).toBe(429);
    expect((await login({ name: "Sai", passcode: "right" }, { ip: ip() })).status).toBe(200);
  });

  test("malformed bodies and a bad Origin are refused before the limiter counts them", async () => {
    await addAdmin("HOST", "Sai");
    const from = ip();
    for (let i = 0; i < DGL.limits.loginPerIpPerMin + 2; i++) {
      expect((await login({ name: 1 }, { ip: from })).status).toBe(400);
      expect((await login({ name: "Sai", passcode: "right" }, { ip: from, origin: "http://evil.test" })).status).toBe(403);
    }
    expect((await login({ name: "Sai", passcode: "right" }, { ip: from })).status).toBe(200);
  });

  test("logout clears the cookie, and 403 on a bad Origin", async () => {
    const res = await logoutPOST(req("/api/dgl/admin/logout", "POST"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/dgl_admin=;/);
    expect(set).toMatch(/Max-Age=0/);
    expect((await logoutPOST(req("/api/dgl/admin/logout", "POST", { origin: "http://evil.test" }))).status).toBe(403);
  });
});

describe("admin state route", () => {
  test("401 without a cookie, 200 with one", async () => {
    const none = await adminStateGET(req("/api/dgl/admin/state", "GET"));
    expect(none.status).toBe(401);
    expect(none.headers.get("cache-control")).toBe("no-store");
    const a = await addAdmin("HOST");
    const ok = await adminStateGET(req("/api/dgl/admin/state", "GET", { cookie: a.cookie }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ phase: "IDLE", version: 0 });
  });

  test("401 on a forged token", async () => {
    const a = await addAdmin("HOST");
    // Change the last hex character of the signature: always a different signature (replacing two
    // characters with "00" was the real signature 1 time in 256).
    const forged = a.cookie.slice(0, -1) + (a.cookie.endsWith("0") ? "1" : "0");
    expect(forged).not.toBe(a.cookie);
    expect((await adminStateGET(req("/api/dgl/admin/state", "GET", { cookie: forged }))).status).toBe(401);
  });
});

describe("action route", () => {
  const act = (o: Init) => actionPOST(req("/api/dgl/admin/action", "POST", o));
  const audits = () => db.query("SELECT 1 FROM dgl_audit");
  const showVersion = async () => (await db.query<{ version: number }>("SELECT version FROM dgl_show WHERE id = 1"))[0].version;

  test("403 when Origin differs", async () => {
    const a = await addAdmin("HOST");
    const res = await act({
      body: { action: { type: "spinWheel" }, version: 0 },
      cookie: a.cookie,
      origin: "http://evil.test",
    });
    expect(res.status).toBe(403);
  });

  test("401 without session", async () => {
    const res = await act({ body: { action: { type: "spinWheel" }, version: 0 } });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("400 on malformed bodies, before auth", async () => {
    for (const body of [
      {},
      { action: { type: "spinWheel" } },
      { action: { type: "spinWheel" }, version: "0" },
      { action: { type: "spinWheel" }, version: 1.5 },
      { action: "spinWheel", version: 0 },
      { action: { type: 5 }, version: 0 },
      { action: null, version: 0 },
      [],
      null,
    ]) {
      const res = await act({ body });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "bad request" });
    }
  });

  test("200 ok with the new state, then 409 stale on the old version", async () => {
    const a = await addAdmin("HOST");
    const ok = await act({
      body: { action: { type: "putOnStage", name: "Riya Sharma" }, version: 0 },
      cookie: a.cookie,
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.ok).toBe(true);
    expect(body.state).toMatchObject({ phase: "READY", contestant: "Riya Sharma", version: 1 });
    const stale = await act({ body: { action: { type: "spinWheel" }, version: 0 }, cookie: a.cookie });
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("stale");
  });

  test("409 not_allowed", async () => {
    const a = await addAdmin("HOST");
    const na = await act({ body: { action: { type: "startVoting" }, version: 0 }, cookie: a.cookie });
    expect(na.status).toBe(409);
    expect((await na.json()).code).toBe("not_allowed");
  });

  test("the status map has no needs_prompt", () => {
    expect(ACTION_STATUS).toEqual({ forbidden: 403, invalid: 400, stale: 409, not_allowed: 409, needs_self_score: 409 });
    expect("needs_prompt" in ACTION_STATUS).toBe(false);
  });

  test("accepts the new action types: put on stage, fix the name, spin the wheel, start with or without a prompt", async () => {
    const a = await addAdmin("HOST");
    const send = async (action: unknown, version: number) => {
      const res = await act({ body: { action, version }, cookie: a.cookie });
      expect(res.status, JSON.stringify(action)).toBe(200);
      return (await res.json()).state;
    };
    expect(await send({ type: "putOnStage", name: "Riya Shrma" }, 0)).toMatchObject({ phase: "READY", contestant: "Riya Shrma" });
    expect(await send({ type: "renameAct", name: "Riya Sharma" }, 1)).toMatchObject({ contestant: "Riya Sharma", version: 2 });
    expect(await send({ type: "spinWheel" }, 2)).toMatchObject({ prompt: "Sell us a deprecated API", spunAtMs: expect.any(Number) });
    expect(await send({ type: "startPerformance" }, 3)).toMatchObject({ phase: "PERFORMING" });
  });

  test("startPerformance needs no prompt", async () => {
    const a = await addAdmin("HOST");
    await act({ body: { action: { type: "putOnStage", name: "Riya Sharma" }, version: 0 }, cookie: a.cookie });
    const res = await act({ body: { action: { type: "startPerformance" }, version: 1 }, cookie: a.cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).state).toMatchObject({ phase: "PERFORMING", prompt: null });
  });

  test("rejects the removed action types with 400 and writes nothing", async () => {
    const a = await addAdmin("SUPER_ADMIN");
    const before = await audits();
    for (const action of [
      { type: "selectContestant", contestantId: crypto.randomUUID() },
      { type: "reassignContestant", contestantId: crypto.randomUUID() },
      { type: "setPrompt", text: "Roast your own GitHub profile" },
      { type: "drawPrompt" },
      { type: "upsertContestant", name: "Riya Sharma", sort: 1, active: true },
    ]) {
      const res = await act({ body: { action, version: 0 }, cookie: a.cookie });
      expect(res.status, action.type).toBe(400);
      expect((await res.json()).code).toBe("invalid");
    }
    expect(await audits()).toHaveLength(before.length);
    expect(await db.query("SELECT 1 FROM dgl_performances")).toHaveLength(0);
    expect(await showVersion()).toBe(0);
  });

  test("403 forbidden for a role without the permission", async () => {
    const a = await addAdmin("HOST");
    const res = await act({
      body: { action: { type: "upsertPrompt", text: "x", active: true }, version: 0 },
      cookie: a.cookie,
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
  });

  test("400 invalid for an action type that is not an admin action (kioskVote, an unknown one), and nothing is written", async () => {
    const a = await addAdmin("SUPER_ADMIN");
    const before = await audits();
    for (const type of ["kioskVote", "nope", "toString", "__proto__"]) {
      const res = await act({ body: { action: { type }, version: 0 }, cookie: a.cookie });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("invalid");
    }
    expect(await audits()).toHaveLength(before.length);
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(0);
    expect(await showVersion()).toBe(0);
  });

  test("400 invalid for a well-shaped action with bad fields", async () => {
    const a = await addAdmin("HOST");
    for (const name of ["", "   ", "x".repeat(81), "Ri\u0000ya", 7]) {
      const res = await act({ body: { action: { type: "putOnStage", name }, version: 0 }, cookie: a.cookie });
      expect(res.status, JSON.stringify(name)).toBe(400);
      expect((await res.json()).code).toBe("invalid");
    }
    expect(await db.query("SELECT 1 FROM dgl_performances")).toHaveLength(0);
  });

  test("a session from a retired role (OPERATOR, VOLUNTEER) works as HOST", async () => {
    for (const role of ["OPERATOR", "VOLUNTEER"] as const) {
      const a = await addAdmin(role);
      const state = await adminStateGET(req("/api/dgl/admin/state", "GET", { cookie: a.cookie }));
      expect(state.status).toBe(200);
      const { me, version } = await state.json();
      expect(me).toEqual({ name: a.name, role: "HOST" });
      const forbidden = await act({ body: { action: { type: "upsertPrompt", text: "x", active: true }, version }, cookie: a.cookie });
      expect(forbidden.status).toBe(403);
    }
    const legacy = await addAdmin("OPERATOR");
    const res = await act({ body: { action: { type: "putOnStage", name: "Riya Sharma" }, version: 0 }, cookie: legacy.cookie });
    expect(res.status).toBe(200);
  });
});

describe("kiosk vote route", () => {
  const kiosk = (pid: string, score: unknown, o: Init & { attemptId?: unknown } = {}) => {
    const { attemptId = crypto.randomUUID(), ...init } = o;
    return kioskPOST(req("/api/dgl/kiosk/vote", "POST", { body: { performanceId: pid, score, attemptId }, ip: ip(), ...init }));
  };
  const kioskRows = () => db.query<{ voter_id: string; score: number }>("SELECT voter_id, score FROM dgl_votes");
  const kioskAudit = () => db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'");

  test("401 without session, and nothing is written", async () => {
    const pid = await toVoting();
    expect((await kiosk(pid, 6)).status).toBe(401);
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(0);
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'")).toHaveLength(0);
  });

  test("both roles may record kiosk votes", async () => {
    const pid = await toVoting();
    // Two accounts, so the per-admin gap does not apply between them.
    for (const role of ["HOST", "SUPER_ADMIN"] as const) {
      const a = await addAdmin(role);
      expect((await kiosk(pid, 6, { cookie: a.cookie })).status, role).toBe(200);
    }
    expect(await kioskRows()).toHaveLength(2);
  });

  test("200 for HOST, stores source kiosk and a kiosk- voter, audits without the score", async () => {
    const pid = await toVoting();
    const v = await addAdmin("HOST", "Vee");
    const res = await kiosk(pid, 6, { cookie: v.cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded", score: 6 });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    const rows = await db.query<{ voter_id: string; source: string; score: number; ip_hash: string }>(
      "SELECT voter_id, source, score, ip_hash FROM dgl_votes",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("kiosk");
    expect(rows[0].voter_id).toMatch(/^kiosk-[0-9a-f-]{36}$/);
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{32}$/);
    const audit = await db.query<{ admin_id: string; admin_name: string; performance_id: string; detail: unknown }>(
      "SELECT admin_id, admin_name, performance_id, detail FROM dgl_audit WHERE action = 'kioskVote'",
    );
    expect(audit).toEqual([{ admin_id: v.id, admin_name: "Vee", performance_id: pid, detail: {} }]);
  });

  test("429 when the same admin votes again within kioskGapMs", async () => {
    const pid = await toVoting();
    const v = await addAdmin("HOST");
    expect((await kiosk(pid, 6, { cookie: v.cookie })).status).toBe(200);
    const again = await kiosk(pid, 7, { cookie: v.cookie });
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({ status: "rate_limited" });
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(1);
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'")).toHaveLength(1);
  });

  test("3 kiosk votes (one per gap) make 3 kiosk rows, 3 audit rows and a kiosk count of 3", async () => {
    const pid = await toVoting();
    const v = await addAdmin("HOST");
    const now = vi.spyOn(Date, "now");
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) {
      now.mockReturnValue(t0 + i * (DGL.limits.kioskGapMs + 100));
      expect((await kiosk(pid, 5 + i, { cookie: v.cookie })).status).toBe(200);
    }
    now.mockRestore();
    const rows = await db.query<{ source: string }>("SELECT source FROM dgl_votes");
    expect(rows.map((r) => r.source)).toEqual(["kiosk", "kiosk", "kiosk"]);
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'")).toHaveLength(3);
    const host = await addAdmin("HOST");
    const state = await adminStateGET(req("/api/dgl/admin/state", "GET", { cookie: host.cookie }));
    expect((await state.json()).kiosk).toBe(3);
  });

  describe("attempt id", () => {
    test("the same attemptId twice is recorded then duplicate with the FIRST score, one vote, one audit row", async () => {
      const pid = await toVoting();
      const v = await addAdmin("HOST");
      const attemptId = crypto.randomUUID();
      const now = vi.spyOn(Date, "now");
      const t0 = Date.now();
      now.mockReturnValue(t0);
      const first = await kiosk(pid, 7, { cookie: v.cookie, attemptId });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ status: "recorded", score: 7 });
      now.mockReturnValue(t0 + DGL.limits.kioskGapMs + 100);
      const again = await kiosk(pid, 3, { cookie: v.cookie, attemptId });
      now.mockRestore();
      expect(again.status).toBe(409);
      expect(await again.json()).toEqual({ status: "duplicate", score: 7 });
      expect(await kioskRows()).toEqual([{ voter_id: `kiosk-${attemptId}`, score: 7 }]);
      expect(await kioskAudit()).toHaveLength(1);
    });

    test("an upper case attemptId is the same attempt as its lower case form", async () => {
      const pid = await toVoting();
      const v = await addAdmin("HOST");
      const attemptId = crypto.randomUUID();
      const now = vi.spyOn(Date, "now");
      const t0 = Date.now();
      now.mockReturnValue(t0);
      expect((await kiosk(pid, 7, { cookie: v.cookie, attemptId: attemptId.toUpperCase() })).status).toBe(200);
      now.mockReturnValue(t0 + DGL.limits.kioskGapMs + 100);
      expect((await kiosk(pid, 7, { cookie: v.cookie, attemptId })).status).toBe(409);
      now.mockRestore();
      expect(await kioskRows()).toHaveLength(1);
    });

    test("two different attemptIds make two votes", async () => {
      const pid = await toVoting();
      const v = await addAdmin("HOST");
      const now = vi.spyOn(Date, "now");
      const t0 = Date.now();
      now.mockReturnValue(t0);
      expect((await kiosk(pid, 7, { cookie: v.cookie })).status).toBe(200);
      now.mockReturnValue(t0 + DGL.limits.kioskGapMs + 100);
      expect((await kiosk(pid, 7, { cookie: v.cookie })).status).toBe(200);
      now.mockRestore();
      expect(await kioskRows()).toHaveLength(2);
      expect(await kioskAudit()).toHaveLength(2);
    });

    test.each([undefined, "", "not-a-uuid", 7, null, "11111111-1111-4111-8111-11111111111"])(
      "a missing or malformed attemptId (%s) is 400 and writes nothing",
      async (attemptId) => {
        const pid = await toVoting();
        const v = await addAdmin("HOST");
        const res = await kioskPOST(
          req("/api/dgl/kiosk/vote", "POST", {
            body: attemptId === undefined ? { performanceId: pid, score: 6 } : { performanceId: pid, score: 6, attemptId },
            cookie: v.cookie,
            ip: ip(),
          }),
        );
        expect(res.status).toBe(400);
        expect(await kioskRows()).toHaveLength(0);
        expect(await kioskAudit()).toHaveLength(0);
      },
    );

    test("a bad attemptId is refused before any database work", async () => {
      const pid = await toVoting();
      const v = await addAdmin("HOST");
      const spy = vi.spyOn(db, "query");
      const res = await kioskPOST(req("/api/dgl/kiosk/vote", "POST", { body: { performanceId: pid, score: 6, attemptId: "x" }, cookie: v.cookie, ip: ip() }));
      expect(res.status).toBe(400);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  test("400 on a bad score and 403 on a bad Origin", async () => {
    const pid = await toVoting();
    const v = await addAdmin("HOST");
    expect((await kiosk(pid, "6", { cookie: v.cookie })).status).toBe(400);
    expect((await kiosk(pid, 6, { cookie: v.cookie, origin: "http://evil.test" })).status).toBe(403);
  });

  test("409 when voting is closed", async () => {
    const pid = await toVoting();
    await run({ type: "stopVoting" });
    const v = await addAdmin("HOST");
    const res = await kiosk(pid, 6, { cookie: v.cookie });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "closed" });
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'")).toHaveLength(0);
  });
});
