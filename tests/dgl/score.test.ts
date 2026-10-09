import { test, expect } from "vitest";
import { compareScores, formatRaw, publicAverage } from "@/lib/dgl/score";

test("publicAverage rounds half up to a whole number", () => {
  expect(publicAverage(8.5, 1)).toBe(9);
  expect(publicAverage(8.49, 3)).toBe(8);
  expect(publicAverage(8.4999999, 7)).toBe(8);
  expect(publicAverage(1, 1)).toBe(1);
  expect(publicAverage(10, 1)).toBe(10);
});

test("publicAverage rounds a half up at every score and anything else to the nearest", () => {
  // Real averages: a half can only come from an even number of votes.
  const cases: [number, number][] = [
    [1.5, 2],
    [2.5, 3],
    [4.5, 5],
    [7.5, 8],
    [9.5, 10],
    [2.4, 2],
    [2.6, 3],
    [9.4, 9],
    [9.6, 10],
    [65 / 30, 2],
  ];
  for (const [avg, shown] of cases) expect(publicAverage(avg, 30)).toBe(shown);
});

test("publicAverage is null only with no votes", () => {
  expect(publicAverage(9, 0)).toBeNull();
  expect(publicAverage(null, 3)).toBeNull();
  expect(publicAverage(9, 1)).toBe(9); // a single vote counts
});

test("compareScores is whole numbers", () => {
  expect(compareScores(8, 8)).toEqual({ kind: "match" });
  expect(compareScores(9, 7)).toEqual({ kind: "diff", diff: 2 });
  expect(compareScores(3, 9)).toEqual({ kind: "diff", diff: 6 });
  expect(compareScores(9, null)).toEqual({ kind: "insufficient" });
});

test("compareScores: the gap is the same either way round and never a fraction", () => {
  for (const [self, audience] of [
    [2, 9],
    [9, 2],
    [1, 10],
    [10, 1],
    [5, 6],
  ] as const) {
    const r = compareScores(self, audience);
    expect(r.kind).toBe("diff");
    if (r.kind === "diff") {
      expect(r.diff).toBe(Math.abs(self - audience));
      expect(Number.isInteger(r.diff)).toBe(true);
    }
  }
});

test("formatRaw keeps two decimals", () => {
  expect(formatRaw(8.64)).toBe("8.64");
  expect(formatRaw(8)).toBe("8.00");
});

test("formatRaw rounds the exact average half up on the scaled value", () => {
  expect(formatRaw(7.125)).toBe("7.13");
  expect(formatRaw(65 / 30)).toBe("2.17");
});
