import type { Comparison } from "./score";
import type { PublicState } from "./types";

/**
 * What the stage display (/dgl/stage) shows, decided from the polled show
 * state. Pure: no React, no DOM. The components only render it.
 *
 * The stage never carries the running average: voting shows the count only,
 * and the audience score appears at REVEAL, from the server's own reveal
 * (which already holds compareScores' result; nothing here recomputes it).
 */

/** As the phone's Act: while the wheel spins, `prompt` is null and the screen says the wheel is spinning. */
export type StageAct = { contestant: string | null; prompt: string | null; spinning: boolean };

export type StageView =
  | { kind: "idle" }
  | { kind: "completed" }
  /** Between acts, with the host's winner screen on. */
  | { kind: "winner"; names: string[]; audience: number }
  | { kind: "ready"; id: string; act: StageAct }
  /** PERFORMING (running) and PERFORMED (time up) share one screen so the timer never remounts at 0. */
  | { kind: "clock"; id: string; act: StageAct; endsAtMs: number | null; running: boolean }
  | { kind: "voting"; id: string; act: StageAct; votes: number; paused: boolean }
  | { kind: "closed"; id: string; act: StageAct; votes: number }
  | { kind: "reveal"; id: string; act: StageAct; self: number; audience: number | null; result: Comparison };

/** `spinning` comes from useSpinning(state.spunAtMs, offset); it hides the prompt in any phase until the spin ends. */
export function stageView(state: PublicState | null, spinning = false): StageView {
  // Before the first poll (and on the server) there is nothing to show but the waiting screen.
  if (!state) return { kind: "idle" };
  const { phase, performanceId: id } = state;
  if (phase === "COMPLETED") return state.winner ? { kind: "winner", ...state.winner } : { kind: "completed" };
  if (phase === "IDLE" || !id) return { kind: "idle" };
  const act: StageAct = { contestant: state.contestant, prompt: spinning ? null : state.prompt, spinning };

  switch (phase) {
    case "READY":
      return { kind: "ready", id, act };
    case "PERFORMING":
    case "PERFORMED":
      return { kind: "clock", id, act, endsAtMs: state.endsAtMs, running: phase === "PERFORMING" };
    case "VOTING":
    case "VOTING_PAUSED":
      return { kind: "voting", id, act, votes: state.votes, paused: phase === "VOTING_PAUSED" };
    case "VOTING_CLOSED":
      return { kind: "closed", id, act, votes: state.votes };
    case "REVEAL":
      if (!state.reveal) return { kind: "closed", id, act, votes: state.votes };
      return { kind: "reveal", id, act, ...state.reveal };
  }
}

/**
 * The QR code and the URL line under it are up only while the act is running
 * or voting is open: PERFORMING and PERFORMED (the `clock` screen) and VOTING
 * and VOTING_PAUSED (the `voting` screen). Waiting, up next, voting closed,
 * the reveal and between acts have neither.
 */
export function showsQr(v: StageView): boolean {
  return v.kind === "clock" || v.kind === "voting";
}

/**
 * How the DevFest Got Latent artwork is shown: the full poster fills the
 * screen while nothing is on (waiting, and between acts with no winner), a
 * wide banner strip tops every other screen so the act always has the room.
 */
export function bannerFor(v: StageView): "poster" | "strip" {
  return v.kind === "idle" || v.kind === "completed" ? "poster" : "strip";
}

/**
 * Which screen the right-hand column is on, for cross-fades. Phases that only
 * change a detail of one screen (the clock running out, voting pausing) keep
 * the key; a new act always gets a new one.
 */
export function screenKey(v: StageView): string {
  return v.kind === "idle" || v.kind === "completed" || v.kind === "winner" ? v.kind : `${v.kind}:${v.id}`;
}
