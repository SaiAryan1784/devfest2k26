import { DGL } from "@/data/dgl";
import { ensureSchema, type Db } from "./db";
import { LIVE_ACTIONS, allowed, can, effectivePhase, nextStatus } from "./machine";
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

/** $1: whether to include admins and the audit log (SUPER_ADMIN). */
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
  END AS audit
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
  admin: { id: string; role: Role },
  now: number,
): Promise<AdminState> {
  await ensureSchema(db);
  const full = admin.role === "SUPER_ADMIN";
  const [r] = await db.query<AdminRow>(ADMIN_SQL, [full]);
  const state: AdminState = {
    ...toPublic(r, now),
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
    case "upsertAdmin":
      // Needs hashPasscode (Task 4); implemented with its guards in Task 11.
      return null;
    case "setFlaggedExcluded":
      return isUuid(a.performanceId) && isBool(a.excluded)
        ? { type: a.type, performanceId: a.performanceId, excluded: a.excluded }
        : null;
    case "resetShow":
      return a.confirm === "RESET" ? { type: a.type, confirm: "RESET" } : null;
    default:
      return { type: a.type };
  }
}

function detailOf(a: Action): Record<string, unknown> {
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
 * Neon's HTTP driver, which has no transactions. Each statement bumps
 * dgl_show.version (guarded by WHERE version = $v for versioned actions),
 * applies the change and inserts the audit row, all keyed off the same CTE,
 * and returns n = the number of rows the guard let through (0 or 1).
 */
function writeStatement(a: Action, admin: Admin, version: number, now: number) {
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
  const unchecked = (cond: string) =>
    `bump AS (UPDATE dgl_show SET version = version + 1 WHERE id = 1 AND ${cond} RETURNING id)`;
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
        ${unchecked("EXISTS (SELECT 1 FROM up)")},
        ${audit("up", "NULL::uuid", `${detail()} || jsonb_build_object('id', up.id)`)}
        SELECT count(*)::int AS n FROM up`;
      break;
    }
    case "setFlaggedExcluded":
      text = `WITH perf AS (SELECT id FROM dgl_performances WHERE id = ${q.add(a.performanceId, "uuid")}),
        chg AS (UPDATE dgl_votes v SET excluded = ${q.add(a.excluded, "boolean")}
          FROM perf WHERE v.performance_id = perf.id AND v.flagged RETURNING 1),
        ${unchecked("EXISTS (SELECT 1 FROM perf)")},
        ${audit("perf", "perf.id", `${detail()} || jsonb_build_object('votes', (SELECT count(*) FROM chg))`)}
        SELECT count(*)::int AS n FROM perf`;
      break;
    case "upsertAdmin":
      throw new Error("upsertAdmin is not implemented yet");
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

  const { text, values } = writeStatement(a, admin, version, now);
  const [{ n }] = await db.query<{ n: number }>(text, values);
  const state = await readAdminState(db, admin, now);
  if (Number(n) > 0) return { ok: true, state };
  // Nothing written: a versioned action lost the race (stale) or, with the
  // version unchanged, its target vanished (invalid). Unversioned setup
  // actions only fail on an unknown id.
  return refuse(versioned(a) && state.version !== version ? "stale" : "invalid", state);
}
