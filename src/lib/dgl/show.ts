import { DGL } from "@/data/dgl";
import { cleanAdminName, hashPasscode, validNewPasscode } from "./auth";
import { ensureSchema, type Db } from "./db";
import { LIVE_ACTIONS, SETUP_ACTIONS, allowed, can, effectivePhase, nextStatus } from "./machine";
import { compareScores, publicAverage } from "./score";
import type {
  Action,
  ActionResult,
  AdminState,
  ContestantStatus,
  LiveAction,
  PublicState,
  Role,
  StoredStatus,
} from "./types";

export type { ActionResult, AdminState, PublicState } from "./types";

type Admin = { id: string; name: string; role: Role };

/*
 * Reads. Timestamps cross the boundary as epoch ms (float8), counts as int,
 * averages as float8. Averages and the vote count only use votes that are
 * NOT excluded.
 */

const CURRENT = `
FROM dgl_show s
LEFT JOIN dgl_performances p ON p.id = s.current_performance_id
LEFT JOIN dgl_contestants c ON c.id = p.contestant_id`;

/*
 * The public read. The self score is only selected behind the REVEAL
 * condition, and no voter or IP column is ever selected.
 */
const PUBLIC_SQL = `
SELECT p.id AS performance_id, p.status, c.name AS contestant, p.prompt,
  round(extract(epoch FROM p.ends_at) * 1000)::float8 AS ends_at_ms,
  CASE WHEN p.status = 'REVEAL' THEN p.self_score::int END AS revealed_self,
  t.votes, t.average
${CURRENT}
LEFT JOIN LATERAL (
  SELECT count(*)::int AS votes, avg(v.score)::float8 AS average
  FROM dgl_votes v WHERE v.performance_id = p.id AND NOT v.excluded
) t ON true
WHERE s.id = 1`;

/** $1: whether to include admins, the audit log and moderation (SUPER_ADMIN). */
const ADMIN_SQL = `
SELECT s.version, p.id AS performance_id, p.status, c.name AS contestant, p.prompt,
  round(extract(epoch FROM p.ends_at) * 1000)::float8 AS ends_at_ms,
  p.self_score::int AS self_score,
  CASE WHEN p.status = 'REVEAL' THEN p.self_score::int END AS revealed_self,
  t.votes, t.average, t.flagged, t.excluded, t.kiosk,
  (SELECT coalesce(json_agg(json_build_object(
      'id', k.id, 'name', k.name, 'sort', k.sort, 'active', k.active,
      'status', CASE
        WHEN k.id = p.contestant_id AND p.status <> 'COMPLETED' THEN 'current'
        WHEN EXISTS (SELECT 1 FROM dgl_performances d WHERE d.contestant_id = k.id AND d.status = 'COMPLETED') THEN 'done'
        ELSE 'upcoming' END
    ) ORDER BY k.sort, k.name), '[]'::json) FROM dgl_contestants k) AS contestants,
  (SELECT coalesce(json_agg(json_build_object('id', r.id, 'text', r.text, 'active', r.active)
    ORDER BY r.text), '[]'::json) FROM dgl_prompts r) AS prompts,
  CASE WHEN $1::boolean THEN
    (SELECT coalesce(json_agg(json_build_object('id', a.id, 'name', a.name, 'role', a.role, 'active', a.active)
      ORDER BY a.name), '[]'::json) FROM dgl_admins a)
  END AS admins,
  CASE WHEN $1::boolean THEN
    (SELECT coalesce(json_agg(json_build_object(
        'at', round(extract(epoch FROM l.at) * 1000)::float8,
        'adminName', l.admin_name, 'action', l.action, 'detail', l.detail
      ) ORDER BY l.id DESC), '[]'::json)
     FROM (SELECT * FROM dgl_audit ORDER BY id DESC LIMIT 50) l)
  END AS audit,
  CASE WHEN $1::boolean THEN
    (SELECT coalesce(json_agg(json_build_object(
        'performanceId', m.id, 'contestant', m.name, 'votes', m.votes,
        'flagged', m.flagged, 'excluded', m.excluded
      ) ORDER BY m.created_at DESC, m.id DESC), '[]'::json)
     FROM (
       SELECT d.id, d.created_at, k.name,
         (count(*) FILTER (WHERE NOT v.excluded))::int AS votes,
         (count(*) FILTER (WHERE v.flagged))::int AS flagged,
         (count(*) FILTER (WHERE v.excluded))::int AS excluded
       FROM dgl_performances d
       JOIN dgl_contestants k ON k.id = d.contestant_id
       JOIN dgl_votes v ON v.performance_id = d.id
       GROUP BY d.id, d.created_at, k.name
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT 20) m)
  END AS moderation
${CURRENT}
LEFT JOIN LATERAL (
  SELECT (count(*) FILTER (WHERE NOT v.excluded))::int AS votes,
    (avg(v.score) FILTER (WHERE NOT v.excluded))::float8 AS average,
    (count(*) FILTER (WHERE v.flagged))::int AS flagged,
    (count(*) FILTER (WHERE v.excluded))::int AS excluded,
    (count(*) FILTER (WHERE v.source = 'kiosk'))::int AS kiosk
  FROM dgl_votes v WHERE v.performance_id = p.id
) t ON true
WHERE s.id = 1`;

type PublicRow = {
  performance_id: string | null;
  status: StoredStatus | null;
  contestant: string | null;
  prompt: string | null;
  ends_at_ms: number | null;
  revealed_self: number | null;
  votes: number;
  average: number | null;
};

type AdminRow = PublicRow & {
  version: number;
  self_score: number | null;
  flagged: number;
  excluded: number;
  kiosk: number;
  contestants: AdminState["contestants"];
  prompts: AdminState["prompts"];
  admins: NonNullable<AdminState["admins"]> | null;
  audit: NonNullable<AdminState["audit"]> | null;
  moderation: NonNullable<AdminState["moderation"]> | null;
};

const num = (x: unknown): number | null => (x === null || x === undefined ? null : Number(x));

function toPublic(r: PublicRow, now: number): PublicState {
  const votes = Number(r.votes ?? 0);
  const average = publicAverage(num(r.average), votes);
  const self = r.status === "REVEAL" ? num(r.revealed_self) : null;
  return {
    phase: effectivePhase(r.status, num(r.ends_at_ms), now),
    performanceId: r.performance_id,
    contestant: r.contestant,
    prompt: r.prompt,
    endsAtMs: num(r.ends_at_ms),
    votes,
    average,
    reveal:
      self === null ? null : { self, audience: average, result: compareScores(self, average) },
  };
}

export async function readPublicState(db: Db, now: number): Promise<PublicState> {
  await ensureSchema(db);
  const [row] = await db.query<PublicRow>(PUBLIC_SQL);
  return toPublic(row, now);
}

export async function readAdminState(
  db: Db,
  admin: Admin,
  now: number,
): Promise<AdminState> {
  await ensureSchema(db);
  const full = admin.role === "SUPER_ADMIN";
  const [r] = await db.query<AdminRow>(ADMIN_SQL, [full]);
  const state: AdminState = {
    ...toPublic(r, now),
    me: { name: admin.name, role: admin.role },
    version: Number(r.version),
    serverNow: now,
    selfScore: num(r.self_score),
    rawAverage: num(r.average),
    flagged: Number(r.flagged ?? 0),
    excluded: Number(r.excluded ?? 0),
    kiosk: Number(r.kiosk ?? 0),
    contestants: r.contestants.map((k) => ({ ...k, status: k.status as ContestantStatus })),
    prompts: r.prompts,
  };
  if (full) {
    state.admins = r.admins ?? [];
    state.audit = r.audit ?? [];
    state.moderation = r.moderation ?? [];
  }
  if (admin.role === "VOLUNTEER") {
    // The kiosk needs the phase, the act and `me`. The own score before the
    // reveal, the raw average, the flag and kiosk counts and the prompt list
    // are show control data a volunteer device has no use for.
    state.selfScore = null;
    state.rawAverage = null;
    state.flagged = 0;
    state.excluded = 0;
    state.kiosk = 0;
    state.prompts = [];
  }
  return state;
}

/*
 * Input validation. Returns the action rebuilt from known fields only (so
 * the audit detail never carries stray input), trimmed, or null if invalid.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);
const isBool = (x: unknown): x is boolean => typeof x === "boolean";
const isScore = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 10;
const ROLES: readonly Role[] = ["SUPER_ADMIN", "OPERATOR", "HOST", "VOLUNTEER"];
const isRole = (x: unknown): x is Role => ROLES.includes(x as Role);
const isSort = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= -2_147_483_648 && x <= 2_147_483_647;
function text200(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t.length >= 1 && t.length <= 200 ? t : null;
}

function normalize(a: Action): Action | null {
  switch (a.type) {
    case "selectContestant":
    case "reassignContestant":
      return isUuid(a.contestantId) ? { type: a.type, contestantId: a.contestantId } : null;
    case "setPrompt": {
      const text = text200(a.text);
      return text ? { type: a.type, text } : null;
    }
    case "setSelfScore":
      return isScore(a.score) ? { type: a.type, score: a.score } : null;
    case "upsertContestant": {
      const name = text200(a.name);
      if (!name || !isSort(a.sort) || !isBool(a.active)) return null;
      if (a.id != null && !isUuid(a.id)) return null;
      return { type: a.type, ...(a.id != null && { id: a.id }), name, sort: a.sort, active: a.active };
    }
    case "upsertPrompt": {
      const text = text200(a.text);
      if (!text || !isBool(a.active)) return null;
      if (a.id != null && !isUuid(a.id)) return null;
      return { type: a.type, ...(a.id != null && { id: a.id }), text, active: a.active };
    }
    case "upsertAdmin": {
      // A new admin needs a passcode; an edit may leave it out (keeps the hash).
      const name = cleanAdminName(a.name);
      if (!name || !isRole(a.role) || !isBool(a.active)) return null;
      if (a.id != null && !isUuid(a.id)) return null;
      const hasPass = a.passcode != null;
      if (hasPass ? !validNewPasscode(a.passcode) : a.id == null) return null;
      return {
        type: a.type,
        ...(a.id != null && { id: a.id }),
        name,
        role: a.role,
        ...(hasPass && { passcode: a.passcode }),
        active: a.active,
      };
    }
    case "setFlaggedExcluded":
      return isUuid(a.performanceId) && isBool(a.excluded)
        ? { type: a.type, performanceId: a.performanceId, excluded: a.excluded }
        : null;
    case "resetShow":
      return a.confirm === "RESET" ? { type: a.type, confirm: "RESET" } : null;
    case "drawPrompt":
    case "startPerformance":
    case "startVoting":
    case "pauseVoting":
    case "resumeVoting":
    case "stopVoting":
    case "reopenVoting":
    case "reveal":
    case "complete":
      return { type: a.type };
    default:
      // Anything else (kioskVote, which has its own route, or an unknown type) is not an action here.
      return null;
  }
}

/** Every Action type, and nothing else (kioskVote is a permission with its own route, not an action). */
const ACTION_TYPES = new Set<string>([...LIVE_ACTIONS, ...SETUP_ACTIONS]);

function detailOf(a: Action): Record<string, unknown> {
  if (a.type === "upsertAdmin") {
    // Built field by field: never the passcode, never its hash.
    return { name: a.name, role: a.role, active: a.active, passcodeChanged: a.passcode != null };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { type, ...rest } = a as Action & { confirm?: string; passcode?: string };
  delete rest.confirm;
  delete rest.passcode;
  return rest;
}

const LIVE = new Set<string>(LIVE_ACTIONS);
const isLive = (a: Action): a is LiveAction => LIVE.has(a.type);
/** Actions guarded by the show version: every live action, and resetShow. */
const versioned = (a: Action) => isLive(a) || a.type === "resetShow";

/** Collects positional parameters; add() returns the typed placeholder. */
class Params {
  readonly values: unknown[] = [];
  add(value: unknown, type: string): string {
    this.values.push(value);
    return `$${this.values.length}::${type}`;
  }
}

/*
 * Every write is one statement (data-modifying CTEs), so it is atomic over
 * Neon's HTTP driver, which has no transactions. A versioned action (live
 * actions and resetShow) bumps dgl_show.version guarded by WHERE version =
 * $v; setup actions (contestants, prompts, admins, moderation) leave the
 * version alone, so an edit in setup mid-show never makes the host's next
 * tap stale. Each statement applies the change and inserts the audit row,
 * keyed off the same CTE, and returns n = the number of rows the guard let
 * through (0 or 1).
 *
 * `hash` is the scrypt hash of an upsertAdmin passcode, computed by the
 * caller before the statement (null: keep the stored one). It only ever
 * goes into dgl_admins.passcode_hash.
 */
function writeStatement(a: Action, admin: Admin, version: number, now: number, hash: string | null) {
  const q = new Params();
  const ts = (ms: number) => `to_timestamp(${q.add(ms, "float8")} / 1000.0)`;
  const at = ts(now);
  // Lazy: a placeholder that no SQL references cannot be typed by Postgres.
  const detail = () => q.add(JSON.stringify(detailOf(a)), "jsonb");
  const audit = (from: string, performanceId: string, detailSql = detail()) =>
    `aud AS (INSERT INTO dgl_audit (at, admin_id, admin_name, action, performance_id, detail)
      SELECT ${at}, ${q.add(admin.id, "uuid")}, ${q.add(admin.name, "text")}, ${q.add(a.type, "text")},
        ${performanceId}, ${detailSql} FROM ${from})`;
  const checked = (set = "", cond = "") =>
    `bump AS (UPDATE dgl_show SET version = version + 1${set}
      WHERE id = 1 AND version = ${q.add(version, "int")}${cond}
      RETURNING current_performance_id AS pid)`;
  // Tied to the current performance by id only, with no status condition:
  // every status change bumps the version, so the version guard in `bump`
  // implies the status this action was checked against in applyAction.
  const onCurrent = (set: string) =>
    `chg AS (UPDATE dgl_performances p SET ${set} FROM bump WHERE p.id = bump.pid)`;
  const status = (t: LiveAction["type"]) => `status = ${q.add(nextStatus(t), "text")}`;
  const nBump = "SELECT count(*)::int AS n FROM bump";

  let text: string;
  switch (a.type) {
    case "selectContestant":
      // The new id is made in the same UPDATE that bumps the version, so the
      // show row is written once; the FK is checked at end of statement.
      text = `WITH ${checked(", current_performance_id = gen_random_uuid()")},
        ins AS (INSERT INTO dgl_performances (id, contestant_id, status, created_at)
          SELECT bump.pid, ${q.add(a.contestantId, "uuid")}, ${q.add(nextStatus(a.type), "text")}, ${at} FROM bump),
        ${audit("bump", "bump.pid")}
        ${nBump}`;
      break;
    case "drawPrompt":
      // Unused active prompts sort first, then random; LIMIT 1.
      text = `WITH pick AS (
          SELECT r.text FROM dgl_prompts r WHERE r.active
          ORDER BY EXISTS (SELECT 1 FROM dgl_performances x WHERE x.prompt = r.text), random()
          LIMIT 1),
        ${checked("", " AND EXISTS (SELECT 1 FROM pick)")},
        chg AS (UPDATE dgl_performances p SET prompt = pick.text FROM bump, pick WHERE p.id = bump.pid),
        ${audit("bump, pick", "bump.pid", "jsonb_build_object('text', pick.text)")}
        ${nBump}`;
      break;
    case "reassignContestant":
    case "setPrompt":
    case "setSelfScore":
    case "startPerformance":
    case "startVoting":
    case "pauseVoting":
    case "resumeVoting":
    case "stopVoting":
    case "reopenVoting":
    case "reveal":
    case "complete": {
      const set = {
        reassignContestant: () => `contestant_id = ${q.add((a as { contestantId: string }).contestantId, "uuid")}`,
        setPrompt: () => `prompt = ${q.add((a as { text: string }).text, "text")}`,
        setSelfScore: () => `self_score = ${q.add((a as { score: number }).score, "smallint")}`,
        startPerformance: () => `${status(a.type)}, ends_at = ${ts(now + DGL.performanceMs)}`,
        startVoting: () => `${status(a.type)}, voting_opened_at = ${at}`,
        pauseVoting: () => status(a.type),
        resumeVoting: () => status(a.type),
        stopVoting: () => `${status(a.type)}, voting_closed_at = ${at}`,
        reopenVoting: () => `${status(a.type)}, voting_closed_at = NULL`,
        reveal: () => `${status(a.type)}, revealed_at = ${at}`,
        complete: () => status(a.type),
      }[a.type]();
      text = `WITH ${checked()}, ${onCurrent(set)}, ${audit("bump", "bump.pid")} ${nBump}`;
      break;
    }
    case "resetShow":
      // Null the pointer in the same statement that deletes the performances
      // (votes cascade); the FK is checked at end of statement.
      text = `WITH ${checked(", current_performance_id = NULL")},
        del AS (DELETE FROM dgl_performances WHERE EXISTS (SELECT 1 FROM bump) RETURNING id),
        ${audit("bump", "NULL::uuid", `${detail()} || jsonb_build_object('performances', (SELECT count(*) FROM del))`)}
        ${nBump}`;
      break;
    case "upsertContestant":
    case "upsertPrompt": {
      const up =
        a.type === "upsertContestant"
          ? a.id
            ? `UPDATE dgl_contestants SET name = ${q.add(a.name, "text")}, sort = ${q.add(a.sort, "int")},
                active = ${q.add(a.active, "boolean")} WHERE id = ${q.add(a.id, "uuid")} RETURNING id`
            : `INSERT INTO dgl_contestants (name, sort, active)
                VALUES (${q.add(a.name, "text")}, ${q.add(a.sort, "int")}, ${q.add(a.active, "boolean")}) RETURNING id`
          : a.id
            ? `UPDATE dgl_prompts SET text = ${q.add(a.text, "text")}, active = ${q.add(a.active, "boolean")}
                WHERE id = ${q.add(a.id, "uuid")} RETURNING id`
            : `INSERT INTO dgl_prompts (text, active)
                VALUES (${q.add(a.text, "text")}, ${q.add(a.active, "boolean")}) RETURNING id`;
      text = `WITH up AS (${up}),
        ${audit("up", "NULL::uuid", `${detail()} || jsonb_build_object('id', up.id)`)}
        SELECT count(*)::int AS n FROM up`;
      break;
    }
    case "setFlaggedExcluded":
      text = `WITH perf AS (SELECT id FROM dgl_performances WHERE id = ${q.add(a.performanceId, "uuid")}),
        chg AS (UPDATE dgl_votes v SET excluded = ${q.add(a.excluded, "boolean")}
          FROM perf WHERE v.performance_id = perf.id AND v.flagged RETURNING 1),
        ${audit("perf", "perf.id", `${detail()} || jsonb_build_object('votes', (SELECT count(*) FROM chg))`)}
        SELECT count(*)::int AS n FROM perf`;
      break;
    case "upsertAdmin": {
      const role = q.add(a.role, "text");
      const active = q.add(a.active, "boolean");
      let up: string;
      if (!a.id) {
        if (hash === null) throw new Error("upsertAdmin insert needs a passcode hash");
        // A taken name is a conflict: no row, n = 0, "invalid" (never a 500).
        up = `up AS (INSERT INTO dgl_admins (name, role, passcode_hash, active)
          VALUES (${q.add(a.name, "text")}, ${role}, ${q.add(hash, "text")}, ${active})
          ON CONFLICT (name) DO NOTHING RETURNING id)`;
      } else {
        /*
         * The last active SUPER_ADMIN guard. `supers` locks every active
         * SUPER_ADMIN row (FOR UPDATE, in id order so two edits lock in the
         * same order). The update goes through if the row stays an active
         * SUPER_ADMIN, or is not one now, or another active SUPER_ADMIN is
         * among the locked rows. Two concurrent demotions (X demotes Y while
         * Y demotes X): the second blocks on the first one's lock;
         * under READ COMMITTED, once the first commits Postgres re-checks
         * the locked row against WHERE role = 'SUPER_ADMIN' AND active, so
         * the demoted row drops out of `supers`, no other SUPER_ADMIN is
         * left, and the second update matches nothing (invalid). A plain
         * EXISTS on the table would read the statement snapshot and let
         * both through. The guard reads `supers`, never the table. A row
         * counted as "another" stays locked until commit, so nobody can
         * demote it meanwhile. A lock wait cycle that Postgres still finds
         * fails the statement (nothing written, a 500), never a bad state.
         */
        const id = q.add(a.id, "uuid");
        const keepsSuper = a.role === "SUPER_ADMIN" && a.active;
        const pass = hash === null ? "passcode_hash" : q.add(hash, "text");
        up = `supers AS (SELECT id FROM dgl_admins WHERE role = 'SUPER_ADMIN' AND active ORDER BY id FOR UPDATE),
          up AS (UPDATE dgl_admins SET name = ${q.add(a.name, "text")}, role = ${role}, active = ${active},
              passcode_hash = ${pass}
            WHERE id = ${id}
              ${keepsSuper ? "" : `AND (NOT (role = 'SUPER_ADMIN' AND active) OR EXISTS (SELECT 1 FROM supers WHERE supers.id <> ${id}))`}
            RETURNING id)`;
      }
      text = `WITH ${up},
        ${audit("up", "NULL::uuid", `${detail()} || jsonb_build_object('id', up.id)`)}
        SELECT count(*)::int AS n FROM up`;
      break;
    }
  }
  return { text, values: q.values };
}

export async function applyAction(
  db: Db,
  admin: Admin,
  action: Action,
  version: number,
  now: number,
): Promise<ActionResult> {
  await ensureSchema(db);
  const refuse = async (
    code: Extract<ActionResult, { ok: false }>["code"],
    state?: AdminState,
  ): Promise<ActionResult> => ({
    ok: false,
    code,
    state: state ?? (await readAdminState(db, admin, now)),
  });

  // An unknown type is invalid for everyone, before the role check: `can` knows kioskVote, which is
  // not an action here and would otherwise reach writeStatement with no SQL for it.
  if (!ACTION_TYPES.has(action.type)) return refuse("invalid");
  if (!can(admin.role, action.type)) return refuse("forbidden");
  const a = normalize(action);
  if (!a) return refuse("invalid");

  const before = await readAdminState(db, admin, now);
  // A versioned action from an outdated view is stale, whatever it asks for:
  // the guarded write below would fail anyway.
  if (versioned(a) && before.version !== version) return refuse("stale", before);
  if (isLive(a)) {
    if (!allowed(before.phase, a.type)) return refuse("not_allowed", before);
    if (a.type === "selectContestant" || a.type === "reassignContestant") {
      const target = before.contestants.find((k) => k.id === a.contestantId);
      if (!target?.active) return refuse("invalid", before);
    }
    if (a.type === "drawPrompt" && !before.prompts.some((r) => r.active)) {
      return refuse("invalid", before);
    }
    if (a.type === "startPerformance" && !before.prompt) return refuse("needs_prompt", before);
    if (a.type === "reveal" && before.selfScore === null) return refuse("needs_self_score", before);
  }

  let hash: string | null = null;
  if (a.type === "upsertAdmin") {
    // You cannot deactivate yourself or step down from SUPER_ADMIN (only a
    // SUPER_ADMIN gets here). The last-SUPER_ADMIN guard is in the SQL.
    if (a.id === admin.id && (!a.active || a.role !== "SUPER_ADMIN")) return refuse("invalid", before);
    if (a.passcode != null) hash = await hashPasscode(a.passcode);
  }

  const { text, values } = writeStatement(a, admin, version, now, hash);
  let n: number;
  try {
    [{ n }] = await db.query<{ n: number }>(text, values);
  } catch (err) {
    // A rename onto a name that is already taken: invalid, not a 500.
    if (a.type === "upsertAdmin" && (err as { code?: unknown })?.code === "23505") return refuse("invalid");
    throw err;
  }
  const state = await readAdminState(db, admin, now);
  if (Number(n) > 0) return { ok: true, state };
  // Nothing written: a versioned action lost the race (stale) or, with the
  // version unchanged, its target vanished (invalid). Unversioned setup
  // actions only fail on an unknown id.
  return refuse(versioned(a) && state.version !== version ? "stale" : "invalid", state);
}
