import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { DGL } from "@/data/dgl";
import { ensureSchema, type Db } from "./db";
import type { Role } from "./types";

type Admin = { id: string; name: string; role: Role };

const KEYLEN = 32;
const SALT_BYTES = 16;
const HEX = /^[0-9a-f]+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function derive(pass: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pass, salt, keylen, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** `scrypt$<saltHex>$<hashHex>`: 16-byte random salt, 32-byte key. */
export async function hashPasscode(pass: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(pass, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Constant-time compare. A malformed stored string is a plain false, never a throw. */
export async function verifyPasscode(pass: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  if (!saltHex || saltHex.length % 2 !== 0 || !HEX.test(saltHex)) return false;
  if (hashHex.length !== KEYLEN * 2 || !HEX.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await derive(pass, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

function mac(adminId: string, expiresMs: number, secret: string): string {
  return createHmac("sha256", secret).update(`${adminId}.${expiresMs}`).digest("hex");
}

/** `${adminId}.${expiresMs}.${hmacHex}`. */
export function signSession(adminId: string, expiresMs: number, secret: string): string {
  return `${adminId}.${expiresMs}.${mac(adminId, expiresMs, secret)}`;
}

/** The admin id when the token is well formed, correctly signed and unexpired; else null. */
export function readSession(token: string | undefined, secret: string, now: number): string | null {
  if (!token || !secret) return null;
  // Split from the right: the signature and expiry never contain dots.
  const sigAt = token.lastIndexOf(".");
  const expAt = sigAt < 0 ? -1 : token.lastIndexOf(".", sigAt - 1);
  if (sigAt < 0 || expAt <= 0) return null;
  const id = token.slice(0, expAt);
  const expiry = token.slice(expAt + 1, sigAt);
  const sig = token.slice(sigAt + 1);
  if (!/^\d+$/.test(expiry)) return null;
  const expiresMs = Number(expiry);
  if (!Number.isSafeInteger(expiresMs)) return null;
  const want = Buffer.from(mac(id, expiresMs, secret));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return expiresMs <= now ? null : id;
}

/** A valid-format hash nobody knows the passcode for, so an unknown name costs the same as a known one. */
const DUMMY_HASH = `scrypt$${"00".repeat(SALT_BYTES)}$${"ab".repeat(KEYLEN)}`;

type AdminRow = { id: string; name: string; role: Role; passcode_hash: string; active: boolean };

export type LoginResult =
  | { ok: true; admin: Admin }
  | { ok: false; code: "bad_credentials" | "locked" };

const MAX_NAME = 64;
const MAX_PASS = 256;
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Checks a name and passcode. The name is trimmed (as the bootstrap script
 * does); an empty, over-long or control-character name, or an empty or
 * over-long passcode, is `bad_credentials` with no query and no audit row.
 *
 * The lockout claims a slot BEFORE verifying, so parallel attempts cannot all
 * read the same low failure count:
 *  1. insert an audit row as `loginFailed` and take its id;
 *  2. count `loginFailed` rows for the name in the last `loginWindowMin`
 *     minutes with id <= ours (our own row included); above `loginFailures`
 *     the attempt is `locked`: the row becomes `loginLocked` (non-counting, so
 *     a lock never extends itself) and the passcode is never checked;
 *  3. otherwise verify. Success turns the row into `login` (stops counting);
 *     failure leaves it as `loginFailed`.
 * So at most `loginFailures` attempts per name per window reach scrypt, and
 * an attempt past the limit is refused even with the right passcode.
 * Residual: a bigserial id can be allocated out of commit order, so two racing
 * attempts can briefly see each other's ranks out of order. That is a tiny
 * window, far tighter than read-count-then-write.
 * No passcode, hash or token is ever stored in an audit row.
 */
export async function login(db: Db, rawName: string, pass: string, now: number): Promise<LoginResult> {
  const name = rawName.trim();
  if (!name || name.length > MAX_NAME || CONTROL.test(name) || !pass || pass.length > MAX_PASS) {
    return { ok: false, code: "bad_credentials" };
  }
  await ensureSchema(db);

  const [{ id: attemptId }] = await db.query<{ id: string }>(
    `INSERT INTO dgl_audit (at, admin_id, admin_name, action, detail)
     VALUES (to_timestamp($1::float8 / 1000.0), NULL, $2::text, 'loginFailed', '{}'::jsonb)
     RETURNING id::text AS id`,
    [now, name],
  );
  const [{ n }] = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM dgl_audit
     WHERE action = 'loginFailed' AND admin_name = $1::text AND id <= $2::bigint
       AND at > to_timestamp($3::float8 / 1000.0) - make_interval(mins => $4::int)`,
    [name, attemptId, now, DGL.limits.loginWindowMin],
  );
  if (n > DGL.limits.loginFailures) {
    await db.query("UPDATE dgl_audit SET action = 'loginLocked' WHERE id = $1::bigint", [attemptId]);
    return { ok: false, code: "locked" };
  }

  const [row] = await db.query<AdminRow>(
    "SELECT id, name, role, passcode_hash, active FROM dgl_admins WHERE name = $1::text",
    [name],
  );
  const matches = await verifyPasscode(pass, row?.passcode_hash ?? DUMMY_HASH);
  const ok = !!row && row.active && matches;

  await db.query(
    "UPDATE dgl_audit SET action = $2::text, admin_id = $3::uuid WHERE id = $1::bigint",
    [attemptId, ok ? "login" : "loginFailed", row?.id ?? null],
  );
  return ok
    ? { ok: true, admin: { id: row.id, name: row.name, role: row.role } }
    : { ok: false, code: "bad_credentials" };
}

/**
 * The signed-in admin for a session token, re-read from the row on every call
 * so deactivating them or changing their role bites on their next request.
 * The token is verified against DGL_SECRET; null when it is unset.
 */
export async function currentAdmin(db: Db, token: string | undefined, now: number): Promise<Admin | null> {
  const secret = process.env.DGL_SECRET;
  if (!secret) return null;
  const id = readSession(token, secret, now);
  if (!id || !UUID.test(id)) return null;
  await ensureSchema(db);
  const [row] = await db.query<AdminRow>(
    "SELECT id, name, role, active FROM dgl_admins WHERE id = $1::uuid",
    [id],
  );
  return row?.active ? { id: row.id, name: row.name, role: row.role } : null;
}
