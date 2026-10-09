/**
 * DGL tables, one statement per step, all idempotent. `ensureSchema` runs
 * them in order, so a table always follows the tables it references.
 *
 * The probe `ensureSchema` runs first (SCHEMA_PROBE) is built from the same
 * steps as the DDL, so it cannot drift from it: a step that `creates` a table
 * or index contributes `to_regclass(name) IS NOT NULL`, and a step that changes
 * one carries its own `probe`, a boolean SQL expression that reads the catalog
 * only (never a DGL table, which might not exist yet). Two kinds of step carry
 * no probe: the `dgl_show` row, inserted before dgl_votes, the votes index and
 * dgl_audit are created (so a database where all of them exist has had it, and
 * nothing deletes it); and the role update, the last step, which rides on the
 * same pass as the column changes before it. If a pass stops between those
 * changes and the update, the probe is true and the update is not retried:
 * normalizeRole (auth.ts) reads a leftover OPERATOR or VOLUNTEER as HOST.
 *
 * The steps the first release shipped come first, unchanged (pinned by
 * tests/dgl/fixtures/schema-v1.ts): a fresh database and one that already
 * has them take the same path, the original CREATEs and then the changes.
 */
type SchemaStep = { ddl: string; creates?: string; probe?: string };

/** True when `table` has a live column `column` (and, with `extra`, that more holds of it). Catalog only. */
const column = (table: string, name: string, extra = "") =>
  `EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.${table}') AND attname = '${name}'${extra} AND NOT attisdropped)`;

const STEPS: SchemaStep[] = [
  {
    creates: "dgl_admins",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    role text NOT NULL,
    passcode_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  },
  {
    creates: "dgl_contestants",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_contestants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    sort int NOT NULL,
    active boolean NOT NULL DEFAULT true
  )`,
  },
  {
    creates: "dgl_prompts",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    text text NOT NULL,
    active boolean NOT NULL DEFAULT true
  )`,
  },
  {
    creates: "dgl_performances",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_performances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contestant_id uuid NOT NULL REFERENCES dgl_contestants,
    prompt text,
    status text NOT NULL,
    ends_at timestamptz,
    voting_opened_at timestamptz,
    voting_closed_at timestamptz,
    self_score smallint CHECK (self_score BETWEEN 1 AND 10),
    revealed_at timestamptz,
    created_at timestamptz NOT NULL
  )`,
  },
  {
    creates: "dgl_show",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_show (
    id int PRIMARY KEY CHECK (id = 1),
    current_performance_id uuid REFERENCES dgl_performances,
    version int NOT NULL DEFAULT 0
  )`,
  },
  { ddl: `INSERT INTO dgl_show (id) VALUES (1) ON CONFLICT DO NOTHING` },
  {
    creates: "dgl_votes",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_votes (
    performance_id uuid NOT NULL REFERENCES dgl_performances ON DELETE CASCADE,
    voter_id text NOT NULL,
    score smallint NOT NULL CHECK (score BETWEEN 1 AND 10),
    ip_hash text NOT NULL,
    source text NOT NULL,
    flagged boolean NOT NULL,
    excluded boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (performance_id, voter_id)
  )`,
  },
  {
    creates: "dgl_votes_ip_idx",
    ddl: `CREATE INDEX IF NOT EXISTS dgl_votes_ip_idx ON dgl_votes (performance_id, ip_hash, created_at)`,
  },
  {
    creates: "dgl_audit",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_audit (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL,
    admin_id uuid,
    admin_name text NOT NULL,
    action text NOT NULL,
    performance_id uuid,
    detail jsonb NOT NULL DEFAULT '{}'
  )`,
  },
  // Acts by name: the host types who is on stage; contestants are no longer used.
  {
    ddl: `ALTER TABLE dgl_performances ADD COLUMN IF NOT EXISTS contestant_name text`,
    probe: column("dgl_performances", "contestant_name"),
  },
  // The server time of the current act's last spin of the prompt wheel.
  {
    ddl: `ALTER TABLE dgl_performances ADD COLUMN IF NOT EXISTS spun_at timestamptz`,
    probe: column("dgl_performances", "spun_at"),
  },
  // A new act has no contestant row. Dropping NOT NULL from a nullable column is a no-op.
  {
    ddl: `ALTER TABLE dgl_performances ALTER COLUMN contestant_id DROP NOT NULL`,
    probe: column("dgl_performances", "contestant_id", " AND NOT attnotnull"),
  },
  // Tracks: one show per room. dgl_show and the rows from before tracks are left in place, unused.
  {
    creates: "dgl_tracks",
    ddl: `CREATE TABLE IF NOT EXISTS dgl_tracks (
    track text PRIMARY KEY CHECK (track IN ('build', 'grow', 'think')),
    current_performance_id uuid REFERENCES dgl_performances,
    version int NOT NULL DEFAULT 0,
    winner_shown boolean NOT NULL DEFAULT false
  )`,
  },
  {
    ddl: `INSERT INTO dgl_tracks (track) VALUES ('build'), ('grow'), ('think') ON CONFLICT DO NOTHING`,
  },
  {
    ddl: `ALTER TABLE dgl_performances ADD COLUMN IF NOT EXISTS track text`,
    probe: column("dgl_performances", "track"),
  },
  {
    ddl: `ALTER TABLE dgl_admins ADD COLUMN IF NOT EXISTS track text`,
    probe: column("dgl_admins", "track"),
  },
  {
    creates: "dgl_performances_track_idx",
    ddl: `CREATE INDEX IF NOT EXISTS dgl_performances_track_idx ON dgl_performances (track, created_at)`,
  },
  // Two roles remain. A data step with no probe: it must stay the last step (see above).
  { ddl: `UPDATE dgl_admins SET role = 'HOST' WHERE role IN ('OPERATOR', 'VOLUNTEER')` },
];

export const SCHEMA: string[] = STEPS.map((s) => s.ddl);

/** Every table and index the schema creates. */
export const SCHEMA_OBJECTS: string[] = STEPS.flatMap((s) => (s.creates ? [s.creates] : []));

/** What one step contributes to the probe: nothing for the dgl_show row and the role update. */
const probeOf = (s: SchemaStep): string[] =>
  s.creates ? [`to_regclass('public.${s.creates}') IS NOT NULL`] : s.probe ? [s.probe] : [];

/**
 * One lock-free read: true when every table, index and column change is in
 * place. `to_regclass` and `pg_attribute` read the catalog only, unlike
 * `CREATE INDEX IF NOT EXISTS`, which takes a SHARE lock on dgl_votes even when
 * the index is there and so queues behind vote inserts, or `ALTER TABLE`, which
 * takes an ACCESS EXCLUSIVE lock on dgl_performances even when it changes
 * nothing.
 */
export const SCHEMA_PROBE = `SELECT (${STEPS.flatMap(probeOf).join(" AND ")}) AS ok`;
