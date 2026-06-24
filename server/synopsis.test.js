import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, chmod } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { generateSynopsis } from './synopsis.js'

describe('generateSynopsis', () => {
  it('returns null when project has no content sources', async () => {
    const result = await generateSynopsis({ name: 'x' })
    assert.equal(result, null)
  })

  describe('with fake claude binary', () => {
    let binDir, origPath

    before(async () => {
      binDir = await mkdtemp(join(tmpdir(), 'fake-bin-'))
      await writeFile(join(binDir, 'claude'), '#!/bin/sh\necho "Manages project tasks using AI assistance."\n')
      await chmod(join(binDir, 'claude'), 0o755)
      origPath = process.env.PATH
      process.env.PATH = binDir + ':' + origPath
    })

    after(async () => {
      process.env.PATH = origPath
      await rm(binDir, { recursive: true })
    })

    it('uses description as content and returns trimmed claude output', async () => {
      const result = await generateSynopsis({ name: 'myapp', description: 'A task management tool' })
      assert.equal(result, 'Manages project tasks using AI assistance.')
    })

    it('reads README.md from local_path', async () => {
      const repoDir = await mkdtemp(join(tmpdir(), 'fake-repo-'))
      try {
        await writeFile(join(repoDir, 'README.md'), '# MyApp\nA great app that does things.\n')
        const result = await generateSynopsis({ name: 'myapp', local_path: repoDir })
        assert.equal(result, 'Manages project tasks using AI assistance.')
      } finally {
        await rm(repoDir, { recursive: true })
      }
    })

    it('falls back to description when local_path has no README', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'empty-repo-'))
      try {
        const result = await generateSynopsis({ name: 'myapp', local_path: emptyDir, description: 'fallback desc' })
        assert.equal(result, 'Manages project tasks using AI assistance.')
      } finally {
        await rm(emptyDir, { recursive: true })
      }
    })
  })
})
