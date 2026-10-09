/**
 * The DGL schema exactly as it shipped before acts by name and the wheel
 * (`SCHEMA` from src/lib/dgl/schema.ts at commit 4c4bca6), frozen. Only
 * migration.test.ts uses it: it builds the OLD database from these
 * statements, inserts legacy rows, then runs today's ensureSchema over it.
 * Never edit this file: it is the database that is already deployed.
 */
export const SCHEMA_V1: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS dgl_admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    role text NOT NULL,
    passcode_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS dgl_contestants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    sort int NOT NULL,
    active boolean NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS dgl_prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    text text NOT NULL,
    active boolean NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS dgl_performances (
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
  `CREATE TABLE IF NOT EXISTS dgl_show (
    id int PRIMARY KEY CHECK (id = 1),
    current_performance_id uuid REFERENCES dgl_performances,
    version int NOT NULL DEFAULT 0
  )`,
  `INSERT INTO dgl_show (id) VALUES (1) ON CONFLICT DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS dgl_votes (
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
  `CREATE INDEX IF NOT EXISTS dgl_votes_ip_idx ON dgl_votes (performance_id, ip_hash, created_at)`,
  `CREATE TABLE IF NOT EXISTS dgl_audit (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL,
    admin_id uuid,
    admin_name text NOT NULL,
    action text NOT NULL,
    performance_id uuid,
    detail jsonb NOT NULL DEFAULT '{}'
  )`,
];
