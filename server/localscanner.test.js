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
