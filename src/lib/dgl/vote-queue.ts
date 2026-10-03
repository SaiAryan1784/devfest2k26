import type { VoteResult } from "./votes";

/**
 * The phone's record of its own vote, and how a server answer changes it.
 * Pure: no React, no DOM, only types from the server modules.
 *
 * The honesty rule: a vote is only ever "recorded" once the server said so.
 * Everything else is queued (will be retried) or rejected (will not).
 */

export type LocalVote = {
  performanceId: string;
  score: number;
  state: "queued" | "recorded" | "rejected";
  reason?: "paused" | "closed";
  at: number;
};

/** What a vote attempt can come back as: the server's answer, or no answer. */
export type VoteOutcome = VoteResult | { status: "network" } | { status: "rate_limited" };

export const KEY_PREFIX = "dgl:vote:";
export const voteKey = (performanceId: string) => `${KEY_PREFIX}${performanceId}`;

const STATES = ["queued", "recorded", "rejected"] as const;
const REASONS = ["paused", "closed"] as const;

function isLocalVote(x: unknown, performanceId: string): x is LocalVote {
  if (typeof x !== "object" || x === null) return false;
  const v = x as Record<string, unknown>;
  return (
    v.performanceId === performanceId &&
    typeof v.score === "number" &&
    Number.isInteger(v.score) &&
    v.score >= 1 &&
    v.score <= 10 &&
    typeof v.state === "string" &&
    (STATES as readonly string[]).includes(v.state) &&
    (v.reason === undefined || (REASONS as readonly unknown[]).includes(v.reason)) &&
    typeof v.at === "number"
  );
}

/** A stored vote, parsed and checked, or null (missing, corrupt, or for another performance). */
export function parseVote(raw: string | null, performanceId: string): LocalVote | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isLocalVote(parsed, performanceId) ? parsed : null;
  } catch {
    return null;
  }
}

/** The stored vote for a performance, or null (missing, corrupt, or storage that throws). */
export function loadVote(storage: Storage, performanceId: string): LocalVote | null {
  try {
    return parseVote(storage.getItem(voteKey(performanceId)), performanceId);
  } catch {
    return null;
  }
}

/** Every stored vote still waiting to be sent, for any performance (a refresh mid-request leaves one). */
export function queuedVotes(storage: Storage): LocalVote[] {
  const found: LocalVote[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const v = loadVote(storage, key.slice(KEY_PREFIX.length));
      if (v && v.state === "queued") found.push(v);
    }
  } catch {
    // Unreadable storage: nothing to recover.
  }
  return found;
}

/**
 * Two views of one vote (this tab's and another tab's): a decided vote
 * (recorded or rejected) always beats a queued one, and this tab's own
 * decided vote is never replaced.
 */
export function mergeVotes(mine: LocalVote | undefined, theirs: LocalVote): LocalVote {
  if (!mine) return theirs;
  if (mine.state !== "queued") return mine;
  return theirs.state !== "queued" ? theirs : mine;
}

/** Best effort: private modes and full quotas must never break voting. */
export function saveVote(storage: Storage, v: LocalVote): void {
  try {
    storage.setItem(voteKey(v.performanceId), JSON.stringify(v));
  } catch {
    // The in-memory vote still works for this tab.
  }
}

/** Never mutates `v`. See the mapping table in the DGL plan (Task 7). */
export function applyVoteResult(v: LocalVote, r: VoteOutcome): LocalVote {
  switch (r.status) {
    case "recorded":
    case "duplicate": {
      // The server's score wins, including on a duplicate (a vote from another tab or phone).
      const next: LocalVote = { ...v, score: r.score, state: "recorded" };
      delete next.reason;
      return next;
    }
    case "paused":
      return { ...v, state: "queued", reason: "paused" };
    case "closed":
      return { ...v, state: "rejected", reason: "closed" };
    case "network":
    case "rate_limited":
      return v;
  }
}

const isScore = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 10;

/**
 * The HTTP outcome of POST /api/dgl/vote as a VoteOutcome. `null` is a fetch
 * that threw (offline, timeout). Anything unexpected (5xx, 400, 403, a body
 * that does not match its status) is "network": the vote stays queued and is
 * never shown as recorded.
 */
export async function toVoteResult(res: Response | null): Promise<VoteOutcome> {
  if (!res) return { status: "network" };
  if (res.status === 429) return { status: "rate_limited" };
  if (res.status !== 200 && res.status !== 409) return { status: "network" };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: "network" };
  }
  if (typeof body !== "object" || body === null) return { status: "network" };
  const b = body as { status?: unknown; score?: unknown };
  if (res.status === 200) {
    return b.status === "recorded" && isScore(b.score) ? { status: "recorded", score: b.score } : { status: "network" };
  }
  if (b.status === "duplicate" && isScore(b.score)) return { status: "duplicate", score: b.score };
  if (b.status === "paused") return { status: "paused" };
  if (b.status === "closed") return { status: "closed" };
  return { status: "network" };
}
