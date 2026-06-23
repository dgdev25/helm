import { spawn } from 'child_process'
import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILL_PATH = join(__dirname, 'primers-skill.md')

let _skill = null
async function getSkill() {
  if (!_skill) _skill = await readFile(SKILL_PATH, 'utf8')
  return _skill
}

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
    proc.on('close', code => {
      clearTimeout(timer)
      if (code === 0 || stdout) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `claude exited with code ${code}`))
    })
  })
}

export async function runPrimer(localPath) {
  const skill = await getSkill()
  const output = await runClaude(localPath, skill)

  // Read STATE.md if claude wrote it
  let state = null
  try {
    state = await readFile(join(localPath, '.primer', 'STATE.md'), 'utf8')
  } catch {}

  return { output, state: state || output }
}
