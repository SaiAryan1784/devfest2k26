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

const TRANSITIONS: Record<Phase, readonly LiveType[]> = {
  IDLE: ["selectContestant"],
  COMPLETED: ["selectContestant"],
  READY: [
    "selectContestant",
    "reassignContestant",
    "setPrompt",
    "drawPrompt",
    "setSelfScore",
    "startPerformance",
  ],
  PERFORMING: ["reassignContestant", "setSelfScore", "startVoting"],
  PERFORMED: ["reassignContestant", "setSelfScore", "startVoting"],
  VOTING: ["pauseVoting", "stopVoting", "setSelfScore"],
  VOTING_PAUSED: [
    "resumeVoting",
    "stopVoting",
    "reassignContestant",
    "setSelfScore",
  ],
  VOTING_CLOSED: ["reopenVoting", "setSelfScore", "reveal"],
  REVEAL: ["complete"],
};

export function allowed(phase: Phase, action: LiveType): boolean {
  return TRANSITIONS[phase].includes(action);
}

export const LIVE_ACTIONS: readonly LiveType[] = [
  "selectContestant",
  "reassignContestant",
  "setPrompt",
  "drawPrompt",
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
  "upsertContestant",
  "upsertPrompt",
  "upsertAdmin",
  "setFlaggedExcluded",
  "resetShow",
];

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
  OPERATOR: new Set<Permission>([
    ...LIVE_ACTIONS,
    "upsertContestant",
    "upsertPrompt",
    "kioskVote",
  ]),
  HOST: new Set<Permission>(LIVE_ACTIONS),
  VOLUNTEER: new Set<Permission>(["kioskVote"]),
};

export function can(role: Role, action: Permission): boolean {
  return PERMISSIONS[role].has(action);
}

const NEXT_STATUS: Record<LiveType, StoredStatus | null> = {
  selectContestant: "READY",
  startPerformance: "PERFORMING",
  startVoting: "VOTING",
  pauseVoting: "VOTING_PAUSED",
  resumeVoting: "VOTING",
  stopVoting: "VOTING_CLOSED",
  reopenVoting: "VOTING",
  reveal: "REVEAL",
  complete: "COMPLETED",
  reassignContestant: null,
  setPrompt: null,
  drawPrompt: null,
  setSelfScore: null,
};

/** The status an action moves the show to; null when it does not move it. */
export function nextStatus(action: LiveType): StoredStatus | null {
  return NEXT_STATUS[action];
}
