import type { compareScores } from "./score";

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

/** What anyone may see: never the self score before REVEAL, never voter or IP data. */
export type PublicState = {
  phase: Phase;
  performanceId: string | null;
  contestant: string | null;
  prompt: string | null;
  endsAtMs: number | null;
  /** Counted votes (excluded votes are not counted). */
  votes: number;
  /** The audience score: a whole number from the first counted vote, null with none. */
  average: number | null;
  reveal: {
    self: number;
    audience: number | null;
    result: ReturnType<typeof compareScores>;
  } | null;
};

export type ContestantStatus = "upcoming" | "current" | "done";

export type AdminState = PublicState & {
  /** The signed-in admin, so the console can show who it is and decide what to offer. */
  me: { name: string; role: Role };
  version: number;
  serverNow: number;
  /**
   * For a VOLUNTEER these are stripped: selfScore and rawAverage null,
   * flagged, excluded and kiosk 0, prompts empty (see readAdminState).
   */
  selfScore: number | null;
  rawAverage: number | null;
  flagged: number;
  excluded: number;
  kiosk: number;
  contestants: { id: string; name: string; sort: number; active: boolean; status: ContestantStatus }[];
  prompts: { id: string; text: string; active: boolean }[];
  /** SUPER_ADMIN only. */
  admins?: { id: string; name: string; role: Role; active: boolean }[];
  /** SUPER_ADMIN only: the last 50 entries, newest first. */
  audit?: { at: number; adminName: string; action: string; detail: unknown }[];
  /**
   * SUPER_ADMIN only: the 20 newest performances that have at least one vote,
   * newest first. `votes` counts the votes that count (not excluded), like
   * `votes` above; `flagged` and `excluded` count flagged and excluded votes.
   * setFlaggedExcluded flips `excluded` on the flagged votes only, so
   * `excluded > 0` means the flagged votes are out.
   */
  moderation?: { performanceId: string; contestant: string; votes: number; flagged: number; excluded: number }[];
};

export type ActionResult =
  | { ok: true; state: AdminState }
  | {
      ok: false;
      code: "forbidden" | "not_allowed" | "stale" | "invalid" | "needs_prompt" | "needs_self_score";
      state: AdminState;
    };
