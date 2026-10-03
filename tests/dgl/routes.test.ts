import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DGL } from "@/data/dgl";
import { hashPasscode, signSession } from "@/lib/dgl/auth";
import type { Db } from "@/lib/dgl/db";
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
let riya: string;
let seq = 0;

const voter = () => `dgl_voter=${crypto.randomUUID()}`;
const ip = () => `10.0.${seq >> 8}.${seq++ & 255}`;

async function addAdmin(role: Role, name = `${role}-${seq++}`) {
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
  const s = await run({ type: "selectContestant", contestantId: riya });
  await run({ type: "setPrompt", text: "Roast your own GitHub profile" });
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
  const [r] = await db.query<{ id: string }>(
    "INSERT INTO dgl_contestants (name, sort) VALUES ('Riya Sharma', 1) RETURNING id",
  );
  riya = r.id;
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
  const login = (body: unknown, extra: Init = {}) =>
    loginPOST(req("/api/dgl/admin/login", "POST", { body, ...extra }));

  test("sets an HttpOnly SameSite=Strict dgl_admin cookie that works for admin/state", async () => {
    const a = await addAdmin("OPERATOR", "Sai");
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
    await addAdmin("OPERATOR", "Sai");
    const res = await login({ name: "Sai", passcode: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("423 when locked", async () => {
    await addAdmin("OPERATOR", "Sai");
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
    const forged = a.cookie.slice(0, -2) + "00";
    expect((await adminStateGET(req("/api/dgl/admin/state", "GET", { cookie: forged }))).status).toBe(401);
  });
});

describe("action route", () => {
  const act = (o: Init) => actionPOST(req("/api/dgl/admin/action", "POST", o));

  test("403 when Origin differs", async () => {
    const a = await addAdmin("OPERATOR");
    const res = await act({
      body: { action: { type: "drawPrompt" }, version: 0 },
      cookie: a.cookie,
      origin: "http://evil.test",
    });
    expect(res.status).toBe(403);
  });

  test("401 without session", async () => {
    const res = await act({ body: { action: { type: "drawPrompt" }, version: 0 } });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("400 on malformed bodies, before auth", async () => {
    for (const body of [
      {},
      { action: { type: "drawPrompt" } },
      { action: { type: "drawPrompt" }, version: "0" },
      { action: { type: "drawPrompt" }, version: 1.5 },
      { action: "drawPrompt", version: 0 },
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
    const a = await addAdmin("OPERATOR");
    const ok = await act({
      body: { action: { type: "selectContestant", contestantId: riya }, version: 0 },
      cookie: a.cookie,
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.ok).toBe(true);
    expect(body.state).toMatchObject({ phase: "READY", version: 1 });
    const stale = await act({ body: { action: { type: "drawPrompt" }, version: 0 }, cookie: a.cookie });
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("stale");
  });

  test("409 not_allowed and needs_prompt", async () => {
    const a = await addAdmin("OPERATOR");
    const na = await act({ body: { action: { type: "startVoting" }, version: 0 }, cookie: a.cookie });
    expect(na.status).toBe(409);
    expect((await na.json()).code).toBe("not_allowed");
    await act({ body: { action: { type: "selectContestant", contestantId: riya }, version: 0 }, cookie: a.cookie });
    const np = await act({ body: { action: { type: "startPerformance" }, version: 1 }, cookie: a.cookie });
    expect(np.status).toBe(409);
    expect((await np.json()).code).toBe("needs_prompt");
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

  test("400 invalid for a well-shaped action with bad fields", async () => {
    const a = await addAdmin("OPERATOR");
    const res = await act({
      body: { action: { type: "selectContestant", contestantId: "nope" }, version: 0 },
      cookie: a.cookie,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid");
  });
});

describe("kiosk vote route", () => {
  const kiosk = (pid: string, score: unknown, o: Init & { attemptId?: unknown } = {}) => {
    const { attemptId = crypto.randomUUID(), ...init } = o;
    return kioskPOST(req("/api/dgl/kiosk/vote", "POST", { body: { performanceId: pid, score, attemptId }, ip: ip(), ...init }));
  };
  const kioskRows = () => db.query<{ voter_id: string; score: number }>("SELECT voter_id, score FROM dgl_votes");
  const kioskAudit = () => db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'");

  test("403 for HOST, 401 without session", async () => {
    const pid = await toVoting();
    const host = await addAdmin("HOST");
    expect((await kiosk(pid, 6, { cookie: host.cookie })).status).toBe(403);
    expect((await kiosk(pid, 6)).status).toBe(401);
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(0);
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'")).toHaveLength(0);
  });

  test("200 for VOLUNTEER, stores source kiosk and a kiosk- voter, audits without the score", async () => {
    const pid = await toVoting();
    const v = await addAdmin("VOLUNTEER", "Vee");
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
    const v = await addAdmin("VOLUNTEER");
    expect((await kiosk(pid, 6, { cookie: v.cookie })).status).toBe(200);
    const again = await kiosk(pid, 7, { cookie: v.cookie });
    expect(again.status).toBe(429);
    expect(await again.json()).toEqual({ status: "rate_limited" });
    expect(await db.query("SELECT 1 FROM dgl_votes")).toHaveLength(1);
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'")).toHaveLength(1);
  });

  test("3 kiosk votes (one per gap) make 3 kiosk rows, 3 audit rows and a kiosk count of 3", async () => {
    const pid = await toVoting();
    const v = await addAdmin("VOLUNTEER");
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
    const op = await addAdmin("OPERATOR");
    const state = await adminStateGET(req("/api/dgl/admin/state", "GET", { cookie: op.cookie }));
    expect((await state.json()).kiosk).toBe(3);
  });

  describe("attempt id", () => {
    test("the same attemptId twice is recorded then duplicate with the FIRST score, one vote, one audit row", async () => {
      const pid = await toVoting();
      const v = await addAdmin("VOLUNTEER");
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
      const v = await addAdmin("VOLUNTEER");
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
      const v = await addAdmin("VOLUNTEER");
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
        const v = await addAdmin("VOLUNTEER");
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
      const v = await addAdmin("VOLUNTEER");
      const spy = vi.spyOn(db, "query");
      const res = await kioskPOST(req("/api/dgl/kiosk/vote", "POST", { body: { performanceId: pid, score: 6, attemptId: "x" }, cookie: v.cookie, ip: ip() }));
      expect(res.status).toBe(400);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  test("400 on a bad score and 403 on a bad Origin", async () => {
    const pid = await toVoting();
    const v = await addAdmin("OPERATOR");
    expect((await kiosk(pid, "6", { cookie: v.cookie })).status).toBe(400);
    expect((await kiosk(pid, 6, { cookie: v.cookie, origin: "http://evil.test" })).status).toBe(403);
  });

  test("409 when voting is closed", async () => {
    const pid = await toVoting();
    await run({ type: "stopVoting" });
    const v = await addAdmin("VOLUNTEER");
    const res = await kiosk(pid, 6, { cookie: v.cookie });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ status: "closed" });
    expect(await db.query("SELECT 1 FROM dgl_audit WHERE action = 'kioskVote'")).toHaveLength(0);
  });
});
