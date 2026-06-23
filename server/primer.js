import { spawn } from 'child_process'
import { readFile, mkdir } from 'fs/promises'
import { join } from 'path'

const PROMPT = `You are priming this project. Execute the following steps using your tools:

1. Run: git log --oneline -15
2. Run: git status -s
3. Read README.md if it exists
4. Read package.json if it exists (skip lockfiles)
5. Create the .primer/ directory if needed, then write .primer/STATE.md with this structure:

# <Project Name> — Primer State

## At a glance
- **Purpose:** <one sentence>
- **Stack:** <lang + framework + storage>
- **Dev loop:** <how to build/run>
- **Last primed:** <today's date> · HEAD \`<sha>\` on \`<branch>\`

## Structure
<key folders + one-line roles>

## In flight
<branch, uncommitted work, what recent commits suggest>

## Roadmap — next steps
1. <step> — *why now*
2. ...

## Session log
- <today> — initial primer

6. Output the full contents of .primer/STATE.md`

function runClaude(cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      ['-p', '--dangerously-skip-permissions'],
      { cwd, encoding: 'utf8' }
    )
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })
    proc.stdin.write(PROMPT)
    proc.stdin.end()
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Primer timed out after 2 minutes')) }, 120000)
    proc.on('close', code => {
      clearTimeout(timer)
      if (code === 0 || stdout) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `claude exited with code ${code}`))
    })
  })
}

export async function runPrimer(localPath) {
  const output = await runClaude(localPath)

  // Read STATE.md if claude wrote it
  let state = null
  try {
    state = await readFile(join(localPath, '.primer', 'STATE.md'), 'utf8')
  } catch {}

  return { output, state: state || output }
}
