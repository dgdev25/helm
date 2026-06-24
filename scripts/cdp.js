#!/usr/bin/env node
// Cross-platform wrapper: claude --dangerously-skip-permissions
// Usage: node scripts/cdp.js [prompt-or-file] [apiUrl] [slug]
import { spawnSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

const [,, promptArg = '', apiUrl, slug] = process.argv
const prompt = (promptArg && existsSync(promptArg)) ? readFileSync(promptArg, 'utf8').trim() : promptArg

const { status } = spawnSync(
  'claude',
  ['--dangerously-skip-permissions', ...(prompt ? [prompt] : [])],
  { stdio: 'inherit' }
)

// Re-run primer after the session ends so the UI stays fresh
if (apiUrl && slug) {
  try {
    const { request } = await import('http')
    await new Promise((resolve) => {
      const req = request(`${apiUrl}/api/projects/${slug}/primer`, { method: 'POST' })
      req.on('response', resolve)
      req.on('error', resolve) // best-effort, don't crash
      req.end()
    })
  } catch {}
}

process.exit(status ?? 0)
