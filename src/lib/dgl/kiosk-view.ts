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
};

const o = DGL.copy.kiosk.outcome;
const NOT_SENT: KioskOutcome = { kind: "not_sent", text: o.notSent, tone: "error", keepSelection: true, lock: false };

const statusOf = (body: unknown): unknown =>
  typeof body === "object" && body !== null ? (body as { status?: unknown }).status : undefined;

/**
 * A response to POST /api/dgl/kiosk/vote as a kiosk message. `status` is the
 * HTTP status, or null when no answer came (network error, timeout). The
 * honesty rule: "recorded" only ever comes from the server saying so (200
 * `recorded`, or 409 `duplicate`, which for a fresh anonymous voter means the
 * vote already exists); anything unclear is "not sent" and keeps the pick.
 */
export function kioskOutcome(status: number | null, body: unknown): KioskOutcome {
  const s = statusOf(body);
  if (status === 200 && s === "recorded") return { kind: "recorded", text: o.recorded, tone: "success", keepSelection: false, lock: true };
  if (status === 409) {
    if (s === "duplicate") return { kind: "recorded", text: o.recorded, tone: "success", keepSelection: false, lock: true };
    if (s === "paused") return { kind: "paused", text: o.paused, tone: "warn", keepSelection: true, lock: false };
    if (s === "closed") return { kind: "closed", text: o.closed, tone: "error", keepSelection: false, lock: false };
    return NOT_SENT;
  }
  if (status === 429) return { kind: "rate_limited", text: o.rateLimited, tone: "warn", keepSelection: true, lock: false };
  if (status === 401) return { kind: "signed_out", text: "", tone: "error", keepSelection: true, lock: false };
  if (status === 403) return { kind: "forbidden", text: "", tone: "error", keepSelection: true, lock: false };
  return NOT_SENT;
}
