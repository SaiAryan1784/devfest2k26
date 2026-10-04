import { describe, expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import { clockText, formatClock, RING_COLOR, timerTone } from "@/lib/dgl/stage-timer";

describe("formatClock", () => {
  test("M:SS with the part second rounded up", () => {
    expect(formatClock(90_000)).toBe("1:30");
    expect(formatClock(9_400)).toBe("0:10");
    expect(formatClock(60_000)).toBe("1:00");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(1)).toBe("0:01");
  });

  test("0:00 only once time is up, never below", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5_000)).toBe("0:00");
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
    // 0:11 is calm, 0:10 is final; 0:04 is final, 0:03 is critical.
    expect([formatClock(10_001), timerTone(10_001)]).toEqual(["0:11", "calm"]);
    expect([formatClock(10_000), timerTone(10_000)]).toEqual(["0:10", "final"]);
    expect([formatClock(3_001), timerTone(3_001)]).toEqual(["0:04", "final"]);
    expect([formatClock(3_000), timerTone(3_000)]).toEqual(["0:03", "critical"]);
  });
});

describe("clockText", () => {
  test("the clock while time is left, the time copy at 0 and below", () => {
    expect(clockText(90_000)).toBe("1:30");
    expect(clockText(1)).toBe("0:01");
    expect(clockText(0)).toBe(DGL.copy.stageTime);
    expect(clockText(-200)).toBe(DGL.copy.stageTime);
  });
});

test("ring colour per tone comes from the spectrum", () => {
  expect(RING_COLOR).toEqual({ calm: "blue", final: "yellow", critical: "red" });
});
