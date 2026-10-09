import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DGL } from "@/data/dgl";
import {
  currentAdmin,
  hashPasscode,
  login,
  normalizeRole,
  readSession,
  signSession,
  verifyPasscode,
} from "@/lib/dgl/auth";
import type { Db } from "@/lib/dgl/db";
import { createTestDb } from "./pg";

const T0 = Date.parse("2026-10-03T12:00:00Z");
const MIN = 60_000;
const SECRET = "test-secret";
const ID = "55555555-5555-4555-8555-555555555555";

describe("passcodes", () => {
  test("round-trips and rejects a wrong passcode", async () => {
    const h = await hashPasscode("open sesame");
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPasscode("open sesame", h)).toBe(true);
    expect(await verifyPasscode("open sesame!", h)).toBe(false);
  });

  test("salts every hash", async () => {
    expect(await hashPasscode("same")).not.toBe(await hashPasscode("same"));
  });

  test("a malformed stored string is false, not a throw", async () => {
    for (const bad of ["", "x", "scrypt$$", "scrypt$zz$zz", "bcrypt$aa$bb", "scrypt$aa$bb$cc", "scrypt$00$00"]) {
      expect(await verifyPasscode("anything", bad)).toBe(false);
    }
  });
});

describe("sessions", () => {
  const exp = T0 + 60 * MIN;

  test("accepts a valid token", () => {
    const t = signSession(ID, exp, SECRET);
    expect(t.split(".")).toHaveLength(3);
    expect(readSession(t, SECRET, T0)).toBe(ID);
  });

  test("rejects a tampered id", () => {
    const [, e, sig] = signSession(ID, exp, SECRET).split(".");
    const other = "66666666-6666-4666-8666-666666666666";
    expect(readSession(`${other}.${e}.${sig}`, SECRET, T0)).toBeNull();
  });

  test("rejects a tampered expiry", () => {
    const [i, , sig] = signSession(ID, exp, SECRET).split(".");
    expect(readSession(`${i}.${exp + MIN}.${sig}`, SECRET, T0)).toBeNull();
  });

  test("rejects a bad signature and a wrong secret", () => {
    const t = signSession(ID, exp, SECRET);
    // The last hex character changed: always a different signature ("00" over the last two was the real one 1 time in 256).
    const forged = t.slice(0, -1) + (t.endsWith("0") ? "1" : "0");
    expect(forged).not.toBe(t);
    expect(readSession(forged, SECRET, T0)).toBeNull();
    expect(readSession(t, "other-secret", T0)).toBeNull();
    expect(readSession(`${ID}.${exp}.`, SECRET, T0)).toBeNull();
  });

  test("rejects an expired token, including at the exact expiry", () => {
    const t = signSession(ID, exp, SECRET);
    expect(readSession(t, SECRET, exp - 1)).toBe(ID);
    expect(readSession(t, SECRET, exp)).toBeNull();
    expect(readSession(t, SECRET, exp + 1)).toBeNull();
  });

  test("rejects malformed input", () => {
    expect(readSession(undefined, SECRET, T0)).toBeNull();
    expect(readSession("", SECRET, T0)).toBeNull();
    expect(readSession("a.b", SECRET, T0)).toBeNull();
    expect(readSession("a.b.c.d", SECRET, T0)).toBeNull();
    const sig = signSession(ID, exp, SECRET).split(".")[2];
    expect(readSession(`${ID}.abc.${sig}`, SECRET, T0)).toBeNull();
    expect(readSession(`${ID}.${exp}x.${sig}`, SECRET, T0)).toBeNull();
  });
});

describe("login and currentAdmin", () => {
  let db: Db;
  let id: string;

  beforeEach(async () => {
    // currentAdmin takes no secret argument (brief signature); it reads DGL_SECRET.
    vi.stubEnv("DGL_SECRET", SECRET);
    db = await createTestDb();
    const [r] = await db.query<{ id: string }>(
      "INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ($1, $2, $3) RETURNING id",
      ["Sai", "HOST", await hashPasscode("right")],
    );
    id = r.id;
  });

  afterEach(() => vi.unstubAllEnvs());

  const audit = () =>
    db.query<{ admin_id: string | null; admin_name: string; action: string; detail: unknown; at: Date }>(
      "SELECT admin_id, admin_name, action, detail, at FROM dgl_audit ORDER BY id",
    );

  test("a correct passcode logs in and audits it", async () => {
    const r = await login(db, "Sai", "right", T0);
    expect(r).toEqual({ ok: true, admin: { id, name: "Sai", role: "HOST" } });
    const rows = await audit();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ admin_id: id, admin_name: "Sai", action: "login" });
    expect(rows[0].at.getTime()).toBe(T0);
  });

  test("a wrong passcode fails and audits, never storing the passcode", async () => {
    expect(await login(db, "Sai", "wrong-pass", T0)).toEqual({ ok: false, code: "bad_credentials" });
    const rows = await audit();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ admin_id: id, admin_name: "Sai", action: "loginFailed" });
    expect(JSON.stringify(rows)).not.toContain("wrong-pass");
  });

  test("an unknown name fails with a null admin id", async () => {
    expect(await login(db, "Nobody", "right", T0)).toEqual({ ok: false, code: "bad_credentials" });
    const rows = await audit();
    expect(rows[0]).toMatchObject({ admin_id: null, admin_name: "Nobody", action: "loginFailed" });
  });

  test("an inactive admin fails as bad_credentials", async () => {
    await db.query("UPDATE dgl_admins SET active = false WHERE id = $1", [id]);
    expect(await login(db, "Sai", "right", T0)).toEqual({ ok: false, code: "bad_credentials" });
  });

  test("locks after the failure limit, even for the right passcode", async () => {
    for (let i = 0; i < DGL.limits.loginFailures; i++) {
      expect(await login(db, "Sai", "nope", T0 + i * 1000)).toEqual({ ok: false, code: "bad_credentials" });
    }
    const during = T0 + MIN;
    expect(await login(db, "Sai", "right", during)).toEqual({ ok: false, code: "locked" });
    expect(await login(db, "Sai", "nope", during)).toEqual({ ok: false, code: "locked" });
    // A locked attempt does not extend the lock.
    const failed = (await audit()).filter((r) => r.action === "loginFailed");
    expect(failed).toHaveLength(DGL.limits.loginFailures);
  });

  test("the lock is per name", async () => {
    await db.query("INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ('Other', 'HOST', $1)", [
      await hashPasscode("other"),
    ]);
    for (let i = 0; i < DGL.limits.loginFailures; i++) await login(db, "Sai", "nope", T0);
    expect((await login(db, "Other", "other", T0)).ok).toBe(true);
  });

  test("the lock ends once the failures leave the window", async () => {
    for (let i = 0; i < DGL.limits.loginFailures; i++) await login(db, "Sai", "nope", T0);
    const after = T0 + DGL.limits.loginWindowMin * MIN + 1;
    expect((await login(db, "Sai", "right", after)).ok).toBe(true);
  });

  test("one failure fewer than the limit does not lock", async () => {
    for (let i = 0; i < DGL.limits.loginFailures - 1; i++) await login(db, "Sai", "nope", T0);
    expect((await login(db, "Sai", "right", T0 + 1000)).ok).toBe(true);
  });

  test("concurrent attempts cannot bypass the lock", async () => {
    const limit = DGL.limits.loginFailures;
    const attempts = Array.from({ length: 30 }, (_, i) => login(db, "Sai", i === 29 ? "right" : `wrong${i}`, T0));
    const results = await Promise.all(attempts);
    // The correct passcode arrives last, after the limit is spent: refused.
    expect(results[29]).toEqual({ ok: false, code: "locked" });
    expect(results.some((r) => r.ok)).toBe(false);
    const rows = await audit();
    const evaluated = rows.filter((r) => r.action === "loginFailed" || r.action === "login");
    expect(evaluated.length).toBeLessThanOrEqual(limit);
    expect(rows.filter((r) => r.action === "loginLocked").length).toBe(30 - evaluated.length);
    expect(results.filter((r) => !r.ok && r.code === "locked").length).toBe(30 - evaluated.length);
    // And the lock holds afterwards.
    expect(await login(db, "Sai", "right", T0 + 1000)).toEqual({ ok: false, code: "locked" });
  });

  test("a successful login does not count toward the lock", async () => {
    for (let i = 0; i < DGL.limits.loginFailures - 2; i++) await login(db, "Sai", "nope", T0);
    for (let i = 0; i < 10; i++) expect((await login(db, "Sai", "right", T0)).ok).toBe(true);
    expect(await login(db, "Sai", "nope", T0)).toEqual({ ok: false, code: "bad_credentials" });
    expect((await login(db, "Sai", "right", T0)).ok).toBe(true);
    const rows = await audit();
    expect(rows.filter((r) => r.action === "loginFailed")).toHaveLength(DGL.limits.loginFailures - 1);
  });

  test("a locked attempt is audited as loginLocked, which does not extend the lock", async () => {
    for (let i = 0; i < DGL.limits.loginFailures; i++) await login(db, "Sai", "nope", T0);
    for (let i = 0; i < 3; i++) await login(db, "Sai", "right", T0 + 10 * MIN);
    expect((await audit()).filter((r) => r.action === "loginLocked")).toHaveLength(3);
    // Window measured from the original failures: unlocked after they age out.
    expect((await login(db, "Sai", "right", T0 + DGL.limits.loginWindowMin * MIN + 1)).ok).toBe(true);
  });

  test("the name is trimmed, so ' Sai ' matches admin Sai", async () => {
    const r = await login(db, "  Sai ", "right", T0);
    expect(r).toEqual({ ok: true, admin: { id, name: "Sai", role: "HOST" } });
    expect((await audit())[0].admin_name).toBe("Sai");
  });

  test("invalid names and passcodes fail without a query or an audit row", async () => {
    const bad: [string, string][] = [
      ["Sai\u0000", "right"],
      ["Sa\ni", "right"],
      ["Sai\u007f", "right"],
      ["x".repeat(65), "right"],
      ["", "right"],
      ["   ", "right"],
      ["Sai", ""],
      ["Sai", "p".repeat(257)],
    ];
    for (const [n, p] of bad) {
      expect(await login(db, n, p, T0)).toEqual({ ok: false, code: "bad_credentials" });
    }
    expect(await audit()).toHaveLength(0);
    // The limits themselves are inclusive.
    expect((await login(db, "x".repeat(64), "right", T0)).ok).toBe(false);
    expect((await audit())).toHaveLength(1);
  });

  test("currentAdmin reads the live row", async () => {
    const t = signSession(id, T0 + 60 * MIN, SECRET);
    expect(await currentAdmin(db, t, T0)).toEqual({ id, name: "Sai", role: "HOST" });

    await db.query("UPDATE dgl_admins SET role = 'SUPER_ADMIN' WHERE id = $1", [id]);
    expect((await currentAdmin(db, t, T0))?.role).toBe("SUPER_ADMIN");

    await db.query("UPDATE dgl_admins SET active = false WHERE id = $1", [id]);
    expect(await currentAdmin(db, t, T0)).toBeNull();
  });

  test("currentAdmin is null for a missing row, a bad token and an expired token", async () => {
    const ghost = signSession("77777777-7777-4777-8777-777777777777", T0 + MIN, SECRET);
    expect(await currentAdmin(db, ghost, T0)).toBeNull();
    expect(await currentAdmin(db, undefined, T0)).toBeNull();
    expect(await currentAdmin(db, "junk", T0)).toBeNull();
    expect(await currentAdmin(db, signSession(id, T0 + MIN, SECRET), T0 + MIN)).toBeNull();
  });

  test("login reads SUPER_ADMIN as itself and every other stored role as HOST", async () => {
    const roles: [string, string][] = [
      ["SUPER_ADMIN", "SUPER_ADMIN"],
      ["HOST", "HOST"],
      ["OPERATOR", "HOST"],
      ["VOLUNTEER", "HOST"],
      ["ROOT", "HOST"],
      ["super_admin", "HOST"],
    ];
    for (const [stored, read] of roles) {
      const name = `Role ${stored}`;
      await db.query("INSERT INTO dgl_admins (name, role, passcode_hash) VALUES ($1, $2, $3)", [name, stored, await hashPasscode("pass")]);
      expect(await login(db, name, "pass", T0), stored).toMatchObject({ ok: true, admin: { name, role: read } });
    }
  });

  test("currentAdmin reads a retired role as HOST", async () => {
    const t = signSession(id, T0 + 60 * MIN, SECRET);
    for (const stored of ["OPERATOR", "VOLUNTEER"]) {
      await db.query("UPDATE dgl_admins SET role = $2 WHERE id = $1", [id, stored]);
      expect(await currentAdmin(db, t, T0), stored).toEqual({ id, name: "Sai", role: "HOST" });
    }
  });

  test("currentAdmin is null when DGL_SECRET is unset or differs", async () => {
    const t = signSession(id, T0 + MIN, SECRET);
    vi.stubEnv("DGL_SECRET", "");
    expect(await currentAdmin(db, t, T0)).toBeNull();
    vi.stubEnv("DGL_SECRET", "other-secret");
    expect(await currentAdmin(db, t, T0)).toBeNull();
  });
});

describe("normalizeRole", () => {
  test("SUPER_ADMIN stays, anything else is HOST", () => {
    expect(normalizeRole("SUPER_ADMIN")).toBe("SUPER_ADMIN");
    for (const raw of ["HOST", "OPERATOR", "VOLUNTEER", "", "super_admin", " SUPER_ADMIN", "ROOT"]) {
      expect(normalizeRole(raw), raw).toBe("HOST");
    }
  });
});
