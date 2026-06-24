import { spawn, execFileSync } from 'child_process'
import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform } from 'os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CDP_SCRIPT = join(ROOT, 'scripts', 'cdp.js')

function extractNextSteps(state) {
  const match = state.match(/## Roadmap[^\n]*\n([\s\S]*?)(?=\n## |\n#[^#]|$)/)
  if (!match) return null
  return match[1].replace(/<!--[\s\S]*?-->/g, '').trim()
}

// Write prompt to a file — avoids all cross-platform shell-quoting nightmares
async function writePromptFile(localPath, prompt) {
  const file = join(localPath, '.primer', 'launch-prompt.txt')
  await writeFile(file, prompt, 'utf8')
  return file
}

function spawnTerminal(localPath, promptFile, apiUrl, slug) {
  const os = platform()
  const nodeCmd = `node "${CDP_SCRIPT}" "${promptFile}" "${apiUrl}" "${slug}"`

  if (os === 'darwin') {
    // osascript + Terminal.app — always available on macOS
    const script = `tell application "Terminal"\ndo script "cd '${localPath.replace(/'/g, "\\'")}' && ${nodeCmd}"\nactivate\nend tell`
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref()
    return
  }

  if (os === 'win32') {
    const cmd = `cd /d "${localPath}" && ${nodeCmd}`
    // Try Windows Terminal, fall back to a plain cmd window
    let wt = false
    try { execFileSync('where', ['wt'], { stdio: 'pipe' }); wt = true } catch {}
    if (wt) {
      spawn('wt', ['--', 'cmd', '/k', cmd], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', cmd], { detached: true, stdio: 'ignore', shell: false }).unref()
    }
    return
  }

  // Linux — try common terminal emulators in preference order
  const TERMINALS = [
    { bin: 'ptyxis',              args: c => ['--', 'bash', '-c', c] },
    { bin: 'x-terminal-emulator', args: c => ['-e', 'bash', '-c', c] },
    { bin: 'gnome-terminal',      args: c => ['--', 'bash', '-c', c] },
    { bin: 'kitty',               args: c => ['bash', '-c', c] },
    { bin: 'alacritty',           args: c => ['-e', 'bash', '-c', c] },
    { bin: 'xterm',               args: c => ['-e', 'bash', '-c', c] },
  ]
  const terminal = TERMINALS.find(t => { try { execFileSync('which', [t.bin], { stdio: 'pipe' }); return true } catch { return false } })
  if (!terminal) throw new Error('No terminal emulator found (tried ptyxis, gnome-terminal, kitty, alacritty, xterm)')

  const cmd = `cd '${localPath.replace(/'/g, "'\\''")}' && ${nodeCmd}; exec bash`
  spawn(terminal.bin, terminal.args(cmd), { detached: true, stdio: 'ignore', env: process.env }).unref()
}

export async function launchCdp(localPath, projectName, slug) {
  const state = await readFile(join(localPath, '.primer', 'STATE.md'), 'utf8')
  const steps = extractNextSteps(state)
  if (!steps) throw new Error('No roadmap found in STATE.md — run Re-run primer first')

  const apiUrl = `http://127.0.0.1:${process.env.PORT ?? process.env.BACKEND_PORT ?? '47821'}`
  const prompt = `You are working on the ${projectName} project at ${localPath}.\n\nHere are the next steps from the project primer:\n\n${steps}\n\nPlease work through these steps.`
  const promptFile = await writePromptFile(localPath, prompt)
  spawnTerminal(localPath, promptFile, apiUrl, slug)
}
