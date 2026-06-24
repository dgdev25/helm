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
