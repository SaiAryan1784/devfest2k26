import type {
  Action,
  LiveAction,
  Phase,
  Role,
  SetupAction,
  StoredStatus,
} from "./types";

type LiveType = LiveAction["type"];

/** Pure phase from the stored status and the server clock. */
export function effectivePhase(
  status: StoredStatus | null,
  endsAtMs: number | null,
  now: number,
): Phase {
  if (status === null) return "IDLE";
  if (status === "PERFORMING" && endsAtMs !== null && now >= endsAtMs) {
    return "PERFORMED";
  }
  return status;
}

/*
 * What each phase allows. An act goes on stage only when nothing is running
 * (IDLE, or COMPLETED between acts); a typo in its name can be fixed until
 * voting opens, and again while voting is paused; the wheel spins only before
 * the act starts.
 */
const TRANSITIONS: Record<Phase, readonly LiveType[]> = {
  IDLE: ["putOnStage"],
  COMPLETED: ["putOnStage"],
  READY: ["renameAct", "spinWheel", "setSelfScore", "startPerformance"],
  PERFORMING: ["renameAct", "setSelfScore", "startVoting"],
  PERFORMED: ["renameAct", "setSelfScore", "startVoting"],
  VOTING: ["pauseVoting", "stopVoting", "setSelfScore"],
  VOTING_PAUSED: ["resumeVoting", "stopVoting", "renameAct", "setSelfScore"],
  VOTING_CLOSED: ["reopenVoting", "setSelfScore", "reveal"],
  REVEAL: ["complete"],
};

export function allowed(phase: Phase, action: LiveType): boolean {
  return TRANSITIONS[phase].includes(action);
}

export const LIVE_ACTIONS: readonly LiveType[] = [
  "putOnStage",
  "renameAct",
  "spinWheel",
  "startPerformance",
  "startVoting",
  "pauseVoting",
  "resumeVoting",
  "stopVoting",
  "reopenVoting",
  "setSelfScore",
  "reveal",
  "complete",
];

export const SETUP_ACTIONS: readonly SetupAction["type"][] = [
  "upsertPrompt",
  "upsertAdmin",
  "setFlaggedExcluded",
  "resetShow",
];

/** The admin roles, in the order a role picker lists them. */
export const ROLES: readonly Role[] = ["SUPER_ADMIN", "HOST"];

export const isRole = (x: unknown): x is Role => ROLES.includes(x as Role);

type Permission = Action["type"] | "kioskVote";

/*
 * Nobody has an action that edits a vote's score. setFlaggedExcluded
 * (SUPER_ADMIN only) is the only vote moderation.
 */
export const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set<Permission>([
    ...LIVE_ACTIONS,
    ...SETUP_ACTIONS,
    "kioskVote",
  ]),
  HOST: new Set<Permission>([...LIVE_ACTIONS, "kioskVote"]),
};

/** A role read from the database goes through normalizeRole first; anything that slipped past it may do nothing. */
export function can(role: Role, action: Permission): boolean {
  return PERMISSIONS[role]?.has(action) ?? false;
}

const NEXT_STATUS: Record<LiveType, StoredStatus | null> = {
  putOnStage: "READY",
  startPerformance: "PERFORMING",
  startVoting: "VOTING",
  pauseVoting: "VOTING_PAUSED",
  resumeVoting: "VOTING",
  stopVoting: "VOTING_CLOSED",
  reopenVoting: "VOTING",
  reveal: "REVEAL",
  complete: "COMPLETED",
  renameAct: null,
  spinWheel: null,
  setSelfScore: null,
};

/** The status an action moves the show to; null when it does not move it. */
export function nextStatus(action: LiveType): StoredStatus | null {
  return NEXT_STATUS[action];
}
