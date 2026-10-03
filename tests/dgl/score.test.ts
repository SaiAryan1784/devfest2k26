import { test, expect } from "vitest";
import { compareScores, formatAverage, publicAverage } from "@/lib/dgl/score";

test("average hidden below threshold, one decimal at or above", () => {
  expect(publicAverage(9, 4)).toBeNull();
  expect(publicAverage(8.24, 5)).toBe(8.2);
  expect(formatAverage(8)).toBe("8.0");
});

test("compare", () => {
  expect(compareScores(8, 8.04)).toEqual({ kind: "match" });
  expect(compareScores(9, 6.7)).toEqual({ kind: "diff", diff: 2.3 });
  expect(compareScores(9, null)).toEqual({ kind: "insufficient" });
});
