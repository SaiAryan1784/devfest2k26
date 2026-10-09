import { describe, expect, test } from "vitest";
import { bannerFor, screenKey, showsQr, stageView, type StageView } from "@/lib/dgl/stage-view";
import type { Phase, PublicState } from "@/lib/dgl/types";

const ID = "11111111-1111-4111-8111-111111111111";
const act = { contestant: "Riya Sharma", prompt: "Explain Kubernetes to your grandmother", spinning: false };

const st = (over: Partial<PublicState> = {}): PublicState => ({
  track: "build",
  winner: null,
  phase: "VOTING",
  performanceId: ID,
  contestant: act.contestant,
  prompt: act.prompt,
  spunAtMs: null,
  endsAtMs: null,
  votes: 0,
  average: null,
  reveal: null,
  ...over,
});

describe("stageView", () => {
  test("before the first poll, and with no act, it waits", () => {
    expect(stageView(null)).toEqual({ kind: "idle" });
    expect(stageView(st({ phase: "IDLE", performanceId: null, contestant: null, prompt: null }))).toEqual({ kind: "idle" });
  });

  test("between acts it is neutral", () => {
    expect(stageView(st({ phase: "COMPLETED" }))).toEqual({ kind: "completed" });
  });

  test("the winner view carries the names and the audience score", () => {
    const winner = { names: ["Riya Sharma", "Dev Patel"], audience: 9 };
    expect(stageView(st({ phase: "COMPLETED", winner }))).toEqual({ kind: "winner", ...winner });
    expect(stageView(st({ phase: "COMPLETED", winner }), true)).toEqual({ kind: "winner", ...winner });
  });

  test("ready shows who is up next", () => {
    expect(stageView(st({ phase: "READY" }))).toEqual({ kind: "ready", id: ID, act });
  });

  test("while the wheel spins the prompt is hidden", () => {
    const spun = st({ phase: "READY", spunAtMs: 1_000 });
    expect(stageView(spun, true)).toEqual({ kind: "ready", id: ID, act: { contestant: "Riya Sharma", prompt: null, spinning: true } });
    expect(stageView(spun, false)).toEqual({ kind: "ready", id: ID, act });
    // Even if the act started before the wheel stopped.
    const started = stageView(st({ phase: "PERFORMING", endsAtMs: 90_000, spunAtMs: 1_000 }), true);
    expect(started).toMatchObject({ kind: "clock", act: { prompt: null, spinning: true } });
  });

  test("the spin changes neither the screen nor the QR rule", () => {
    const spun = st({ phase: "READY", spunAtMs: 1_000 });
    expect(screenKey(stageView(spun, true))).toBe(screenKey(stageView(spun, false)));
    expect(showsQr(stageView(spun, true))).toBe(false);
  });

  test("performing runs the clock, performed holds it at time", () => {
    expect(stageView(st({ phase: "PERFORMING", endsAtMs: 90_000 }))).toEqual({ kind: "clock", id: ID, act, endsAtMs: 90_000, running: true });
    expect(stageView(st({ phase: "PERFORMED", endsAtMs: 90_000 }))).toEqual({ kind: "clock", id: ID, act, endsAtMs: 90_000, running: false });
  });

  test("voting shows the live count and never the average", () => {
    const v = stageView(st({ phase: "VOTING", votes: 143, average: 8 }));
    expect(v).toEqual({ kind: "voting", id: ID, act, votes: 143, paused: false });
    expect(v).not.toHaveProperty("average");
    const p = stageView(st({ phase: "VOTING_PAUSED", votes: 143, average: 8 }));
    expect(p).toEqual({ kind: "voting", id: ID, act, votes: 143, paused: true });
    expect(p).not.toHaveProperty("average");
  });

  test("closed shows the final count, still no average", () => {
    const v = stageView(st({ phase: "VOTING_CLOSED", votes: 151, average: 8 }));
    expect(v).toEqual({ kind: "closed", id: ID, act, votes: 151 });
    expect(v).not.toHaveProperty("average");
  });

  test("reveal passes the server's comparison through untouched", () => {
    const diff = { self: 8, audience: 7, result: { kind: "diff" as const, diff: 1 } };
    const v = stageView(st({ phase: "REVEAL", votes: 151, average: 7, reveal: diff }));
    expect(v).toEqual({ kind: "reveal", id: ID, act, ...diff });
    expect((v as Extract<StageView, { kind: "reveal" }>).result).toBe(diff.result);
  });

  test("reveal with no votes keeps the null audience", () => {
    const none = { self: 8, audience: null, result: { kind: "insufficient" as const } };
    expect(stageView(st({ phase: "REVEAL", votes: 0, reveal: none }))).toEqual({ kind: "reveal", id: ID, act, ...none });
  });

  test("a REVEAL poll without reveal data stays on the closed count", () => {
    expect(stageView(st({ phase: "REVEAL", votes: 151, reveal: null }))).toEqual({ kind: "closed", id: ID, act, votes: 151 });
  });

  test("an act phase without a performance id waits rather than guessing", () => {
    expect(stageView(st({ phase: "VOTING", performanceId: null }))).toEqual({ kind: "idle" });
  });
});

const reveal = { self: 8, audience: 8, result: { kind: "match" as const } };

/** One stage view of every kind, the QR and poster rules below read off these. */
const views: Record<StageView["kind"], StageView[]> = {
  idle: [{ kind: "idle" }],
  completed: [{ kind: "completed" }],
  winner: [{ kind: "winner", names: ["Riya Sharma"], audience: 9 }],
  ready: [{ kind: "ready", id: ID, act }],
  clock: [
    { kind: "clock", id: ID, act, endsAtMs: 90_000, running: true },
    { kind: "clock", id: ID, act, endsAtMs: 90_000, running: false },
  ],
  voting: [
    { kind: "voting", id: ID, act, votes: 12, paused: false },
    { kind: "voting", id: ID, act, votes: 12, paused: true },
  ],
  closed: [{ kind: "closed", id: ID, act, votes: 12 }],
  reveal: [{ kind: "reveal", id: ID, act, ...reveal }],
};

describe("showsQr", () => {
  test("showsQr is true only while the act is running or voting is open", () => {
    for (const v of views.clock) expect(showsQr(v)).toBe(true); // PERFORMING and PERFORMED
    for (const v of views.voting) expect(showsQr(v)).toBe(true); // VOTING and VOTING_PAUSED
    for (const kind of ["idle", "ready", "closed", "reveal", "completed", "winner"] as const) {
      for (const v of views[kind]) expect(showsQr(v)).toBe(false);
    }
  });

  const phases: [Phase, boolean][] = [
    ["IDLE", false],
    ["READY", false],
    ["PERFORMING", true],
    ["PERFORMED", true],
    ["VOTING", true],
    ["VOTING_PAUSED", true],
    ["VOTING_CLOSED", false],
    ["REVEAL", false],
    ["COMPLETED", false],
  ];
  test.each(phases)("%s shows the QR: %s", (phase, qr) => {
    expect(showsQr(stageView(st({ phase, endsAtMs: 1, reveal: phase === "REVEAL" ? reveal : null })))).toBe(qr);
  });
  test("before the first poll there is no QR", () => {
    expect(showsQr(stageView(null))).toBe(false);
  });
});

describe("bannerFor", () => {
  test("the full poster is only for waiting and between acts; every other screen carries the strip", () => {
    for (const kind of ["idle", "completed"] as const) {
      for (const v of views[kind]) expect(bannerFor(v)).toBe("poster");
    }
    for (const kind of ["winner", "ready", "clock", "voting", "closed", "reveal"] as const) {
      for (const v of views[kind]) expect(bannerFor(v)).toBe("strip");
    }
  });
  test("a spinning act keeps the strip", () => {
    const spun = st({ phase: "READY", spunAtMs: 1_000 });
    expect(bannerFor(stageView(spun, true))).toBe("strip");
  });
  test("every kind is covered", () => {
    expect(Object.keys(views).sort()).toEqual(["clock", "closed", "completed", "idle", "ready", "reveal", "voting", "winner"]);
  });
});

describe("screenKey", () => {
  test("the clock keeps one screen from performing to performed", () => {
    const a = stageView(st({ phase: "PERFORMING", endsAtMs: 9 }));
    const b = stageView(st({ phase: "PERFORMED", endsAtMs: 9 }));
    expect(screenKey(a)).toBe(screenKey(b));
  });
  test("pausing does not swap the voting screen", () => {
    expect(screenKey(stageView(st({ phase: "VOTING" })))).toBe(screenKey(stageView(st({ phase: "VOTING_PAUSED" }))));
  });
  test("a new act is a new screen", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    expect(screenKey(stageView(st({ phase: "READY" })))).not.toBe(screenKey(stageView(st({ phase: "READY", performanceId: other }))));
  });
});
