import { expect, test } from "vitest";
import { estimateOffset, pickOffset, pollDelay, remainingMs } from "@/lib/dgl/clock";

test("remainingMs uses the server offset", () => {
  // phone clock 5 min slow: offset = +300_000
  const off = estimateOffset(1_000, 301_100, 1_200);
  expect(off).toBe(300_000);
  expect(remainingMs(390_000, 1_100, off)).toBe(88_900);
  expect(remainingMs(390_000, 99_000, off)).toBe(0);
});

test("estimateOffset assumes the server stamped the reply at the round trip midpoint", () => {
  expect(estimateOffset(1_000, 1_100, 1_200)).toBe(0);
  // phone clock 2 s fast: server reads 98_000 when the phone's midpoint is 100_000
  expect(estimateOffset(99_900, 98_000, 100_100)).toBe(-2_000);
  // a slow 1 s round trip splits the delay evenly
  expect(estimateOffset(0, 10_500, 1_000)).toBe(10_000);
});

test("remainingMs is clamped at 0 and honours a negative offset", () => {
  expect(remainingMs(1_000, 1_000, 0)).toBe(0);
  expect(remainingMs(1_000, 5_000, 0)).toBe(0);
  expect(remainingMs(10_000, 4_000, -1_000)).toBe(7_000);
});

test("pickOffset trusts the shortest round trip and is 0 with no samples", () => {
  expect(pickOffset([])).toBe(0);
  expect(
    pickOffset([
      { offset: 1_400, rtt: 2_800 },
      { offset: 20, rtt: 90 },
      { offset: 60, rtt: 300 },
    ]),
  ).toBe(20);
});

test("pollDelay is fast while an act is up (ready, performing, voting, paused) and slow otherwise", () => {
  const poll = { votingMs: 1_500, idleMs: 3_000 };
  // READY is live: the wheel can spin there, and its result should reach the screens promptly.
  for (const p of ["READY", "VOTING", "PERFORMING", "PERFORMED", "VOTING_PAUSED"] as const) expect(pollDelay(p, poll), p).toBe(1_500);
  for (const p of ["IDLE", "VOTING_CLOSED", "REVEAL", "COMPLETED"] as const) expect(pollDelay(p, poll), p).toBe(3_000);
  expect(pollDelay(null, poll)).toBe(3_000);
});
