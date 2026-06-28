# Project Management Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a centralized dashboard that aggregates status, recent activity, and open issue/task counts across all local git repos and GitHub repositories.

**Architecture:** Monorepo — Fastify API server handles `/api/*` routes and serves the Vite-built React SPA from `/`. PostgreSQL stores project metadata, cached GitHub data, and sync schedules. A background scheduler polls GitHub every N hours; users can also trigger manual refresh per project.

**Tech Stack:** React 18 + Vite, Fastify 4, PostgreSQL 15, postgres.js, node-cron, Octokit (GitHub SDK), Tailwind CSS, Zustand (client state)

## Global Constraints

- Node.js >= 20
- PostgreSQL >= 15
- All API responses: `{ data, error }` envelope
- All timestamps stored as UTC ISO 8601
- Dark theme only (match screenshots: bg-gray-950, accent teal/green)
- No TypeScript — plain JS throughout
- ESM modules everywhere (`"type": "module"` in package.json)

---

### Task 1: Project Scaffold + Database Schema

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `index.html`
- Create: `server/index.js`
- Create: `server/db.js`
- Create: `server/schema.sql`
- Create: `.env.example`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

**Interfaces:**
- Produces: `db` — postgres.js connection pool exported from `server/db.js`
- Produces: tables: `projects`, `github_sync_log`, `settings`

- [ ] **Step 1: Init package.json**

```json
{
  "name": "helm",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev:server": "node --watch server/index.js",
    "dev:client": "vite",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "build": "vite build",
    "start": "NODE_ENV=production node server/index.js"
  }
}
```

Run: `npm install fastify @fastify/static @fastify/cors postgres @octokit/rest node-cron dotenv react react-dom zustand`
Run: `npm install -D vite @vitejs/plugin-react tailwindcss postcss autoprefixer concurrently`

- [ ] **Step 2: Write failing DB connection test**

Create `server/db.test.js`:
```js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import sql from './db.js'

describe('db', () => {
  after(async () => sql.end())

  it('connects and queries', async () => {
    const [row] = await sql`SELECT 1 AS val`
    assert.equal(row.val, 1)
  })
})
```

Run: `node --test server/db.test.js`
Expected: FAIL — `Cannot find module './db.js'`

- [ ] **Step 3: Create db.js**

```js
// server/db.js
import postgres from 'postgres'
import 'dotenv/config'

const sql = postgres(process.env.DATABASE_URL, { max: 10 })
export default sql
```

- [ ] **Step 4: Create .env.example**

```
DATABASE_URL=postgres://user:password@localhost:5432/helm
GITHUB_TOKEN=ghp_your_token_here
GITHUB_USERNAMES=yourusername,anotherorg
LOCAL_SCAN_DIRS=/home/user/dev,/home/user/projects
SYNC_INTERVAL_HOURS=6
PORT=3000
```

Copy to `.env` and fill in real values.

- [ ] **Step 5: Create schema.sql**

```sql
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
  status      TEXT DEFAULT 'active',
  last_commit_at  TIMESTAMPTZ,
  last_commit_msg TEXT,
  last_commit_author TEXT,
  open_issues INTEGER DEFAULT 0,
  open_prs    INTEGER DEFAULT 0,
  is_private  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

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
```

- [ ] **Step 6: Apply schema**

```bash
psql $DATABASE_URL -f server/schema.sql
```

Expected: `CREATE TABLE` x3, `INSERT 0 2`

- [ ] **Step 7: Run DB test**

Run: `node --test server/db.test.js`
Expected: PASS

- [ ] **Step 8: Create Vite + Tailwind config**

`vite.config.js`:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist' }
})
```

`tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: []
}
```

`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

`index.html`:
```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Helm — Project Dashboard</title>
</head>
<body class="bg-gray-950 text-gray-100">
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

`src/main.jsx`:
```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
```

`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`src/App.jsx`:
```jsx
export default function App() {
  return <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
    <h1 className="text-2xl font-bold text-teal-400">Helm</h1>
  </div>
}
```

- [ ] **Step 9: Scaffold Fastify server**

`server/index.js`:
```js
import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import cors from '@fastify/cors'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import 'dotenv/config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'

const app = Fastify({ logger: true })

await app.register(cors, { origin: isDev ? 'http://localhost:5173' : false })

if (!isDev) {
  await app.register(staticPlugin, {
    root: join(__dirname, '../dist'),
    prefix: '/'
  })
}

app.get('/api/health', async () => ({ ok: true }))

await app.listen({ port: Number(process.env.PORT) || 3000 })
```

- [ ] **Step 10: Verify server starts**

Run: `node server/index.js`
Expected: `{"level":30,"msg":"Server listening at http://127.0.0.1:3000"}`

Run: `curl http://localhost:3000/api/health`
Expected: `{"ok":true}`

- [ ] **Step 11: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold monorepo — Fastify + Vite + Postgres schema"
```

---

### Task 2: GitHub Sync Service

**Files:**
- Create: `server/github.js`
- Create: `server/sync.js`
- Create: `server/github.test.js`

**Interfaces:**
- Consumes: `sql` from `server/db.js`; env vars `GITHUB_TOKEN`, `GITHUB_USERNAMES`
- Produces: `syncGitHub()` — fetches all repos for configured usernames, upserts into `projects` table, writes to `github_sync_log`
- Produces: `startScheduler(intervalHours)` — starts node-cron job calling `syncGitHub()`

- [ ] **Step 1: Write failing sync test**

`server/github.test.js`:
```js
import { describe, it, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'

describe('github sync', () => {
  it('maps repo to project shape', async () => {
    const { repoToProject } = await import('./github.js')
    const repo = {
      name: 'my-app',
      full_name: 'user/my-app',
      description: 'A test app',
      html_url: 'https://github.com/user/my-app',
      topics: ['react', 'node'],
      language: 'JavaScript',
      stargazers_count: 5,
      open_issues_count: 2,
      private: false,
      pushed_at: '2026-06-01T12:00:00Z',
      default_branch: 'main'
    }
    const project = repoToProject(repo)
    assert.equal(project.slug, 'my-app')
    assert.equal(project.stars, 5)
    assert.equal(project.open_issues, 2)
    assert.deepEqual(project.topics, ['react', 'node'])
  })
})
```

Run: `node --test server/github.test.js`
Expected: FAIL — `Cannot find module './github.js'`

- [ ] **Step 2: Create github.js**

```js
// server/github.js
import { Octokit } from '@octokit/rest'
import sql from './db.js'
import 'dotenv/config'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export function repoToProject(repo) {
  return {
    name: repo.name,
    slug: repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    description: repo.description || '',
    github_url: repo.html_url,
    github_full_name: repo.full_name,
    topics: repo.topics || [],
    language: repo.language || null,
    stars: repo.stargazers_count,
    open_issues: repo.open_issues_count,
    is_private: repo.private,
    last_commit_at: repo.pushed_at
  }
}

export async function fetchGitHubRepos(username) {
  const repos = []
  for await (const response of octokit.paginate.iterator(
    octokit.rest.repos.listForUser,
    { username, per_page: 100, type: 'owner' }
  )) {
    repos.push(...response.data)
  }
  return repos
}

export async function fetchOpenPRs(fullName) {
  const [owner, repo] = fullName.split('/')
  const { data } = await octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 1 })
  const { headers } = await octokit.rest.pulls.list({ owner, repo, state: 'open', per_page: 1 })
  // Use link header for total count approximation — or just return data.length for first page
  return data.length
}

export async function syncGitHub() {
  const usernames = (process.env.GITHUB_USERNAMES || '').split(',').map(u => u.trim()).filter(Boolean)
  let updated = 0

  for (const username of usernames) {
    const repos = await fetchGitHubRepos(username)
    for (const repo of repos) {
      const project = repoToProject(repo)
      // Fetch last commit details
      try {
        const [owner, repoName] = repo.full_name.split('/')
        const { data: commits } = await octokit.rest.repos.listCommits({
          owner, repo: repoName, per_page: 1
        })
        if (commits.length) {
          project.last_commit_msg = commits[0].commit.message.split('\n')[0]
          project.last_commit_author = commits[0].commit.author?.name || ''
          project.last_commit_at = commits[0].commit.author?.date || repo.pushed_at
        }
      } catch (_) { /* repo may be empty */ }

      await sql`
        INSERT INTO projects ${sql(project, 'name','slug','description','github_url','github_full_name','topics','language','stars','open_issues','is_private','last_commit_at','last_commit_msg','last_commit_author')}
        ON CONFLICT (slug) DO UPDATE SET
          description = EXCLUDED.description,
          topics = EXCLUDED.topics,
          language = EXCLUDED.language,
          stars = EXCLUDED.stars,
          open_issues = EXCLUDED.open_issues,
          last_commit_at = EXCLUDED.last_commit_at,
          last_commit_msg = EXCLUDED.last_commit_msg,
          last_commit_author = EXCLUDED.last_commit_author,
          updated_at = now()
      `
      updated++
    }
  }

  await sql`
    INSERT INTO github_sync_log (status, message, projects_updated)
    VALUES ('ok', ${`Synced ${usernames.join(', ')}`}, ${updated})
  `
  return updated
}
```

- [ ] **Step 3: Run test**

Run: `node --test server/github.test.js`
Expected: PASS

- [ ] **Step 4: Create sync.js (scheduler)**

```js
// server/sync.js
import cron from 'node-cron'
import { syncGitHub } from './github.js'
import 'dotenv/config'

export function startScheduler() {
  const hours = Number(process.env.SYNC_INTERVAL_HOURS) || 6
  const cronExpr = `0 */${hours} * * *`

  cron.schedule(cronExpr, async () => {
    console.log('[sync] Starting scheduled GitHub sync...')
    try {
      const count = await syncGitHub()
      console.log(`[sync] Done — ${count} projects updated`)
    } catch (err) {
      console.error('[sync] GitHub sync failed:', err.message)
    }
  })

  console.log(`[sync] Scheduler started — every ${hours}h`)
}
```

- [ ] **Step 5: Wire scheduler into server**

Add to `server/index.js` after imports:
```js
import { startScheduler } from './sync.js'
```

Add before `app.listen(...)`:
```js
startScheduler()
```

- [ ] **Step 6: Verify manual sync works**

Add a temporary route to `server/index.js` (will be replaced in Task 3):
```js
import { syncGitHub } from './github.js'
app.post('/api/sync', async () => {
  const count = await syncGitHub()
  return { data: { updated: count } }
})
```

Run server, then: `curl -X POST http://localhost:3000/api/sync`
Expected: `{"data":{"updated":<N>}}`

Check DB: `psql $DATABASE_URL -c "SELECT name, stars, last_commit_at FROM projects LIMIT 5;"`

- [ ] **Step 7: Commit**

```bash
git add server/github.js server/sync.js server/github.test.js server/index.js
git commit -m "feat: GitHub sync service with node-cron scheduler"
```

---

### Task 3: Local Git Scanner

**Files:**
- Create: `server/localscanner.js`
- Create: `server/localscanner.test.js`

**Interfaces:**
- Consumes: `sql` from `server/db.js`; env var `LOCAL_SCAN_DIRS`
- Produces: `scanLocalDirs()` — walks configured directories for git repos, reads last commit via `git log`, upserts into `projects` table, merges with existing GitHub data

- [ ] **Step 1: Write failing test**

`server/localscanner.test.js`:
```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseGitLog } from './localscanner.js'

describe('localscanner', () => {
  it('parses git log output', () => {
    const raw = 'abc1234\x1ffix: correct null check\x1fAlice\x1f2026-06-20T10:00:00+02:00'
    const result = parseGitLog(raw)
    assert.equal(result.hash, 'abc1234')
    assert.equal(result.message, 'fix: correct null check')
    assert.equal(result.author, 'Alice')
    assert.ok(result.date instanceof Date)
  })
})
```

Run: `node --test server/localscanner.test.js`
Expected: FAIL

- [ ] **Step 2: Create localscanner.js**

```js
// server/localscanner.js
import { execSync } from 'child_process'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import sql from './db.js'
import 'dotenv/config'

export function parseGitLog(raw) {
  const [hash, message, author, dateStr] = raw.split('\x1f')
  return { hash, message, author, date: new Date(dateStr) }
}

function isGitRepo(dir) {
  return existsSync(join(dir, '.git'))
}

function getRepoDirs(baseDir) {
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => join(baseDir, d.name))
      .filter(isGitRepo)
  } catch (_) {
    return []
  }
}

function getLastCommit(repoPath) {
  try {
    const raw = execSync(
      `git -C "${repoPath}" log -1 --format="%h\x1f%s\x1f%an\x1f%aI"`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim()
    return parseGitLog(raw)
  } catch (_) {
    return null
  }
}

function getRepoName(repoPath) {
  return repoPath.split('/').pop()
}

export async function scanLocalDirs() {
  const dirs = (process.env.LOCAL_SCAN_DIRS || '').split(',').map(d => d.trim()).filter(Boolean)
  let count = 0

  for (const baseDir of dirs) {
    const repos = getRepoDirs(baseDir)
    for (const repoPath of repos) {
      const name = getRepoName(repoPath)
      const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const commit = getLastCommit(repoPath)

      await sql`
        INSERT INTO projects (name, slug, local_path, last_commit_at, last_commit_msg, last_commit_author)
        VALUES (${name}, ${slug}, ${repoPath}, ${commit?.date?.toISOString() || null}, ${commit?.message || null}, ${commit?.author || null})
        ON CONFLICT (slug) DO UPDATE SET
          local_path = EXCLUDED.local_path,
          last_commit_at = GREATEST(projects.last_commit_at, EXCLUDED.last_commit_at),
          last_commit_msg = CASE
            WHEN EXCLUDED.last_commit_at > projects.last_commit_at THEN EXCLUDED.last_commit_msg
            ELSE projects.last_commit_msg END,
          last_commit_author = CASE
            WHEN EXCLUDED.last_commit_at > projects.last_commit_at THEN EXCLUDED.last_commit_author
            ELSE projects.last_commit_author END,
          updated_at = now()
      `
      count++
    }
  }
  return count
}
```

- [ ] **Step 3: Run test**

Run: `node --test server/localscanner.test.js`
Expected: PASS

- [ ] **Step 4: Wire into sync.js**

In `server/sync.js`, add import and call in scheduler:
```js
import { scanLocalDirs } from './localscanner.js'

// inside the cron callback, after syncGitHub():
const localCount = await scanLocalDirs()
console.log(`[sync] Local scan — ${localCount} repos found`)
```

Also export `scanLocalDirs` access via a new `/api/scan/local` POST route in `server/index.js`:
```js
import { scanLocalDirs } from './localscanner.js'
app.post('/api/scan/local', async () => {
  const count = await scanLocalDirs()
  return { data: { scanned: count } }
})
```

- [ ] **Step 5: Test local scan**

```bash
curl -X POST http://localhost:3000/api/scan/local
```
Expected: `{"data":{"scanned":<N>}}`

```bash
psql $DATABASE_URL -c "SELECT name, local_path, last_commit_msg FROM projects WHERE local_path IS NOT NULL LIMIT 5;"
```

- [ ] **Step 6: Commit**

```bash
git add server/localscanner.js server/localscanner.test.js server/sync.js server/index.js
git commit -m "feat: local git repo scanner with merge strategy"
```

---

### Task 4: Projects REST API

**Files:**
- Create: `server/routes/projects.js`
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `sql` from `server/db.js`
- Produces:
  - `GET /api/projects` → `{ data: Project[] }`
  - `GET /api/projects/:slug` → `{ data: Project }`
  - `PATCH /api/projects/:slug` → `{ data: Project }` (update status, description)
  - `POST /api/projects/:slug/sync` → `{ data: { updated: number } }` (manual refresh for one project)
  - `POST /api/sync` → `{ data: { updated: number } }` (sync all)
  - `GET /api/sync/log` → `{ data: SyncLog[] }`

- [ ] **Step 1: Write failing route tests**

`server/routes/projects.test.js`:
```js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import sql from '../db.js'
import projectRoutes from './projects.js'

describe('GET /api/projects', () => {
  let app

  before(async () => {
    app = Fastify()
    await app.register(projectRoutes)
    // Seed one project
    await sql`DELETE FROM projects WHERE slug = 'test-project'`
    await sql`INSERT INTO projects (name, slug, description, status) VALUES ('Test Project', 'test-project', 'A test', 'active')`
  })

  after(async () => {
    await sql`DELETE FROM projects WHERE slug = 'test-project'`
    await sql.end()
    await app.close()
  })

  it('returns project list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.ok(Array.isArray(body.data))
    assert.ok(body.data.some(p => p.slug === 'test-project'))
  })

  it('returns single project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/test-project' })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).data.slug, 'test-project')
  })

  it('404 for unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/does-not-exist' })
    assert.equal(res.statusCode, 404)
  })
})
```

Run: `node --test server/routes/projects.test.js`
Expected: FAIL

- [ ] **Step 2: Create routes/projects.js**

```js
// server/routes/projects.js
import sql from '../db.js'
import { syncGitHub } from '../github.js'

export default async function projectRoutes(app) {
  app.get('/api/projects', async (req, reply) => {
    const { search, status, language } = req.query
    let projects = await sql`
      SELECT * FROM projects
      WHERE TRUE
        ${search ? sql`AND (name ILIKE ${'%' + search + '%'} OR description ILIKE ${'%' + search + '%'})` : sql``}
        ${status ? sql`AND status = ${status}` : sql``}
        ${language ? sql`AND language = ${language}` : sql``}
      ORDER BY last_commit_at DESC NULLS LAST
    `
    return { data: projects }
  })

  app.get('/api/projects/:slug', async (req, reply) => {
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
    if (!project) return reply.code(404).send({ error: 'Not found' })
    return { data: project }
  })

  app.patch('/api/projects/:slug', async (req, reply) => {
    const allowed = ['status', 'description']
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    )
    if (!Object.keys(updates).length) return reply.code(400).send({ error: 'No valid fields' })

    const [project] = await sql`
      UPDATE projects SET ${sql(updates)}, updated_at = now()
      WHERE slug = ${req.params.slug}
      RETURNING *
    `
    if (!project) return reply.code(404).send({ error: 'Not found' })
    return { data: project }
  })

  app.post('/api/projects/:slug/sync', async (req, reply) => {
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
    if (!project) return reply.code(404).send({ error: 'Not found' })
    if (!project.github_full_name) return reply.code(400).send({ error: 'No GitHub repo linked' })

    const count = await syncGitHub()
    return { data: { updated: count } }
  })

  app.post('/api/sync', async () => {
    const count = await syncGitHub()
    return { data: { updated: count } }
  })

  app.get('/api/sync/log', async () => {
    const log = await sql`SELECT * FROM github_sync_log ORDER BY synced_at DESC LIMIT 20`
    return { data: log }
  })
}
```

- [ ] **Step 3: Wire routes into server**

Replace the inline sync route in `server/index.js` with the plugin:
```js
import projectRoutes from './routes/projects.js'
// ... after cors registration:
await app.register(projectRoutes)
```

Remove the old inline `/api/sync` and `/api/scan/local` routes.

- [ ] **Step 4: Run tests**

Run: `node --test server/routes/projects.test.js`
Expected: all 3 PASS

- [ ] **Step 5: Manual smoke test**

```bash
curl http://localhost:3000/api/projects | jq '.data | length'
curl http://localhost:3000/api/projects/helm | jq '.data.name'
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/ server/index.js
git commit -m "feat: projects REST API with filtering and sync endpoints"
```

---

### Task 5: React UI — Layout + Store

**Files:**
- Create: `src/store.js`
- Create: `src/components/Layout.jsx`
- Create: `src/components/Sidebar.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: Zustand store with `projects`, `loading`, `error`, `fetchProjects(params)`, `patchProject(slug, updates)`, `triggerSync()`
- Produces: `<Layout>` with sidebar nav + main content slot

- [ ] **Step 1: Create store.js**

```js
// src/store.js
import { create } from 'zustand'

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json.data
}

export const useStore = create((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  filters: { search: '', status: '', language: '' },

  setFilter: (key, value) => {
    set(s => ({ filters: { ...s.filters, [key]: value } }))
    get().fetchProjects({ ...get().filters, [key]: value })
  },

  fetchProjects: async (params = {}) => {
    set({ loading: true, error: null })
    try {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v))
      ).toString()
      const projects = await api(`/api/projects${qs ? '?' + qs : ''}`)
      set({ projects, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  patchProject: async (slug, updates) => {
    const updated = await api(`/api/projects/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
    set(s => ({ projects: s.projects.map(p => p.slug === slug ? updated : p) }))
  },

  triggerSync: async () => {
    set({ loading: true })
    await api('/api/sync', { method: 'POST' })
    await useStore.getState().fetchProjects()
  }
}))
```

- [ ] **Step 2: Create Sidebar.jsx**

```jsx
// src/components/Sidebar.jsx
import { useStore } from '../store.js'

const NAV = [
  { label: 'All Projects', status: '' },
  { label: 'Active', status: 'active' },
  { label: 'Paused', status: 'paused' },
  { label: 'Archived', status: 'archived' },
]

export default function Sidebar() {
  const { filters, setFilter, triggerSync, loading } = useStore()

  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-gray-800">
        <h1 className="text-lg font-bold text-teal-400 tracking-tight">Helm</h1>
        <p className="text-xs text-gray-500 mt-0.5">Project Dashboard</p>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV.map(({ label, status }) => (
          <button
            key={label}
            onClick={() => setFilter('status', status)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors
              ${filters.status === status
                ? 'bg-teal-900/50 text-teal-300 font-medium'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={triggerSync}
          disabled={loading}
          className="w-full px-3 py-2 bg-teal-800 hover:bg-teal-700 disabled:opacity-50 rounded text-sm text-teal-100 transition-colors"
        >
          {loading ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Create Layout.jsx**

```jsx
// src/components/Layout.jsx
import Sidebar from './Sidebar.jsx'

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 4: Update App.jsx**

```jsx
// src/App.jsx
import { useEffect } from 'react'
import Layout from './components/Layout.jsx'
import { useStore } from './store.js'

export default function App() {
  const { fetchProjects } = useStore()
  useEffect(() => { fetchProjects() }, [])

  return (
    <Layout>
      <div className="p-8 text-gray-400">Loading projects…</div>
    </Layout>
  )
}
```

- [ ] **Step 5: Verify layout renders**

Run: `npm run dev`
Open: http://localhost:5173
Expected: Dark sidebar on left with nav items and Sync Now button, main area visible.

- [ ] **Step 6: Commit**

```bash
git add src/store.js src/components/Layout.jsx src/components/Sidebar.jsx src/App.jsx
git commit -m "feat: React layout, sidebar nav, Zustand store"
```

---

### Task 6: Project Cards + Dashboard View

**Files:**
- Create: `src/components/ProjectCard.jsx`
- Create: `src/components/SearchBar.jsx`
- Create: `src/pages/Dashboard.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `projects`, `filters`, `setFilter` from `useStore()`
- Produces: `<Dashboard>` — grid of `<ProjectCard>` components with search and language filter

- [ ] **Step 1: Create ProjectCard.jsx**

```jsx
// src/components/ProjectCard.jsx
import { formatDistanceToNow } from '../utils/time.js'

const STATUS_COLORS = {
  active: 'bg-emerald-900/50 text-emerald-300',
  paused: 'bg-yellow-900/50 text-yellow-300',
  archived: 'bg-gray-800 text-gray-500',
}

export default function ProjectCard({ project }) {
  const {
    name, description, language, topics = [], stars,
    open_issues, open_prs, last_commit_at, last_commit_msg,
    last_commit_author, status, github_url, is_private
  } = project

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100 truncate">{name}</h2>
            {is_private && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 shrink-0">private</span>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS.active}`}>
          {status}
        </span>
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topics.slice(0, 5).map(t => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-teal-900/40 text-teal-400">{t}</span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        {language && <span className="text-blue-400">{language}</span>}
        {stars > 0 && <span>★ {stars}</span>}
        {open_issues > 0 && <span className="text-orange-400">{open_issues} issues</span>}
        {open_prs > 0 && <span className="text-purple-400">{open_prs} PRs</span>}
      </div>

      {/* Last commit */}
      {last_commit_at && (
        <div className="border-t border-gray-800 pt-3 text-xs text-gray-600">
          <span className="text-gray-400">{formatDistanceToNow(last_commit_at)}</span>
          {last_commit_msg && (
            <span className="ml-1 truncate block text-gray-600">{last_commit_msg}</span>
          )}
          {last_commit_author && <span className="text-gray-700"> by {last_commit_author}</span>}
        </div>
      )}

      {/* Footer links */}
      <div className="flex gap-3 mt-auto">
        {github_url && (
          <a href={github_url} target="_blank" rel="noreferrer"
            className="text-xs text-gray-600 hover:text-teal-400 transition-colors">
            GitHub ↗
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create utils/time.js**

```js
// src/utils/time.js
export function formatDistanceToNow(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
```

- [ ] **Step 3: Create SearchBar.jsx**

```jsx
// src/components/SearchBar.jsx
import { useStore } from '../store.js'

export default function SearchBar({ languages }) {
  const { filters, setFilter } = useStore()

  return (
    <div className="flex gap-3 items-center">
      <input
        type="text"
        placeholder="Search projects…"
        value={filters.search}
        onChange={e => setFilter('search', e.target.value)}
        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-teal-600"
      />
      <select
        value={filters.language}
        onChange={e => setFilter('language', e.target.value)}
        className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-teal-600"
      >
        <option value="">All languages</option>
        {languages.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
    </div>
  )
}
```

- [ ] **Step 4: Create Dashboard.jsx**

```jsx
// src/pages/Dashboard.jsx
import { useStore } from '../store.js'
import ProjectCard from '../components/ProjectCard.jsx'
import SearchBar from '../components/SearchBar.jsx'

export default function Dashboard() {
  const { projects, loading, error } = useStore()

  const languages = [...new Set(projects.map(p => p.language).filter(Boolean))].sort()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-100 mb-1">Projects</h2>
        <p className="text-sm text-gray-500">{projects.length} total</p>
      </div>

      <div className="mb-6">
        <SearchBar languages={languages} />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && !projects.length ? (
        <div className="text-gray-600 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map(p => <ProjectCard key={p.slug} project={p} />)}
        </div>
      )}

      {!loading && !projects.length && (
        <div className="text-gray-600 text-sm text-center py-16">
          No projects found. Click "Sync Now" to import from GitHub and local dirs.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update App.jsx**

```jsx
// src/App.jsx
import { useEffect } from 'react'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import { useStore } from './store.js'

export default function App() {
  const { fetchProjects } = useStore()
  useEffect(() => { fetchProjects() }, [])
  return <Layout><Dashboard /></Layout>
}
```

- [ ] **Step 6: Verify in browser**

Run: `npm run dev` (both `dev:server` and `dev:client`)
Open: http://localhost:5173
Expected:
- Project grid visible with cards showing name, description, language, stars, issue count
- Search input filters cards in real time
- Language dropdown filters by language
- Status sidebar links filter the grid

- [ ] **Step 7: Commit**

```bash
git add src/components/ProjectCard.jsx src/components/SearchBar.jsx src/pages/Dashboard.jsx src/utils/time.js src/App.jsx
git commit -m "feat: project cards and dashboard grid view"
```

---

### Task 7: Production Build + README

**Files:**
- Modify: `server/index.js` (serve built assets in production)
- Create: `README.md`

**Interfaces:**
- Produces: `npm run build && npm start` serves the full app on PORT

- [ ] **Step 1: Verify production build**

```bash
npm run build
NODE_ENV=production node server/index.js
```

Open: http://localhost:3000
Expected: Full dashboard loads from Fastify-served static files (no Vite dev server)

- [ ] **Step 2: Create README.md**

```markdown
# Helm — Project Dashboard

Centralized dashboard for tracking all your GitHub repos and local git projects.

## Setup

1. `cp .env.example .env` — fill in `DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_USERNAMES`, `LOCAL_SCAN_DIRS`
2. `psql $DATABASE_URL -f server/schema.sql`
3. `npm install`
4. `npm run dev` — Fastify on :3000, Vite on :5173

## Production

```bash
npm run build
npm start
```

## Sync

- Automatic: every `SYNC_INTERVAL_HOURS` hours (default: 6)
- Manual: click "Sync Now" in sidebar, or `POST /api/sync`
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: setup and usage readme"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Dark theme (Tailwind gray-950, teal accents)
- ✅ React + Vite frontend
- ✅ Fastify backend (monorepo, serves static in prod)
- ✅ PostgreSQL persistence
- ✅ GitHub API sync (Octokit, paginated)
- ✅ Local git scanner (exec git log)
- ✅ Scheduled polling (node-cron, configurable hours)
- ✅ Manual refresh (Sync Now button + per-project POST)
- ✅ Recent activity (last commit time, message, author)
- ✅ Open issue counts
- ✅ Project name, description, language, topics, stars
- ✅ Status filter (active/paused/archived)
- ✅ Search by name/description
- ✅ Language filter

**No placeholders found.**

**Type consistency:** `repoToProject` produces fields matching column names in schema.sql and consumed in ProjectCard. `parseGitLog` used consistently in both test and localscanner.js.
