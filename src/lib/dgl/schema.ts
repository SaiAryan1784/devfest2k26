/**
 * DGL tables, one statement per step, all idempotent. `ensureSchema` runs
 * them in order, so a table always follows the tables it references.
 *
 * `creates` names the table or index a step makes. The list of those names is
 * the probe `ensureSchema` runs first (SCHEMA_PROBE), so the probe is built
 * from the same steps as the DDL and cannot drift from it. The `dgl_show` row
 * has no name of its own: it is inserted before dgl_votes, the votes index and
 * dgl_audit are created, so a database where all of them exist has had it
 * inserted, and nothing deletes it.
 */
type SchemaStep = { ddl: string; creates?: string };

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
];

export const SCHEMA: string[] = STEPS.map((s) => s.ddl);

/** Every table and index the schema creates. */
export const SCHEMA_OBJECTS: string[] = STEPS.flatMap((s) => (s.creates ? [s.creates] : []));

/**
 * One lock-free read: true when every table and index exists. `to_regclass`
 * reads the catalog only, unlike `CREATE INDEX IF NOT EXISTS`, which takes a
 * SHARE lock on dgl_votes even when the index is there and so queues behind
 * vote inserts.
 */
export const SCHEMA_PROBE = `SELECT (${SCHEMA_OBJECTS.map((n) => `to_regclass('public.${n}') IS NOT NULL`).join(" AND ")}) AS ok`;
