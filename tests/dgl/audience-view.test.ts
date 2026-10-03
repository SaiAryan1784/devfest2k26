import { describe, expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import { formatClock, gridKey, isFinalCountdown, liveText, revealLines, viewFor, voteLine, type AudienceView } from "@/lib/dgl/audience-view";
import type { PublicState } from "@/lib/dgl/types";
import type { LocalVote } from "@/lib/dgl/vote-queue";

const ID = "11111111-1111-4111-8111-111111111111";

const st = (over: Partial<PublicState> = {}): PublicState => ({
  phase: "VOTING",
  performanceId: ID,
  contestant: "Riya Sharma",
  prompt: "Explain Kubernetes to your grandmother",
  endsAtMs: null,
  votes: 0,
  average: null,
  reveal: null,
  ...over,
});

const vote = (state: LocalVote["state"], over: Partial<LocalVote> = {}): LocalVote => ({
  performanceId: ID,
  score: 7,
  state,
  at: 1,
  ...over,
});

const act = { contestant: "Riya Sharma", prompt: "Explain Kubernetes to your grandmother" };

describe("viewFor", () => {
  test("no state yet (server render, first poll pending) is idle", () => {
    expect(viewFor(null, null)).toEqual({ kind: "idle" });
  });

  test("IDLE and COMPLETED", () => {
    expect(viewFor(st({ phase: "IDLE", performanceId: null, contestant: null, prompt: null }), null)).toEqual({ kind: "idle" });
    expect(viewFor(st({ phase: "COMPLETED" }), null)).toEqual({ kind: "completed" });
  });

  test("READY and PERFORMING carry the act, PERFORMING carries the end time", () => {
    expect(viewFor(st({ phase: "READY", prompt: null }), null)).toEqual({ kind: "ready", act: { ...act, prompt: null } });
    expect(viewFor(st({ phase: "PERFORMING", endsAtMs: 90_000 }), null)).toEqual({ kind: "performing", act, endsAtMs: 90_000 });
    expect(viewFor(st({ phase: "PERFORMED" }), null)).toEqual({ kind: "performed", act });
  });

  test("VOTING with no vote offers the grid, count only before a vote (after-vote rule)", () => {
    const v = viewFor(st({ votes: 12, average: 7.4 }), null);
    expect(v).toEqual({
      kind: "voting-grid",
      act,
      tally: { votes: 12, average: 7.4, showAverage: DGL.showLiveAverage === "always" },
      notCounted: false,
    });
  });

  test("VOTING with a rejected vote offers the grid again with the not-counted note", () => {
    const v = viewFor(st(), vote("rejected", { reason: "closed" }));
    expect(v.kind).toBe("voting-grid");
    if (v.kind === "voting-grid") expect(v.notCounted).toBe(true);
  });

  test("VOTING with a queued or recorded vote shows the locked score and the average", () => {
    expect(viewFor(st({ votes: 3, average: null }), vote("queued"))).toEqual({
      kind: "voted",
      act,
      tally: { votes: 3, average: null, showAverage: true },
      vote: { score: 7, state: "queued", line: "voteQueued" },
    });
    const rec = viewFor(st({ votes: 9, average: 7.1 }), vote("recorded"));
    expect(rec.kind === "voted" && rec.vote).toEqual({ score: 7, state: "recorded", line: "voteRecorded" });
  });

  test("a queued vote still marked paused shows queued, not paused, once voting is open again", () => {
    const v = viewFor(st(), vote("queued", { reason: "paused" }));
    expect(v.kind === "voted" && v.vote.line).toBe("voteQueued");
  });

  test("VOTING_PAUSED never offers the grid, and shows any vote with a phase-aware line", () => {
    expect(viewFor(st({ phase: "VOTING_PAUSED" }), null)).toEqual({ kind: "paused", act, vote: null });
    const v = viewFor(st({ phase: "VOTING_PAUSED" }), vote("queued"));
    expect(v).toEqual({ kind: "paused", act, vote: { score: 7, state: "queued", line: "votePaused" } });
    const r = viewFor(st({ phase: "VOTING_PAUSED" }), vote("recorded"));
    expect(r.kind === "paused" && r.vote?.line).toBe("voteRecorded");
  });

  test("VOTING_CLOSED shows the count, the average and the vote, rejected says not counted", () => {
    expect(viewFor(st({ phase: "VOTING_CLOSED", votes: 40, average: 8.2 }), vote("rejected", { reason: "closed" }))).toEqual({
      kind: "closed",
      act,
      tally: { votes: 40, average: 8.2, showAverage: true },
      vote: { score: 7, state: "rejected", line: "voteNotCounted" },
    });
    const none = viewFor(st({ phase: "VOTING_CLOSED" }), null);
    expect(none.kind === "closed" && none.vote).toBeNull();
  });

  test("REVEAL carries the server's comparison; a missing reveal falls back to closed", () => {
    const reveal = { self: 8, audience: 8.0, result: { kind: "match" as const } };
    expect(viewFor(st({ phase: "REVEAL", reveal }), null)).toEqual({ kind: "reveal", act, ...reveal });
    expect(viewFor(st({ phase: "REVEAL", reveal: null }), null).kind).toBe("closed");
  });

  test("a vote for another performance is ignored", () => {
    expect(viewFor(st(), vote("recorded", { performanceId: "other" })).kind).toBe("voting-grid");
  });

  test("the grid is offered only in VOTING", () => {
    const phases: PublicState["phase"][] = ["IDLE", "READY", "PERFORMING", "PERFORMED", "VOTING_PAUSED", "VOTING_CLOSED", "REVEAL", "COMPLETED"];
    for (const phase of phases) expect(viewFor(st({ phase }), null).kind).not.toBe("voting-grid");
  });
});

describe("voteLine", () => {
  test("derives from the current phase plus the vote state, never the reason alone", () => {
    expect(voteLine(vote("recorded"), "VOTING")).toBe("voteRecorded");
    expect(voteLine(vote("rejected", { reason: "closed" }), "VOTING")).toBe("voteNotCounted");
    expect(voteLine(vote("queued"), "VOTING_PAUSED")).toBe("votePaused");
    expect(voteLine(vote("queued", { reason: "paused" }), "VOTING")).toBe("voteQueued");
    expect(voteLine(vote("queued", { reason: "paused" }), "VOTING_CLOSED")).toBe("voteQueued");
    expect(voteLine(vote("queued"), "VOTING")).toBe("voteQueued");
  });

  test("a queued vote in a browser that blocks cookies says so, in any phase; decided votes are unaffected", () => {
    expect(voteLine(vote("queued"), "VOTING", true)).toBe("voteCookiesBlocked");
    expect(voteLine(vote("queued"), "VOTING_PAUSED", true)).toBe("voteCookiesBlocked");
    expect(voteLine(vote("queued", { reason: "paused" }), "VOTING_CLOSED", true)).toBe("voteCookiesBlocked");
    expect(voteLine(vote("recorded"), "VOTING", true)).toBe("voteRecorded");
    expect(voteLine(vote("rejected", { reason: "closed" }), "VOTING", true)).toBe("voteNotCounted");
  });
});

describe("cookies blocked", () => {
  test("viewFor shows the queued vote with the cookies line, never recorded", () => {
    expect(viewFor(st({ votes: 3 }), vote("queued"), true)).toEqual({
      kind: "voted",
      act,
      tally: { votes: 3, average: null, showAverage: true },
      vote: { score: 7, state: "queued", line: "voteCookiesBlocked" },
    });
    const paused = viewFor(st({ phase: "VOTING_PAUSED" }), vote("queued"), true);
    expect(paused.kind === "paused" && paused.vote?.line).toBe("voteCookiesBlocked");
    expect(viewFor(st(), vote("queued"))).toMatchObject({ vote: { line: "voteQueued" } });
  });

  test("the line is one plain sentence in DGL.copy, read out by the live region", () => {
    const line = DGL.copy.voteCookiesBlocked;
    expect(line).toMatch(/cookies/i);
    expect(line).not.toMatch(/[\u2013\u2014]/);
    expect(liveText(viewFor(st(), vote("queued"), true))).toContain(line);
    expect(liveText(viewFor(st({ phase: "VOTING_PAUSED" }), vote("queued"), true))).toContain(line);
  });
});

describe("gridKey (5 x 2 grid of 1 to 10)", () => {
  test("left and right step and wrap", () => {
    expect(gridKey(1, "ArrowRight")).toBe(2);
    expect(gridKey(10, "ArrowRight")).toBe(1);
    expect(gridKey(1, "ArrowLeft")).toBe(10);
    expect(gridKey(6, "ArrowLeft")).toBe(5);
  });
  test("up and down move between the two rows", () => {
    expect(gridKey(3, "ArrowDown")).toBe(8);
    expect(gridKey(8, "ArrowDown")).toBe(3);
    expect(gridKey(8, "ArrowUp")).toBe(3);
    expect(gridKey(3, "ArrowUp")).toBe(8);
  });
  test("home and end, anything else is not ours", () => {
    expect(gridKey(5, "Home")).toBe(1);
    expect(gridKey(5, "End")).toBe(10);
    expect(gridKey(5, "Tab")).toBeNull();
    expect(gridKey(5, "Enter")).toBeNull();
  });
});

describe("clock", () => {
  test("M:SS, rounding a part second up so 0:00 means time is up", () => {
    expect(formatClock(90_000)).toBe("1:30");
    expect(formatClock(9_001)).toBe("0:10");
    expect(formatClock(61_000)).toBe("1:01");
    expect(formatClock(1)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-5)).toBe("0:00");
  });
  test("final countdown at DGL.finalCountdownS or less", () => {
    const edge = DGL.finalCountdownS * 1000;
    expect(isFinalCountdown(edge + 1)).toBe(false);
    expect(isFinalCountdown(edge)).toBe(true);
    expect(isFinalCountdown(0)).toBe(true);
  });
});

describe("liveText", () => {
  test("announces the phase and the vote state from DGL.copy", () => {
    expect(liveText({ kind: "idle" })).toBe(DGL.copy.idleTitle);
    const voted = viewFor(st(), vote("recorded"));
    expect(liveText(voted)).toContain(DGL.copy.voteRecorded);
    expect(liveText(voted)).toContain("7");
    expect(liveText(viewFor(st({ phase: "VOTING_PAUSED" }), null))).toContain(DGL.copy.votePaused);
    expect(liveText(viewFor(st(), null))).toContain(DGL.copy.votingTitle);
  });
  test("never contains the ticking time", () => {
    const t = liveText(viewFor(st({ phase: "PERFORMING", endsAtMs: 90_000 }), null));
    expect(t).not.toMatch(/\d:\d\d/);
  });
});

describe("revealLines", () => {
  const rv = (self: number, audience: number | null, result: Extract<AudienceView, { kind: "reveal" }>["result"]) =>
    ({ kind: "reveal", act, self, audience, result }) as const;
  test("match, difference and too few votes", () => {
    expect(revealLines(rv(8, 8, { kind: "match" }))).toEqual({ audience: "8.0 / 10", verdict: DGL.copy.perfectMatch });
    expect(revealLines(rv(9, 8.4, { kind: "diff", diff: 0.6 }))).toEqual({ audience: "8.4 / 10", verdict: "Difference 0.6" });
    expect(revealLines(rv(9, null, { kind: "insufficient" }))).toEqual({ audience: null, verdict: DGL.copy.notEnoughVotes });
  });
  test("the live region reads the whole reveal", () => {
    expect(liveText(rv(9, 8.4, { kind: "diff", diff: 0.6 }))).toBe("Own score 9. Audience 8.4 / 10. Difference 0.6");
  });
});
