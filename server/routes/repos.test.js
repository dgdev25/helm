// server/routes/repos.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import sql from '../db.js'

const BASE = `http://localhost:${process.env.FRONTEND_PORT ?? '47621'}`
let repoId

before(async () => {
  const [row] = await sql`
    INSERT INTO repo_library (full_name, owner, name, description, html_url)
    VALUES ('_test_owner/_test_repos_route', '_test_owner', '_test_repos_route', 'Test', 'https://github.com/_test_owner/_test_repos_route')
    ON CONFLICT (full_name) DO UPDATE SET description = 'Test'
    RETURNING id
  `
  repoId = row.id
})

after(async () => {
  await sql`DELETE FROM repo_library WHERE full_name = '_test_owner/_test_repos_route'`
})

describe('GET /api/repos', () => {
  it('returns repo list', async () => {
    const res = await fetch(`${BASE}/api/repos`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(data))
    assert.ok(data.some(r => r.full_name === '_test_owner/_test_repos_route'))
  })

  it('filters by search', async () => {
    const res = await fetch(`${BASE}/api/repos?search=_test_repos_route`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.length, 1)
    assert.equal(data[0].full_name, '_test_owner/_test_repos_route')
  })
})

describe('PATCH /api/repos/:id', () => {
  it('stars a repo', async () => {
    const res = await fetch(`${BASE}/api/repos/${repoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: true }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.starred, true)
  })

  it('adds notes', async () => {
    const res = await fetch(`${BASE}/api/repos/${repoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'useful lib' }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.notes, 'useful lib')
  })

  it('rejects empty update', async () => {
    const res = await fetch(`${BASE}/api/repos/${repoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 422)
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetch(`${BASE}/api/repos/999999999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: false }),
    })
    assert.equal(res.status, 404)
  })
})

describe('POST /api/repos/import-url', () => {
  it('rejects missing url', async () => {
    const res = await fetch(`${BASE}/api/repos/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 422)
  })

  it('rejects invalid topic name', async () => {
    const res = await fetch(`${BASE}/api/repos/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://github.com/topics/INVALID_TOPIC' }),
    })
    assert.equal(res.status, 422)
    const { error } = await res.json()
    assert.ok(error.includes('Invalid topic'))
  })

  it('rejects unsupported URL format', async () => {
    const res = await fetch(`${BASE}/api/repos/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://gitlab.com/user' }),
    })
    assert.equal(res.status, 422)
  })
})

describe('DELETE /api/repos/:id', () => {
  it('removes a repo', async () => {
    const [row] = await sql`
      INSERT INTO repo_library (full_name, owner, name, html_url)
      VALUES ('_test_owner/_del_me', '_test_owner', '_del_me', 'https://github.com/_test_owner/_del_me')
      ON CONFLICT (full_name) DO UPDATE SET name = '_del_me'
      RETURNING id
    `
    const res = await fetch(`${BASE}/api/repos/${row.id}`, { method: 'DELETE' })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.deleted, row.id)
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetch(`${BASE}/api/repos/999999999`, { method: 'DELETE' })
    assert.equal(res.status, 404)
  })
})
