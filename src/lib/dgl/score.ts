import { DGL } from "@/data/dgl";

/** One decimal, always: 8 becomes "8.0". */
export function formatAverage(avg: number): string {
  return avg.toFixed(1);
}

/** The average the public may see: null below DGL.minVotes, else 1 dp. */
export function publicAverage(avg: number | null, count: number): number | null {
  if (avg === null || count < DGL.minVotes) return null;
  return Math.round(avg * 10) / 10;
}

export type Comparison =
  | { kind: "match" }
  | { kind: "diff"; diff: number }
  | { kind: "insufficient" };

/** Contestant's own score against the audience average (both on 1 to 10). */
export function compareScores(self: number, audience: number | null): Comparison {
  if (audience === null) return { kind: "insufficient" };
  const diff = Math.round(Math.abs(self - audience) * 10) / 10;
  if (diff < 0.1) return { kind: "match" };
  return { kind: "diff", diff };
}
