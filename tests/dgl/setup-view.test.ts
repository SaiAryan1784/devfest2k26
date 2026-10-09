import { describe, expect, test } from "vitest";
import * as setupView from "@/lib/dgl/setup-view";
import {
  canEditAdmin,
  formatAuditDetail,
  missingSeedPrompts,
  resetEnabled,
  setupSections,
} from "@/lib/dgl/setup-view";

describe("missingSeedPrompts", () => {
  test("returns the seed prompts not already present, in seed order", () => {
    expect(missingSeedPrompts(["B"], ["A", "B", "C"])).toEqual(["A", "C"]);
  });
  test("matches on exact trimmed text only", () => {
    expect(missingSeedPrompts(["  A  ", "b"], [" A", "B"])).toEqual(["B"]);
  });
  test("dedupes the seed (after trimming) and drops empty entries", () => {
    expect(missingSeedPrompts([], ["A", " A ", "B", "A", "   "])).toEqual(["A", "B"]);
  });
  test("nothing missing, and an empty seed", () => {
    expect(missingSeedPrompts(["A", "B"], ["B", "A"])).toEqual([]);
    expect(missingSeedPrompts(["A"], [])).toEqual([]);
  });
});

describe("canEditAdmin", () => {
  const me = { name: "Sai", role: "SUPER_ADMIN" as const };
  const admins = [
    { name: "Sai", role: "SUPER_ADMIN" as const, active: true },
    { name: "Neha", role: "HOST" as const, active: true },
    { name: "Old", role: "SUPER_ADMIN" as const, active: false },
  ];
  test("you cannot change your own role or deactivate yourself", () => {
    expect(canEditAdmin(me, admins[0], admins)).toEqual({ self: true, lastSuper: true, canChangeRole: false, canDeactivate: false });
  });
  test("anyone else can be edited", () => {
    expect(canEditAdmin(me, admins[1], admins)).toEqual({ self: false, lastSuper: false, canChangeRole: true, canDeactivate: true });
    expect(canEditAdmin(me, admins[2], admins)).toEqual({ self: false, lastSuper: false, canChangeRole: true, canDeactivate: true });
  });
  test("the last active SUPER_ADMIN is locked even for another SUPER_ADMIN", () => {
    const other = { name: "Aman", role: "SUPER_ADMIN" as const };
    expect(canEditAdmin(other, admins[0], admins)).toEqual({ self: false, lastSuper: true, canChangeRole: false, canDeactivate: false });
  });
  test("with two active SUPER_ADMINs, the other one can step down", () => {
    const two = [...admins, { name: "Aman", role: "SUPER_ADMIN" as const, active: true }];
    expect(canEditAdmin(me, two[3], two)).toEqual({ self: false, lastSuper: false, canChangeRole: true, canDeactivate: true });
  });
});

describe("formatAuditDetail", () => {
  test("compact key: value pairs", () => {
    expect(formatAuditDetail({ name: "Neha", role: "HOST", active: true, passcodeChanged: false })).toBe(
      "name: Neha, role: HOST, active: true, passcodeChanged: false",
    );
    expect(formatAuditDetail({ score: 7, text: null })).toBe("score: 7, text: null");
  });
  test("skips undefined and never shows a passcode field", () => {
    expect(formatAuditDetail({ a: undefined, b: 1, passcode: "x", passcode_hash: "scrypt$1$2" })).toBe("b: 1");
  });
  test("truncates long values to 60 characters", () => {
    const out = formatAuditDetail({ text: "x".repeat(200) });
    expect(out).toBe(`text: ${"x".repeat(57)}...`);
    expect(out.length - "text: ".length).toBe(60);
    expect(formatAuditDetail({ text: "y".repeat(60) })).toBe(`text: ${"y".repeat(60)}`);
  });
  test("nested values as compact JSON", () => {
    expect(formatAuditDetail({ list: [1, 2], obj: { k: "v" } })).toBe('list: [1,2], obj: {"k":"v"}');
  });
  test("empty and non-object details", () => {
    expect(formatAuditDetail({})).toBe("");
    expect(formatAuditDetail(null)).toBe("");
    expect(formatAuditDetail(undefined)).toBe("");
    expect(formatAuditDetail("plain")).toBe("plain");
    expect(formatAuditDetail(42)).toBe("42");
    expect(formatAuditDetail([1, "a"])).toBe('[1,"a"]');
  });
  test("never throws", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => formatAuditDetail(loop)).not.toThrow();
    expect(() => formatAuditDetail({ big: BigInt(1) })).not.toThrow();
    expect(formatAuditDetail({ big: BigInt(1) })).toBe("big: 1");
    const evil = Object.defineProperty({}, "boom", { enumerable: true, get() { throw new Error("no"); } });
    expect(() => formatAuditDetail(evil)).not.toThrow();
  });
});

describe("resetEnabled", () => {
  test("exactly RESET", () => {
    expect(resetEnabled("RESET")).toBe(true);
    for (const s of ["", "reset", "Reset", " RESET", "RESET ", "RESETT", "RESE"]) expect(resetEnabled(s)).toBe(false);
  });
});

describe("setupSections", () => {
  const base = { admins: undefined, audit: undefined, moderation: undefined };
  const full = { admins: [], audit: [], moderation: [] };
  test("SUPER_ADMIN sees every section, and there is no contestants section", () => {
    expect(setupSections({ me: { role: "SUPER_ADMIN" }, ...full })).toEqual(["prompts", "admins", "moderation", "audit", "reset"]);
  });
  test("HOST gets no setup, even if the data were there", () => {
    expect(setupSections({ me: { role: "HOST" }, ...base })).toEqual([]);
    expect(setupSections({ me: { role: "HOST" }, ...full })).toEqual([]);
  });
  test("a SUPER_ADMIN section needs its data", () => {
    expect(setupSections({ me: { role: "SUPER_ADMIN" }, ...base })).toEqual(["prompts", "reset"]);
  });
});

test("the contestant sort helpers are gone", () => {
  for (const name of ["swapSort", "parseSort", "nextSort"]) expect(Object.keys(setupView)).not.toContain(name);
});
