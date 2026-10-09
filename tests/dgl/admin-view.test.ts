import { describe, expect, test } from "vitest";
import * as adminView from "@/lib/dgl/admin-view";
import {
  confirmStep,
  formatRawAverage,
  outcomeOf,
  primaryAction,
  secondaryActions,
  settleKey,
  SETTLE_MS,
  spinControl,
  tapAllowed,
  type SecondaryKey,
} from "@/lib/dgl/admin-view";
import type { ActionResult, AdminState, Phase, Role } from "@/lib/dgl/types";

const T = 1_000_000;

const st = (over: Partial<AdminState> = {}): AdminState => ({
  phase: "READY",
  performanceId: "44444444-4444-4444-8444-444444444444",
  contestant: "Riya Sharma",
  prompt: null,
  spunAtMs: null,
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

const PHASES: Phase[] = ["IDLE", "READY", "PERFORMING", "PERFORMED", "VOTING", "VOTING_PAUSED", "VOTING_CLOSED", "REVEAL", "COMPLETED"];
const ROLES: Role[] = ["HOST", "SUPER_ADMIN"];

describe("primaryAction: the one big button", () => {
  const table: [Phase, string, string | null][] = [
    ["IDLE", "putOnStage", null],
    ["COMPLETED", "putOnStage", null],
    ["READY", "startPerformance", "startPerformance"],
    ["PERFORMING", "startVoting", "startVoting"],
    ["PERFORMED", "startVoting", "startVoting"],
    ["VOTING", "stopVoting", "stopVoting"],
    ["VOTING_PAUSED", "resumeVoting", "resumeVoting"],
    ["VOTING_CLOSED", "reveal", "reveal"],
    ["REVEAL", "complete", "complete"],
  ];

  for (const role of ROLES) {
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

  test("IDLE and COMPLETED need a name: the button is the name form's, with no action of its own", () => {
    for (const phase of ["IDLE", "COMPLETED"] as const) {
      for (const role of ROLES) {
        expect(primaryAction(inPhase(phase), role)).toEqual({
          labelKey: "putOnStage",
          action: null,
          disabled: false,
          disabledReason: null,
          needsConfirm: false,
        });
      }
    }
  });

  test("no state, or no role, gives no button", () => {
    expect(primaryAction(null, "HOST")).toBeNull();
    expect(primaryAction(inPhase("READY"), null)).toBeNull();
  });

  test("READY starts the performance with no prompt and no reason", () => {
    for (const over of [{ prompt: null }, { prompt: null, prompts: [] }, { prompt: "Sell us a deprecated API", spunAtMs: T - 10_000 }]) {
      expect(primaryAction(inPhase("READY", over), "HOST")).toEqual({
        labelKey: "startPerformance",
        action: { type: "startPerformance" },
        disabled: false,
        disabledReason: null,
        needsConfirm: false,
      });
    }
  });

  test("reveal without the contestant's own score is disabled: enter their own score first", () => {
    const p = primaryAction(inPhase("VOTING_CLOSED", { selfScore: null }), "SUPER_ADMIN")!;
    expect(p).toMatchObject({ labelKey: "reveal", disabled: true, disabledReason: "needsSelfScore" });
  });

  test("a PERFORMING state read after its end time is treated as PERFORMED (same button)", () => {
    const s = inPhase("PERFORMING", { endsAtMs: T + 1000 });
    expect(primaryAction(s, "HOST", T + 5000)!.labelKey).toBe("startVoting");
  });
});

describe("secondaryActions", () => {
  const keys = (phase: Phase, role: Role = "HOST", over: Partial<AdminState> = {}): SecondaryKey[] =>
    secondaryActions(inPhase(phase, over), role).map((a) => a.key);

  test("READY: spin the wheel, fix the name, own score", () => {
    expect(keys("READY")).toEqual(["spinWheel", "renameAct", "setSelfScore"]);
  });

  test("PERFORMING and PERFORMED: fix the name and own score", () => {
    expect(keys("PERFORMING")).toEqual(["renameAct", "setSelfScore"]);
    expect(keys("PERFORMED")).toEqual(["renameAct", "setSelfScore"]);
  });

  test("VOTING: pause is the only secondary control (stop is the big button), plus own score", () => {
    expect(keys("VOTING")).toEqual(["pauseVoting", "setSelfScore"]);
    expect(primaryAction(inPhase("VOTING"), "HOST")!.action).toEqual({ type: "stopVoting" });
  });

  test("fixing the name is hidden while voting runs and shows once it is paused", () => {
    expect(keys("VOTING")).not.toContain("renameAct");
    expect(keys("VOTING_PAUSED")).toEqual(["stopVoting", "renameAct", "setSelfScore"]);
  });

  test("reopen shows only in VOTING_CLOSED", () => {
    for (const phase of PHASES) {
      expect(keys(phase).includes("reopenVoting")).toBe(phase === "VOTING_CLOSED");
    }
    expect(keys("VOTING_CLOSED")).toEqual(["reopenVoting", "setSelfScore"]);
  });

  test("IDLE, REVEAL and COMPLETED have no secondary controls", () => {
    expect(keys("IDLE")).toEqual([]);
    expect(keys("REVEAL")).toEqual([]);
    expect(keys("COMPLETED")).toEqual([]);
  });

  test("stop and reopen need a second tap; the rest do not", () => {
    const all = PHASES.flatMap((phase) => secondaryActions(inPhase(phase), "HOST"));
    for (const a of all) expect(a.needsConfirm, a.key).toBe(a.key === "stopVoting" || a.key === "reopenVoting");
  });

  test("a super admin sees the same live controls as a host", () => {
    for (const phase of PHASES) expect(keys(phase, "SUPER_ADMIN")).toEqual(keys(phase, "HOST"));
  });

  test("no state gives nothing", () => {
    expect(secondaryActions(null, "HOST")).toEqual([]);
  });
});

describe("spinControl: the wheel button", () => {
  test("READY offers Spin the wheel before any spin and Spin again after one", () => {
    expect(spinControl(inPhase("READY"), "HOST")).toEqual({ labelKey: "spinWheel", disabledReason: null });
    const spun = inPhase("READY", { prompt: "Sell us a deprecated API", spunAtMs: T - 1000 });
    expect(spinControl(spun, "HOST")).toEqual({ labelKey: "spinAgain", disabledReason: null });
    expect(spinControl(spun, "SUPER_ADMIN")).toEqual({ labelKey: "spinAgain", disabledReason: null });
  });

  test("it is off with a reason when no prompt is active", () => {
    expect(spinControl(inPhase("READY", { prompts: [] }), "HOST")).toEqual({ labelKey: "spinWheel", disabledReason: "noPrompts" });
    const off = inPhase("READY", { prompts: [{ id: "p1", text: "x", active: false }], spunAtMs: T - 1000 });
    expect(spinControl(off, "HOST")).toEqual({ labelKey: "spinAgain", disabledReason: "noPrompts" });
    expect(secondaryActions(off, "HOST").find((a) => a.key === "spinWheel")).toMatchObject({ disabledReason: "noPrompts" });
  });

  test("not offered outside READY", () => {
    for (const phase of PHASES.filter((x) => x !== "READY")) expect(spinControl(inPhase(phase), "HOST"), phase).toBeNull();
    expect(spinControl(null, "HOST")).toBeNull();
    expect(spinControl(inPhase("READY"), null)).toBeNull();
  });
});

describe("no queue and no prompt controls anywhere", () => {
  test("no phase offers a removed control, to any role", () => {
    const gone = ["selectContestant", "reassignContestant", "setPrompt", "drawPrompt"];
    for (const role of ROLES) {
      for (const phase of PHASES) {
        const s = inPhase(phase);
        expect(gone).not.toContain(primaryAction(s, role)?.labelKey);
        expect(gone).not.toContain(primaryAction(s, role)?.action?.type);
        for (const a of secondaryActions(s, role)) expect(gone).not.toContain(a.key);
      }
    }
  });

  test("the queue and reassign helpers are gone", () => {
    expect(Object.keys(adminView)).not.toContain("queueAction");
    expect(Object.keys(adminView)).not.toContain("reassignTargets");
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
    const codes: Extract<ActionResult, { ok: false }>["code"][] = ["stale", "not_allowed", "needs_self_score", "forbidden", "invalid"];
    for (const code of codes) expect(outcomeOf({ ok: false, code, state: s })).toBe(code);
  });

  test("no result is a network failure", () => {
    expect(outcomeOf(null)).toBe("network");
  });
});

describe("tapAllowed: the settle guard after the big button changes", () => {
  test("the window is 800 ms", () => {
    expect(SETTLE_MS).toBe(800);
  });

  test("nothing has changed yet: allowed", () => {
    expect(tapAllowed(null, 5000)).toBe(true);
  });

  test("blocked from the change up to 799 ms, allowed from 800 ms", () => {
    expect(tapAllowed(5000, 5000)).toBe(false);
    expect(tapAllowed(5000, 5799)).toBe(false);
    expect(tapAllowed(5000, 5800)).toBe(true);
    expect(tapAllowed(5000, 60_000)).toBe(true);
  });

  test("a change stamped in the future (clock stepped back) is not allowed", () => {
    expect(tapAllowed(5000, 4999)).toBe(false);
  });

  test("the window is adjustable", () => {
    expect(tapAllowed(0, 199, 200)).toBe(false);
    expect(tapAllowed(0, 200, 200)).toBe(true);
  });
});

describe("settleKey: what counts as the big button changing", () => {
  const ready = inPhase("READY");

  test("a new phase, act, role or button changes it", () => {
    expect(settleKey(inPhase("PERFORMING"))).not.toBe(settleKey(ready));
    expect(settleKey(inPhase("READY", { performanceId: "66666666-6666-4666-8666-666666666666" }))).not.toBe(settleKey(ready));
    expect(settleKey(inPhase("REVEAL"))).not.toBe(settleKey(inPhase("COMPLETED")));
    expect(settleKey(inPhase("READY", { me: { name: "Sai", role: "SUPER_ADMIN" } }))).not.toBe(settleKey(ready));
  });

  test("putting an act on stage is a real step, from IDLE and from COMPLETED", () => {
    expect(settleKey(inPhase("READY"))).not.toBe(settleKey(inPhase("IDLE")));
    expect(settleKey(inPhase("READY", { performanceId: "66666666-6666-4666-8666-666666666666" }))).not.toBe(settleKey(inPhase("COMPLETED")));
  });

  test("time running out (PERFORMING to PERFORMED, same act, same button) does not", () => {
    const performing = inPhase("PERFORMING", { endsAtMs: T + 1000 });
    const performed = inPhase("PERFORMED", { endsAtMs: T - 1 });
    expect(settleKey(performed)).toBe(settleKey(performing));
  });

  test("a real step still does: READY to PERFORMING, PERFORMED to VOTING", () => {
    expect(settleKey(inPhase("PERFORMING"))).not.toBe(settleKey(inPhase("READY")));
    expect(settleKey(inPhase("VOTING"))).not.toBe(settleKey(inPhase("PERFORMED")));
  });

  test("votes, version, a spin, a new name and own score do not (the button keeps its label)", () => {
    const spun = inPhase("READY", { votes: 40, version: 99, prompt: "Sell us a deprecated API", spunAtMs: T, contestant: "Riya S.", selfScore: 6 });
    expect(settleKey(spun)).toBe(settleKey(ready));
  });
});
