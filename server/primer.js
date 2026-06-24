import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'

const QUICK_PROMPT = `You are doing a Quick Prime of this project. Run these commands in one parallel batch using your tools:

\`\`\`bash
cat .primer/STATE.md 2>/dev/null | head -40
git log --oneline -10
git branch --show-current && git status -s
git ls-files | cut -d/ -f1-2 | sort -u
\`\`\`

Also read: README.md (if it exists) and the package manifest (package.json / Cargo.toml / pyproject.toml — not lockfiles).

Then write .primer/STATE.md with ONLY these sections:

# <Project Name> — Primer State

## At a glance
- **Purpose:** <one sentence — what this project does>
- **Stack:** <primary language + key framework + storage if any>
- **Dev loop:** <how to run/build, from README or scripts>
- **Last primed:** <today's date> · HEAD \`<short sha>\` on \`<branch>\`

## Structure
<4-6 key folders/files with one-line roles — no exhaustive dumps>

## In flight
<what the last 5 commits + uncommitted changes suggest is being worked on right now — 2-3 sentences>

## Next steps
1. <most obvious next thing, grounded in the commit trajectory or a TODO>
2. <second most obvious>
3. <third>

## Session log
- <YYYY-MM-DD> \`<sha>\` — quick prime

After writing the file, output its full contents.`

function runClaude(cwd, prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      ['-p', '--dangerously-skip-permissions'],
      { cwd, encoding: 'utf8' }
    )
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })
    proc.stdin.write(prompt)
    proc.stdin.end()
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Primer timed out after 2 minutes')) }, 120000)
    proc.on('error', e => {
      clearTimeout(timer)
      reject(new Error(e.code === 'ENOENT'
        ? "`claude` CLI not found on PATH — install it to generate primers"
        : `Failed to run claude: ${e.message}`))
    })
    proc.on('close', code => {
      clearTimeout(timer)
      if (code === 0 || stdout) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `claude exited with code ${code}`))
    })
  })
}

export async function runPrimer(localPath) {
  const output = await runClaude(localPath, QUICK_PROMPT)

  // Read STATE.md if claude wrote it
  let state = null
  try {
    state = await readFile(join(localPath, '.primer', 'STATE.md'), 'utf8')
  } catch {}

  return { output, state: state || output }
}
