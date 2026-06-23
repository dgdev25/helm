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
