import { can } from "./machine";
import type { AdminState, Role } from "./types";

/**
 * Pure helpers for the setup panel (/dgl/admin, Setup). No React, no DOM.
 * The server decides every change; these only decide what the panel offers
 * and how it shows things.
 */

/**
 * The starter prompts that are not in the list yet, by exact trimmed text,
 * in seed order. The seed is deduped (after trimming) and empty entries are
 * dropped.
 */
export function missingSeedPrompts(existing: string[], seed: string[]): string[] {
  const have = new Set(existing.map((t) => t.trim()));
  const out: string[] = [];
  for (const raw of seed) {
    const t = raw.trim();
    if (!t || have.has(t)) continue;
    have.add(t);
    out.push(t);
  }
  return out;
}

type Sorted = { id: string; sort: number };

/**
 * The sort changes that move `list[index]` one place up (dir -1) or down
 * (dir 1), `list` being in display order (sort, then name, as the server
 * sends it). With every sort distinct, the two neighbours swap values: two
 * updates (the moved row first), and nothing else moves. With a tie anywhere, swapping values
 * could reorder other rows (ties fall back to the name), so the new order is
 * renumbered 1..n and only the rows whose sort changed are returned. Empty
 * when the move would go past either end.
 */
export function swapSort(list: readonly Sorted[], index: number, dir: -1 | 1): Sorted[] {
  const j = index + dir;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return [];
  const a = list[index];
  const b = list[j];
  const distinct = new Set(list.map((x) => x.sort)).size === list.length;
  if (distinct) {
    return [
      { id: a.id, sort: b.sort },
      { id: b.id, sort: a.sort },
    ];
  }
  const order = [...list];
  order[index] = b;
  order[j] = a;
  return order.flatMap((x, i) => (x.sort === i + 1 ? [] : [{ id: x.id, sort: i + 1 }]));
}

/** A whole number Postgres can store in an int column, from a field's text (trimmed); else null. */
export function parseSort(text: string): number | null {
  const t = text.trim();
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= -2_147_483_648 && n <= 2_147_483_647 ? n : null;
}

/** The sort a new contestant gets by default: one past the highest, 1 when there are none. */
export function nextSort(list: readonly { sort: number }[]): number {
  return list.length === 0 ? 1 : Math.max(...list.map((x) => x.sort)) + 1;
}

type AdminLike = { name: string; role: Role; active: boolean };

export type AdminEdit = {
  /** The row is the signed-in admin (names are unique). */
  self: boolean;
  /** The row is the only active SUPER_ADMIN. */
  lastSuper: boolean;
  canChangeRole: boolean;
  canDeactivate: boolean;
};

/**
 * What the admins list lets the signed-in admin change on one row. Mirrors
 * the server's guards so the panel can disable what would be refused: you
 * cannot change your own role or deactivate yourself, and nobody can demote
 * or deactivate the last active SUPER_ADMIN. `me` carries no id, so the
 * match is by name, which is unique. The server still decides.
 */
export function canEditAdmin(
  me: { name: string; role: Role },
  target: AdminLike,
  admins: readonly AdminLike[],
): AdminEdit {
  const self = target.name === me.name;
  const supers = admins.filter((x) => x.role === "SUPER_ADMIN" && x.active).length;
  const lastSuper = target.role === "SUPER_ADMIN" && target.active && supers <= 1;
  const locked = self || lastSuper;
  return { self, lastSuper, canChangeRole: !locked, canDeactivate: !locked };
}

const MAX_VALUE = 60;
/** Never shown, whatever an audit row carries. None is ever written; this is a second lock. */
const HIDDEN = new Set(["passcode", "passcode_hash", "passcodeHash"]);

function valueText(v: unknown): string {
  let s: string;
  if (typeof v === "string") s = v;
  else if (v === null) s = "null";
  else if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") s = String(v);
  else {
    try {
      s = JSON.stringify(v) ?? String(v);
    } catch {
      s = String(v);
    }
  }
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE - 3)}...` : s;
}

/**
 * An audit row's detail as one compact line: `key: value, key: value`.
 * Undefined values are skipped, nested values are compact JSON, and every
 * value is cut to 60 characters. Not an object: the value itself. Never
 * throws, whatever JSON (or non-JSON) it is given.
 */
export function formatAuditDetail(detail: unknown): string {
  try {
    if (detail === null || detail === undefined) return "";
    if (typeof detail !== "object" || Array.isArray(detail)) return valueText(detail);
    return Object.entries(detail)
      .filter(([k, v]) => v !== undefined && !HIDDEN.has(k))
      .map(([k, v]) => `${k}: ${valueText(v)}`)
      .join(", ");
  } catch {
    return "";
  }
}

export type SetupSection = "contestants" | "prompts" | "admins" | "moderation" | "audit" | "reset";

/**
 * The setup sections this admin gets, in display order: each one only when
 * the role may do what it offers (`can`, the server's own table) and, for
 * the SUPER_ADMIN-only lists, when the state carries their data. Empty:
 * the console offers no Setup view.
 */
export function setupSections(
  s: { me: { role: Role } } & Pick<AdminState, "admins" | "audit" | "moderation">,
): SetupSection[] {
  const role = s.me.role;
  const out: SetupSection[] = [];
  if (can(role, "upsertContestant")) out.push("contestants");
  if (can(role, "upsertPrompt")) out.push("prompts");
  if (can(role, "upsertAdmin") && s.admins) out.push("admins");
  if (can(role, "setFlaggedExcluded") && s.moderation) out.push("moderation");
  // The audit log has no action of its own: it is shown with admin management.
  if (can(role, "upsertAdmin") && s.audit) out.push("audit");
  if (can(role, "resetShow")) out.push("reset");
  return out;
}

/** The reset button is enabled only by typing exactly RESET. */
export function resetEnabled(input: string): boolean {
  return input === "RESET";
}
