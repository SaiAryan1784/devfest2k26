import { DGL } from "@/data/dgl";
import type { Comparison } from "./score";
import type { Phase, PublicState } from "./types";
import type { LocalVote } from "./vote-queue";

/**
 * What the audience page (/dgl) shows, decided from the polled show state and
 * this phone's vote. Pure: no React, no DOM. The components only render it.
 */

/** Which DGL.copy line describes this phone's vote right now. */
export type VoteLineKey = "voteRecorded" | "voteQueued" | "votePaused" | "voteNotCounted" | "voteCookiesBlocked";

export type VoteShown = { score: number; state: LocalVote["state"]; line: VoteLineKey };
/**
 * The act on stage. While the wheel is spinning (`spinning`, from useSpinning
 * in server time) `prompt` is null and the screen says the wheel is spinning
 * in its place, so the prompt never shows before the wheel lands.
 */
export type Act = { contestant: string | null; prompt: string | null; spinning: boolean };
/** `average` is the public one, a whole number (null with no counted votes); `showAverage` says whether to show it at all. */
export type Tally = { votes: number; average: number | null; showAverage: boolean };

export type AudienceView =
  | { kind: "idle" }
  | { kind: "ready"; act: Act }
  | { kind: "performing"; act: Act; endsAtMs: number | null }
  | { kind: "performed"; act: Act }
  | { kind: "voting-grid"; act: Act; tally: Tally; notCounted: boolean }
  | { kind: "voted"; act: Act; tally: Tally; vote: VoteShown }
  | { kind: "paused"; act: Act; vote: VoteShown | null }
  | { kind: "closed"; act: Act; tally: Tally; vote: VoteShown | null }
  | { kind: "reveal"; act: Act; self: number; audience: number | null; result: Comparison }
  | { kind: "completed" }
  | { kind: "winner"; names: string[]; audience: number };

/**
 * The line for a vote, from its state and the CURRENT phase. A queued vote's
 * `reason: "paused"` can outlive the pause (a later network error keeps it),
 * so the reason is never read here: only a queued vote while the show is
 * actually paused says "paused". `cookiesBlocked` (see afterAnswer in
 * vote-queue.ts) replaces a queued vote's line in any phase: the vote cannot
 * be sent until the voter allows cookies, and that is the thing to say.
 */
export function voteLine(v: LocalVote, phase: Phase, cookiesBlocked = false): VoteLineKey {
  if (v.state === "recorded") return "voteRecorded";
  if (v.state === "rejected") return "voteNotCounted";
  if (cookiesBlocked) return "voteCookiesBlocked";
  return phase === "VOTING_PAUSED" ? "votePaused" : "voteQueued";
}

/**
 * `spinning` comes from useSpinning(state.spunAtMs, offset). It is not tied to
 * a phase: the prompt stays hidden until the spin ends even if the act has
 * started by then.
 */
export function viewFor(state: PublicState | null, local: LocalVote | null, cookiesBlocked = false, spinning = false): AudienceView {
  // Before the first poll (and on the server) there is nothing to show but the waiting screen.
  if (!state) return { kind: "idle" };
  const { phase } = state;
  const act: Act = { contestant: state.contestant, prompt: spinning ? null : state.prompt, spinning };
  const mine = local && local.performanceId === state.performanceId ? local : null;
  const shown: VoteShown | null = mine ? { score: mine.score, state: mine.state, line: voteLine(mine, phase, cookiesBlocked) } : null;
  const tally = (showAverage: boolean): Tally => ({ votes: state.votes, average: state.average, showAverage });

  switch (phase) {
    case "IDLE":
      return { kind: "idle" };
    case "COMPLETED":
      return state.winner ? { kind: "winner", ...state.winner } : { kind: "completed" };
    case "READY":
      return { kind: "ready", act };
    case "PERFORMING":
      return { kind: "performing", act, endsAtMs: state.endsAtMs };
    case "PERFORMED":
      return { kind: "performed", act };
    case "VOTING":
      // No vote, or one voting closed on before a reopen: the grid (useVote.submit accepts exactly these).
      if (!shown || shown.state === "rejected") {
        return { kind: "voting-grid", act, tally: tally(DGL.showLiveAverage === "always"), notCounted: shown?.state === "rejected" };
      }
      return { kind: "voted", act, tally: tally(true), vote: shown };
    case "VOTING_PAUSED":
      return { kind: "paused", act, vote: shown };
    case "VOTING_CLOSED":
      return { kind: "closed", act, tally: tally(true), vote: shown };
    case "REVEAL":
      if (!state.reveal) return { kind: "closed", act, tally: tally(true), vote: shown };
      return { kind: "reveal", act, ...state.reveal };
  }
}

/** Arrow keys on a 5 x 2 grid of 1 to 10: left and right step and wrap, up and down switch rows. */
export function gridKey(n: number, key: string): number | null {
  switch (key) {
    case "ArrowRight":
      return (n % 10) + 1;
    case "ArrowLeft":
      return ((n + 8) % 10) + 1;
    case "ArrowDown":
    case "ArrowUp":
      return n <= 5 ? n + 5 : n - 5;
    case "Home":
      return 1;
    case "End":
      return 10;
    default:
      return null;
  }
}

/** Whole seconds, a part second rounded up, so the clock reads 0 only once time is up: 90, never 1:30. */
export function formatClock(ms: number): string {
  return String(Math.max(0, Math.ceil(ms / 1000)));
}

/** The phone's clock text: the whole seconds and their unit, "90 sec". */
export function clockLabel(ms: number): string {
  return `${formatClock(ms)} ${DGL.copy.secondsUnit}`;
}

/** The last DGL.finalCountdownS seconds (the clock reads 10 or less). */
export function isFinalCountdown(ms: number): boolean {
  return ms <= DGL.finalCountdownS * 1000;
}

const c = DGL.copy;
const sentence = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(". ");

/**
 * What the polite live region says. Phase and vote state only: never the
 * clock or the vote count, which change every second or poll and would
 * make a screen reader talk over the show.
 */
export function liveText(v: AudienceView): string {
  const yours = (vote: VoteShown | null) => vote && sentence(`${c.yourScore} ${vote.score}`, c[vote.line]);
  switch (v.kind) {
    case "idle":
      return c.idleTitle;
    case "ready":
      return sentence(c.upNext, v.act.contestant);
    case "performing":
      return sentence(c.onStageNow, v.act.contestant);
    case "performed":
      return c.performed;
    case "voting-grid":
      return sentence(v.notCounted && c.earlierNotCounted, c.votingTitle, v.act.contestant);
    case "voted":
      return yours(v.vote)!;
    case "paused":
      // A queued vote's own line is "Voting is paused" too: say it once.
      return sentence(c.votePaused, v.vote && `${c.yourScore} ${v.vote.score}`, v.vote && v.vote.line !== "votePaused" && c[v.vote.line]);
    case "closed":
      return sentence(c.votingClosed, yours(v.vote));
    case "reveal": {
      const r = revealLines(v);
      return sentence(`${c.ownScore} ${v.self}`, r.audience && `${c.audience} ${r.audience}`, r.verdict);
    }
    case "completed":
      return c.completed;
    case "winner":
      return sentence(v.names.length > 1 ? c.winnersTitle : c.winnerTitle, v.names.join(", "), c.winnerScore(v.audience));
  }
}

/**
 * The reveal's audience figure ("8 / 10", or null with no votes) and its
 * verdict line, shared by the page and the live region. Both numbers are the
 * server's whole numbers; nothing is rounded or recomputed here.
 */
export function revealLines(v: Extract<AudienceView, { kind: "reveal" }>): { audience: string | null; verdict: string } {
  if (v.result.kind === "insufficient" || v.audience === null) return { audience: null, verdict: c.noVotes };
  return {
    audience: c.outOfTen(v.audience),
    verdict: v.result.kind === "match" ? c.perfectMatch : c.difference(v.result.diff),
  };
}

/**
 * The audience-average part of the tally line, or null while it is not meant
 * to show yet (see DGL.showLiveAverage). With no counted votes there is no
 * average: "Waiting for audience..." while voting is open, "No votes" once it
 * has closed. One vote is already an average.
 */
export function tallyAverage(tally: Tally, closed: boolean): string | null {
  if (!tally.showAverage) return null;
  if (tally.average === null) return closed ? c.noVotes : c.waitingForAudience;
  return `${c.audienceAverage} ${c.outOfTen(tally.average)}`;
}
