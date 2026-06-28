# GitHub Repo Discovery & Project Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub repo discovery system that lets users import repos by URL, and lets AI discover relevant repos automatically from a project's context — then links them to projects with relevance scores, mirroring the existing crate-project linking system.

**Architecture:** A `repo_library` table stores imported GitHub repos; a `project_repo_links` join table stores scored links per project. Two discovery modes: (1) AI-driven — Claude generates search queries from the project's primer/description, runs them against GitHub Search API, scores results; (2) library-suggest — scores all repos already in the library. `octokit` from `server/github.js` handles all GitHub API calls (already authenticated via `GITHUB_TOKEN`). The scorer (`server/lib/repoScorer.js`) follows the same swappable strategy pattern as `claudeScorer.js`.

**Tech Stack:** Node.js/Fastify 5, PostgreSQL (`postgres` tagged-template SQL), React 19, `@octokit/rest` (already installed), Claude CLI subprocess (via `withAISlot`)

## Global Constraints

- ESM only (`import`/`export`) — no `require()`
- No new npm dependencies — use `@octokit/rest` (already installed), existing `execFile`/`promisify` pattern for Claude CLI
- All SQL via the `sql` tagged template from `../db.js` — no raw strings
- Integer IDs validated with `parseInt` + `Number.isInteger` before use in SQL (see crateLinks.js pattern)
- All AI calls wrapped in `withAISlot()` from `../lib/aiSlot.js`
- Pinned rows must never be overwritten by AI upserts — use `WHERE project_repo_links.pinned = false` in ON CONFLICT
- Server port: backend `47821`, frontend `47621`
- Tests use `node:test` + `node:assert/strict` hitting the real server on port 47621
- `octokit` is exported from `server/github.js` — import from there, do not create a new instance

---

## File Map

**New files:**
- `server/schema.sql` — add `repo_library` and `project_repo_links` tables (append, IF NOT EXISTS)
- `server/routes/repos.js` — repo library CRUD + `POST /api/repos/import-url`
- `server/lib/repoScorer.js` — `scoreProjectRepos(project, repos)` strategy (same pattern as `claudeScorer.js`)
- `server/lib/repoDiscoverer.js` — `generateRepoQueries(project)` → string[] of GitHub search queries
- `server/routes/repoLinks.js` — 6 endpoints for discover/suggest/list/manual/patch/delete
- `server/routes/repoLinks.test.js` — smoke tests
- `src/pages/Repos.jsx` — Repo Library page (import URL bar + table)
- `src/components/RelatedRepos.jsx` — project Repos tab component

**Modified files:**
- `server/index.js` — register `reposRoutes` and `repoLinksRoutes`
- `src/App.jsx` — add `/repos` and `/projects/:slug/repos` routes
- `src/components/Sidebar.jsx` — add "Repo Library" nav link
- `src/pages/ProjectDetail.jsx` — add "Repos" third tab

---

## Task 1: Schema — `repo_library` and `project_repo_links` tables

**Files:**
- Modify: `server/schema.sql` (append at end)

**Interfaces:**
- Produces: `repo_library(id, full_name, owner, name, description, language, topics, stars, html_url, created_at, updated_at)` and `project_repo_links(id, project_slug, repo_id, score, reason, source, pinned, created_at)`

- [ ] **Step 1: Append the two table definitions to schema.sql**

Open `server/schema.sql` and append at the end:

```sql
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
```

- [ ] **Step 2: Verify schema applies cleanly**

The server applies schema.sql on every boot (idempotent). Restart the server to apply:

```bash
bash /mnt/datadisk/dev/helm/start.sh
```

Then confirm tables exist:

```bash
psql $DATABASE_URL -c "\dt repo_library" -c "\dt project_repo_links"
```

Expected: both tables listed.

- [ ] **Step 3: Commit**

```bash
git add server/schema.sql
git commit -m "feat: add repo_library and project_repo_links schema"
```

---

## Task 2: Repo Library Routes — `server/routes/repos.js`

**Files:**
- Create: `server/routes/repos.js`

**Interfaces:**
- Consumes: `octokit` from `../../github.js`, `sql` from `../db.js`
- Produces:
  - `GET /api/repos` → `{ data: RepoRow[] }` where `RepoRow` includes `project_count: number`
  - `POST /api/repos/import-url` body `{ url: string }` → `{ data: { imported: number, total: number } }`
  - `PATCH /api/repos/:id` body `{ starred?: boolean, notes?: string }` → `{ data: RepoRow }`
  - `DELETE /api/repos/:id` → `{ data: { deleted: number } }`

- [ ] **Step 1: Create `server/routes/repos.js`**

```js
// server/routes/repos.js
import sql from '../db.js'
import { octokit } from '../github.js'

async function upsertRepo(repo) {
  const [row] = await sql`
    INSERT INTO repo_library (full_name, owner, name, description, language, topics, stars, html_url, updated_at)
    VALUES (
      ${repo.full_name},
      ${repo.full_name.split('/')[0]},
      ${repo.name},
      ${repo.description || ''},
      ${repo.language || null},
      ${repo.topics || []},
      ${repo.stargazers_count ?? repo.stars ?? 0},
      ${repo.html_url},
      now()
    )
    ON CONFLICT (full_name) DO UPDATE SET
      description = EXCLUDED.description,
      language    = EXCLUDED.language,
      topics      = EXCLUDED.topics,
      stars       = EXCLUDED.stars,
      updated_at  = now()
    RETURNING *
  `
  return row
}

async function fetchUserOrOrgRepos(owner) {
  // Try user first, fall back to org
  const all = []
  try {
    for await (const page of octokit.paginate.iterator(octokit.rest.repos.listForUser, { username: owner, per_page: 100, type: 'owner' })) {
      all.push(...page.data)
    }
  } catch {
    for await (const page of octokit.paginate.iterator(octokit.rest.repos.listForOrg, { org: owner, per_page: 100, type: 'public' })) {
      all.push(...page.data)
    }
  }
  return all
}

export default async function reposRoutes(app) {
  // List all repos in library
  app.get('/api/repos', async (req) => {
    const { search, language, starred } = req.query
    const conditions = []
    if (search) conditions.push(sql`(r.name ILIKE ${'%' + search + '%'} OR r.description ILIKE ${'%' + search + '%'} OR r.full_name ILIKE ${'%' + search + '%'})`)
    if (language) conditions.push(sql`r.language = ${language}`)
    if (starred === 'true') conditions.push(sql`r.starred = true`)

    const rows = conditions.length
      ? await sql`
          SELECT r.*, COUNT(l.id)::int AS project_count
          FROM repo_library r
          LEFT JOIN project_repo_links l ON l.repo_id = r.id
          WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}
          GROUP BY r.id
          ORDER BY r.starred DESC, r.stars DESC`
      : await sql`
          SELECT r.*, COUNT(l.id)::int AS project_count
          FROM repo_library r
          LEFT JOIN project_repo_links l ON l.repo_id = r.id
          GROUP BY r.id
          ORDER BY r.starred DESC, r.stars DESC`
    return { data: rows }
  })

  // Import from github.com/:user, github.com/:org, or github.com/topics/:topic
  app.post('/api/repos/import-url', async (req, reply) => {
    const { url } = req.body || {}
    if (!url) return reply.code(422).send({ error: 'url required' })

    let repos = []
    const userMatch  = url.match(/github\.com\/([^/?\s]+)\/?$/)
    const topicMatch = url.match(/github\.com\/topics\/([^/?#\s]+)/)

    if (topicMatch) {
      const { data } = await octokit.rest.search.repos({
        q: `topic:${topicMatch[1]}`,
        sort: 'stars',
        per_page: 100,
      })
      repos = data.items
    } else if (userMatch) {
      repos = await fetchUserOrOrgRepos(userMatch[1])
    } else {
      return reply.code(422).send({ error: 'Unsupported URL. Use github.com/:user, github.com/:org, or github.com/topics/:topic' })
    }

    let imported = 0
    for (const r of repos) {
      await upsertRepo(r)
      imported++
    }
    return { data: { imported, total: repos.length } }
  })

  // Star / add notes
  app.patch('/api/repos/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid id' })
    const { starred, notes } = req.body || {}
    const updates = {}
    if (starred !== undefined) updates.starred = starred
    if (notes   !== undefined) updates.notes   = notes
    if (!Object.keys(updates).length) return reply.code(422).send({ error: 'Nothing to update' })
    const [row] = await sql`UPDATE repo_library SET ${sql(updates)}, updated_at = now() WHERE id = ${id} RETURNING *`
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return { data: row }
  })

  // Remove from library
  app.delete('/api/repos/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid id' })
    const [row] = await sql`DELETE FROM repo_library WHERE id = ${id} RETURNING id`
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return { data: { deleted: row.id } }
  })
}

// Exported for use in repoLinks.js discover endpoint
export { upsertRepo }
```

- [ ] **Step 2: Register in `server/index.js`**

Add after the existing `crateLinksRoutes` import and register:

```js
// At top with other imports:
import reposRoutes from './routes/repos.js'
import repoLinksRoutes from './routes/repoLinks.js'   // created in Task 4

// After app.register(crateLinksRoutes):
await app.register(reposRoutes)
await app.register(repoLinksRoutes)   // add after Task 4
```

Only add the `reposRoutes` line now. Add `repoLinksRoutes` after Task 4.

- [ ] **Step 3: Smoke test the import endpoint**

Restart the server (`bash /mnt/datadisk/dev/helm/start.sh`), then:

```bash
curl -s -X POST http://localhost:47821/api/repos/import-url \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://github.com/ruvnet"}' | jq '.data'
```

Expected: `{ "imported": <N>, "total": <N> }` where N > 0.

```bash
curl -s http://localhost:47821/api/repos | jq '.data | length'
```

Expected: same N.

- [ ] **Step 4: Commit**

```bash
git add server/routes/repos.js server/index.js
git commit -m "feat: repo library routes + ruvnet import via URL"
```

---

## Task 3: Repo Scorer and Discoverer

**Files:**
- Create: `server/lib/repoScorer.js`
- Create: `server/lib/repoDiscoverer.js`

**Interfaces:**
- Produces:
  - `scoreProjectRepos(project, repos)` → `Promise<Array<{repo_id: number, score: number, reason: string}>>`
    - `repos` param shape: `{id, full_name, language, description, topics, stars}`
    - Returns `[]` on any error, never throws
    - Returns max 20 items, score >= 0.3, sorted descending
  - `generateRepoQueries(project)` → `Promise<string[]>`
    - Returns 3–5 GitHub search query strings (e.g. `"MCP protocol rust"`)
    - Returns `[]` on error, never throws

- [ ] **Step 1: Create `server/lib/repoScorer.js`**

```js
// server/lib/repoScorer.js
// ponytail: strategy pattern — swap this for ruvectorRepoScorer.js when embeddings are ready
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export async function scoreProjectRepos(project, repos) {
  const catalogue = repos.map(r =>
    `${r.id}|${r.full_name}|${r.language || 'unknown'}|${(r.description || '').slice(0, 100)}`
  ).join('\n')

  const projectContext = [
    `Name: <project-name>${(project.name || '').replace(/[<>]/g, '')}</project-name>`,
    `Language: ${project.language || 'unknown'}`,
    `Topics: ${(project.topics || []).join(', ') || 'none'}`,
    `Description: <project-desc>${(project.description || '').replace(/[<>]/g, '')}</project-desc>`,
    project.primer_state
      ? `\nPrimer (truncated):\n${project.primer_state.slice(0, 3000)}`
      : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are a software project advisor. Given a project context and a list of GitHub repositories, identify which repos are most relevant and useful to this project.

PROJECT:
${projectContext}

REPO CATALOGUE (format: id|full_name|language|description):
${catalogue}

Return ONLY a JSON array of up to 20 objects, sorted by relevance descending:
[{"repo_id": <number>, "score": <0.0-1.0>, "reason": "<one sentence why this repo is relevant to this specific project>"}]

Rules:
- Only include repos with score >= 0.3
- reason must be specific to this project, not generic
- Prefer repos in the same language as the project or that provide useful tooling
- Return raw JSON only, no markdown, no explanation`

  try {
    const { stdout } = await exec('claude', ['-p', prompt], { timeout: 60000 })
    const json = stdout.replace(/```json|```/g, '').trim()
    const results = JSON.parse(json)
    if (!Array.isArray(results)) return []
    return results
      .filter(r => r.repo_id && typeof r.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Create `server/lib/repoDiscoverer.js`**

```js
// server/lib/repoDiscoverer.js
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export async function generateRepoQueries(project) {
  const projectContext = [
    `Name: <project-name>${(project.name || '').replace(/[<>]/g, '')}</project-name>`,
    `Language: ${project.language || 'unknown'}`,
    `Topics: ${(project.topics || []).join(', ') || 'none'}`,
    `Description: <project-desc>${(project.description || '').replace(/[<>]/g, '')}</project-desc>`,
    project.primer_state
      ? `Primer (truncated):\n${project.primer_state.slice(0, 2000)}`
      : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are a software discovery assistant. Given a project, generate GitHub repository search queries that will surface the most relevant open-source repositories.

PROJECT:
${projectContext}

Generate 3 to 5 concise GitHub search queries that would surface useful libraries, tools, frameworks, or reference implementations for this project.

Rules:
- Each query should be 2-5 words, suitable for GitHub's search bar
- Vary the angle: cover core stack, tooling, protocols, and domain
- Prefer queries that match the project's primary language (e.g. append "rust" or "typescript" where useful)
- Return ONLY a JSON array of strings, no explanation:
["query one", "query two", "query three"]`

  try {
    const { stdout } = await exec('claude', ['-p', prompt], { timeout: 30000 })
    const json = stdout.replace(/```json|```/g, '').trim()
    const queries = JSON.parse(json)
    if (!Array.isArray(queries)) return []
    return queries.filter(q => typeof q === 'string').slice(0, 5)
  } catch {
    return []
  }
}
```

- [ ] **Step 3: Quick manual test of the scorer**

```bash
node --input-type=module <<'EOF'
import { scoreProjectRepos } from './server/lib/repoScorer.js'
const project = { name: 'test', description: 'A Rust CLI tool', language: 'Rust', topics: ['cli'], primer_state: '' }
const repos = [
  { id: 1, full_name: 'clap-rs/clap', language: 'Rust', description: 'A full-featured CLI argument parser', topics: [], stars: 10000 },
  { id: 2, full_name: 'tokio-rs/tokio', language: 'Rust', description: 'Async runtime for Rust', topics: [], stars: 20000 },
]
const result = await scoreProjectRepos(project, repos)
console.log(JSON.stringify(result, null, 2))
EOF
```

Expected: JSON array with `repo_id`, `score`, `reason` for relevant repos.

- [ ] **Step 4: Commit**

```bash
git add server/lib/repoScorer.js server/lib/repoDiscoverer.js
git commit -m "feat: repo scorer and AI query discoverer"
```

---

## Task 4: Repo Links Routes — `server/routes/repoLinks.js`

**Files:**
- Create: `server/routes/repoLinks.js`

**Interfaces:**
- Consumes:
  - `withAISlot` from `../lib/aiSlot.js`
  - `scoreProjectRepos` from `../lib/repoScorer.js`
  - `generateRepoQueries` from `../lib/repoDiscoverer.js`
  - `upsertRepo` from `./repos.js`
  - `octokit` from `../github.js`
  - `sql` from `../db.js`
- Produces:
  - `POST /api/projects/:slug/discover-repos` → `{ data: { discovered: number, saved: number, results: LinkRow[] } }`
  - `POST /api/projects/:slug/suggest-repos` → `{ data: { saved: number, results: LinkRow[] } }`
  - `GET /api/projects/:slug/repos` → `{ data: LinkRow[] }`
  - `POST /api/projects/:slug/repos` body `{ repo_id: number }` → `{ data: LinkRow }`
  - `PATCH /api/projects/:slug/repos/:linkId` body `{ pinned?: boolean, reason?: string }` → `{ data: LinkRow }`
  - `DELETE /api/projects/:slug/repos/:linkId` → `{ data: { deleted: number } }`
  - `LinkRow`: all columns from `project_repo_links` joined with `repo_library` (full_name, name, description, language, topics, stars, html_url)

- [ ] **Step 1: Create `server/routes/repoLinks.js`**

```js
// server/routes/repoLinks.js
import sql from '../db.js'
import { octokit } from '../github.js'
import { withAISlot } from '../lib/aiSlot.js'
import { scoreProjectRepos } from '../lib/repoScorer.js'
import { generateRepoQueries } from '../lib/repoDiscoverer.js'
import { upsertRepo } from './repos.js'

async function getLinksForProject(slug) {
  return sql`
    SELECT l.*, r.full_name, r.name, r.description, r.language, r.topics, r.stars, r.html_url
    FROM project_repo_links l
    JOIN repo_library r ON r.id = l.repo_id
    WHERE l.project_slug = ${slug}
    ORDER BY l.pinned DESC, l.score DESC
  `
}

export default async function repoLinksRoutes(app) {

  // AI Discovery: generate queries → search GitHub → upsert repos → score → save links
  app.post('/api/projects/:slug/discover-repos', async (req, reply) => {
    const { slug } = req.params
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${slug}`
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const results = await withAISlot(async () => {
      // Step 1: generate search queries
      const queries = await generateRepoQueries(project)
      if (!queries.length) return []

      // Step 2: search GitHub for each query, deduplicate by full_name
      const seen = new Set()
      const discovered = []
      for (const q of queries) {
        try {
          const { data } = await octokit.rest.search.repos({ q, sort: 'stars', per_page: 30 })
          for (const repo of data.items) {
            if (!seen.has(repo.full_name)) {
              seen.add(repo.full_name)
              discovered.push(repo)
            }
          }
        } catch (err) {
          console.warn(`[discover] search failed for "${q}": ${err.message}`)
        }
      }
      if (!discovered.length) return []

      // Step 3: upsert all discovered repos into repo_library
      const saved = []
      for (const r of discovered) {
        const row = await upsertRepo(r)
        saved.push(row)
      }

      // Step 4: score all against the project
      return await scoreProjectRepos(project, saved)
    })

    if (!results.length) return reply.code(422).send({ error: 'Discovery returned no results — check GITHUB_TOKEN and try again' })

    // Step 5: upsert scored links (never overwrite pinned)
    for (const r of results) {
      await sql`
        INSERT INTO project_repo_links (project_slug, repo_id, score, reason, source)
        VALUES (${slug}, ${r.repo_id}, ${r.score}, ${r.reason}, 'discover')
        ON CONFLICT (project_slug, repo_id) DO UPDATE SET
          score  = EXCLUDED.score,
          reason = EXCLUDED.reason,
          source = 'discover'
        WHERE project_repo_links.pinned = false
      `
    }

    const links = await getLinksForProject(slug)
    return { data: { discovered: results.length, saved: results.length, results: links } }
  })

  // AI Suggest: score all repos already in the library against this project
  app.post('/api/projects/:slug/suggest-repos', async (req, reply) => {
    const { slug } = req.params
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${slug}`
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const repos = await sql`SELECT id, full_name, name, description, language, topics, stars FROM repo_library ORDER BY stars DESC`
    if (!repos.length) return reply.code(422).send({ error: 'No repos in library — import some first or use Discover' })

    const results = await withAISlot(() => scoreProjectRepos(project, repos))
    if (!results.length) return reply.code(422).send({ error: 'Scorer returned no results' })

    for (const r of results) {
      await sql`
        INSERT INTO project_repo_links (project_slug, repo_id, score, reason, source)
        VALUES (${slug}, ${r.repo_id}, ${r.score}, ${r.reason}, 'ai')
        ON CONFLICT (project_slug, repo_id) DO UPDATE SET
          score  = EXCLUDED.score,
          reason = EXCLUDED.reason,
          source = 'ai'
        WHERE project_repo_links.pinned = false
      `
    }

    const links = await getLinksForProject(slug)
    return { data: { saved: results.length, results: links } }
  })

  // List links for a project
  app.get('/api/projects/:slug/repos', async (req) => {
    return { data: await getLinksForProject(req.params.slug) }
  })

  // Manual link
  app.post('/api/projects/:slug/repos', async (req, reply) => {
    const { slug } = req.params
    const repoId = parseInt(req.body?.repo_id, 10)
    if (!Number.isInteger(repoId)) return reply.code(422).send({ error: 'repo_id must be an integer' })
    const [link] = await sql`
      INSERT INTO project_repo_links (project_slug, repo_id, score, source, pinned)
      VALUES (${slug}, ${repoId}, 1.0, 'manual', true)
      ON CONFLICT (project_slug, repo_id) DO UPDATE SET pinned = true, source = 'manual'
      RETURNING *
    `
    return { data: link }
  })

  // Update (pin/unpin, edit reason)
  app.patch('/api/projects/:slug/repos/:linkId', async (req, reply) => {
    const id = parseInt(req.params.linkId, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid link id' })
    const { pinned, reason } = req.body || {}
    const updates = {}
    if (pinned  !== undefined) updates.pinned  = pinned
    if (reason  !== undefined) updates.reason  = reason
    if (!Object.keys(updates).length) return reply.code(422).send({ error: 'Nothing to update' })
    const [link] = await sql`UPDATE project_repo_links SET ${sql(updates)} WHERE id = ${id} RETURNING *`
    if (!link) return reply.code(404).send({ error: 'Link not found' })
    return { data: link }
  })

  // Remove link
  app.delete('/api/projects/:slug/repos/:linkId', async (req, reply) => {
    const id = parseInt(req.params.linkId, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid link id' })
    const [row] = await sql`DELETE FROM project_repo_links WHERE id = ${id} RETURNING id`
    if (!row) return reply.code(404).send({ error: 'Link not found' })
    return { data: { deleted: row.id } }
  })
}
```

- [ ] **Step 2: Register `repoLinksRoutes` in `server/index.js`**

Add the second import line added in Task 2 Step 2 and its register call:

```js
// top with other imports (already added reposRoutes in Task 2):
import repoLinksRoutes from './routes/repoLinks.js'

// after app.register(reposRoutes):
await app.register(repoLinksRoutes)
```

- [ ] **Step 3: Restart and smoke test**

```bash
bash /mnt/datadisk/dev/helm/start.sh
```

```bash
# List repos (should have ruvnet repos from Task 2)
curl -s http://localhost:47821/api/repos | jq '.data | length'

# List links for a project (empty)
curl -s http://localhost:47821/api/projects/skillscdn/repos | jq '.data'
```

Expected: repos count > 0, links array empty.

- [ ] **Step 4: Commit**

```bash
git add server/routes/repoLinks.js server/index.js
git commit -m "feat: repo links routes (discover, suggest, list, manual, patch, delete)"
```

---

## Task 5: Smoke Tests — `server/routes/repoLinks.test.js`

**Files:**
- Create: `server/routes/repoLinks.test.js`

**Interfaces:**
- Consumes: real server on port 47621 (Vite proxy → 47821), real DB

- [ ] **Step 1: Create the test file**

```js
// server/routes/repoLinks.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import sql from '../db.js'

const BASE = 'http://localhost:47621'
const slug = '_test_project_repo_links'

before(async () => {
  await sql`INSERT INTO projects (name, slug, language) VALUES ('Test', ${slug}, 'Rust') ON CONFLICT DO NOTHING`
  await sql`
    INSERT INTO repo_library (full_name, owner, name, description, html_url)
    VALUES ('_test_owner/_test_repo', '_test_owner', '_test_repo', 'A test repo', 'https://github.com/_test_owner/_test_repo')
    ON CONFLICT DO NOTHING
  `
})

after(async () => {
  await sql`DELETE FROM project_repo_links WHERE project_slug = ${slug}`
  await sql`DELETE FROM projects WHERE slug = ${slug}`
  await sql`DELETE FROM repo_library WHERE full_name = '_test_owner/_test_repo'`
})

describe('GET /api/projects/:slug/repos', () => {
  it('returns empty array for project with no links', async () => {
    const res = await fetch(`${BASE}/api/projects/${slug}/repos`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(data))
    assert.equal(data.length, 0)
  })
})

describe('POST /api/projects/:slug/repos (manual)', () => {
  it('creates a manual link', async () => {
    const [repo] = await sql`SELECT id FROM repo_library WHERE full_name = '_test_owner/_test_repo'`
    const res = await fetch(`${BASE}/api/projects/${slug}/repos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_id: repo.id }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.source, 'manual')
    assert.equal(data.pinned, true)
  })
})

describe('PATCH /api/projects/:slug/repos/:linkId', () => {
  it('can unpin a link', async () => {
    const [link] = await sql`SELECT id FROM project_repo_links WHERE project_slug = ${slug}`
    const res = await fetch(`${BASE}/api/projects/${slug}/repos/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: false }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.pinned, false)
  })
})

describe('DELETE /api/projects/:slug/repos/:linkId', () => {
  it('removes the link', async () => {
    const [link] = await sql`SELECT id FROM project_repo_links WHERE project_slug = ${slug}`
    const res = await fetch(`${BASE}/api/projects/${slug}/repos/${link.id}`, { method: 'DELETE' })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(data.deleted)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd /mnt/datadisk/dev/helm
node --test server/routes/repoLinks.test.js
```

Expected output:
```
✔ GET /api/projects/:slug/repos > returns empty array for project with no links
✔ POST /api/projects/:slug/repos (manual) > creates a manual link
✔ PATCH /api/projects/:slug/repos/:linkId > can unpin a link
✔ DELETE /api/projects/:slug/repos/:linkId > removes the link
```

All 4 tests must pass before committing.

- [ ] **Step 3: Commit**

```bash
git add server/routes/repoLinks.test.js
git commit -m "test: repo links smoke tests"
```

---

## Task 6: Repo Library Page — `src/pages/Repos.jsx`

**Files:**
- Create: `src/pages/Repos.jsx`

**Interfaces:**
- Consumes: `GET /api/repos`, `POST /api/repos/import-url`, `PATCH /api/repos/:id`, `DELETE /api/repos/:id`
- Produces: React component `export default function Repos()`

- [ ] **Step 1: Create `src/pages/Repos.jsx`**

Model after `src/pages/Crates.jsx`. Read that file first to understand the existing patterns, then create this:

```jsx
// src/pages/Repos.jsx
import { useState, useEffect, useCallback } from 'react'

const LANG_COLOR = {
  'Rust': '#f97316', 'TypeScript': '#3b82f6', 'JavaScript': '#eab308',
  'Python': '#a3e635', 'Go': '#06b6d4', 'C': '#6b7280', 'C++': '#8b5cf6',
  'Zig': '#f59e0b', 'Ruby': '#ef4444', 'Java': '#f97316', 'Swift': '#f97316',
}

function fmt(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function Repos() {
  const [repos, setRepos]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [search, setSearch]       = useState('')
  const [langFilter, setLangFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search)     params.set('search', search)
    if (langFilter) params.set('language', langFilter)
    const { data } = await fetch(`/api/repos?${params}`).then(r => r.json())
    setRepos(data || [])
    setLoading(false)
  }, [search, langFilter])

  useEffect(() => { load() }, [load])

  const importFromUrl = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/repos/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      }).then(r => r.json())
      setImportResult(res.error ? { error: res.error } : { ok: `Imported ${res.data.imported} repos` })
      if (!res.error) { setImportUrl(''); load() }
    } catch (e) {
      setImportResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  const toggleStar = async (repo) => {
    await fetch(`/api/repos/${repo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: !repo.starred }),
    })
    setRepos(rs => rs.map(r => r.id === repo.id ? { ...r, starred: !r.starred } : r))
  }

  const languages = [...new Set(repos.map(r => r.language).filter(Boolean))].sort()

  return (
    <div style={{ padding: '0 0 60px' }}>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--surface-border)', padding: '12px 28px' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Repo Library</span>
      </div>

      <div style={{ padding: '24px 28px' }}>
        {/* Import bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && importFromUrl()}
            placeholder="github.com/ruvnet  ·  github.com/topics/mcp  ·  github.com/tokio-rs"
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'monospace' }}
          />
          <button
            onClick={importFromUrl}
            disabled={importing || !importUrl.trim()}
            style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.82rem', cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1 }}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
        {importResult && (
          <div style={{ fontSize: '0.75rem', marginBottom: 12, color: importResult.error ? 'var(--danger)' : 'var(--primary)' }}>
            {importResult.error || importResult.ok}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search repos…"
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 6, color: 'var(--text)' }}
          />
          <select
            value={langFilter}
            onChange={e => setLangFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 6, color: 'var(--text)' }}
          >
            <option value="">All languages</option>
            {languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {repos.length} repos
          </span>
        </div>

        {/* Table */}
        {loading
          ? <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <colgroup>
                <col style={{ width: 260 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 70 }} />
                <col />
                <col style={{ width: 48 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                  {['Repo', 'Language', 'Stars', 'Description', ''].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repos.map(r => {
                  const lc = LANG_COLOR[r.language] || 'var(--text-muted)'
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                        <a href={r.html_url} target="_blank" rel="noreferrer"
                          style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.82rem' }}>
                          {r.full_name}
                        </a>
                        {r.project_count > 0 && (
                          <span style={{ marginLeft: 6, fontSize: '0.6rem', padding: '1px 5px', borderRadius: 9999, background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                            {r.project_count} project{r.project_count > 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                        {r.language && (
                          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 9999, background: `${lc}18`, border: `1px solid ${lc}`, color: lc }}>
                            {r.language}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        ★ {fmt(r.stars)}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {r.description}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                        <button
                          onClick={() => toggleStar(r)}
                          style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', color: r.starred ? '#fbbf24' : 'var(--text-dim)' }}
                        >
                          {r.starred ? '★' : '☆'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `/repos` route in `src/App.jsx`**

```js
// Add import at top:
import Repos from './pages/Repos.jsx'

// Add route inside <Routes>:
<Route path="/repos" element={<Layout><Repos /></Layout>} />
```

- [ ] **Step 3: Add "Repo Library" nav link in `src/components/Sidebar.jsx`**

Find the TOOLS nav items array (around line 14) and add a repo entry:

```js
{ label: 'Repo Library', to: '/repos', icon: '⎇' },
```

Add it after the existing `{ label: 'Crate Library', to: '/crates', icon: '⬡' }` line.

- [ ] **Step 4: Restart server, navigate to http://localhost:47621/repos, verify:**
  - Repo Library appears in sidebar
  - Import bar is visible
  - If ruvnet repos were imported in Task 2, they appear in the table
  - Language filter populates correctly
  - Star toggle works

- [ ] **Step 5: Commit**

```bash
git add src/pages/Repos.jsx src/App.jsx src/components/Sidebar.jsx
git commit -m "feat: repo library page with import bar and language filter"
```

---

## Task 7: RelatedRepos Component and "Repos" Project Tab

**Files:**
- Create: `src/components/RelatedRepos.jsx`
- Modify: `src/pages/ProjectDetail.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/projects/:slug/repos`, `GET /api/repos?search=<q>`, `POST /api/projects/:slug/discover-repos`, `POST /api/projects/:slug/suggest-repos`
- `RelatedRepos` props: `{ slug: string }`

- [ ] **Step 1: Create `src/components/RelatedRepos.jsx`**

Model closely after `src/components/RelatedCrates.jsx`. The key differences:
- Two action buttons: "Discover" (AI generates queries + searches GitHub) and "Suggest from Library"
- Table columns: Repo | Language | Stars | Relevance | Reason | Actions
- `ScoreBar` is the same component (copy it — the file is self-contained)
- Manual search hits `GET /api/repos?search=<q>` and links by `repo_id`

```jsx
// src/components/RelatedRepos.jsx
import { useState, useEffect, useCallback } from 'react'

const LANG_COLOR = {
  'Rust': '#f97316', 'TypeScript': '#3b82f6', 'JavaScript': '#eab308',
  'Python': '#a3e635', 'Go': '#06b6d4', 'C': '#6b7280', 'C++': '#8b5cf6',
  'Zig': '#f59e0b', 'Ruby': '#ef4444', 'Java': '#f97316',
}

const TH = { padding: '6px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }
const TD = { padding: '8px 10px', borderBottom: '1px solid var(--surface-border)', verticalAlign: 'middle' }

function fmt(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }

function ScoreBar({ score }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.8 ? 'var(--primary)' : score >= 0.5 ? '#fbbf24' : 'var(--text-dim)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color, minWidth: 30 }}>{pct}%</span>
    </div>
  )
}

function RepoRow({ link, onPin, onRemove }) {
  const lc = LANG_COLOR[link.language] || 'var(--text-muted)'
  return (
    <tr>
      <td style={TD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href={link.html_url} target="_blank" rel="noreferrer"
            style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.82rem' }}>
            {link.full_name}
          </a>
          {link.source === 'manual' && (
            <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 9999, padding: '1px 6px' }}>manual</span>
          )}
        </div>
      </td>
      <td style={TD}>
        {link.language && (
          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 9999, background: `${lc}18`, border: `1px solid ${lc}`, color: lc }}>{link.language}</span>
        )}
      </td>
      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        ★ {fmt(link.stars || 0)}
      </td>
      <td style={TD}>
        {link.score > 0 && link.source !== 'manual'
          ? <ScoreBar score={link.score} />
          : <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>—</span>}
      </td>
      <td style={{ ...TD, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <span title={link.reason} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {link.reason || '—'}
        </span>
      </td>
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onPin(link)} title={link.pinned ? 'Unpin' : 'Pin'}
            style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: link.pinned ? '#fbbf24' : 'var(--text-dim)', cursor: 'pointer' }}>
            {link.pinned ? '★' : '☆'}
          </button>
          <button onClick={() => onRemove(link)} title="Remove"
            style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: 'var(--text-dim)', cursor: 'pointer' }}>×</button>
        </div>
      </td>
    </tr>
  )
}

export default function RelatedRepos({ slug }) {
  const [links, setLinks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [suggesting, setSuggesting]   = useState(false)
  const [error, setError]             = useState(null)
  const [search, setSearch]           = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${slug}/repos`).then(r => r.json())
      setLinks(res.data || [])
    } catch (e) {
      setError(e.message || 'Failed to load repos')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  const discover = async () => {
    setDiscovering(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${slug}/discover-repos`, { method: 'POST' }).then(r => r.json())
      if (res.error) { setError(res.error); return }
      await load()
    } catch (e) {
      setError(e.message || 'Discovery failed')
    } finally {
      setDiscovering(false)
    }
  }

  const suggest = async () => {
    setSuggesting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${slug}/suggest-repos`, { method: 'POST' }).then(r => r.json())
      if (res.error) { setError(res.error); return }
      await load()
    } catch (e) {
      setError(e.message || 'Suggest failed')
    } finally {
      setSuggesting(false)
    }
  }

  const togglePin = async (link) => {
    await fetch(`/api/projects/${slug}/repos/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !link.pinned }),
    })
    setLinks(ls => ls.map(l => l.id === link.id ? { ...l, pinned: !l.pinned } : l))
  }

  const remove = async (link) => {
    await fetch(`/api/projects/${slug}/repos/${link.id}`, { method: 'DELETE' })
    setLinks(ls => ls.filter(l => l.id !== link.id))
  }

  const doSearch = async (q) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const { data } = await fetch(`/api/repos?search=${encodeURIComponent(q)}`).then(r => r.json())
      const linked = new Set(links.map(l => l.full_name))
      setSearchResults((data || []).filter(r => !linked.has(r.full_name)).slice(0, 8))
    } finally {
      setSearching(false)
    }
  }

  const addManual = async (repo) => {
    setSearchResults([])
    setSearch('')
    await fetch(`/api/projects/${slug}/repos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_id: repo.id }),
    })
    await load()
  }

  const pinned    = links.filter(l => l.pinned)
  const suggested = links.filter(l => !l.pinned)
  const busy      = discovering || suggesting

  return (
    <div style={{ padding: '0 0 32px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          Related Repos {links.length > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>({links.length})</span>}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={discover} disabled={busy}
            style={{ padding: '6px 14px', background: busy ? 'var(--surface)' : 'var(--primary)', color: busy ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', cursor: busy ? 'default' : 'pointer' }}>
            {discovering ? 'Discovering…' : '⎇ Discover'}
          </button>
          <button onClick={suggest} disabled={busy}
            style={{ padding: '6px 14px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: '0.78rem', cursor: busy ? 'default' : 'pointer' }}>
            {suggesting ? 'Suggesting…' : '✦ Suggest from Library'}
          </button>
        </div>
      </div>

      {error && <div style={{ marginBottom: 12, fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</div>}

      {/* Manual search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); doSearch(e.target.value) }}
          onBlur={() => setTimeout(() => setSearchResults([]), 150)}
          placeholder="Search repos to add manually…"
          style={{ width: '100%', padding: '7px 12px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, color: 'var(--text)', boxSizing: 'border-box' }}
        />
        {searchResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, zIndex: 20, marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
            {searchResults.map(r => (
              <button key={r.id} onClick={() => addManual(r)}
                style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--surface-border)' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text)', flex: 1 }}>{r.full_name}</span>
                {r.language && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{r.language}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>}

      {!loading && links.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <p style={{ marginBottom: 12 }}>No related repos yet.</p>
          <p style={{ fontSize: '0.75rem' }}>
            Click <strong>⎇ Discover</strong> to search GitHub using AI-generated queries, or <strong>✦ Suggest from Library</strong> to score repos already imported.
          </p>
        </div>
      )}

      {links.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
              <th style={TH}>Repo</th>
              <th style={TH}>Language</th>
              <th style={TH}>Stars</th>
              <th style={TH}>Relevance</th>
              <th style={TH}>Reason</th>
              <th style={TH}></th>
            </tr>
          </thead>
          {pinned.length > 0 && (
            <tbody>
              <tr><td colSpan={6} style={{ padding: '6px 0 2px', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Pinned</td></tr>
              {pinned.map(l => <RepoRow key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
            </tbody>
          )}
          {suggested.length > 0 && (
            <tbody>
              <tr><td colSpan={6} style={{ padding: '6px 0 2px', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Suggestions</td></tr>
              {suggested.map(l => <RepoRow key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
            </tbody>
          )}
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add "Repos" tab to `src/pages/ProjectDetail.jsx`**

The file already has `Overview` and `Crates` tabs. Add `Repos` as a third tab.

Find the tab bar array `['Overview', 'Crates']` and change to `['Overview', 'Crates', 'Repos']`.

Find the navigate call in the tab onClick and extend it:

```js
navigate(
  tab === 'Crates' ? `/projects/${slug}/crates`
  : tab === 'Repos' ? `/projects/${slug}/repos`
  : `/projects/${slug}`
)
```

Add the Repos tab render block after the existing Crates block:

```jsx
import RelatedRepos from '../components/RelatedRepos.jsx'

{/* Repos tab — add after the Crates block */}
{activeTab === 'Repos' && (
  <div style={{ padding: '0 28px' }}>
    <RelatedRepos slug={slug} />
  </div>
)}
```

- [ ] **Step 3: Add `/projects/:slug/repos` route in `src/App.jsx`**

```jsx
<Route path="/projects/:slug/repos" element={<Layout><ProjectDetail initialTab="Repos" /></Layout>} />
```

Add after the existing `/projects/:slug/crates` route.

- [ ] **Step 4: Restart server, navigate to http://localhost:47621/projects/skillscdn/repos, verify:**
  - Three tabs visible: Overview | Crates | Repos
  - Repos tab shows empty state with Discover and Suggest from Library buttons
  - Discover button makes the AI call and surfaces repos (takes ~20 seconds)
  - Table shows Repo | Language | Stars | Relevance | Reason columns
  - Pin/remove buttons work
  - Manual search finds repos from the library

- [ ] **Step 5: Commit**

```bash
git add src/components/RelatedRepos.jsx src/pages/ProjectDetail.jsx src/App.jsx
git commit -m "feat: RelatedRepos component and Repos project tab"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Import ruvnet repos → Task 2 `POST /api/repos/import-url` with `github.com/ruvnet`
- ✅ Import by user/org/topic URL → Task 2
- ✅ AI Discovery (AI generates queries → GitHub search) → Task 3 `repoDiscoverer.js` + Task 4 `discover-repos` endpoint
- ✅ Score from library (Suggest) → Task 4 `suggest-repos` endpoint
- ✅ Repo Library page → Task 6
- ✅ Project Repos tab with table → Task 7
- ✅ Relevance bar + score % → Task 7 `ScoreBar` component
- ✅ Pin/unpin → Tasks 4 and 7
- ✅ Manual search + link → Tasks 4 and 7
- ✅ Smoke tests → Task 5
- ✅ Pinned rows never overwritten → `WHERE project_repo_links.pinned = false` in all upserts

**Placeholder scan:** No TBDs, all code blocks complete.

**Type consistency:**
- `scoreProjectRepos(project, repos)` defined in Task 3, consumed in Tasks 4
- `generateRepoQueries(project)` defined in Task 3, consumed in Task 4
- `upsertRepo(repo)` defined in Task 2, consumed in Task 4
- `LinkRow` shape consistent: Task 4 `getLinksForProject` JOIN includes `full_name, name, description, language, topics, stars, html_url` — all referenced in Task 7 `RepoRow`
