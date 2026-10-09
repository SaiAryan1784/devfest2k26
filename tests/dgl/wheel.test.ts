import { describe, expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import { spinLeftMs, spinState, wheelAngle, wheelTarget } from "@/lib/dgl/wheel";

const T = 1_000_000;
const SPIN = DGL.wheel.spinMs;

test("the wheel spins for 4.5 s over 12 segments", () => {
  expect(DGL.wheel).toEqual({ spinMs: 4500, segments: 12 });
});

describe("spinState", () => {
  test("no spin yet is none", () => {
    expect(spinState(null, T)).toBe("none");
    expect(spinState(null, 0)).toBe("none");
  });

  test("one ms before the end it is still spinning", () => {
    expect(spinState(T, T)).toBe("spinning");
    expect(spinState(T, T + SPIN - 1)).toBe("spinning");
  });

  test("exactly at the end it has landed", () => {
    expect(spinState(T, T + SPIN)).toBe("landed");
  });

  test("after the end it has landed", () => {
    expect(spinState(T, T + SPIN + 1)).toBe("landed");
    expect(spinState(T, T + 60_000)).toBe("landed");
  });

  test("a clock that reads before the spin still counts it as spinning (the prompt stays hidden)", () => {
    expect(spinState(T, T - 500)).toBe("spinning");
  });

  test("the length can be given", () => {
    expect(spinState(T, T + 999, 1000)).toBe("spinning");
    expect(spinState(T, T + 1000, 1000)).toBe("landed");
  });
});

describe("spinLeftMs", () => {
  test("0 with no spin and once landed", () => {
    expect(spinLeftMs(null, T)).toBe(0);
    expect(spinLeftMs(T, T + SPIN)).toBe(0);
    expect(spinLeftMs(T, T + SPIN + 5)).toBe(0);
  });

  test("the time left while spinning", () => {
    expect(spinLeftMs(T, T)).toBe(SPIN);
    expect(spinLeftMs(T, T + 1000)).toBe(SPIN - 1000);
    expect(spinLeftMs(T, T + SPIN - 1)).toBe(1);
  });

  test("never more than one spin, whatever the clock says", () => {
    expect(spinLeftMs(T, T - 300_000)).toBe(SPIN);
  });
});

describe("wheelTarget", () => {
  const prompts = ["Explain Kubernetes to your grandmother", "Pitch a startup in one breath", "Sell this pen", "Roast your own code", "Describe the cloud to a farmer"];

  test("is deterministic", () => {
    for (const p of prompts) expect(wheelTarget(p, 12)).toEqual(wheelTarget(p, 12));
  });

  test("lands on a real segment, after six turns", () => {
    for (const p of prompts) {
      const t = wheelTarget(p, 12);
      expect(Number.isInteger(t.segment)).toBe(true);
      expect(t.segment).toBeGreaterThanOrEqual(0);
      expect(t.segment).toBeLessThan(12);
      expect(t.turns).toBe(6);
    }
  });

  test("no prompt lands on segment 0", () => {
    expect(wheelTarget(null, 12)).toEqual({ segment: 0, turns: 6 });
  });

  test("different prompts do not all land on one segment", () => {
    const segments = new Set(prompts.map((p) => wheelTarget(p, 12).segment));
    expect(segments.size).toBeGreaterThan(1);
  });

  test("the segment count is respected", () => {
    for (const p of prompts) expect(wheelTarget(p, 5).segment).toBeLessThan(5);
  });
});

describe("wheelTarget golden values", () => {
  // Pinned: a change here would move every wheel off the segment a screen already showed.
  test("known prompts land on known segments", () => {
    expect(wheelTarget("Explain Kubernetes to your grandmother", 12)).toEqual({ segment: 5, turns: 6 });
    expect(wheelTarget("Sell this pen", 12)).toEqual({ segment: 4, turns: 6 });
  });
});

describe("wheelAngle", () => {
  test("segment 0 stops half a step short of a full turn, after six turns", () => {
    expect(wheelAngle(0, 6, 12)).toBe(6 * 360 + 345);
    expect(wheelAngle(11, 6, 12)).toBe(6 * 360 + 15);
    expect(wheelAngle(5, 6, 12)).toBe(6 * 360 + 360 - 165);
  });

  test("the pointer at the top lands on the centre of the chosen segment", () => {
    for (const segments of [5, 12]) {
      const step = 360 / segments;
      for (let segment = 0; segment < segments; segment++) {
        // A point on the wheel at angle a (clockwise from the top) is under the pointer when a + rotation = 0 mod 360.
        const underPointer = (((360 - (wheelAngle(segment, 6, segments) % 360)) % 360) + 360) % 360;
        expect(underPointer).toBeCloseTo(segment * step + step / 2, 9);
      }
    }
  });

  test("more turns add whole turns only", () => {
    expect(wheelAngle(3, 7, 12) - wheelAngle(3, 6, 12)).toBe(360);
  });
});
