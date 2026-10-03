import { DGL } from "@/data/dgl";
import { can } from "./machine";
import type { Phase, Role } from "./types";

/**
 * What the volunteer kiosk (/dgl/kiosk) shows and what each server answer
 * means. Pure: no React, no DOM. The component only renders it.
 */

/** Where the one /admin/state check stands. "unreachable" is a 503 or no answer, never a sign-out. */
export type KioskSession = "checking" | "signedOut" | "unreachable" | "signedIn";

export type KioskScreen =
  | "checking"
  | "login"
  | "retry"
  | "wrong-role"
  | "voting"
  | "not-open"
  | "paused"
  | "closed";

/**
 * The session decides first; then the role; then the show phase. The score
 * grid exists only on "voting" (phase VOTING and a role that may record).
 */
export function kioskScreen(a: { session: KioskSession; role: Role | null; phase: Phase | null }): KioskScreen {
  if (a.session === "checking") return "checking";
  if (a.session === "signedOut") return "login";
  if (a.session === "unreachable") return "retry";
  if (a.role === null) return "checking";
  if (!can(a.role, "kioskVote")) return "wrong-role";
  switch (a.phase) {
    case "VOTING":
      return "voting";
    case "VOTING_PAUSED":
      return "paused";
    case "VOTING_CLOSED":
    case "REVEAL":
    case "COMPLETED":
      return "closed";
    default:
      return "not-open";
  }
}

export type KioskOutcome = {
  kind: "recorded" | "paused" | "closed" | "rate_limited" | "signed_out" | "forbidden" | "not_sent";
  /** The line to show (empty for the two kinds that change the whole screen instead). */
  text: string;
  tone: "success" | "warn" | "error";
  /** Keep the picked score so the volunteer can press again. */
  keepSelection: boolean;
  /** Lock the grid for DGL.limits.kioskGapMs (only after a vote the server recorded). */
  lock: boolean;
  /** The score the SERVER has on record for this press (recorded and duplicate only), else null. */
  score: number | null;
};

const o = DGL.copy.kiosk.outcome;
const NOT_SENT: KioskOutcome = { kind: "not_sent", text: o.notSent, tone: "error", keepSelection: true, lock: false, score: null };

const field = (body: unknown, key: string): unknown =>
  typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;

const serverScore = (body: unknown): number | null => {
  const n = field(body, "score");
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
};

/**
 * A response to POST /api/dgl/kiosk/vote as a kiosk message. `status` is the
 * HTTP status, or null when no answer came (network error, timeout). The
 * honesty rule: "recorded" only ever comes from the server saying so (200
 * `recorded`, or 409 `duplicate`: this press, or an earlier try of it, is
 * already stored); anything unclear is "not sent" and keeps the pick, which
 * is safe to press again because the attempt id makes a resend a duplicate.
 *
 * The score shown is the server's (`score` in the body), never the local
 * pick: when a resend carried a different pick than the try that went through,
 * the server answers duplicate with the ORIGINAL score, and the text says so.
 * `sent` is the score this request carried.
 */
export function kioskOutcome(status: number | null, body: unknown, sent: number | null = null): KioskOutcome {
  const s = field(body, "status");
  const recorded = (): KioskOutcome => {
    const score = serverScore(body);
    const differs = score !== null && sent !== null && score !== sent;
    return {
      kind: "recorded",
      text: differs ? o.recordedAs(score) : o.recorded,
      tone: "success",
      keepSelection: false,
      lock: true,
      score,
    };
  };
  if (status === 200 && s === "recorded") return recorded();
  if (status === 409) {
    if (s === "duplicate") return recorded();
    if (s === "paused") return { kind: "paused", text: o.paused, tone: "warn", keepSelection: true, lock: false, score: null };
    if (s === "closed") return { kind: "closed", text: o.closed, tone: "error", keepSelection: false, lock: false, score: null };
    return NOT_SENT;
  }
  if (status === 429) return { kind: "rate_limited", text: o.rateLimited, tone: "warn", keepSelection: true, lock: false, score: null };
  if (status === 401) return { kind: "signed_out", text: "", tone: "error", keepSelection: true, lock: false, score: null };
  if (status === 403) return { kind: "forbidden", text: "", tone: "error", keepSelection: true, lock: false, score: null };
  return NOT_SENT;
}

/**
 * The attempt id of one press. It is created when a press starts and kept
 * across every outcome that leaves the vote's fate unknown or retryable
 * (no answer, 5xx, 429, paused, an unreadable body, 401, 403), so pressing
 * again resends the SAME id and the server answers duplicate if the first try
 * actually went through. It is dropped after a definitive answer (recorded or
 * duplicate, closed) and on sign-out, so the next press is a new vote.
 */
export type AttemptEvent = "press" | "sign_out" | KioskOutcome["kind"];

export function nextAttempt(prev: string | null, event: AttemptEvent, newId: () => string): string | null {
  switch (event) {
    case "press":
      return prev ?? newId();
    case "recorded":
    case "closed":
    case "sign_out":
      return null;
    default:
      return prev;
  }
}

/** A version 4 UUID from 16 random bytes (RFC 4122 version and variant bits set). */
export function uuidV4(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** `crypto.randomUUID()`, or a v4 built from `getRandomValues` where it is missing (older or non-secure-context browsers). */
export function newAttemptId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return uuidV4(crypto.getRandomValues(new Uint8Array(16)));
}
