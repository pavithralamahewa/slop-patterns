-- Held Sprint Graph — Postgres DDL (production)
-- Local/dev uses the file repository with the same logical model.

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  phase TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  differentiators JSONB NOT NULL DEFAULT '[]',
  target_user TEXT NOT NULL DEFAULT '',
  target_moment TEXT NOT NULL DEFAULT '',
  winner_sketch_id TEXT,
  prototype_brief TEXT,
  verdict TEXT,
  verdict_rationale TEXT,
  graph JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gate_events (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gate_events_sprint_idx ON gate_events (sprint_id, at);

CREATE TABLE IF NOT EXISTS evidence_claims (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  supports_question_ids JSONB NOT NULL DEFAULT '[]',
  polarity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_sprint_idx ON evidence_claims (sprint_id);
