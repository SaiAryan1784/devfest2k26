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

/**
 * Checks a name and passcode. Locked when `loginFailures` failed attempts for
 * that name sit inside the last `loginWindowMin` minutes, even for the right
 * passcode. Every attempt that is not locked out writes one audit row; no
 * passcode, hash or token is ever stored in it.
 */
export async function login(db: Db, name: string, pass: string, now: number): Promise<LoginResult> {
  await ensureSchema(db);
  const [{ failures }] = await db.query<{ failures: number }>(
    `SELECT count(*)::int AS failures FROM dgl_audit
     WHERE action = 'loginFailed' AND admin_name = $1::text
       AND at > to_timestamp($2::float8 / 1000.0) - make_interval(mins => $3::int)`,
    [name, now, DGL.limits.loginWindowMin],
  );
  if (failures >= DGL.limits.loginFailures) return { ok: false, code: "locked" };

  const [row] = await db.query<AdminRow>(
    "SELECT id, name, role, passcode_hash, active FROM dgl_admins WHERE name = $1::text",
    [name],
  );
  const matches = await verifyPasscode(pass, row?.passcode_hash ?? DUMMY_HASH);
  const ok = !!row && row.active && matches;

  await db.query(
    `INSERT INTO dgl_audit (at, admin_id, admin_name, action, detail)
     VALUES (to_timestamp($1::float8 / 1000.0), $2::uuid, $3::text, $4::text, '{}'::jsonb)`,
    [now, row?.id ?? null, ok ? row.name : name, ok ? "login" : "loginFailed"],
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
