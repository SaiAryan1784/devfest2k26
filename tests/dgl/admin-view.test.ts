import { describe, expect, test } from "vitest";
import {
  confirmStep,
  formatRawAverage,
  outcomeOf,
  primaryAction,
  queueAction,
  reassignTargets,
  secondaryActions,
  type SecondaryKey,
} from "@/lib/dgl/admin-view";
import type { ActionResult, AdminState, Phase, Role } from "@/lib/dgl/types";

const RIYA = "11111111-1111-4111-8111-111111111111";
const AMAN = "22222222-2222-4222-8222-222222222222";
const KABIR = "33333333-3333-4333-8333-333333333333";
const NEHA = "55555555-5555-4555-8555-555555555555";
const T = 1_000_000;

const st = (over: Partial<AdminState> = {}): AdminState => ({
  phase: "READY",
  performanceId: "44444444-4444-4444-8444-444444444444",
  contestant: "Riya Sharma",
  prompt: "Explain Kubernetes to your grandmother",
  endsAtMs: null,
  votes: 0,
  average: null,
  reveal: null,
  version: 7,
  serverNow: T,
  selfScore: null,
  rawAverage: null,
  flagged: 0,
  excluded: 0,
  kiosk: 0,
  contestants: [
    { id: RIYA, name: "Riya Sharma", sort: 1, active: true, status: "current" },
    { id: AMAN, name: "Aman Gupta", sort: 2, active: true, status: "upcoming" },
    { id: KABIR, name: "Kabir Rao", sort: 3, active: false, status: "upcoming" },
    { id: NEHA, name: "Neha Iyer", sort: 0, active: true, status: "done" },
  ],
  prompts: [{ id: "p1", text: "Sell us a deprecated API", active: true }],
  me: { name: "Sai", role: "HOST" },
  ...over,
});

/** A state in each phase, with what that phase normally carries. */
function inPhase(phase: Phase, over: Partial<AdminState> = {}): AdminState {
  const base: Partial<AdminState> = {
    PERFORMING: { endsAtMs: T + 30_000 },
    PERFORMED: { endsAtMs: T - 1 },
    VOTING: { endsAtMs: T - 1, votes: 12 },
    VOTING_PAUSED: { endsAtMs: T - 1, votes: 12 },
    VOTING_CLOSED: { endsAtMs: T - 1, votes: 12, selfScore: 8 },
    REVEAL: { endsAtMs: T - 1, votes: 12, selfScore: 8 },
  }[phase as string] ?? {};
  const none: Partial<AdminState> =
    phase === "IDLE" ? { performanceId: null, contestant: null, prompt: null } : {};
  return st({ phase, ...base, ...none, ...over });
}

const LIVE_ROLES: Role[] = ["HOST", "OPERATOR", "SUPER_ADMIN"];

describe("primaryAction: the one big button", () => {
  const table: [Phase, string, string | null][] = [
    ["IDLE", "selectContestant", null],
    ["COMPLETED", "selectContestant", null],
    ["READY", "startPerformance", "startPerformance"],
    ["PERFORMING", "startVoting", "startVoting"],
    ["PERFORMED", "startVoting", "startVoting"],
    ["VOTING", "stopVoting", "stopVoting"],
    ["VOTING_PAUSED", "resumeVoting", "resumeVoting"],
    ["VOTING_CLOSED", "reveal", "reveal"],
    ["REVEAL", "complete", "complete"],
  ];

  for (const role of LIVE_ROLES) {
    for (const [phase, label, action] of table) {
      test(`${role} in ${phase}: ${label}`, () => {
        const p = primaryAction(inPhase(phase), role);
        expect(p).not.toBeNull();
        expect(p!.labelKey).toBe(label);
        expect(p!.action?.type ?? null).toBe(action);
        expect(p!.disabled).toBe(false);
        expect(p!.disabledReason).toBeNull();
      });
    }
  }

  test("only stop voting asks for a second tap", () => {
    for (const [phase] of table) {
      expect(primaryAction(inPhase(phase), "HOST")!.needsConfirm).toBe(phase === "VOTING");
    }
  });

  test("the IDLE and COMPLETED hint has no action: it only points at the queue", () => {
    expect(primaryAction(inPhase("IDLE"), "HOST")!.action).toBeNull();
    expect(primaryAction(inPhase("COMPLETED"), "OPERATOR")!.action).toBeNull();
  });

  test("a volunteer sees nothing actionable in any phase", () => {
    for (const [phase] of table) {
      expect(primaryAction(inPhase(phase), "VOLUNTEER")).toBeNull();
      expect(secondaryActions(inPhase(phase), "VOLUNTEER")).toEqual([]);
    }
  });

  test("no state, or no role, gives no button", () => {
    expect(primaryAction(null, "HOST")).toBeNull();
    expect(primaryAction(inPhase("READY"), null)).toBeNull();
  });

  test("start performance without a prompt is disabled: add a prompt first", () => {
    const p = primaryAction(inPhase("READY", { prompt: null }), "HOST")!;
    expect(p).toMatchObject({ labelKey: "startPerformance", disabled: true, disabledReason: "needsPrompt" });
  });

  test("reveal without the contestant's own score is disabled: enter their own score first", () => {
    const p = primaryAction(inPhase("VOTING_CLOSED", { selfScore: null }), "OPERATOR")!;
    expect(p).toMatchObject({ labelKey: "reveal", disabled: true, disabledReason: "needsSelfScore" });
  });

  test("the hint is disabled when there is nobody to select", () => {
    const contestants = st().contestants.map((k) => ({ ...k, active: false }));
    const p = primaryAction(inPhase("COMPLETED", { contestants }), "HOST")!;
    expect(p).toMatchObject({ labelKey: "selectContestant", disabled: true, disabledReason: "noContestants" });
  });

  test("a PERFORMING state read after its end time is treated as PERFORMED (same button)", () => {
    const s = inPhase("PERFORMING", { endsAtMs: T + 1000 });
    expect(primaryAction(s, "HOST", T + 5000)!.labelKey).toBe("startVoting");
  });
});

describe("secondaryActions", () => {
  const keys = (phase: Phase, role: Role = "HOST", over: Partial<AdminState> = {}): SecondaryKey[] =>
    secondaryActions(inPhase(phase, over), role).map((a) => a.key);

  test("VOTING: pause is the only secondary control (stop is the big button), plus own score", () => {
    expect(keys("VOTING")).toEqual(["pauseVoting", "setSelfScore"]);
    expect(primaryAction(inPhase("VOTING"), "HOST")!.action).toEqual({ type: "stopVoting" });
  });

  test("reassign is hidden while voting runs and shows once it is paused", () => {
    expect(keys("VOTING")).not.toContain("reassignContestant");
    expect(keys("VOTING_PAUSED")).toEqual(["stopVoting", "reassignContestant", "setSelfScore"]);
  });

  test("reopen shows only in VOTING_CLOSED", () => {
    const phases: Phase[] = ["IDLE", "READY", "PERFORMING", "PERFORMED", "VOTING", "VOTING_PAUSED", "VOTING_CLOSED", "REVEAL", "COMPLETED"];
    for (const phase of phases) {
      expect(keys(phase).includes("reopenVoting")).toBe(phase === "VOTING_CLOSED");
    }
    expect(keys("VOTING_CLOSED")).toEqual(["reopenVoting", "setSelfScore"]);
  });

  test("READY: draw prompt, enter prompt, reassign, own score", () => {
    expect(keys("READY")).toEqual(["drawPrompt", "setPrompt", "reassignContestant", "setSelfScore"]);
  });

  test("PERFORMING and PERFORMED: reassign and own score", () => {
    expect(keys("PERFORMING")).toEqual(["reassignContestant", "setSelfScore"]);
    expect(keys("PERFORMED")).toEqual(["reassignContestant", "setSelfScore"]);
  });

  test("IDLE, REVEAL and COMPLETED have no secondary controls", () => {
    expect(keys("IDLE")).toEqual([]);
    expect(keys("REVEAL")).toEqual([]);
    expect(keys("COMPLETED")).toEqual([]);
  });

  test("stop, reopen and reassign need a second tap; the rest do not", () => {
    const all = [
      ...secondaryActions(inPhase("VOTING"), "HOST"),
      ...secondaryActions(inPhase("VOTING_PAUSED"), "HOST"),
      ...secondaryActions(inPhase("VOTING_CLOSED"), "HOST"),
      ...secondaryActions(inPhase("READY"), "HOST"),
    ];
    for (const a of all) {
      expect(a.needsConfirm).toBe(a.key === "stopVoting" || a.key === "reopenVoting" || a.key === "reassignContestant");
    }
  });

  test("operator and super admin see the same live controls as a host", () => {
    for (const role of LIVE_ROLES) expect(keys("VOTING_PAUSED", role)).toEqual(keys("VOTING_PAUSED", "HOST"));
  });

  test("draw prompt says why it is off when no prompt is active", () => {
    const s = inPhase("READY", { prompts: [{ id: "p1", text: "x", active: false }] });
    expect(secondaryActions(s, "HOST").find((a) => a.key === "drawPrompt")).toMatchObject({ disabledReason: "noPrompts" });
  });

  test("reassign says why it is off when nobody else can take the slot", () => {
    const contestants = st().contestants.filter((k) => k.status !== "upcoming");
    const s = inPhase("READY", { contestants });
    expect(secondaryActions(s, "HOST").find((a) => a.key === "reassignContestant")).toMatchObject({ disabledReason: "noOtherContestants" });
  });

  test("no state gives nothing", () => {
    expect(secondaryActions(null, "HOST")).toEqual([]);
  });
});

describe("the queue", () => {
  test("Select on upcoming and done contestants when selecting is allowed", () => {
    const s = inPhase("COMPLETED", {
      contestants: st().contestants.map((k) => (k.status === "current" ? { ...k, status: "done" as const } : k)),
    });
    expect(queueAction(s, "HOST", AMAN)).toBe("select");
    expect(queueAction(s, "HOST", NEHA)).toBe("select");
    expect(queueAction(s, "HOST", RIYA)).toBe("select");
  });

  test("never on the current contestant, an inactive one, or without permission", () => {
    const s = inPhase("READY");
    expect(queueAction(s, "HOST", RIYA)).toBeNull();
    expect(queueAction(s, "HOST", KABIR)).toBeNull();
    expect(queueAction(s, "VOLUNTEER", AMAN)).toBeNull();
    expect(queueAction(s, "HOST", "no-such-id")).toBeNull();
  });

  test("not while an act is under way", () => {
    for (const phase of ["PERFORMING", "VOTING", "VOTING_PAUSED", "VOTING_CLOSED", "REVEAL"] as Phase[]) {
      expect(queueAction(inPhase(phase), "OPERATOR", AMAN)).toBeNull();
    }
  });

  test("reassign targets are the active upcoming contestants only", () => {
    expect(reassignTargets(inPhase("VOTING_PAUSED")).map((k) => k.id)).toEqual([AMAN]);
  });
});

describe("confirmStep", () => {
  test("the first tap only arms the confirm", () => {
    expect(confirmStep(null, "stopVoting", 100)).toEqual({ confirmed: false, pending: { key: "stopVoting", at: 100 } });
  });

  test("a second tap on the same key within 3 s confirms and clears", () => {
    expect(confirmStep({ key: "stopVoting", at: 100 }, "stopVoting", 3099)).toEqual({ confirmed: true, pending: null });
  });

  test("after 3 s the next tap starts over", () => {
    expect(confirmStep({ key: "stopVoting", at: 100 }, "stopVoting", 3100)).toEqual({ confirmed: false, pending: { key: "stopVoting", at: 3100 } });
  });

  test("a tap on a different key starts a new confirm", () => {
    expect(confirmStep({ key: "stopVoting", at: 100 }, "reopenVoting", 200)).toEqual({ confirmed: false, pending: { key: "reopenVoting", at: 200 } });
  });

  test("the window is adjustable", () => {
    expect(confirmStep({ key: "a", at: 0 }, "a", 999, 1000).confirmed).toBe(true);
    expect(confirmStep({ key: "a", at: 0 }, "a", 1000, 1000).confirmed).toBe(false);
  });
});

describe("formatRawAverage", () => {
  test("two decimals, rounded half up", () => {
    expect(formatRawAverage(7, 3)).toBe("7.00");
    expect(formatRawAverage(65 / 30, 30)).toBe("2.17");
    expect(formatRawAverage(7.125, 8)).toBe("7.13");
  });

  test("null with no votes", () => {
    expect(formatRawAverage(null, 0)).toBeNull();
    expect(formatRawAverage(5, 0)).toBeNull();
  });
});

describe("outcomeOf", () => {
  const s = st();
  test("ok is quiet, refusals name their reason", () => {
    expect(outcomeOf({ ok: true, state: s })).toBeNull();
    const codes: Extract<ActionResult, { ok: false }>["code"][] = ["stale", "not_allowed", "needs_prompt", "needs_self_score", "forbidden", "invalid"];
    for (const code of codes) expect(outcomeOf({ ok: false, code, state: s })).toBe(code);
  });

  test("no result is a network failure", () => {
    expect(outcomeOf(null)).toBe("network");
  });
});
