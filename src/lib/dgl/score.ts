/**
 * The audience score is a whole number: the exact average rounded half up
 * (8.4 shows 8, 8.5 shows 9). Math.round does exactly that for the positive
 * averages here. It exists from the first counted vote; there is no minimum.
 * Staff alone see the exact figure, through formatRaw.
 */

/** The audience score the public may see: null with no counted votes, else a whole number. */
export function publicAverage(avg: number | null, count: number): number | null {
  if (avg === null || count < 1) return null;
  return Math.round(avg);
}

export type Comparison =
  | { kind: "match" }
  | { kind: "diff"; diff: number }
  | { kind: "insufficient" };

/**
 * Contestant's own score against the audience score. Both are whole numbers
 * on 1 to 10 (publicAverage already rounded the audience's), so the gap is
 * one too, and "match" means the two numbers are equal. "insufficient" means
 * there is no audience score, which now only happens with no votes.
 */
export function compareScores(self: number, audience: number | null): Comparison {
  if (audience === null) return { kind: "insufficient" };
  if (self === audience) return { kind: "match" };
  return { kind: "diff", diff: Math.abs(self - audience) };
}

/**
 * The exact average to two decimals (8.64, and 8 gives "8.00"), for staff
 * only (the admin console). Math.round on the scaled value, so a tie like
 * 7.125 goes up; toFixed(2) alone would round on the binary value.
 */
export function formatRaw(avg: number): string {
  return (Math.round(avg * 100) / 100).toFixed(2);
}
