import { describe, expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import { kioskOutcome, kioskScreen, newAttemptId, nextAttempt, uuidV4, type KioskOutcome } from "@/lib/dgl/kiosk-view";
import type { Phase, Role } from "@/lib/dgl/types";

const k = DGL.copy.kiosk;
const signedIn = (role: Role | null, phase: Phase | null) => kioskScreen({ session: "signedIn", role, phase });

describe("kioskScreen", () => {
  test("the session decides before anything else", () => {
    expect(kioskScreen({ session: "checking", role: null, phase: null })).toBe("checking");
    expect(kioskScreen({ session: "signedOut", role: null, phase: "VOTING" })).toBe("login");
    expect(kioskScreen({ session: "unreachable", role: null, phase: "VOTING" })).toBe("retry");
  });

  test("an unreachable server is never the login form", () => {
    expect(kioskScreen({ session: "unreachable", role: null, phase: null })).not.toBe("login");
  });

  test("a signed in session without a role keeps checking", () => {
    expect(signedIn(null, "VOTING")).toBe("checking");
  });

  test("HOST cannot record kiosk votes, in any phase", () => {
    for (const phase of ["IDLE", "VOTING", "VOTING_PAUSED", "VOTING_CLOSED"] as const) {
      expect(signedIn("HOST", phase)).toBe("wrong-role");
    }
  });

  test.each(["VOLUNTEER", "OPERATOR", "SUPER_ADMIN"] as const)("%s gets the kiosk", (role) => {
    expect(signedIn(role, "VOTING")).toBe("voting");
  });

  test("the grid only exists in VOTING", () => {
    const grid = (["IDLE", "READY", "PERFORMING", "PERFORMED", "VOTING", "VOTING_PAUSED", "VOTING_CLOSED", "REVEAL", "COMPLETED"] as const).filter(
      (p) => signedIn("VOLUNTEER", p) === "voting",
    );
    expect(grid).toEqual(["VOTING"]);
  });

  test("other phases map to a short line", () => {
    expect(signedIn("VOLUNTEER", null)).toBe("not-open");
    for (const p of ["IDLE", "READY", "PERFORMING", "PERFORMED"] as const) expect(signedIn("VOLUNTEER", p)).toBe("not-open");
    expect(signedIn("VOLUNTEER", "VOTING_PAUSED")).toBe("paused");
    for (const p of ["VOTING_CLOSED", "REVEAL", "COMPLETED"] as const) expect(signedIn("VOLUNTEER", p)).toBe("closed");
  });
});

describe("kioskOutcome", () => {
  const recorded: KioskOutcome = { kind: "recorded", text: k.outcome.recorded, tone: "success", keepSelection: false, lock: true, score: 7 };

  test("200 recorded is the only success, and it locks and clears", () => {
    expect(kioskOutcome(200, { status: "recorded", score: 7 }, 7)).toEqual(recorded);
  });

  test("409 duplicate is treated as recorded", () => {
    expect(kioskOutcome(409, { status: "duplicate", score: 7 }, 7)).toEqual(recorded);
  });

  test("409 paused keeps the selection, does not lock", () => {
    expect(kioskOutcome(409, { status: "paused" })).toEqual({ kind: "paused", text: k.outcome.paused, tone: "warn", keepSelection: true, lock: false, score: null });
  });

  test("409 closed clears the selection and says the vote was not counted", () => {
    expect(kioskOutcome(409, { status: "closed" })).toEqual({ kind: "closed", text: k.outcome.closed, tone: "error", keepSelection: false, lock: false, score: null });
  });

  test("429 keeps the selection", () => {
    expect(kioskOutcome(429, { status: "rate_limited" })).toEqual({ kind: "rate_limited", text: k.outcome.rateLimited, tone: "warn", keepSelection: true, lock: false, score: null });
  });

  test("401 sends the volunteer to sign in, 403 to the role message", () => {
    expect(kioskOutcome(401, { error: "unauthorized" }).kind).toBe("signed_out");
    expect(kioskOutcome(403, { error: "forbidden" }).kind).toBe("forbidden");
  });

  test("the score shown is the server's: a duplicate with another score than the pick says so", () => {
    const o = kioskOutcome(409, { status: "duplicate", score: 7 }, 3);
    expect(o).toMatchObject({ kind: "recorded", score: 7, lock: true, keepSelection: false });
    expect(o.text).toBe(k.outcome.recordedAs(7));
    expect(o.text).toContain("7");
    expect(o.text).not.toContain("3");
  });

  test("a recorded answer carries the server score, even if it differs from the pick", () => {
    expect(kioskOutcome(200, { status: "recorded", score: 8 }, 6)).toMatchObject({ score: 8, text: k.outcome.recordedAs(8) });
  });

  test("a recorded answer without a usable score still records, with no score to show", () => {
    expect(kioskOutcome(200, { status: "recorded" }, 6)).toMatchObject({ kind: "recorded", score: null, text: k.outcome.recorded });
    expect(kioskOutcome(200, { status: "recorded", score: 99 }, 6)).toMatchObject({ kind: "recorded", score: null });
  });

  test("not sent tells the volunteer a repeat press is safe", () => {
    expect(k.outcome.notSent).toMatch(/press again/i);
    expect(k.outcome.notSent).toMatch(/not count twice/i);
  });

  test("honesty: a network error or timeout (null status) is never recorded", () => {
    const o = kioskOutcome(null, null);
    expect(o).toEqual({ kind: "not_sent", text: k.outcome.notSent, tone: "error", keepSelection: true, lock: false, score: null });
    expect(o.text).not.toMatch(/recorded/i);
  });

  test("honesty: 5xx, 400, 404 and unparseable bodies are not sent, selection kept", () => {
    for (const status of [400, 404, 500, 502, 503, 504]) {
      const o = kioskOutcome(status, { error: "unavailable" });
      expect(o.kind).toBe("not_sent");
      expect(o.keepSelection).toBe(true);
      expect(o.lock).toBe(false);
    }
    expect(kioskOutcome(503, null).kind).toBe("not_sent");
  });

  test("honesty: a 200 or 409 whose body does not say so is not recorded", () => {
    expect(kioskOutcome(200, null).kind).toBe("not_sent");
    expect(kioskOutcome(200, {}).kind).toBe("not_sent");
    expect(kioskOutcome(200, { status: "paused" }).kind).toBe("not_sent");
    expect(kioskOutcome(409, null).kind).toBe("not_sent");
    expect(kioskOutcome(409, { status: "weird" }).kind).toBe("not_sent");
    expect(kioskOutcome(429, null).kind).toBe("rate_limited");
  });

  test("only recorded locks the grid", () => {
    const locks = [null, 200, 401, 403, 409, 429, 500].flatMap((s) =>
      [{ status: "recorded" }, { status: "duplicate" }, { status: "paused" }, { status: "closed" }, null].map((b) => kioskOutcome(s, b)),
    ).filter((o) => o.lock);
    expect(locks.every((o) => o.kind === "recorded")).toBe(true);
  });

  test("copy has no dashes", () => {
    expect(JSON.stringify(k)).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("nextAttempt", () => {
  let n = 0;
  const fresh = () => `id-${++n}`;

  test("the first press creates an id, a later press of the same attempt keeps it", () => {
    const first = nextAttempt(null, "press", fresh);
    expect(first).toMatch(/^id-/);
    expect(nextAttempt(first, "press", fresh)).toBe(first);
  });

  test.each(["not_sent", "rate_limited", "paused", "signed_out", "forbidden"] as const)("%s keeps the id, so a repeat press resends it", (kind) => {
    const id = nextAttempt(null, "press", fresh);
    const after = nextAttempt(id, kind, fresh);
    expect(after).toBe(id);
    expect(nextAttempt(after, "press", fresh)).toBe(id);
  });

  test.each(["recorded", "closed", "sign_out"] as const)("%s drops the id, so the next press is a new vote", (event) => {
    const id = nextAttempt(null, "press", fresh);
    const after = nextAttempt(id, event, fresh);
    expect(after).toBeNull();
    const next = nextAttempt(after, "press", fresh);
    expect(next).not.toBe(id);
  });

  test("duplicate answers are definitive too (they come back as recorded)", () => {
    const id = nextAttempt(null, "press", fresh);
    expect(nextAttempt(id, kioskOutcome(409, { status: "duplicate", score: 5 }, 5).kind, fresh)).toBeNull();
  });

  test("a network error and an unreadable 200 body keep the id", () => {
    const id = nextAttempt(null, "press", fresh);
    expect(nextAttempt(id, kioskOutcome(null, null).kind, fresh)).toBe(id);
    expect(nextAttempt(id, kioskOutcome(200, null).kind, fresh)).toBe(id);
  });
});

describe("attempt ids", () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  test("uuidV4 builds a v4 UUID from any 16 bytes", () => {
    expect(uuidV4(new Uint8Array(16))).toBe("00000000-0000-4000-8000-000000000000");
    expect(uuidV4(new Uint8Array(16).fill(255))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(uuidV4(Uint8Array.from({ length: 16 }, (_, i) => i * 17))).toMatch(V4);
  });

  test("newAttemptId is a v4 UUID, with randomUUID or with the getRandomValues fallback", () => {
    expect(newAttemptId()).toMatch(V4);
    const real = globalThis.crypto;
    const stub = { getRandomValues: real.getRandomValues.bind(real) } as unknown as Crypto;
    Object.defineProperty(globalThis, "crypto", { value: stub, configurable: true });
    try {
      const a = newAttemptId();
      const b = newAttemptId();
      expect(a).toMatch(V4);
      expect(a).not.toBe(b);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: real, configurable: true });
    }
  });
});
