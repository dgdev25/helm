# Crate–Project Relevance Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link crates in the library to projects by relevance — AI-powered suggestions cached in the DB, manual overrides, and a clear upgrade path to ruvector-based semantic search.

**Architecture:** A `project_crate_links` join table stores (project_slug, crate_id, score, reason, source). A single `POST /api/projects/:slug/suggest-crates` endpoint calls the `claude` CLI with the project's primer + a compressed crate catalogue, saves scored results, and is idempotent (safe to re-run). The frontend adds a "Related Crates" tab to `ProjectDetail` and crate cards show which projects they're linked to. The ruvector integration path is defined as a drop-in replacement for the scoring step: same DB schema, same API surface, different backend.

**Tech Stack:** Node.js / Fastify 5 · PostgreSQL (`postgres` tagged-template driver) · `claude` CLI subprocess via `withAISlot()` · React 19 + Zustand · ruvector (future — Rust HNSW binary, called via child_process)

## Global Constraints

- Never add a new npm dependency for something a few lines of Node.js can do.
- All AI calls must go through `withAISlot()` (concurrency cap of 2) — import it from `server/routes/projects.js` or extract it to a shared module first.
- Follow existing SQL patterns: `postgres` tagged-template literals, `sql\`…\`` style.
- Follow existing API response shape: `{ data: … }` on success, `{ error: '…' }` on failure.
- React state in `ProjectDetail` is local (`useState`); don't add global Zustand state for crate links.
- No TypeScript — plain `.js` / `.jsx` throughout.
- Test file for new routes goes in `server/routes/` alongside the route (matching `projects.test.js` pattern).

---

## ruvector Integration Path

This section is the architectural contract. The Claude-based scorer in Task 3 is written as a swappable strategy. When ruvector is ready, only Task 3's scorer implementation changes — schema, API, and UI are untouched.

### Why ruvector makes sense at scale
At 340 crates the Claude approach is correct. At 50k+ crates (full crates.io import), sending the full catalogue in a prompt is infeasible. ruvector solves this with HNSW approximate nearest-neighbour search over pre-computed embeddings.

### Integration contract (implement when ready)
```
┌─────────────────────────────────────────────────────┐
│  scorer interface (server/lib/crateScorer.js)        │
│                                                      │
│  scoreProjectCrates(project, crates)                 │
│    → Promise<[{ crate_id, score, reason }]>          │
│                                                      │
│  Two implementations:                                │
│  · claudeScorer.js   ← built in Task 3 (now)        │
│  · ruvectorScorer.js ← built when needed (future)   │
└─────────────────────────────────────────────────────┘
```

### ruvector upgrade steps (future, not part of this plan)
1. Stand up `ruvector-service` — a small Rust binary exposing `POST /embed` and `POST /search` over HTTP, backed by ruvector's HNSW index. Run as a sidecar (`server/scripts/ruvector-service`).
2. Generate embeddings for all crates on import (`POST /api/crates/import-url` calls `/embed` for each crate description after upsert).
3. Implement `server/lib/ruvectorScorer.js` — embeds the project primer, queries `/search` for top-50 nearest crates, passes those 50 to Claude for re-ranking with reasons. Returns the same `[{ crate_id, score, reason }]` shape.
4. Swap `import scorer from './claudeScorer.js'` → `import scorer from './ruvectorScorer.js'` in `server/routes/crateLinks.js`.
5. Add `embedding VECTOR(1536)` column to `crate_library` (pgvector as an alternative if ruvector stays Rust-only).
6. No schema, API, or UI changes needed.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/schema.sql` | Modify | Add `project_crate_links` table + indexes |
| `server/lib/claudeScorer.js` | **Create** | Pure scoring function: project + crates → scored list |
| `server/routes/crateLinks.js` | **Create** | REST routes for suggest, list, pin/unpin, delete |
| `server/index.js` | Modify | Register `crateLinks` routes |
| `server/routes/projects.js` | Modify | Extract `withAISlot` to shared module |
| `server/lib/aiSlot.js` | **Create** | Shared `withAISlot()` — used by projects + crateLinks |
| `server/routes/crateLinks.test.js` | **Create** | Route-level integration tests |
| `src/components/RelatedCrates.jsx` | **Create** | "Related Crates" tab panel for ProjectDetail |
| `src/pages/ProjectDetail.jsx` | Modify | Add Related Crates tab |
| `src/pages/Crates.jsx` | Modify | Show linked-project badges on each crate card |

---

## Task 1: Extract `withAISlot` to a shared module

**Files:**
- Create: `server/lib/aiSlot.js`
- Modify: `server/routes/projects.js` (lines 15–28 — remove local def, import shared)

**Interfaces:**
- Produces: `withAISlot(fn: () => Promise<T>): Promise<T>` — exported from `server/lib/aiSlot.js`

- [ ] **Step 1: Create `server/lib/aiSlot.js`**

```js
// server/lib/aiSlot.js
// ponytail: global 2-slot cap; crateLinks + projects share the same pool
let aiSlots = 0
const AI_MAX = 2
const queue = []

export async function withAISlot(fn) {
  if (aiSlots >= AI_MAX) {
    await new Promise(resolve => queue.push(resolve))
  }
  aiSlots++
  try {
    return await fn()
  } finally {
    aiSlots--
    if (queue.length) queue.shift()()
  }
}
```

- [ ] **Step 2: Update `server/routes/projects.js` to import from shared module**

Remove lines 15–28 (the local `withAISlot` definition) and add at the top:

```js
import { withAISlot } from '../lib/aiSlot.js'
```

- [ ] **Step 3: Verify server still starts and AI endpoints respond**

```bash
bash start.sh
curl -s -X POST http://localhost:47621/api/fill-descriptions | python3 -m json.tool
# expected: {"data":{"started":true}}
```

- [ ] **Step 4: Commit**

```bash
git add server/lib/aiSlot.js server/routes/projects.js
git commit -m "refactor: extract withAISlot to shared server/lib/aiSlot.js"
```

---

## Task 2: Add `project_crate_links` schema

**Files:**
- Modify: `server/schema.sql`

**Interfaces:**
- Produces table: `project_crate_links(id, project_slug, crate_id, score REAL, reason TEXT, source TEXT, pinned BOOLEAN, created_at)`

- [ ] **Step 1: Append to `server/schema.sql`**

```sql
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
```

- [ ] **Step 2: Apply schema (server bootstraps on start, but apply manually now)**

```bash
psql $DATABASE_URL -f server/schema.sql
# expected: CREATE TABLE, CREATE INDEX (no errors)
```

- [ ] **Step 3: Verify table exists**

```bash
psql $DATABASE_URL -c "\d project_crate_links"
# expected: column list with project_slug, crate_id, score, reason, source, pinned
```

- [ ] **Step 4: Commit**

```bash
git add server/schema.sql
git commit -m "feat: add project_crate_links schema"
```

---

## Task 3: Claude scorer (`server/lib/claudeScorer.js`)

This is the swappable strategy. Its exported signature is the ruvector integration contract.

**Files:**
- Create: `server/lib/claudeScorer.js`

**Interfaces:**
- Consumes: `project` object (has `.name`, `.description`, `.primer_state`, `.topics[]`, `.language`), `crates` array (has `.id`, `.name`, `.description`, `.category`)
- Produces: `Promise<[{ crate_id: number, score: number, reason: string }]>` — score 0.0–1.0, sorted descending, max 20 results

- [ ] **Step 1: Create `server/lib/claudeScorer.js`**

```js
// server/lib/claudeScorer.js
// ponytail: strategy pattern — ruvectorScorer.js will export the same signature
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export async function scoreProjectCrates(project, crates) {
  // Compress crate catalogue: id|name|category|description (first 80 chars)
  const catalogue = crates.map(c =>
    `${c.id}|${c.name}|${c.category}|${(c.description || '').slice(0, 80)}`
  ).join('\n')

  const projectContext = [
    `Name: ${project.name}`,
    `Language: ${project.language || 'unknown'}`,
    `Topics: ${(project.topics || []).join(', ') || 'none'}`,
    `Description: ${project.description || ''}`,
    project.primer_state
      ? `\nPrimer (truncated):\n${project.primer_state.slice(0, 3000)}`
      : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are a Rust dependency advisor. Given a project context and a catalogue of Rust crates, return the top crates most relevant to this project.

PROJECT:
${projectContext}

CRATE CATALOGUE (format: id|name|category|description):
${catalogue}

Return ONLY a JSON array of up to 20 objects, sorted by relevance descending:
[{"crate_id": <number>, "score": <0.0-1.0>, "reason": "<one sentence why>"}]

Rules:
- Only include crates with score >= 0.3
- reason must be specific to this project, not generic
- Return raw JSON only, no markdown, no explanation`

  try {
    const { stdout } = await exec('claude', ['-p', prompt], { timeout: 60000 })
    // Strip any accidental markdown fences
    const json = stdout.replace(/```json|```/g, '').trim()
    const results = JSON.parse(json)
    if (!Array.isArray(results)) return []
    return results
      .filter(r => r.crate_id && typeof r.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  } catch {
    return []
  }
}
```

- [ ] **Step 2: Smoke-test the scorer manually**

```bash
node --input-type=module <<'EOF'
import { scoreProjectCrates } from './server/lib/claudeScorer.js'
const project = { name: 'test', language: 'Rust', topics: ['ml'], description: 'A vector search engine', primer_state: null }
const crates = [
  { id: 1, name: 'ruvector', category: 'Vector DB', description: 'HNSW vector database' },
  { id: 2, name: 'serde',    category: 'Utility',   description: 'Serialization framework' },
]
const result = await scoreProjectCrates(project, crates)
console.log(JSON.stringify(result, null, 2))
EOF
# expected: array with ruvector scoring higher than serde
```

- [ ] **Step 3: Commit**

```bash
git add server/lib/claudeScorer.js
git commit -m "feat: add claude-based crate scorer (swappable strategy)"
```

---

## Task 4: Crate links routes (`server/routes/crateLinks.js`)

**Files:**
- Create: `server/routes/crateLinks.js`
- Create: `server/routes/crateLinks.test.js`
- Modify: `server/index.js` — add `import crateLinksRoutes` and `await app.register(crateLinksRoutes)`

**Interfaces:**
- Consumes: `withAISlot` from `../lib/aiSlot.js`, `scoreProjectCrates` from `../lib/claudeScorer.js`, `sql` from `../db.js`
- Produces endpoints:
  - `POST /api/projects/:slug/suggest-crates` → `{ data: { saved: number, results: [{crate_id, score, reason, crate: {name,category}}] } }`
  - `GET  /api/projects/:slug/crates` → `{ data: [{id, crate_id, score, reason, source, pinned, crate: {name,version,category,description,crates_io_url}}] }`
  - `PATCH /api/projects/:slug/crates/:linkId` → `{ data: link }` — toggle `pinned`, update `reason`
  - `DELETE /api/projects/:slug/crates/:linkId` → `{ data: { deleted: id } }`
  - `POST /api/projects/:slug/crates` → `{ data: link }` — manual link `{ crate_id }`

- [ ] **Step 1: Create `server/routes/crateLinks.js`**

```js
// server/routes/crateLinks.js
import sql from '../db.js'
import { withAISlot } from '../lib/aiSlot.js'
import { scoreProjectCrates } from '../lib/claudeScorer.js'

export default async function crateLinksRoutes(app) {

  // AI suggest — idempotent, upserts results
  app.post('/api/projects/:slug/suggest-crates', async (req, reply) => {
    const { slug } = req.params
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${slug}`
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const crates = await sql`SELECT id, name, description, category FROM crate_library ORDER BY name`
    if (!crates.length) return reply.code(422).send({ error: 'No crates in library — import some first' })

    const results = await withAISlot(() => scoreProjectCrates(project, crates))
    if (!results.length) return reply.code(422).send({ error: 'Scorer returned no results' })

    for (const r of results) {
      await sql`
        INSERT INTO project_crate_links (project_slug, crate_id, score, reason, source)
        VALUES (${slug}, ${r.crate_id}, ${r.score}, ${r.reason}, 'ai')
        ON CONFLICT (project_slug, crate_id) DO UPDATE SET
          score  = EXCLUDED.score,
          reason = EXCLUDED.reason,
          source = 'ai'
        WHERE project_crate_links.pinned = false
      `
    }

    // Return saved links with crate info
    const saved = await sql`
      SELECT l.*, c.name AS crate_name, c.category AS crate_category
      FROM project_crate_links l
      JOIN crate_library c ON c.id = l.crate_id
      WHERE l.project_slug = ${slug}
      ORDER BY l.score DESC
    `
    return { data: { saved: results.length, results: saved } }
  })

  // List links for a project
  app.get('/api/projects/:slug/crates', async (req) => {
    const { slug } = req.params
    const links = await sql`
      SELECT l.*, c.name, c.version, c.category, c.description, c.crates_io_url, c.docs_url
      FROM project_crate_links l
      JOIN crate_library c ON c.id = l.crate_id
      WHERE l.project_slug = ${slug}
      ORDER BY l.pinned DESC, l.score DESC
    `
    return { data: links }
  })

  // Manual link
  app.post('/api/projects/:slug/crates', async (req, reply) => {
    const { slug } = req.params
    const { crate_id } = req.body || {}
    if (!crate_id) return reply.code(422).send({ error: 'crate_id required' })
    const [link] = await sql`
      INSERT INTO project_crate_links (project_slug, crate_id, score, source, pinned)
      VALUES (${slug}, ${crate_id}, 1.0, 'manual', true)
      ON CONFLICT (project_slug, crate_id) DO UPDATE SET pinned = true, source = 'manual'
      RETURNING *
    `
    return { data: link }
  })

  // Update link (pin/unpin, edit reason)
  app.patch('/api/projects/:slug/crates/:linkId', async (req, reply) => {
    const { linkId } = req.params
    const { pinned, reason } = req.body || {}
    const updates = {}
    if (pinned !== undefined) updates.pinned = pinned
    if (reason !== undefined) updates.reason = reason
    if (!Object.keys(updates).length) return reply.code(422).send({ error: 'Nothing to update' })
    const [link] = await sql`
      UPDATE project_crate_links SET ${sql(updates)} WHERE id = ${linkId} RETURNING *
    `
    if (!link) return reply.code(404).send({ error: 'Link not found' })
    return { data: link }
  })

  // Remove link
  app.delete('/api/projects/:slug/crates/:linkId', async (req, reply) => {
    const { linkId } = req.params
    const [row] = await sql`DELETE FROM project_crate_links WHERE id = ${linkId} RETURNING id`
    if (!row) return reply.code(404).send({ error: 'Link not found' })
    return { data: { deleted: row.id } }
  })
}
```

- [ ] **Step 2: Register in `server/index.js`**

Add after the existing `import cratesRoutes` line:
```js
import crateLinksRoutes from './routes/crateLinks.js'
```

Add after `await app.register(cratesRoutes)`:
```js
await app.register(crateLinksRoutes)
```

- [ ] **Step 3: Write route tests `server/routes/crateLinks.test.js`**

```js
// server/routes/crateLinks.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import sql from '../db.js'

// Minimal smoke tests — hit the real DB (test data cleaned up after)
const BASE = 'http://localhost:47621'
const slug = '_test_project_crate_links'

before(async () => {
  // Insert a throwaway project and crate
  await sql`INSERT INTO projects (name, slug, language) VALUES ('Test', ${slug}, 'Rust') ON CONFLICT DO NOTHING`
  await sql`INSERT INTO crate_library (name, category) VALUES ('_test_crate', 'Utility') ON CONFLICT DO NOTHING`
})

after(async () => {
  await sql`DELETE FROM project_crate_links WHERE project_slug = ${slug}`
  await sql`DELETE FROM projects WHERE slug = ${slug}`
  await sql`DELETE FROM crate_library WHERE name = '_test_crate'`
})

describe('GET /api/projects/:slug/crates', () => {
  it('returns empty array for project with no links', async () => {
    const res = await fetch(`${BASE}/api/projects/${slug}/crates`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(data))
  })
})

describe('POST /api/projects/:slug/crates (manual)', () => {
  it('creates a manual link', async () => {
    const [crate] = await sql`SELECT id FROM crate_library WHERE name = '_test_crate'`
    const res = await fetch(`${BASE}/api/projects/${slug}/crates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crate_id: crate.id }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.source, 'manual')
    assert.equal(data.pinned, true)
  })
})

describe('PATCH /api/projects/:slug/crates/:linkId', () => {
  it('can unpin a link', async () => {
    const [link] = await sql`SELECT id FROM project_crate_links WHERE project_slug = ${slug}`
    const res = await fetch(`${BASE}/api/projects/${slug}/crates/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: false }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.pinned, false)
  })
})

describe('DELETE /api/projects/:slug/crates/:linkId', () => {
  it('removes the link', async () => {
    const [link] = await sql`SELECT id FROM project_crate_links WHERE project_slug = ${slug}`
    const res = await fetch(`${BASE}/api/projects/${slug}/crates/${link.id}`, { method: 'DELETE' })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(data.deleted)
  })
})
```

- [ ] **Step 4: Run tests (server must be running)**

```bash
cd /mnt/datadisk/dev/helm
node --test server/routes/crateLinks.test.js
# expected: 4 passing
```

- [ ] **Step 5: Commit**

```bash
git add server/routes/crateLinks.js server/routes/crateLinks.test.js server/index.js
git commit -m "feat: crate-project link routes (suggest, list, pin, delete)"
```

---

## Task 5: `RelatedCrates` UI component

**Files:**
- Create: `src/components/RelatedCrates.jsx`

**Interfaces:**
- Consumes props: `slug: string` (project slug)
- Produces: self-contained panel — fetches its own data, handles suggest, pin/unpin, remove, manual search+add

- [ ] **Step 1: Create `src/components/RelatedCrates.jsx`**

```jsx
// src/components/RelatedCrates.jsx
import { useState, useEffect, useCallback } from 'react'

const CAT_COLOR = {
  'Vector DB': '#6ee7b7', 'Neural / ML': '#93c5fd', 'Quantum': '#d8b4fe',
  'Agent / Orchestration': '#34d399', 'Graph / DAG': '#fbbf24',
  'Streaming / Dataflow': '#f472b6', 'Cryptography': '#fb923c',
  'Robotics': '#60a5fa', 'Storage / Memory': '#a78bfa',
  'Web / API': '#4ade80', 'Utility': 'var(--text-muted)',
}

export default function RelatedCrates({ slug }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/projects/${slug}/crates`).then(r => r.json())
    setLinks(res.data || [])
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  const suggest = async () => {
    setSuggesting(true)
    setError(null)
    const res = await fetch(`/api/projects/${slug}/suggest-crates`, { method: 'POST' }).then(r => r.json())
    setSuggesting(false)
    if (res.error) { setError(res.error); return }
    await load()
  }

  const togglePin = async (link) => {
    await fetch(`/api/projects/${slug}/crates/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !link.pinned }),
    })
    setLinks(ls => ls.map(l => l.id === link.id ? { ...l, pinned: !l.pinned } : l))
  }

  const remove = async (link) => {
    await fetch(`/api/projects/${slug}/crates/${link.id}`, { method: 'DELETE' })
    setLinks(ls => ls.filter(l => l.id !== link.id))
  }

  const searchCrates = async (q) => {
    setSearch(q)
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/crates?search=${encodeURIComponent(q)}`).then(r => r.json())
    const existing = new Set(links.map(l => l.crate_id))
    setSearchResults((res.data || []).filter(c => !existing.has(c.id)).slice(0, 8))
    setSearching(false)
  }

  const addManual = async (crate) => {
    await fetch(`/api/projects/${slug}/crates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crate_id: crate.id }),
    })
    setSearch('')
    setSearchResults([])
    await load()
  }

  const pinned = links.filter(l => l.pinned)
  const suggested = links.filter(l => !l.pinned)

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>
          Related Crates {links.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({links.length})</span>}
        </span>
        <button
          onClick={suggest}
          disabled={suggesting}
          style={{
            background: suggesting ? 'var(--surface)' : 'var(--gradient-btn)',
            border: '1px solid rgba(34,153,113,0.2)', borderRadius: 8,
            padding: '5px 14px', fontSize: '0.78rem', fontWeight: 600,
            color: suggesting ? 'var(--text-muted)' : '#fff',
            cursor: suggesting ? 'wait' : 'pointer',
          }}
        >
          {suggesting ? '✦ Analysing…' : links.length ? '✦ Re-suggest' : '✦ AI Suggest'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.78rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Manual search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          type="search"
          placeholder="Search crates to add manually…"
          value={search}
          onChange={e => searchCrates(e.target.value)}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '7px 12px', fontSize: '0.78rem', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
        />
        {searchResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-2)', border: '1px solid var(--surface-border)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
            {searchResults.map(c => (
              <button
                key={c.id}
                onClick={() => addManual(c)}
                style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--surface-border)' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text)', flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 9999, background: `${CAT_COLOR[c.category] || 'var(--text-muted)'}18`, color: CAT_COLOR[c.category] || 'var(--text-dim)' }}>{c.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>}

      {!loading && links.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <p style={{ marginBottom: 12 }}>No related crates yet.</p>
          <p style={{ fontSize: '0.75rem' }}>Click <strong>AI Suggest</strong> to analyse this project against the crate library.</p>
        </div>
      )}

      {/* Pinned crates */}
      {pinned.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 8 }}>Pinned</div>
          {pinned.map(l => <CrateLink key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
        </div>
      )}

      {/* AI suggestions */}
      {suggested.length > 0 && (
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 8 }}>AI Suggestions</div>
          {suggested.map(l => <CrateLink key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
        </div>
      )}
    </div>
  )
}

function CrateLink({ link, onPin, onRemove }) {
  const color = CAT_COLOR[link.category] || 'var(--text-muted)'
  return (
    <div className="glass" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700 }}>{link.name}</span>
          {link.version && <span style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>v{link.version}</span>}
          <span style={{ fontSize: '0.63rem', padding: '1px 6px', borderRadius: 9999, background: `${color}18`, border: `1px solid ${color}`, color }}>{link.category}</span>
          {link.source === 'manual' && <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 9999, padding: '1px 6px' }}>manual</span>}
        </div>
        {link.reason && <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>{link.reason}</p>}
        <code style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: 4, display: 'block' }}>cargo add {link.name}</code>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onPin(link)}
          title={link.pinned ? 'Unpin' : 'Pin'}
          style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: link.pinned ? '#fbbf24' : 'var(--text-dim)', cursor: 'pointer' }}
        >
          {link.pinned ? '★' : '☆'}
        </button>
        <button
          onClick={() => onRemove(link)}
          title="Remove"
          style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: 'var(--text-dim)', cursor: 'pointer' }}
        >×</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RelatedCrates.jsx
git commit -m "feat: RelatedCrates component with AI suggest, pin, manual search"
```

---

## Task 6: Wire `RelatedCrates` into `ProjectDetail`

**Files:**
- Modify: `src/pages/ProjectDetail.jsx`

**Interfaces:**
- Consumes: `RelatedCrates` component (from `../components/RelatedCrates.jsx`), existing `slug` from `useParams()`

The existing `ProjectDetail` renders tabs (Primer, Synopsis, etc.). Add a "Crates" tab.

- [ ] **Step 1: Add import at top of `ProjectDetail.jsx`**

```js
import RelatedCrates from '../components/RelatedCrates.jsx'
```

- [ ] **Step 2: Find the tab definitions array (search for `tabs` or `tab` state)**

Locate where tabs are defined in `ProjectDetail.jsx`. It will look something like:
```js
const TABS = ['Primer', 'Synopsis', 'Commits', ...]
```
or a `useState` with a tab key. Add `'Crates'` to that list.

- [ ] **Step 3: Add the Crates tab render branch**

In the section that renders tab content (the `activeTab === 'X'` conditions), add:

```jsx
{activeTab === 'Crates' && <RelatedCrates slug={slug} />}
```

- [ ] **Step 4: Start server, navigate to any Rust project, click Crates tab**

```bash
bash start.sh
# Open http://localhost:47621/projects/<any-rust-project-slug>
# Click the Crates tab
# Expected: empty state with "AI Suggest" button
```

- [ ] **Step 5: Click "AI Suggest" and verify results appear**

Expected: spinner for 10–30s, then a list of crates with scores and reasons.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ProjectDetail.jsx
git commit -m "feat: add Related Crates tab to project detail"
```

---

## Task 7: Show project badges on Crate Library cards

**Files:**
- Modify: `src/pages/Crates.jsx`

**Interfaces:**
- Consumes: `GET /api/crates` response (add `project_count` to the query), or a separate `GET /api/crates/:id/projects` call

The simplest approach: update the crates list query in the backend to include a `project_count` (a COUNT join), then show a badge on each card.

- [ ] **Step 1: Update `GET /api/crates` in `server/routes/crates.js` to include link count**

Find the `SELECT * FROM crate_library` queries and add a subquery:

```js
// Replace both SELECT queries in GET /api/crates:
const rows = conditions.length
  ? await sql`
      SELECT c.*, COUNT(l.id)::int AS project_count
      FROM crate_library c
      LEFT JOIN project_crate_links l ON l.crate_id = c.id
      WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}
      GROUP BY c.id
      ORDER BY c.starred DESC, c.name`
  : await sql`
      SELECT c.*, COUNT(l.id)::int AS project_count
      FROM crate_library c
      LEFT JOIN project_crate_links l ON l.crate_id = c.id
      GROUP BY c.id
      ORDER BY c.starred DESC, c.name`
```

- [ ] **Step 2: Add project count badge to crate cards in `Crates.jsx`**

In the crate card header (next to the star button), add:

```jsx
{c.project_count > 0 && (
  <span
    title={`Linked to ${c.project_count} project${c.project_count > 1 ? 's' : ''}`}
    style={{ fontSize: '0.63rem', background: 'rgba(34,153,113,0.12)', border: '1px solid rgba(34,153,113,0.25)', borderRadius: 9999, padding: '1px 7px', color: 'var(--primary)' }}
  >
    {c.project_count} project{c.project_count > 1 ? 's' : ''}
  </span>
)}
```

- [ ] **Step 3: Verify in browser**

After running AI suggest on a project, refresh Crate Library — cards for matched crates should show a green "N projects" badge.

- [ ] **Step 4: Commit**

```bash
git add server/routes/crates.js src/pages/Crates.jsx
git commit -m "feat: show linked-project count badge on crate library cards"
```

---

## Self-Review

### Spec coverage
| Requirement | Task |
|---|---|
| Join table with score, reason, source, pinned | Task 2 |
| AI suggest endpoint (idempotent, respects pinned) | Task 4 |
| Manual link/unlink | Task 4 + Task 5 |
| Pin/unpin | Task 4 + Task 5 |
| "Related Crates" UI on project detail | Task 5 + Task 6 |
| Crate library shows which projects use each crate | Task 7 |
| `withAISlot` shared (not duplicated) | Task 1 |
| ruvector integration path documented | Architecture section |
| Scorer is a swappable strategy | Task 3 |

### Placeholder scan
None — all code blocks are complete and runnable.

### Type consistency
- `scoreProjectCrates(project, crates)` defined in Task 3, consumed in Task 4 ✓
- `withAISlot` extracted in Task 1, imported in Task 4 ✓
- `project_crate_links.id` used as `linkId` param in Task 4 routes and Task 5 PATCH/DELETE calls ✓
- `link.name`, `link.version`, `link.category`, `link.reason` — all returned by the JOIN query in Task 4's GET route ✓
