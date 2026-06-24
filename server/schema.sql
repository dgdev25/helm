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

CREATE TABLE IF NOT EXISTS crate_library (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  display_name TEXT,
  version     TEXT,
  description TEXT,
  category    TEXT DEFAULT 'Uncategorized',
  source_path TEXT,
  crates_io_url TEXT,
  docs_url    TEXT,
  tags        TEXT[] DEFAULT '{}',
  downloads   INTEGER DEFAULT 0,
  starred     BOOLEAN DEFAULT false,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crate_library_category ON crate_library (category);
CREATE INDEX IF NOT EXISTS idx_crate_library_starred ON crate_library (starred);
INSERT INTO settings (key, value) VALUES ('app_name', 'Helm') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS project_crate_links (
  id           SERIAL PRIMARY KEY,
  project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  crate_id     INTEGER NOT NULL REFERENCES crate_library(id) ON DELETE CASCADE,
  score        REAL DEFAULT 0,
  reason       TEXT DEFAULT '',
  source       TEXT DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  pinned       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_slug, crate_id)
);

CREATE INDEX IF NOT EXISTS idx_pcl_project ON project_crate_links (project_slug);
CREATE INDEX IF NOT EXISTS idx_pcl_crate   ON project_crate_links (crate_id);
CREATE INDEX IF NOT EXISTS idx_pcl_score   ON project_crate_links (project_slug, score DESC);

CREATE TABLE IF NOT EXISTS repo_library (
  id          SERIAL PRIMARY KEY,
  full_name   TEXT NOT NULL UNIQUE,
  owner       TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  language    TEXT,
  topics      TEXT[] DEFAULT '{}',
  stars       INTEGER DEFAULT 0,
  html_url    TEXT NOT NULL,
  starred     BOOLEAN DEFAULT false,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repo_library_owner    ON repo_library (owner);
CREATE INDEX IF NOT EXISTS idx_repo_library_language ON repo_library (language);
CREATE INDEX IF NOT EXISTS idx_repo_library_stars    ON repo_library (stars DESC);

CREATE TABLE IF NOT EXISTS project_repo_links (
  id           SERIAL PRIMARY KEY,
  project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  repo_id      INTEGER NOT NULL REFERENCES repo_library(id) ON DELETE CASCADE,
  score        REAL DEFAULT 0,
  reason       TEXT DEFAULT '',
  source       TEXT DEFAULT 'ai' CHECK (source IN ('ai', 'manual', 'discover')),
  pinned       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_slug, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_prl_project ON project_repo_links (project_slug);
CREATE INDEX IF NOT EXISTS idx_prl_repo    ON project_repo_links (repo_id);
CREATE INDEX IF NOT EXISTS idx_prl_score   ON project_repo_links (project_slug, score DESC);
