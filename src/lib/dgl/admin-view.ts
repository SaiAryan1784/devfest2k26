import { allowed, can, effectivePhase } from "./machine";
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
  | "selectContestant"
  | "startPerformance"
  | "startVoting"
  | "stopVoting"
  | "resumeVoting"
  | "reveal"
  | "complete";

export type DisabledReason = "needsPrompt" | "needsSelfScore" | "noContestants" | "noPrompts" | "noOtherContestants";

export type Primary = {
  /** Key into DGL.copy.admin.primary. */
  labelKey: PrimaryKey;
  /** Null for the IDLE / COMPLETED hint, which only moves focus to the queue. */
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

const selectable = (s: AdminState) => s.contestants.filter((k) => k.active && k.status !== "current");

export function primaryAction(s: AdminState | null, role: Role | null, now?: number): Primary | null {
  if (!s || !role) return null;
  const phase = phaseAt(s, now);

  if (phase === "IDLE" || phase === "COMPLETED") {
    if (!allowed(phase, "selectContestant") || !can(role, "selectContestant")) return null;
    const none = selectable(s).length === 0;
    return {
      labelKey: "selectContestant",
      action: null,
      disabled: none,
      disabledReason: none ? "noContestants" : null,
      needsConfirm: false,
    };
  }

  const type = NEXT[phase];
  if (!type || !allowed(phase, type) || !can(role, type)) return null;
  let disabledReason: DisabledReason | null = null;
  if (type === "startPerformance" && !s.prompt) disabledReason = "needsPrompt";
  if (type === "reveal" && s.selfScore === null) disabledReason = "needsSelfScore";
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
  | "drawPrompt"
  | "setPrompt"
  | "reassignContestant"
  | "setSelfScore";

export type Secondary = { key: SecondaryKey; needsConfirm: boolean; disabledReason: DisabledReason | null };

const SECONDARY: readonly SecondaryKey[] = [
  "pauseVoting",
  "resumeVoting",
  "stopVoting",
  "reopenVoting",
  "drawPrompt",
  "setPrompt",
  "reassignContestant",
  "setSelfScore",
];
const CONFIRM = new Set<SecondaryKey>(["stopVoting", "reopenVoting", "reassignContestant"]);

/** Active upcoming contestants: who can take the current slot on a reassign. */
export function reassignTargets(s: AdminState): AdminState["contestants"] {
  return s.contestants.filter((k) => k.active && k.status === "upcoming");
}

/**
 * The smaller controls, in display order: each one allowed in this phase and
 * permitted for the role, minus whatever the big button already does.
 * `setPrompt` is the typed prompt field and `setSelfScore` the own-score grid;
 * the rest are buttons.
 */
export function secondaryActions(s: AdminState | null, role: Role | null, now?: number): Secondary[] {
  if (!s || !role) return [];
  const phase = phaseAt(s, now);
  const primary = primaryAction(s, role, now)?.action?.type;
  return SECONDARY.filter((k) => k !== primary && allowed(phase, k) && can(role, k)).map((key) => {
    let disabledReason: DisabledReason | null = null;
    if (key === "drawPrompt" && !s.prompts.some((r) => r.active)) disabledReason = "noPrompts";
    if (key === "reassignContestant" && reassignTargets(s).length === 0) disabledReason = "noOtherContestants";
    return { key, needsConfirm: CONFIRM.has(key), disabledReason };
  });
}

/** The queue row's button for one contestant: "select" or nothing. */
export function queueAction(s: AdminState | null, role: Role | null, contestantId: string, now?: number): "select" | null {
  if (!s || !role) return null;
  const k = s.contestants.find((x) => x.id === contestantId);
  if (!k || !k.active || k.status === "current") return null;
  return allowed(phaseAt(s, now), "selectContestant") && can(role, "selectContestant") ? "select" : null;
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
 * The admin-only raw average, two decimals (same rounding rule as
 * formatAverage: Math.round on the scaled value). Null with no votes, so the
 * console says "No votes yet" instead of a number.
 */
export function formatRawAverage(avg: number | null, votes: number): string | null {
  if (avg === null || votes === 0) return null;
  return (Math.round(avg * 100) / 100).toFixed(2);
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
 * "Start voting", "Reveal" then "Next contestant".
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
 * What the big button depends on: phase, act and the button itself (for the
 * signed-in role). When this changes between two adopted states, the console
 * settles. Counts, the version, the prompt and the own score leave it alone.
 */
export function settleKey(s: AdminState): string {
  const p = primaryAction(s, s.me.role);
  return [s.phase, s.performanceId ?? "", s.me.role, p ? `${p.labelKey}:${p.action?.type ?? ""}` : ""].join("|");
}
