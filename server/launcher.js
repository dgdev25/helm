import { spawn, execFileSync } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'

const TERMINALS = [
  { bin: 'ptyxis',          args: cmd => ['--', 'bash', '-c', cmd] },
  { bin: 'x-terminal-emulator', args: cmd => ['-e', 'bash', '-c', cmd] },
  { bin: 'gnome-terminal',  args: cmd => ['--', 'bash', '-c', cmd] },
  { bin: 'kitty',           args: cmd => ['bash', '-c', cmd] },
  { bin: 'alacritty',       args: cmd => ['-e', 'bash', '-c', cmd] },
  { bin: 'xterm',           args: cmd => ['-e', 'bash', '-c', cmd] },
]

function findTerminal() {
  for (const t of TERMINALS) {
    try { execFileSync('which', [t.bin], { stdio: 'pipe' }); return t } catch {}
  }
  return null
}

function extractNextSteps(state) {
  const match = state.match(/## Roadmap[^\n]*\n([\s\S]*?)(?=\n## |\n#[^#]|$)/)
  if (!match) return null
  return match[1].replace(/<!--[\s\S]*?-->/g, '').trim()
}

export async function launchCdp(localPath, projectName) {
  const state = await readFile(join(localPath, '.primer', 'STATE.md'), 'utf8')
  const steps = extractNextSteps(state)
  if (!steps) throw new Error('No roadmap found in STATE.md — run Re-run primer first')

  const terminal = findTerminal()
  if (!terminal) throw new Error('No terminal emulator found (tried ptyxis, gnome-terminal, kitty, alacritty, xterm)')

  const prompt = `You are working on the ${projectName} project at ${localPath}. Here are the next steps from the project primer:\n\n${steps}\n\nPlease work through these steps.`
  // shell-escape: wrap in single quotes, escape any internal single quotes
  const sq = s => `'${s.replace(/'/g, "'\\''")}'`
  const cmd = `cd ${sq(localPath)} && cdp ${sq(prompt)}; exec bash`

  spawn(terminal.bin, terminal.args(cmd), {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  }).unref()
}
