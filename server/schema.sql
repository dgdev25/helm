CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  local_path  TEXT,
  github_url  TEXT,
  github_full_name TEXT,
  topics      TEXT[] DEFAULT '{}',
  language    TEXT,
  stars       INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  last_commit_at  TIMESTAMPTZ,
  last_commit_msg TEXT,
  last_commit_author TEXT,
  open_issues INTEGER DEFAULT 0,
  is_private  BOOLEAN DEFAULT false,
  synopsis    TEXT,
  primer_state TEXT,
  primer_updated_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS primer_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_last_commit_at ON projects (last_commit_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_language ON projects (language);

CREATE TABLE IF NOT EXISTS github_sync_log (
  id         SERIAL PRIMARY KEY,
  synced_at  TIMESTAMPTZ DEFAULT now(),
  status     TEXT NOT NULL,
  message    TEXT,
  projects_updated INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('sync_interval_hours', '6'),
  ('last_sync', '')
ON CONFLICT DO NOTHING;
