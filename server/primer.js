import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'

const QUICK_PROMPT = `You are priming this project. Run these commands in one parallel batch:

\`\`\`bash
cat .primer/STATE.md 2>/dev/null
git log --oneline -10
git branch --show-current && git status -s
git ls-files | cut -d/ -f1-2 | sort -u
\`\`\`

Also read: README.md and the package manifest (package.json / Cargo.toml / pyproject.toml — not lockfiles).

Then write .primer/STATE.md with ONLY these sections (use the exact headings):

# <Project Name> — Primer State
<!-- Maintained by the /primers skill. AUTO blocks are regenerated each run; edit CARRY blocks freely. -->

## Executive Summary
- **Project:** <one sentence — what this project does>
- **Last session:** <what the most recent 3-5 commits shipped — concrete, not vague>
- **What's next:** <the single most important next step>

## At a glance
- **Stack:** <primary language + key framework + storage>
- **Dev loop:** <how to run/build — exact commands>
- **Last primed:** <YYYY-MM-DD> · HEAD \`<short sha>\` on \`<branch>\`

## Structure
<4-6 key folders/files with one-line roles — no exhaustive dumps>

## Roadmap — next steps
1. <step> — <why now>
2. <step> — <why now>
3. <step> — <why now>

## Session log
- <YYYY-MM-DD> \`<sha>\` — <what this prime found>

Preserve any existing CARRY or Session log sections verbatim. After writing, output the file contents.`

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
