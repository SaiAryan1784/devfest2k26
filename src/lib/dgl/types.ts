import type { Track } from "@/data/dgl";
import type { compareScores } from "./score";

export type { Track };

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
 * performance; PERFORMED means PERFORMING with the time up.
 */
export type Phase = "IDLE" | StoredStatus | "PERFORMED";

/**
 * The two admin roles. A HOST runs the show (every live action) and may record
 * kiosk votes; a SUPER_ADMIN can do that and everything in setup. A role
 * stored before this pair existed (OPERATOR, VOLUNTEER) reads as HOST (see
 * normalizeRole). The audience is not a role: it has no account.
 */
export type Role = "SUPER_ADMIN" | "HOST";

/** A signed-in admin. `track` null means all three tracks. */
export type Admin = { id: string; name: string; role: Role; track: Track | null };

/** The highest-scoring act(s) of a track: an exact tie lists every tied name. */
export type Winners = { names: string[]; audience: number };

export type LiveAction =
  /** The host typed who is on stage: a new act, READY. */
  | { type: "putOnStage"; name: string }
  /** Fix a typo in the current act's name. */
  | { type: "renameAct"; name: string }
  /** Pick a random active prompt for the current act (READY only, repeatable). */
  | { type: "spinWheel" }
  | { type: "startPerformance" }
  | { type: "startVoting" }
  | { type: "pauseVoting" }
  | { type: "resumeVoting" }
  | { type: "stopVoting" }
  | { type: "reopenVoting" }
  | { type: "setSelfScore"; score: number }
  | { type: "reveal" }
  | { type: "complete" }
  /** Between acts: put the track's winner on the stage (and phones), or take it off. */
  | { type: "showWinner" }
  | { type: "hideWinner" };

export type SetupAction =
  | { type: "upsertPrompt"; id?: string; text: string; active: boolean }
  | {
      type: "upsertAdmin";
      id?: string;
      name: string;
      role: Role;
      /** Null: all tracks. */
      track: Track | null;
      passcode?: string;
      active: boolean;
    }
  | { type: "setFlaggedExcluded"; performanceId: string; excluded: boolean }
  | { type: "resetShow"; confirm: "RESET" };

export type Action = LiveAction | SetupAction;

/** What anyone may see: never the self score before REVEAL, never voter or IP data. */
export type PublicState = {
  track: Track;
  phase: Phase;
  performanceId: string | null;
  /** The current act's name, as the host typed it. */
  contestant: string | null;
  /** Set by the wheel. Screens hide it until the spin ends (spunAtMs + DGL.wheel.spinMs, server time). */
  prompt: string | null;
  /** Server time of the current act's last spin, null before any spin. */
  spunAtMs: number | null;
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
  /** Non-null only while the host has the winner screen on. */
  winner: Winners | null;
};

/** One act of the track so far, for the staff list. */
export type ActRow = {
  performanceId: string;
  name: string;
  status: StoredStatus;
  votes: number;
  /** The whole-number audience score, null with no counted votes. */
  audience: number | null;
  /** The exact average (staff only), null with no counted votes. */
  exact: number | null;
  revealed: boolean;
};

export type AdminState = PublicState & {
  /** The signed-in admin, so the console can show who it is and decide what to offer. */
  me: { name: string; role: Role; track: Track | null };
  /** This track's acts in running order, and who leads (the winner if shown now). */
  acts: ActRow[];
  leaders: Winners | null;
  winnerShown: boolean;
  version: number;
  serverNow: number;
  selfScore: number | null;
  rawAverage: number | null;
  flagged: number;
  excluded: number;
  kiosk: number;
  /** The whole prompt pool (the wheel draws from the active ones). */
  prompts: { id: string; text: string; active: boolean }[];
  /** SUPER_ADMIN only. */
  admins?: { id: string; name: string; role: Role; track: Track | null; active: boolean }[];
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
      code: "forbidden" | "not_allowed" | "stale" | "invalid" | "needs_self_score" | "no_winner";
      state: AdminState;
    };
