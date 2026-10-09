import { describe, expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import { clockText, clockUnit, formatClock, RING_COLOR, timerTone } from "@/lib/dgl/stage-timer";

describe("formatClock", () => {
  test("whole seconds with the part second rounded up", () => {
    expect(formatClock(90_000)).toBe("90");
    expect(formatClock(89_001)).toBe("90");
    expect(formatClock(89_000)).toBe("89");
    expect(formatClock(9_400)).toBe("10");
    expect(formatClock(60_000)).toBe("60");
    expect(formatClock(59_001)).toBe("60");
    expect(formatClock(400)).toBe("1"); // 0.4 s still reads 1, only 0 reads Time
    expect(formatClock(1)).toBe("1");
  });

  test("0 only once time is up, never below", () => {
    expect(formatClock(0)).toBe("0");
    expect(formatClock(-5_000)).toBe("0");
  });
});

describe("timerTone", () => {
  test("calm above the final countdown", () => {
    expect(timerTone(90_000)).toBe("calm");
    expect(timerTone(10_001)).toBe("calm");
  });

  test("final from DGL.finalCountdownS seconds down to just above 3 s", () => {
    expect(DGL.finalCountdownS).toBe(10);
    expect(timerTone(10_000)).toBe("final");
    expect(timerTone(9_999)).toBe("final");
    expect(timerTone(3_001)).toBe("final");
  });

  test("critical at 3 s or less, at 0 and below", () => {
    expect(timerTone(3_000)).toBe("critical");
    expect(timerTone(2_999)).toBe("critical");
    expect(timerTone(0)).toBe("critical");
    expect(timerTone(-1)).toBe("critical");
  });

  test("the colour changes exactly when the digits do", () => {
    // 11 is calm, 10 is final; 4 is final, 3 is critical.
    expect([formatClock(10_001), timerTone(10_001)]).toEqual(["11", "calm"]);
    expect([formatClock(10_000), timerTone(10_000)]).toEqual(["10", "final"]);
    expect([formatClock(3_001), timerTone(3_001)]).toEqual(["4", "final"]);
    expect([formatClock(3_000), timerTone(3_000)]).toEqual(["3", "critical"]);
  });
});

describe("clockText", () => {
  test("the clock while time is left, the time copy at 0 and below", () => {
    expect(clockText(90_000)).toBe("90");
    expect(clockText(10_000)).toBe("10");
    expect(clockText(400)).toBe("1");
    expect(clockText(1)).toBe("1");
    expect(clockText(0)).toBe(DGL.copy.stageTime);
    expect(clockText(-200)).toBe(DGL.copy.stageTime);
  });
});

describe("clockUnit", () => {
  test("the unit goes with the digits while time is left, and never with the Time copy", () => {
    expect(clockUnit(90_000)).toBe(DGL.copy.secondsUnit);
    expect(clockUnit(10_000)).toBe("sec");
    expect(clockUnit(400)).toBe("sec");
    expect(clockUnit(1)).toBe("sec");
    expect(clockUnit(0)).toBe("");
    expect(clockUnit(-200)).toBe("");
  });
  test("it follows clockText exactly: a unit if and only if the text is digits", () => {
    for (const ms of [90_000, 10_001, 10_000, 3_000, 1, 0, -1]) {
      expect(clockUnit(ms) === "").toBe(clockText(ms) === DGL.copy.stageTime);
    }
  });
});

test("ring colour per tone comes from the spectrum", () => {
  expect(RING_COLOR).toEqual({ calm: "blue", final: "yellow", critical: "red" });
});
