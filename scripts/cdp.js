#!/usr/bin/env node
// Cross-platform wrapper: claude --dangerously-skip-permissions
// Usage: node scripts/cdp.js [prompt-or-file]
import { spawnSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

const arg = process.argv[2] ?? ''
// If the arg is a path to an existing file, read it — avoids shell-quoting the full prompt
const prompt = (arg && existsSync(arg)) ? readFileSync(arg, 'utf8').trim() : arg

const { status } = spawnSync(
  'claude',
  ['--dangerously-skip-permissions', ...(prompt ? [prompt] : [])],
  { stdio: 'inherit' }
)
process.exit(status ?? 0)
