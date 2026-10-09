import { allowed, can, effectivePhase } from "./machine";
import { formatRaw } from "./score";
import type { ActionResult, AdminState, LiveAction, Phase, Role, StoredStatus } from "./types";

/**
 * What the admin console (/dgl/admin) offers, decided from the polled admin
 * state and the signed-in role. Pure: no React, no DOM. Every control is
 * offered only when the state machine allows it in this phase (`allowed`)
 * AND the role may do it (`can`), so the console never shows a button the
 * server would refuse for those reasons. The server still decides.
 */

/**
 * The phase as of `now` (server time). The server already resolved it at
 * `serverNow`; a later `now` can only turn PERFORMING into PERFORMED.
 */
export function phaseAt(s: AdminState, now: number = s.serverNow): Phase {
  const stored: StoredStatus | null = s.phase === "IDLE" ? null : s.phase === "PERFORMED" ? "PERFORMING" : s.phase;
  return effectivePhase(stored, s.endsAtMs, now);
}

export type PrimaryKey =
  | "putOnStage"
  | "startPerformance"
  | "startVoting"
  | "stopVoting"
  | "resumeVoting"
  | "reveal"
  | "complete";

export type DisabledReason = "needsSelfScore" | "noPrompts" | "noWinner";

export type Primary = {
  /** Key into DGL.copy.admin.primary. */
  labelKey: PrimaryKey;
  /**
   * Null for "Put on stage" (IDLE, COMPLETED): it needs a name, so the button
   * is the console's name form's, which builds putOnStage from what was typed.
   */
  action: LiveAction | null;
  disabled: boolean;
  /** Key into DGL.copy.admin.reason, shown as text under the disabled button. */
  disabledReason: DisabledReason | null;
  needsConfirm: boolean;
};

type Simple = Extract<LiveAction, { type: "startPerformance" | "startVoting" | "stopVoting" | "resumeVoting" | "reveal" | "complete" }>["type"];

/*
 * The one "next" button per phase. VOTING_PAUSED is not in the brief's
 * table: its next step is resuming (stopping from a pause is a secondary
 * control with its own confirm).
 */
const NEXT: Partial<Record<Phase, Simple>> = {
  READY: "startPerformance",
  PERFORMING: "startVoting",
  PERFORMED: "startVoting",
  VOTING: "stopVoting",
  VOTING_PAUSED: "resumeVoting",
  VOTING_CLOSED: "reveal",
  REVEAL: "complete",
};

export function primaryAction(s: AdminState | null, role: Role | null, now?: number): Primary | null {
  if (!s || !role) return null;
  const phase = phaseAt(s, now);

  if (phase === "IDLE" || phase === "COMPLETED") {
    if (!allowed(phase, "putOnStage") || !can(role, "putOnStage")) return null;
    return { labelKey: "putOnStage", action: null, disabled: false, disabledReason: null, needsConfirm: false };
  }

  const type = NEXT[phase];
  if (!type || !allowed(phase, type) || !can(role, type)) return null;
  // The prompt is optional: only the reveal waits for something (the own score).
  const disabledReason: DisabledReason | null = type === "reveal" && s.selfScore === null ? "needsSelfScore" : null;
  return {
    labelKey: type,
    action: { type },
    disabled: disabledReason !== null,
    disabledReason,
    needsConfirm: type === "stopVoting",
  };
}

export type SecondaryKey =
  | "pauseVoting"
  | "resumeVoting"
  | "stopVoting"
  | "reopenVoting"
  | "spinWheel"
  | "renameAct"
  | "setSelfScore"
  | "showWinner"
  | "hideWinner";

export type Secondary = { key: SecondaryKey; needsConfirm: boolean; disabledReason: DisabledReason | null };

const SECONDARY: readonly SecondaryKey[] = [
  "pauseVoting",
  "resumeVoting",
  "stopVoting",
  "reopenVoting",
  "spinWheel",
  "renameAct",
  "setSelfScore",
  "showWinner",
  "hideWinner",
];
const CONFIRM = new Set<SecondaryKey>(["stopVoting", "reopenVoting"]);

/**
 * The smaller controls, in display order: each one allowed in this phase and
 * permitted for the role, minus whatever the big button already does.
 * `spinWheel` is the wheel button (see spinControl), `renameAct` the "Fix the
 * name" control and `setSelfScore` the own-score grid; the rest are buttons.
 * Nothing here needs a second tap except stopping and reopening voting.
 */
export function secondaryActions(s: AdminState | null, role: Role | null, now?: number): Secondary[] {
  if (!s || !role) return [];
  const phase = phaseAt(s, now);
  const primary = primaryAction(s, role, now)?.action?.type;
  return SECONDARY.filter(
    (k) =>
      k !== primary &&
      allowed(phase, k) &&
      can(role, k) &&
      // One winner button at a time: show it, then hide it.
      !(k === "showWinner" && s.winnerShown) &&
      !(k === "hideWinner" && !s.winnerShown),
  ).map((key) => ({
    key,
    needsConfirm: CONFIRM.has(key),
    // The wheel draws from the active prompts only; the winner needs a revealed act with votes.
    disabledReason:
      key === "spinWheel" && !s.prompts.some((r) => r.active) ? "noPrompts" : key === "showWinner" && !s.leaders ? "noWinner" : null,
  }));
}

/**
 * The wheel button, when it is offered (READY): "Spin the wheel", or "Spin
 * again" once this act has been spun; off, with the reason, when no prompt is
 * active. `labelKey` is a key into DGL.copy.admin. Null when not offered.
 */
export function spinControl(
  s: AdminState | null,
  role: Role | null,
  now?: number,
): { labelKey: "spinWheel" | "spinAgain"; disabledReason: DisabledReason | null } | null {
  const item = secondaryActions(s, role, now).find((a) => a.key === "spinWheel");
  if (!s || !item) return null;
  return { labelKey: s.spunAtMs === null ? "spinWheel" : "spinAgain", disabledReason: item.disabledReason };
}

export type Pending = { key: string; at: number };

/**
 * Confirm on a second tap: the first tap on `key` arms it, a second tap on
 * the same key within `windowMs` confirms. A different key, or a tap after
 * the window, arms afresh.
 */
export function confirmStep(
  pending: Pending | null,
  key: string,
  now: number,
  windowMs = 3000,
): { confirmed: boolean; pending: Pending | null } {
  if (pending && pending.key === key && now - pending.at < windowMs) return { confirmed: true, pending: null };
  return { confirmed: false, pending: { key, at: now } };
}

/**
 * The admin-only raw average, the exact figure to two decimals through
 * formatRaw (the public sees a whole number instead). Null with no votes, so
 * the console says "No votes yet" instead of a number.
 */
export function formatRawAverage(avg: number | null, votes: number): string | null {
  if (avg === null || votes === 0) return null;
  return formatRaw(avg);
}

export type Outcome = Extract<ActionResult, { ok: false }>["code"] | "network";

/** Which note an action's result needs: null when it worked, "network" when there was no answer. */
export function outcomeOf(r: ActionResult | null): Outcome | null {
  if (!r) return "network";
  return r.ok ? null : r.code;
}

/**
 * How long guarded controls ignore taps after the big button changed (a new
 * phase, act or label). A double tap whose second tap lands after the round
 * trip would otherwise run the NEXT phase's action: "Start performance" then
 * "Start voting", "Reveal" then "Next contestant", "Put on stage" then "Start
 * performance".
 */
export const SETTLE_MS = 800;

/**
 * Whether a tap may act now, `changedAt` being when the big button last
 * changed (null: it has not). Both times come from one monotonic clock
 * (performance.now() in the console); a negative gap is treated as not settled.
 */
export function tapAllowed(changedAt: number | null, now: number, settleMs: number = SETTLE_MS): boolean {
  if (changedAt === null) return true;
  return now - changedAt >= settleMs;
}

/**
 * What the big button depends on: phase (PERFORMED counted as PERFORMING),
 * act and the button itself (for the signed-in role). When this changes
 * between two adopted states, the console settles. Counts, the version, a
 * spin (the prompt and its time), a fixed name and the own score leave it
 * alone: none of them is a step of the show.
 */
export function settleKey(s: AdminState): string {
  const p = primaryAction(s, s.me.role);
  // PERFORMED is PERFORMING with the time up: the server's clock moves it, not
  // an action (same version, same "Start voting"), so it must not settle.
  const phase = s.phase === "PERFORMED" ? "PERFORMING" : s.phase;
  return [phase, s.performanceId ?? "", s.me.role, p ? `${p.labelKey}:${p.action?.type ?? ""}` : ""].join("|");
}
