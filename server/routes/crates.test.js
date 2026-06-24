// server/routes/crates.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import sql from '../db.js'

const BASE = 'http://localhost:47621'
let crateId

before(async () => {
  const [row] = await sql`
    INSERT INTO crate_library (name, version, description, category)
    VALUES ('_test_crate', '0.1.0', 'A test crate', 'Utility')
    ON CONFLICT (name) DO UPDATE SET version = '0.1.0'
    RETURNING id
  `
  crateId = row.id
})

after(async () => {
  await sql`DELETE FROM crate_library WHERE name = '_test_crate'`
})

describe('GET /api/crates', () => {
  it('returns crate list', async () => {
    const res = await fetch(`${BASE}/api/crates`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(data))
    assert.ok(data.some(c => c.name === '_test_crate'))
  })

  it('filters by search', async () => {
    const res = await fetch(`${BASE}/api/crates?search=_test_crate`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.length, 1)
    assert.equal(data[0].name, '_test_crate')
  })

  it('filters by category', async () => {
    const res = await fetch(`${BASE}/api/crates?category=Utility`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(data.every(c => c.category === 'Utility'))
  })

  it('filters starred', async () => {
    const res = await fetch(`${BASE}/api/crates?starred=true`)
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.ok(data.every(c => c.starred === true))
  })
})

describe('PATCH /api/crates/:id', () => {
  it('stars a crate', async () => {
    const res = await fetch(`${BASE}/api/crates/${crateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: true }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.starred, true)
  })

  it('updates notes', async () => {
    const res = await fetch(`${BASE}/api/crates/${crateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'great crate' }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.notes, 'great crate')
  })

  it('updates category', async () => {
    const res = await fetch(`${BASE}/api/crates/${crateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'Web / API' }),
    })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.category, 'Web / API')
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetch(`${BASE}/api/crates/999999999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: false }),
    })
    assert.equal(res.status, 404)
  })
})

describe('POST /api/crates/import-url', () => {
  it('rejects missing url', async () => {
    const res = await fetch(`${BASE}/api/crates/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 422)
  })

  it('rejects unsupported URL format', async () => {
    const res = await fetch(`${BASE}/api/crates/import-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://npmjs.com/package/lodash' }),
    })
    assert.equal(res.status, 422)
  })
})

describe('DELETE /api/crates/:id', () => {
  it('removes a crate', async () => {
    const [row] = await sql`
      INSERT INTO crate_library (name, version, description, category)
      VALUES ('_test_crate_del', '0.0.1', '', 'Utility')
      ON CONFLICT (name) DO UPDATE SET version = '0.0.1'
      RETURNING id
    `
    const res = await fetch(`${BASE}/api/crates/${row.id}`, { method: 'DELETE' })
    const { data } = await res.json()
    assert.equal(res.status, 200)
    assert.equal(data.deleted, row.id)
  })

  it('returns 404 for unknown id', async () => {
    const res = await fetch(`${BASE}/api/crates/999999999`, { method: 'DELETE' })
    assert.equal(res.status, 404)
  })
})
