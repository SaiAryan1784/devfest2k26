/** Status stored on a performance row. */
export type StoredStatus =
  | "READY"
  | "PERFORMING"
  | "VOTING"
  | "VOTING_PAUSED"
  | "VOTING_CLOSED"
  | "REVEAL"
  | "COMPLETED";

/**
 * What the show is doing right now. IDLE means there is no current
 * performance; PERFORMED means PERFORMING with the time up. UPCOMING is a
 * contestant-list status, never a phase.
 */
export type Phase = "IDLE" | StoredStatus | "PERFORMED";

export type Role = "SUPER_ADMIN" | "OPERATOR" | "HOST" | "VOLUNTEER";

export type LiveAction =
  | { type: "selectContestant"; contestantId: string }
  | { type: "reassignContestant"; contestantId: string }
  | { type: "setPrompt"; text: string }
  | { type: "drawPrompt" }
  | { type: "startPerformance" }
  | { type: "startVoting" }
  | { type: "pauseVoting" }
  | { type: "resumeVoting" }
  | { type: "stopVoting" }
  | { type: "reopenVoting" }
  | { type: "setSelfScore"; score: number }
  | { type: "reveal" }
  | { type: "complete" };

export type SetupAction =
  | {
      type: "upsertContestant";
      id?: string;
      name: string;
      sort: number;
      active: boolean;
    }
  | { type: "upsertPrompt"; id?: string; text: string; active: boolean }
  | {
      type: "upsertAdmin";
      id?: string;
      name: string;
      role: Role;
      passcode?: string;
      active: boolean;
    }
  | { type: "setFlaggedExcluded"; performanceId: string; excluded: boolean }
  | { type: "resetShow"; confirm: "RESET" };

export type Action = LiveAction | SetupAction;
