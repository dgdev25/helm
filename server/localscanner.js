// server/localscanner.js
import { spawnSync } from 'child_process'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import sql from './db.js'
import 'dotenv/config'

export function parseGitLog(raw) {
  const [hash, message, author, dateStr] = raw.split('\x1f')
  return { hash, message, author, date: new Date(dateStr) }
}

function isGitRepo(dir) {
  return existsSync(join(dir, '.git'))
}

function getRepoDirs(baseDir) {
  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => join(baseDir, d.name))
      .filter(isGitRepo)
  } catch (err) {
    console.warn(`[scan] Cannot read directory ${baseDir}: ${err.message}`)
    return []
  }
}

function getLastCommit(repoPath) {
  const result = spawnSync(
    'git',
    ['-C', repoPath, 'log', '-1', '--format=%h\x1f%s\x1f%an\x1f%aI'],
    { encoding: 'utf8', timeout: 5000 }
  )
  if (result.status !== 0 || !result.stdout.trim()) return null
  return parseGitLog(result.stdout.trim())
}

function getRepoName(repoPath) {
  return repoPath.split('/').pop()
}

export async function scanLocalDirs() {
  const dirs = (process.env.LOCAL_SCAN_DIRS || '').split(',').map(d => d.trim()).filter(Boolean)
  let count = 0

  for (const baseDir of dirs) {
    const repos = getRepoDirs(baseDir)
    for (const repoPath of repos) {
      const name = getRepoName(repoPath)
      const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const commit = getLastCommit(repoPath)

      await sql`
        INSERT INTO projects (name, slug, local_path, last_commit_at, last_commit_msg, last_commit_author)
        VALUES (${name}, ${slug}, ${repoPath}, ${commit?.date?.toISOString() || null}, ${commit?.message || null}, ${commit?.author || null})
        ON CONFLICT (slug) DO UPDATE SET
          local_path = EXCLUDED.local_path,
          last_commit_at = GREATEST(projects.last_commit_at, EXCLUDED.last_commit_at),
          last_commit_msg = CASE
            WHEN EXCLUDED.last_commit_at > projects.last_commit_at THEN EXCLUDED.last_commit_msg
            ELSE projects.last_commit_msg END,
          last_commit_author = CASE
            WHEN EXCLUDED.last_commit_at > projects.last_commit_at THEN EXCLUDED.last_commit_author
            ELSE projects.last_commit_author END,
          updated_at = now()
      `
      count++
    }
  }
  return count
}
