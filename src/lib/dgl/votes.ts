import { DGL } from "@/data/dgl";
import type { Db } from "./db";

export type VoteResult =
  | { status: "recorded"; score: number }
  | { status: "duplicate"; score: number }
  | { status: "paused" }
  | { status: "closed" };

export type CastVoteInput = {
  performanceId: string;
  voterId: string;
  score: number;
  ipHash: string;
  source: "web" | "kiosk";
  now: number;
};

/**
 * One statement does the whole job (data-modifying CTEs), so a vote is atomic
 * and the unique (performance, voter) key settles duplicates. A flagged vote
 * still counts; flags only inform moderation.
 *
 * The kiosk variant adds one CTE that writes the audit row FROM `ins`, so the
 * row exists exactly when a vote was inserted and never otherwise (same
 * statement, same transaction). It takes two more parameters ($9 admin id,
 * $10 admin name); the plain statement has none, since Postgres rejects
 * parameters that are never used.
 */
function castSql(withAudit: boolean): string {
  return `
WITH cur AS (SELECT p.id FROM dgl_show s JOIN dgl_performances p ON p.id = s.current_performance_id
             WHERE p.id = $1 AND p.status = 'VOTING'),
burst AS (SELECT count(*) AS n FROM dgl_votes WHERE performance_id = $1 AND ip_hash = $4
          AND created_at > to_timestamp($6::float8 / 1000.0) - make_interval(secs => $7::float8)),
ins AS (INSERT INTO dgl_votes (performance_id, voter_id, score, ip_hash, source, flagged, created_at)
        SELECT cur.id, $2::text, $3::smallint, $4::text, $5::text, (SELECT n FROM burst) >= $8::int, to_timestamp($6::float8 / 1000.0) FROM cur
        ON CONFLICT (performance_id, voter_id) DO NOTHING RETURNING score)${
          withAudit
            ? `,
aud AS (INSERT INTO dgl_audit (at, admin_id, admin_name, action, performance_id, detail)
        SELECT to_timestamp($6::float8 / 1000.0), $9::uuid, $10::text, 'kioskVote', $1::uuid, '{}'::jsonb FROM ins)`
            : ""
        }
SELECT (SELECT score FROM ins) AS inserted,
       (SELECT score FROM dgl_votes WHERE performance_id = $1 AND voter_id = $2) AS existing,
       (SELECT status FROM dgl_performances WHERE id = $1) AS status,
       EXISTS (SELECT 1 FROM cur) AS open`;
}

const CAST = castSql(false);
const CAST_KIOSK = castSql(true);

type CastRow = {
  inserted: number | null;
  existing: number | null;
  status: string | null;
  open: boolean;
};

function assertScore(score: number) {
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error("score must be an integer from 1 to 10");
  }
}

const castParams = (v: CastVoteInput) => [
  v.performanceId,
  v.voterId,
  v.score,
  v.ipHash,
  v.source,
  v.now,
  DGL.limits.burstWindowS,
  DGL.limits.burstFlagAt,
];

/** The one mapping from the statement's row to a result, shared by both entry points. */
async function resultOf(db: Db, v: CastVoteInput, row: CastRow): Promise<VoteResult> {
  if (row.inserted != null) return { status: "recorded", score: Number(row.inserted) };
  if (row.existing != null) return { status: "duplicate", score: Number(row.existing) };
  if (row.status === "VOTING_PAUSED") return { status: "paused" };
  if (row.open) {
    // A concurrent insert won the conflict but our snapshot cannot see it.
    const [again] = await db.query<{ score: number }>(
      "SELECT score FROM dgl_votes WHERE performance_id = $1 AND voter_id = $2",
      [v.performanceId, v.voterId],
    );
    if (again) return { status: "duplicate", score: Number(again.score) };
  }
  return { status: "closed" };
}

export async function castVote(db: Db, v: CastVoteInput): Promise<VoteResult> {
  assertScore(v.score);
  const [row] = await db.query<CastRow>(CAST, castParams(v));
  return resultOf(db, v, row);
}

/**
 * A kiosk vote and its `kioskVote` audit row in ONE statement: the audit row
 * is written from the inserted vote, so a vote cannot exist without its audit
 * row and a duplicate, paused or closed attempt leaves none. The audit detail
 * is `{}`: it never carries the score.
 */
export async function castKioskVote(
  db: Db,
  v: CastVoteInput & { adminId: string; adminName: string },
): Promise<VoteResult> {
  assertScore(v.score);
  const [row] = await db.query<CastRow>(CAST_KIOSK, [...castParams(v), v.adminId, v.adminName]);
  return resultOf(db, v, row);
}

/** The voter's own vote on the CURRENT performance, or null. Never creates a vote. */
export async function myVote(
  db: Db,
  voterId: string,
): Promise<{ performanceId: string; score: number } | null> {
  const [row] = await db.query<{ performance_id: string; score: number }>(
    `SELECT v.performance_id, v.score FROM dgl_show s
     JOIN dgl_votes v ON v.performance_id = s.current_performance_id
     WHERE s.id = 1 AND v.voter_id = $1::text`,
    [voterId],
  );
  return row ? { performanceId: row.performance_id, score: Number(row.score) } : null;
}
