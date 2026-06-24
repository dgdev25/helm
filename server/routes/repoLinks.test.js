// server/routes/repoLinks.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import sql from '../db.js'

// Minimal smoke tests — hit the real DB (test data cleaned up after)
const BASE = `http://localhost:${process.env.FRONTEND_PORT ?? '47621'}`
const slug = '_test_project_repo_links'

before(async () => {
  // Insert a throwaway project and repo
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
