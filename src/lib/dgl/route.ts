import { NextResponse, type NextRequest } from "next/server";
import { DGL } from "@/data/dgl";
import { signSession } from "./auth";
import { neonDb, type Db } from "./db";
import { clientIp, createLimiter, ipHash } from "./http";
import type { ActionResult } from "./types";
import type { VoteResult } from "./votes";

/** Shared plumbing for the /api/dgl routes. */

export const NO_STORE = { "Cache-Control": "no-store" } as const;
export const VOTER_COOKIE = "dgl_voter";
export const ADMIN_COOKIE = "dgl_admin";
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
const YEAR_S = 365 * 24 * 60 * 60;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** JSON with explicit headers (no-store unless given), so error responses are never cached by accident. */
export function json(body: unknown, status = 200, headers: HeadersInit = NO_STORE): NextResponse {
  return NextResponse.json(body, { status, headers });
}

export const unavailable = () => json({ error: "unavailable" }, 503);
export const badRequest = () => json({ error: "bad request" }, 400);
export const forbidden = () => json({ error: "forbidden" }, 403);
export const unauthorized = () => json({ error: "unauthorized" }, 401);

let warned = false;

/**
 * The database and the signing secret, or null when either is missing. In
 * production that is a configuration error: it is logged once per process,
 * naming the variables but never printing a value.
 */
export function config(): { db: Db; secret: string } | null {
  const secret = process.env.DGL_SECRET;
  const db = neonDb();
  if (secret && db) return { db, secret };
  if (!warned) {
    warned = true;
    console.error("DGL routes unavailable: DGL_SECRET or DATABASE_URL is not configured");
  }
  return null;
}

/** Logs the failure class only: driver messages can carry hostnames. */
export function fail(err: unknown): NextResponse {
  const code = (err as { code?: unknown } | null)?.code;
  console.error("DGL route failed:", err instanceof Error ? err.name : "unknown", typeof code === "string" ? code : "");
  return unavailable();
}

export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}

export const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

export const isScore = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 10;

/** `{ performanceId, score }` with strict types, else null. */
export function parseVoteBody(body: unknown): { performanceId: string; score: number } | null {
  if (!isObject(body)) return null;
  const { performanceId, score } = body;
  if (typeof performanceId !== "string" || !UUID.test(performanceId) || !isScore(score)) return null;
  return { performanceId, score };
}

/**
 * A kiosk vote body: the vote body plus `attemptId`, a client-made UUID that
 * stays the same across resends of one press. The server derives the voter id
 * from it, so a resend after a lost answer hits the (performance, voter)
 * unique key and comes back as a duplicate instead of counting twice. Lower
 * cased, so the same UUID in either case is one attempt.
 */
export function parseKioskBody(body: unknown): { performanceId: string; score: number; attemptId: string } | null {
  const vote = parseVoteBody(body);
  if (!vote) return null;
  const { attemptId } = body as { attemptId?: unknown };
  if (typeof attemptId !== "string" || !UUID.test(attemptId)) return null;
  return { ...vote, attemptId: attemptId.toLowerCase() };
}

const secure = () => process.env.NODE_ENV === "production";

/** The voter id from the cookie when it is a UUID, else a fresh one (and `minted`). */
export function voterFrom(req: NextRequest): { id: string; minted: boolean } {
  const v = req.cookies.get(VOTER_COOKIE)?.value;
  return v && UUID.test(v) ? { id: v, minted: false } : { id: crypto.randomUUID(), minted: true };
}

export function setVoterCookie(res: NextResponse, id: string): NextResponse {
  res.cookies.set(VOTER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: YEAR_S,
  });
  return res;
}

const adminCookie = { httpOnly: true, sameSite: "strict", secure: secure(), path: "/" } as const;

export function setAdminCookie(res: NextResponse, adminId: string, secret: string, now: number): NextResponse {
  res.cookies.set(ADMIN_COOKIE, signSession(adminId, now + ADMIN_SESSION_MS, secret), {
    ...adminCookie,
    secure: secure(),
    maxAge: ADMIN_SESSION_MS / 1000,
  });
  return res;
}

export function clearAdminCookie(res: NextResponse): NextResponse {
  res.cookies.set(ADMIN_COOKIE, "", { ...adminCookie, secure: secure(), maxAge: 0 });
  return res;
}

// Per instance, best effort (see createLimiter): not a global limit on serverless.
export const voterLimiter = createLimiter(DGL.limits.votePerVoterPerMin, 60_000);
export const ipLimiter = createLimiter(DGL.limits.votePerIpPerMin, 60_000);
export const kioskLimiter = createLimiter(1, DGL.limits.kioskGapMs);
/**
 * Sign in attempts per IP, checked before any database or scrypt work, so a
 * script cannot run unlimited scrypt with random names or burn a known name's
 * lockout as fast as it likes. Per instance, best effort, like the others: a
 * client spread over many warm instances gets more; the per-name lockout in
 * the database is still the real guard.
 */
export const loginLimiter = createLimiter(DGL.limits.loginPerIpPerMin, 60_000);

/**
 * The HTTP status for each refusal of POST /api/dgl/admin/action. Typed by
 * the refusal codes, so a code added to ActionResult without a status (or a
 * status left for a code that is gone) does not compile.
 */
export const ACTION_STATUS: Record<Extract<ActionResult, { ok: false }>["code"], number> = {
  forbidden: 403,
  invalid: 400,
  stale: 409,
  not_allowed: 409,
  needs_self_score: 409,
};

/** A vote result as the HTTP response the clients expect. */
export function voteResponse(r: VoteResult): NextResponse {
  return json(r, r.status === "recorded" ? 200 : 409);
}

/** The IP limiter and the stored hash share one hash; the raw IP goes no further than here. */
export function hashedIp(req: Request, secret: string): string {
  return ipHash(clientIp(req), secret);
}
