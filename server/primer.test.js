import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, chmod, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { runPrimer } from './primer.js'

describe('runPrimer', () => {
  let binDir, repoDir, origPath

  before(async () => {
    binDir = await mkdtemp(join(tmpdir(), 'fake-bin-'))
    repoDir = await mkdtemp(join(tmpdir(), 'fake-repo-'))
    origPath = process.env.PATH
    process.env.PATH = binDir + ':' + origPath
  })

  after(async () => {
    process.env.PATH = origPath
    await rm(binDir, { recursive: true })
    await rm(repoDir, { recursive: true })
  })

  // Clean .primer dir between tests
  beforeEach(async () => {
    try { await rm(join(repoDir, '.primer'), { recursive: true }) } catch {}
  })

  it('returns state from STATE.md when claude writes it', async () => {
    const stateContent = '# Test — Primer State\n## Executive Summary\n- **Project:** test app'
    // ponytail: embed repoDir directly — tmpdir paths have no spaces or special chars
    await writeFile(join(binDir, 'claude'), `#!/bin/sh
mkdir -p ${repoDir}/.primer
printf '%s' '${stateContent.replace(/'/g, "'\\''")}' > ${repoDir}/.primer/STATE.md
echo "primer ran"
`)
    await chmod(join(binDir, 'claude'), 0o755)

    const result = await runPrimer(repoDir)
    assert.equal(result.output, 'primer ran')
    assert.ok(result.state.includes('# Test'))
    assert.ok(result.state.includes('Executive Summary'))
  })

  it('falls back to stdout when claude does not write STATE.md', async () => {
    await writeFile(join(binDir, 'claude'), '#!/bin/sh\necho "fallback output"\n')
    await chmod(join(binDir, 'claude'), 0o755)

    const result = await runPrimer(repoDir)
    assert.equal(result.output, 'fallback output')
    assert.equal(result.state, 'fallback output')
  })

  it('rejects when claude exits non-zero with no stdout', async () => {
    await writeFile(join(binDir, 'claude'), '#!/bin/sh\necho "oops" >&2\nexit 1\n')
    await chmod(join(binDir, 'claude'), 0o755)

    await assert.rejects(
      () => runPrimer(repoDir),
      err => { assert.ok(err.message.includes('oops')); return true }
    )
  })
})
