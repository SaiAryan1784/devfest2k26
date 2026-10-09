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
