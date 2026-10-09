import { DGL } from "@/data/dgl";

/**
 * The prompt wheel, in server time. Pure: no React, no DOM.
 *
 * A spin stores the prompt and the server time of the spin (`spunAtMs`). Every
 * screen hides the prompt until `spunAtMs + spinMs`, so the wheel on the stage
 * and the prompt on the phones land together. "none" before any spin.
 */
export type SpinState = "none" | "spinning" | "landed";

export function spinState(spunAtMs: number | null, serverNowMs: number, spinMs: number = DGL.wheel.spinMs): SpinState {
  if (spunAtMs === null) return "none";
  return serverNowMs < spunAtMs + spinMs ? "spinning" : "landed";
}

/**
 * Milliseconds until the spin ends, 0 when it is not spinning. Never more than
 * one spin: a device whose clock reads before the spin (an offset not measured
 * yet, or wrong) hides the prompt for one spin at most, not until its own clock
 * catches up.
 */
export function spinLeftMs(spunAtMs: number | null, serverNowMs: number, spinMs: number = DGL.wheel.spinMs): number {
  if (spunAtMs === null || spinState(spunAtMs, serverNowMs, spinMs) !== "spinning") return 0;
  return Math.min(spinMs, spunAtMs + spinMs - serverNowMs);
}

/** Whole turns the wheel makes before it settles. */
const WHEEL_TURNS = 6;

/**
 * Where the wheel stops: a segment picked by a stable hash of the prompt
 * (FNV-1a), so the stage's wheel is the same on a refresh or a second
 * screen, and the number of turns. The wheel is for show: the prompt itself
 * is chosen on the server; this only gives it a place to land. No prompt
 * (before any spin) is segment 0.
 */
export function wheelTarget(prompt: string | null, segments: number): { segment: number; turns: number } {
  if (prompt === null) return { segment: 0, turns: WHEEL_TURNS };
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return { segment: h % segments, turns: WHEEL_TURNS };
}

/**
 * The wheel's final rotation in degrees: `turns` full turns plus the angle
 * that brings the middle of `segment` under the pointer at the top. Segments
 * run clockwise from the top (a conic-gradient's own start), so the middle of
 * segment i sits at (i + 0.5) * step degrees and the wheel must turn the
 * rest of the way round to put it at 0.
 */
export function wheelAngle(segment: number, turns: number, segments: number): number {
  const step = 360 / segments;
  return turns * 360 + (360 - (segment * step + step / 2));
}
