import { DGL } from "@/data/dgl";

/**
 * The one rounding rule for every figure shown: Math.round on x * 10, so a
 * tie like 8.35 goes up. toFixed(1) would round on the binary value instead
 * (8.35 gives "8.3") and disagree with the rest.
 */
const r1 = (x: number): number => Math.round(x * 10) / 10;

/** One decimal, always: 8 becomes "8.0". */
export function formatAverage(avg: number): string {
  return r1(avg).toFixed(1);
}

/** The average the public may see: null below DGL.minVotes, else 1 dp. */
export function publicAverage(avg: number | null, count: number): number | null {
  if (avg === null || count < DGL.minVotes) return null;
  return r1(avg);
}

export type Comparison =
  | { kind: "match" }
  | { kind: "diff"; diff: number }
  | { kind: "insufficient" };

/** Contestant's own score against the audience average (both on 1 to 10). */
export function compareScores(self: number, audience: number | null): Comparison {
  if (audience === null) return { kind: "insufficient" };
  const diff = r1(Math.abs(self - audience));
  if (diff < 0.1) return { kind: "match" };
  return { kind: "diff", diff };
}
