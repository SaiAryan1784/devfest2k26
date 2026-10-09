import type { Phase } from "./types";

/**
 * The server clock, as the phone sees it. Pure: no React, no DOM.
 *
 * The offset is `serverNow - clientNow`, so `clientNow + offset` is server
 * time. A phone whose clock is five minutes slow gets an offset of +300 000.
 */

/**
 * Offset from one round trip: the server stamped `serverNow` roughly halfway
 * between the request leaving (`sentAt`) and the reply arriving (`receivedAt`).
 */
export function estimateOffset(sentAt: number, serverNow: number, receivedAt: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/**
 * The offset to trust from recent samples: the one with the shortest round
 * trip, since a slow trip is where the midpoint assumption is least true.
 */
export function pickOffset(samples: { offset: number; rtt: number }[]): number {
  let best: { offset: number; rtt: number } | null = null;
  for (const s of samples) if (!best || s.rtt < best.rtt) best = s;
  return best ? best.offset : 0;
}

/**
 * Poll often while an act is up (ready, performing, voting, paused), slowly
 * otherwise. READY counts as live: the wheel spins there, and its result
 * should reach the screens while the spin is still running.
 */
export function pollDelay(phase: Phase | null, poll: { votingMs: number; idleMs: number }): number {
  const live =
    phase === "READY" || phase === "VOTING" || phase === "PERFORMING" || phase === "PERFORMED" || phase === "VOTING_PAUSED";
  return live ? poll.votingMs : poll.idleMs;
}

/** Milliseconds until `endsAtMs` (server time), never below 0. */
export function remainingMs(endsAtMs: number, clientNow: number, offset: number): number {
  return Math.max(0, endsAtMs - (clientNow + offset));
}
