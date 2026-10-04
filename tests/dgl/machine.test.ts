import { test, expect } from "vitest";
import {
  allowed,
  can,
  effectivePhase,
  nextStatus,
} from "@/lib/dgl/machine";
import type { LiveAction } from "@/lib/dgl/types";

test("PERFORMING becomes PERFORMED at endsAt", () => {
  expect(effectivePhase("PERFORMING", 90_000, 89_999)).toBe("PERFORMING");
  expect(effectivePhase("PERFORMING", 90_000, 90_000)).toBe("PERFORMED");
  expect(effectivePhase(null, null, 0)).toBe("IDLE");
});

test("voting cannot start before the act and reveal needs voting closed", () => {
  expect(allowed("READY", "startVoting")).toBe(false);
  expect(allowed("PERFORMED", "startVoting")).toBe(true);
  expect(allowed("VOTING", "reveal")).toBe(false);
  expect(allowed("VOTING_CLOSED", "reveal")).toBe(true);
});

test("wrong contestant can only be fixed with voting paused", () => {
  expect(allowed("VOTING", "reassignContestant")).toBe(false);
  expect(allowed("VOTING_PAUSED", "reassignContestant")).toBe(true);
});

test("roles", () => {
  expect(can("HOST", "reveal")).toBe(true);
  expect(can("HOST", "upsertContestant")).toBe(false);
  expect(can("OPERATOR", "upsertPrompt")).toBe(true);
  expect(can("OPERATOR", "setFlaggedExcluded")).toBe(false);
  expect(can("VOLUNTEER", "startVoting")).toBe(false);
  expect(can("VOLUNTEER", "kioskVote")).toBe(true);
  expect(can("SUPER_ADMIN", "resetShow")).toBe(true);
});

test("nextStatus maps each status-moving action", () => {
  const table: Record<LiveAction["type"], string | null> = {
    selectContestant: "READY",
    startPerformance: "PERFORMING",
    startVoting: "VOTING",
    pauseVoting: "VOTING_PAUSED",
    resumeVoting: "VOTING",
    stopVoting: "VOTING_CLOSED",
    reopenVoting: "VOTING",
    reveal: "REVEAL",
    complete: "COMPLETED",
    reassignContestant: null,
    setPrompt: null,
    drawPrompt: null,
    setSelfScore: null,
  };
  for (const [action, status] of Object.entries(table)) {
    expect(nextStatus(action as LiveAction["type"])).toBe(status);
  }
});
