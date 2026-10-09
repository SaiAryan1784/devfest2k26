import { describe, expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import {
  clockLabel,
  formatClock,
  gridKey,
  isFinalCountdown,
  liveText,
  revealLines,
  tallyAverage,
  viewFor,
  voteLine,
  type AudienceView,
  type Tally,
} from "@/lib/dgl/audience-view";
import type { PublicState } from "@/lib/dgl/types";
import type { LocalVote } from "@/lib/dgl/vote-queue";

const ID = "11111111-1111-4111-8111-111111111111";

const st = (over: Partial<PublicState> = {}): PublicState => ({
  phase: "VOTING",
  performanceId: ID,
  contestant: "Riya Sharma",
  prompt: "Explain Kubernetes to your grandmother",
  spunAtMs: null,
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

const act = { contestant: "Riya Sharma", prompt: "Explain Kubernetes to your grandmother", spinning: false };
const SPUN = 1_000;

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
    const v = viewFor(st({ votes: 12, average: 7 }), null);
    expect(v).toEqual({
      kind: "voting-grid",
      act,
      tally: { votes: 12, average: 7, showAverage: DGL.showLiveAverage === "always" },
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
    const rec = viewFor(st({ votes: 9, average: 7 }), vote("recorded"));
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
    expect(viewFor(st({ phase: "VOTING_CLOSED", votes: 40, average: 8 }), vote("rejected", { reason: "closed" }))).toEqual({
      kind: "closed",
      act,
      tally: { votes: 40, average: 8, showAverage: true },
      vote: { score: 7, state: "rejected", line: "voteNotCounted" },
    });
    const none = viewFor(st({ phase: "VOTING_CLOSED" }), null);
    expect(none.kind === "closed" && none.vote).toBeNull();
  });

  test("REVEAL carries the server's comparison; a missing reveal falls back to closed", () => {
    const reveal = { self: 8, audience: 8, result: { kind: "match" as const } };
    expect(viewFor(st({ phase: "REVEAL", reveal }), null)).toEqual({ kind: "reveal", act, ...reveal });
    expect(viewFor(st({ phase: "REVEAL", reveal: null }), null).kind).toBe("closed");
  });

  test("Act.spinning hides the prompt", () => {
    const spun = st({ phase: "READY", spunAtMs: SPUN });
    expect(viewFor(spun, null, false, true)).toEqual({ kind: "ready", act: { contestant: "Riya Sharma", prompt: null, spinning: true } });
    // Once the wheel has landed the prompt shows.
    expect(viewFor(spun, null, false, false)).toEqual({ kind: "ready", act });
    // The flag defaults to not spinning.
    expect(viewFor(spun, null)).toEqual({ kind: "ready", act });
  });

  test("the prompt stays hidden until the spin ends, even if the act starts first", () => {
    const v = viewFor(st({ phase: "PERFORMING", endsAtMs: 90_000, spunAtMs: SPUN }), null, false, true);
    expect(v).toEqual({ kind: "performing", act: { contestant: "Riya Sharma", prompt: null, spinning: true }, endsAtMs: 90_000 });
  });

  test("the spinning act's live text never carries the prompt", () => {
    const text = liveText(viewFor(st({ phase: "READY", spunAtMs: SPUN }), null, false, true));
    expect(text).not.toContain("Kubernetes");
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
  test("formatClock counts whole seconds up", () => {
    expect(formatClock(90_000)).toBe("90");
    expect(formatClock(89_001)).toBe("90");
    expect(formatClock(89_000)).toBe("89");
    expect(formatClock(9_400)).toBe("10");
    expect(formatClock(400)).toBe("1");
    expect(formatClock(1)).toBe("1");
    expect(formatClock(0)).toBe("0");
    expect(formatClock(-5)).toBe("0");
  });
  test("formatClock never rolls into minutes", () => {
    expect(formatClock(61_000)).toBe("61");
    expect(formatClock(60_000)).toBe("60");
    expect(formatClock(59_001)).toBe("60");
    for (const ms of [90_000, 61_000, 60_000, 9_001, 1, 0]) expect(formatClock(ms)).not.toContain(":");
  });
  test("clockLabel is the whole seconds and the unit, as 90 sec", () => {
    expect(DGL.copy.secondsUnit).toBe("sec");
    expect(clockLabel(90_000)).toBe("90 sec");
    expect(clockLabel(89_001)).toBe("90 sec");
    expect(clockLabel(9_400)).toBe("10 sec");
    expect(clockLabel(1)).toBe("1 sec");
    expect(clockLabel(0)).toBe("0 sec");
    expect(clockLabel(-5)).toBe("0 sec");
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
    expect(t).not.toMatch(/\d+ sec/);
  });
});

describe("revealLines", () => {
  const rv = (self: number, audience: number | null, result: Extract<AudienceView, { kind: "reveal" }>["result"]) =>
    ({ kind: "reveal", act, self, audience, result }) as const;
  test("revealLines whole numbers", () => {
    expect(revealLines(rv(7, 9, { kind: "diff", diff: 2 }))).toEqual({ audience: "9 / 10", verdict: "Difference 2" });
    expect(revealLines(rv(9, 3, { kind: "diff", diff: 6 }))).toEqual({ audience: "3 / 10", verdict: "Difference 6" });
    expect(revealLines(rv(8, 8, { kind: "match" }))).toEqual({ audience: "8 / 10", verdict: DGL.copy.perfectMatch });
  });
  test("revealLines with no votes says No votes", () => {
    expect(DGL.copy.noVotes).toBe("No votes");
    expect(revealLines(rv(9, null, { kind: "insufficient" }))).toEqual({ audience: null, verdict: DGL.copy.noVotes });
  });
  test("the copy takes whole numbers, and the new lines carry no dashes", () => {
    expect(DGL.copy.outOfTen(8)).toBe("8 / 10");
    expect(DGL.copy.difference(2)).toBe("Difference 2");
    expect(DGL.copy.stageIdleBody).toBe("The QR code to vote appears when the act begins.");
    for (const line of [DGL.copy.outOfTen(8), DGL.copy.difference(2), DGL.copy.noVotes, DGL.copy.secondsUnit, DGL.copy.stageIdleBody]) {
      expect(line).not.toMatch(/[\u2013\u2014]/);
    }
  });
  test("the live region reads the whole reveal", () => {
    expect(liveText(rv(9, 8, { kind: "diff", diff: 1 }))).toBe("Own score 9. Audience 8 / 10. Difference 1");
    expect(liveText(rv(8, 8, { kind: "match" }))).toBe("Own score 8. Audience 8 / 10. Perfect match");
    expect(liveText(rv(9, null, { kind: "insufficient" }))).toBe("Own score 9. No votes");
  });
});

describe("tallyAverage", () => {
  const tally = (over: Partial<Tally> = {}): Tally => ({ votes: 0, average: null, showAverage: true, ...over });
  test("the tally line shows Waiting for audience... for zero votes while voting, and No votes once closed", () => {
    expect(tallyAverage(tally(), false)).toBe("Waiting for audience...");
    expect(tallyAverage(tally(), true)).toBe("No votes");
    expect(tallyAverage(tally(), false)).toBe(DGL.copy.waitingForAudience);
    expect(tallyAverage(tally(), true)).toBe(DGL.copy.noVotes);
  });
  test("one vote is already an average, as a whole number out of ten", () => {
    expect(tallyAverage(tally({ votes: 1, average: 9 }), false)).toBe("Audience average 9 / 10");
    expect(tallyAverage(tally({ votes: 40, average: 8 }), true)).toBe("Audience average 8 / 10");
  });
  test("nothing at all until the average is meant to show", () => {
    expect(tallyAverage(tally({ showAverage: false }), false)).toBeNull();
    expect(tallyAverage(tally({ votes: 5, average: 7, showAverage: false }), true)).toBeNull();
  });
  test("through viewFor: a locked vote not yet counted waits, a closed show with none says No votes", () => {
    const voted = viewFor(st({ votes: 0, average: null }), vote("queued"));
    expect(voted.kind === "voted" && tallyAverage(voted.tally, false)).toBe(DGL.copy.waitingForAudience);
    const closed = viewFor(st({ phase: "VOTING_CLOSED", votes: 0, average: null }), null);
    expect(closed.kind === "closed" && tallyAverage(closed.tally, true)).toBe(DGL.copy.noVotes);
    const one = viewFor(st({ phase: "VOTING_CLOSED", votes: 1, average: 7 }), null);
    expect(one.kind === "closed" && tallyAverage(one.tally, true)).toBe("Audience average 7 / 10");
  });
});
