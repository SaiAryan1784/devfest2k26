import { describe, expect, test } from "vitest";
import {
  LIVE_ACTIONS,
  PERMISSIONS,
  ROLES,
  SETUP_ACTIONS,
  allowed,
  can,
  effectivePhase,
  isRole,
  nextStatus,
} from "@/lib/dgl/machine";
import type { LiveAction, Phase } from "@/lib/dgl/types";

type LiveType = LiveAction["type"];

const PHASES: Phase[] = [
  "IDLE",
  "READY",
  "PERFORMING",
  "PERFORMED",
  "VOTING",
  "VOTING_PAUSED",
  "VOTING_CLOSED",
  "REVEAL",
  "COMPLETED",
];

const ACTIONS: LiveType[] = [
  "putOnStage",
  "renameAct",
  "spinWheel",
  "startPerformance",
  "startVoting",
  "pauseVoting",
  "resumeVoting",
  "stopVoting",
  "reopenVoting",
  "setSelfScore",
  "reveal",
  "complete",
  "showWinner",
  "hideWinner",
];

/** The transition table, written out from the brief: what each phase allows. */
const TABLE: Record<Phase, LiveType[]> = {
  IDLE: ["putOnStage"],
  COMPLETED: ["putOnStage", "showWinner", "hideWinner"],
  READY: ["renameAct", "spinWheel", "setSelfScore", "startPerformance"],
  PERFORMING: ["renameAct", "setSelfScore", "startVoting"],
  PERFORMED: ["renameAct", "setSelfScore", "startVoting"],
  VOTING: ["pauseVoting", "stopVoting", "setSelfScore"],
  VOTING_PAUSED: ["resumeVoting", "stopVoting", "renameAct", "setSelfScore"],
  VOTING_CLOSED: ["reopenVoting", "setSelfScore", "reveal"],
  REVEAL: ["complete"],
};

test("PERFORMING becomes PERFORMED at endsAt", () => {
  expect(effectivePhase("PERFORMING", 90_000, 89_999)).toBe("PERFORMING");
  expect(effectivePhase("PERFORMING", 90_000, 90_000)).toBe("PERFORMED");
  expect(effectivePhase(null, null, 0)).toBe("IDLE");
});

describe("the transition table, cell by cell", () => {
  for (const phase of PHASES) {
    for (const action of ACTIONS) {
      const ok = TABLE[phase].includes(action);
      test(`${phase} ${ok ? "allows" : "refuses"} ${action}`, () => {
        expect(allowed(phase, action)).toBe(ok);
      });
    }
  }

  test("the live actions are exactly the fourteen in the table", () => {
    expect([...LIVE_ACTIONS].sort()).toEqual([...ACTIONS].sort());
  });

  test("the removed actions are allowed in no phase", () => {
    for (const phase of PHASES) {
      for (const gone of ["selectContestant", "reassignContestant", "setPrompt", "drawPrompt"]) {
        expect(allowed(phase, gone as LiveType)).toBe(false);
      }
    }
  });
});

describe("roles", () => {
  test("there are exactly two admin roles", () => {
    expect([...ROLES]).toEqual(["SUPER_ADMIN", "HOST"]);
    expect(Object.keys(PERMISSIONS).sort()).toEqual(["HOST", "SUPER_ADMIN"]);
    expect(isRole("SUPER_ADMIN")).toBe(true);
    expect(isRole("HOST")).toBe(true);
    for (const x of ["OPERATOR", "VOLUNTEER", "host", "", null, undefined, 1]) expect(isRole(x)).toBe(false);
  });

  test("the setup actions are the prompt pool, admins, moderation and reset", () => {
    expect([...SETUP_ACTIONS].sort()).toEqual(["resetShow", "setFlaggedExcluded", "upsertAdmin", "upsertPrompt"]);
  });

  test("HOST has kioskVote and no setup action", () => {
    for (const a of LIVE_ACTIONS) expect(can("HOST", a), a).toBe(true);
    expect(can("HOST", "kioskVote")).toBe(true);
    for (const a of SETUP_ACTIONS) expect(can("HOST", a), a).toBe(false);
  });

  test("SUPER_ADMIN has every action", () => {
    for (const a of [...LIVE_ACTIONS, ...SETUP_ACTIONS, "kioskVote" as const]) expect(can("SUPER_ADMIN", a), a).toBe(true);
  });
});

test("nextStatus maps each status-moving action, and the rest move nothing", () => {
  const table: Record<LiveType, string | null> = {
    putOnStage: "READY",
    startPerformance: "PERFORMING",
    startVoting: "VOTING",
    pauseVoting: "VOTING_PAUSED",
    resumeVoting: "VOTING",
    stopVoting: "VOTING_CLOSED",
    reopenVoting: "VOTING",
    reveal: "REVEAL",
    complete: "COMPLETED",
    renameAct: null,
    spinWheel: null,
    setSelfScore: null,
    showWinner: null,
    hideWinner: null,
  };
  for (const [action, status] of Object.entries(table)) {
    expect(nextStatus(action as LiveType), action).toBe(status);
  }
});
