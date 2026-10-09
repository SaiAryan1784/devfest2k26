import { DGL } from "@/data/dgl";
import { cleanAdminName, cleanName, hashPasscode, normalizeRole, validNewPasscode } from "./auth";
import { ensureSchema, type Db } from "./db";
import { LIVE_ACTIONS, SETUP_ACTIONS, allowed, can, effectivePhase, isRole, nextStatus } from "./machine";
import { compareScores, publicAverage } from "./score";
import { winnersOf, type ActStanding } from "./standings";
import { canAccessTrack, defaultTrackFor, isTrack } from "./tracks";
import type {
  Action,
  ActionResult,
  ActRow,
  Admin,
  AdminState,
  LiveAction,
  PublicState,
  StoredStatus,
  Track,
} from "./types";

export type { ActionResult, AdminState, PublicState } from "./types";

/*
 * Reads. Timestamps cross the boundary as epoch ms (float8), counts as int,
 * averages as float8. Averages and the vote count only use votes that are
 * NOT excluded. An act's name is its own (contestant_name, typed by the
 * host); dgl_contestants is no longer read.
 */

const CURRENT = `
FROM dgl_tracks s
LEFT JOIN dgl_performances p ON p.id = s.current_performance_id`;

/**
 * The track's acts in running order with their exact average: the staff list
 * and the winner. $1 is the track. Performances from before tracks have a null
 * track and are never read.
 */
const ACTS_SQL = `
SELECT p.id AS performance_id, coalesce(p.contestant_name, '') AS name, p.status,
  (count(v.*) FILTER (WHERE NOT v.excluded))::int AS votes,
  (avg(v.score) FILTER (WHERE NOT v.excluded))::float8 AS exact,
  (p.revealed_at IS NOT NULL) AS revealed
FROM dgl_performances p
LEFT JOIN dgl_votes v ON v.performance_id = p.id
WHERE p.track = $1::text
GROUP BY p.id, p.contestant_name, p.status, p.revealed_at, p.created_at
ORDER BY p.created_at, p.id`;

type ActsRow = { performance_id: string; name: string; status: StoredStatus; votes: number; exact: number | null; revealed: boolean };

/*
 * The public read. The self score is only selected behind the REVEAL
 * condition, and no voter or IP column is ever selected.
 */
const PUBLIC_SQL = `
SELECT s.track, s.winner_shown, p.id AS performance_id, p.status, p.contestant_name AS contestant, p.prompt,
  round(extract(epoch FROM p.ends_at) * 1000)::float8 AS ends_at_ms,
  round(extract(epoch FROM p.spun_at) * 1000)::float8 AS spun_at_ms,
  CASE WHEN p.status = 'REVEAL' THEN p.self_score::int END AS revealed_self,
  t.votes, t.average
${CURRENT}
LEFT JOIN LATERAL (
  SELECT count(*)::int AS votes, avg(v.score)::float8 AS average
  FROM dgl_votes v WHERE v.performance_id = p.id AND NOT v.excluded
) t ON true
WHERE s.track = $1::text`;

/**
 * $1: whether to include admins, the audit log and moderation (SUPER_ADMIN);
 * $2: the track.
 * Admin roles come back as stored (readAdminState normalises them). In the
 * moderation list an act from before names were typed has none: '' rather
 * than null.
 */
const ADMIN_SQL = `
SELECT s.track, s.winner_shown, s.version, p.id AS performance_id, p.status, p.contestant_name AS contestant, p.prompt,
  round(extract(epoch FROM p.ends_at) * 1000)::float8 AS ends_at_ms,
  round(extract(epoch FROM p.spun_at) * 1000)::float8 AS spun_at_ms,
  p.self_score::int AS self_score,
  CASE WHEN p.status = 'REVEAL' THEN p.self_score::int END AS revealed_self,
  t.votes, t.average, t.flagged, t.excluded, t.kiosk,
  (SELECT coalesce(json_agg(json_build_object('id', r.id, 'text', r.text, 'active', r.active)
    ORDER BY r.text), '[]'::json) FROM dgl_prompts r) AS prompts,
  CASE WHEN $1::boolean THEN
    (SELECT coalesce(json_agg(json_build_object('id', a.id, 'name', a.name, 'role', a.role, 'track', a.track, 'active', a.active)
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
       SELECT d.id, d.created_at, coalesce(d.contestant_name, '') AS name,
         (count(*) FILTER (WHERE NOT v.excluded))::int AS votes,
         (count(*) FILTER (WHERE v.flagged))::int AS flagged,
         (count(*) FILTER (WHERE v.excluded))::int AS excluded
       FROM dgl_performances d
       JOIN dgl_votes v ON v.performance_id = d.id
       WHERE d.track = $2::text
       GROUP BY d.id, d.created_at, d.contestant_name
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
WHERE s.track = $2::text`;

type PublicRow = {
  track: Track;
  winner_shown: boolean;
  performance_id: string | null;
  status: StoredStatus | null;
  contestant: string | null;
  prompt: string | null;
  ends_at_ms: number | null;
  spun_at_ms: number | null;
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
  prompts: AdminState["prompts"];
  /** `role` as stored: read through normalizeRole. */
  admins: { id: string; name: string; role: string; track: string | null; active: boolean }[] | null;
  audit: NonNullable<AdminState["audit"]> | null;
  moderation: NonNullable<AdminState["moderation"]> | null;
};

const num = (x: unknown): number | null => (x === null || x === undefined ? null : Number(x));

const toActs = (rows: ActsRow[]): ActStanding[] =>
  rows.map((a) => ({
    performanceId: a.performance_id,
    name: a.name,
    status: a.status,
    votes: Number(a.votes),
    exact: num(a.exact),
    revealed: !!a.revealed,
  }));

function toPublic(r: PublicRow, now: number, acts: ActStanding[]): PublicState {
  const votes = Number(r.votes ?? 0);
  const average = publicAverage(num(r.average), votes);
  const self = r.status === "REVEAL" ? num(r.revealed_self) : null;
  return {
    track: r.track,
    phase: effectivePhase(r.status, num(r.ends_at_ms), now),
    performanceId: r.performance_id,
    contestant: r.contestant,
    prompt: r.prompt,
    spunAtMs: num(r.spun_at_ms),
    endsAtMs: num(r.ends_at_ms),
    votes,
    average,
    reveal:
      self === null ? null : { self, audience: average, result: compareScores(self, average) },
    // Computed on read, so moderation changes show at once.
    winner: r.winner_shown ? winnersOf(acts) : null,
  };
}

export async function readPublicState(db: Db, track: Track, now: number): Promise<PublicState> {
  await ensureSchema(db);
  const [row] = await db.query<PublicRow>(PUBLIC_SQL, [track]);
  // The standings are only read while the host has the winner screen on.
  const acts = row.winner_shown ? toActs(await db.query<ActsRow>(ACTS_SQL, [track])) : [];
  return toPublic(row, now, acts);
}

/** The caller checks canAccessTrack(admin.track, track) first (the routes and applyAction do). */
export async function readAdminState(
  db: Db,
  admin: Admin,
  track: Track,
  now: number,
): Promise<AdminState> {
  await ensureSchema(db);
  const full = admin.role === "SUPER_ADMIN";
  const [r] = await db.query<AdminRow>(ADMIN_SQL, [full, track]);
  const acts = toActs(await db.query<ActsRow>(ACTS_SQL, [track]));
  const state: AdminState = {
    ...toPublic(r, now, acts),
    me: { name: admin.name, role: admin.role, track: admin.track },
    acts: acts.map(
      (a): ActRow => ({
        performanceId: a.performanceId,
        name: a.name,
        status: a.status,
        votes: a.votes,
        audience: publicAverage(a.exact, a.votes),
        exact: a.exact,
        revealed: a.revealed,
      }),
    ),
    leaders: winnersOf(acts),
    winnerShown: !!r.winner_shown,
    version: Number(r.version),
    serverNow: now,
    selfScore: num(r.self_score),
    rawAverage: num(r.average),
    flagged: Number(r.flagged ?? 0),
    excluded: Number(r.excluded ?? 0),
    kiosk: Number(r.kiosk ?? 0),
    prompts: r.prompts,
  };
  if (full) {
    state.admins = (r.admins ?? []).map((a) => ({ ...a, role: normalizeRole(a.role), track: isTrack(a.track) ? a.track : null }));
    state.audit = r.audit ?? [];
    state.moderation = r.moderation ?? [];
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
function text200(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t.length >= 1 && t.length <= 200 ? t : null;
}

function normalize(a: Action): Action | null {
  switch (a.type) {
    case "putOnStage":
    case "renameAct": {
      // An act's name: trimmed, 1 to DGL.limits.nameMax characters, no control characters.
      const name = cleanName(a.name, DGL.limits.nameMax);
      return name ? { type: a.type, name } : null;
    }
    case "removePrompt":
      return isUuid(a.id) ? { type: a.type, id: a.id } : null;
    case "setSelfScore":
      return isScore(a.score) ? { type: a.type, score: a.score } : null;
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
      // Null: all tracks. Anything that is not a track slug is invalid.
      if (a.track !== null && !isTrack(a.track)) return null;
      if (a.id != null && !isUuid(a.id)) return null;
      const hasPass = a.passcode != null;
      if (hasPass ? !validNewPasscode(a.passcode) : a.id == null) return null;
      return {
        type: a.type,
        ...(a.id != null && { id: a.id }),
        name,
        role: a.role,
        track: a.track,
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
    case "spinWheel":
    case "startPerformance":
    case "startVoting":
    case "pauseVoting":
    case "resumeVoting":
    case "stopVoting":
    case "reopenVoting":
    case "reveal":
    case "complete":
    case "showWinner":
    case "hideWinner":
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
    return { name: a.name, role: a.role, adminTrack: a.track, active: a.active, passcodeChanged: a.passcode != null };
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
 * $v; setup actions (prompts, admins, moderation) leave the version alone,
 * so an edit in setup mid-show never makes the host's next tap stale. Each statement applies the change and inserts the audit row,
 * keyed off the same CTE, and returns n = the number of rows the guard let
 * through (0 or 1).
 *
 * `hash` is the scrypt hash of an upsertAdmin passcode, computed by the
 * caller before the statement (null: keep the stored one). It only ever
 * goes into dgl_admins.passcode_hash.
 */
function writeStatement(a: Action, admin: Admin, track: Track, version: number, now: number, hash: string | null) {
  const q = new Params();
  const ts = (ms: number) => `to_timestamp(${q.add(ms, "float8")} / 1000.0)`;
  const at = ts(now);
  // Lazy: a placeholder that no SQL references cannot be typed by Postgres.
  const detail = () => q.add(JSON.stringify({ ...detailOf(a), track }), "jsonb");
  let trackParam: string | null = null;
  const tp = () => (trackParam ??= q.add(track, "text"));
  const audit = (from: string, performanceId: string, detailSql = detail()) =>
    `aud AS (INSERT INTO dgl_audit (at, admin_id, admin_name, action, performance_id, detail)
      SELECT ${at}, ${q.add(admin.id, "uuid")}, ${q.add(admin.name, "text")}, ${q.add(a.type, "text")},
        ${performanceId}, ${detailSql} FROM ${from})`;
  const checked = (set = "", cond = "") =>
    `bump AS (UPDATE dgl_tracks SET version = version + 1${set}
      WHERE track = ${tp()} AND version = ${q.add(version, "int")}${cond}
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
    case "putOnStage":
      // The new id is made in the same UPDATE that bumps the version, so the
      // show row is written once; the FK is checked at end of statement. The
      // act carries the typed name; it has no contestant row (contestant_id null).
      text = `WITH ${checked(", current_performance_id = gen_random_uuid(), winner_shown = false")},
        ins AS (INSERT INTO dgl_performances (id, contestant_name, status, track, created_at)
          SELECT bump.pid, ${q.add(a.name, "text")}, ${q.add(nextStatus(a.type), "text")}, ${tp()}, ${at} FROM bump),
        ${audit("bump", "bump.pid")}
        ${nBump}`;
      break;
    case "spinWheel":
      // Active prompts that no performance has used sort first, then random;
      // LIMIT 1. The current act's own draw counts as used, so "Spin again"
      // moves on to another prompt while an unused one is left. The spin time
      // is stored with it: the screens hide the prompt until the wheel stops.
      text = `WITH pick AS (
          SELECT r.text FROM dgl_prompts r WHERE r.active
          ORDER BY EXISTS (SELECT 1 FROM dgl_performances x WHERE x.prompt = r.text AND x.track = ${tp()}), random()
          LIMIT 1),
        ${checked("", " AND EXISTS (SELECT 1 FROM pick)")},
        chg AS (UPDATE dgl_performances p SET prompt = pick.text, spun_at = ${at} FROM bump, pick WHERE p.id = bump.pid),
        ${audit("bump, pick", "bump.pid", `jsonb_build_object('text', pick.text, 'track', ${tp()})`)}
        ${nBump}`;
      break;
    case "renameAct":
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
        renameAct: () => `contestant_name = ${q.add((a as { name: string }).name, "text")}`,
        setSelfScore: () => `self_score = ${q.add((a as { score: number }).score, "smallint")}`,
        startPerformance: () => `${status(a.type)}, ends_at = ${ts(now + DGL.performanceMs + DGL.startLeadMs)}`,
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
    case "showWinner":
    case "hideWinner":
      text = `WITH ${checked(`, winner_shown = ${a.type === "showWinner"}`)}, ${audit("bump", "bump.pid")} ${nBump}`;
      break;
    case "resetShow":
      // Null the pointer in the same statement that deletes this track's
      // performances (votes cascade); the FK is checked at end of statement.
      text = `WITH ${checked(", current_performance_id = NULL, winner_shown = false")},
        del AS (DELETE FROM dgl_performances WHERE EXISTS (SELECT 1 FROM bump) AND track = ${tp()} RETURNING id),
        ${audit("bump", "NULL::uuid", `${detail()} || jsonb_build_object('performances', (SELECT count(*) FROM del))`)}
        ${nBump}`;
      break;
    case "upsertPrompt": {
      const up = a.id
        ? `UPDATE dgl_prompts SET text = ${q.add(a.text, "text")}, active = ${q.add(a.active, "boolean")}
            WHERE id = ${q.add(a.id, "uuid")} RETURNING id`
        : `INSERT INTO dgl_prompts (text, active)
            VALUES (${q.add(a.text, "text")}, ${q.add(a.active, "boolean")}) RETURNING id`;
      text = `WITH up AS (${up}),
        ${audit("up", "NULL::uuid", `${detail()} || jsonb_build_object('id', up.id)`)}
        SELECT count(*)::int AS n FROM up`;
      break;
    }
    case "removePrompt":
      // One statement: the delete and its audit row. A prompt that is already gone matches nothing (n = 0, "invalid").
      text = `WITH del AS (DELETE FROM dgl_prompts WHERE id = ${q.add(a.id, "uuid")} RETURNING id),
        ${audit("del", "NULL::uuid", `${detail()} || jsonb_build_object('id', del.id)`)}
        SELECT count(*)::int AS n FROM del`;
      break;
    case "setFlaggedExcluded":
      text = `WITH perf AS (SELECT id FROM dgl_performances WHERE id = ${q.add(a.performanceId, "uuid")} AND track = ${tp()}),
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
        up = `up AS (INSERT INTO dgl_admins (name, role, track, passcode_hash, active)
          VALUES (${q.add(a.name, "text")}, ${role}, ${q.add(a.track, "text")}, ${q.add(hash, "text")}, ${active})
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
        // Only an all-track super admin can manage accounts, so that is the kind to keep.
        const keepsSuper = a.role === "SUPER_ADMIN" && a.active && a.track === null;
        const pass = hash === null ? "passcode_hash" : q.add(hash, "text");
        up = `supers AS (SELECT id FROM dgl_admins WHERE role = 'SUPER_ADMIN' AND active AND track IS NULL ORDER BY id FOR UPDATE),
          up AS (UPDATE dgl_admins SET name = ${q.add(a.name, "text")}, role = ${role}, active = ${active}, track = ${q.add(a.track, "text")},
              passcode_hash = ${pass}
            WHERE id = ${id}
              ${keepsSuper ? "" : `AND (NOT (role = 'SUPER_ADMIN' AND active AND track IS NULL) OR EXISTS (SELECT 1 FROM supers WHERE supers.id <> ${id}))`}
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
  track: Track,
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
    state: state ?? (await readAdminState(db, admin, track, now)),
  });

  // A track admin works in their own track only: nothing is read or written elsewhere.
  // The refusal carries the admin's own track's state, never the one asked for.
  if (!canAccessTrack(admin.track, track)) return refuse("forbidden", await readAdminState(db, admin, defaultTrackFor(admin.track), now));

  // An unknown type is invalid for everyone, before the role check: `can` knows kioskVote, which is
  // not an action here and would otherwise reach writeStatement with no SQL for it.
  if (!ACTION_TYPES.has(action.type)) return refuse("invalid");
  if (!can(admin.role, action.type)) return refuse("forbidden");
  const a = normalize(action);
  if (!a) return refuse("invalid");

  // Admin accounts belong to all-track super admins.
  if (a.type === "upsertAdmin" && admin.track !== null) return refuse("forbidden");

  const before = await readAdminState(db, admin, track, now);
  // A versioned action from an outdated view is stale, whatever it asks for:
  // the guarded write below would fail anyway.
  if (versioned(a) && before.version !== version) return refuse("stale", before);
  if (isLive(a)) {
    if (!allowed(before.phase, a.type)) return refuse("not_allowed", before);
    // Nothing to draw from. The statement's own guard (EXISTS pick) covers a
    // prompt switched off between this read and the write.
    if (a.type === "spinWheel" && !before.prompts.some((r) => r.active)) return refuse("invalid", before);
    // The prompt is optional: startPerformance needs nothing more.
    if (a.type === "reveal" && before.selfScore === null) return refuse("needs_self_score", before);
    if (a.type === "showWinner" && !before.leaders) return refuse("no_winner", before);
  }

  let hash: string | null = null;
  if (a.type === "upsertAdmin") {
    // You cannot deactivate yourself or step down from SUPER_ADMIN (only a
    // SUPER_ADMIN gets here). The last-SUPER_ADMIN guard is in the SQL.
    if (a.id === admin.id && (!a.active || a.role !== "SUPER_ADMIN" || a.track !== null)) return refuse("invalid", before);
    if (a.passcode != null) hash = await hashPasscode(a.passcode);
  }

  const { text, values } = writeStatement(a, admin, track, version, now, hash);
  let n: number;
  try {
    [{ n }] = await db.query<{ n: number }>(text, values);
  } catch (err) {
    // A rename onto a name that is already taken: invalid, not a 500.
    if (a.type === "upsertAdmin" && (err as { code?: unknown })?.code === "23505") return refuse("invalid");
    throw err;
  }
  const state = await readAdminState(db, admin, track, now);
  if (Number(n) > 0) return { ok: true, state };
  // Nothing written: a versioned action lost the race (stale) or, with the
  // version unchanged, its target vanished (invalid). Unversioned setup
  // actions only fail on an unknown id.
  return refuse(versioned(a) && state.version !== version ? "stale" : "invalid", state);
}
