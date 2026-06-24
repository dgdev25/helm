// server/localscanner.js
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdirSync, existsSync } from 'fs'

const execFileAsync = promisify(execFile)
import { join } from 'path'
import sql from './db.js'
import { getSetting } from './settings.js'

export function parseGitLog(raw) {
  const [hash, message, author, dateStr] = raw.split('\x1f')
  const date = new Date(dateStr)
  return { hash, message, author, date: isNaN(date.getTime()) ? null : date }
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

async function getLastCommit(repoPath) {
  try {
    const { stdout } = await execFileAsync(
      'git', ['-C', repoPath, 'log', '-1', '--format=%h\x1f%s\x1f%an\x1f%aI'],
      { encoding: 'utf8', timeout: 5000 }
    )
    return stdout.trim() ? parseGitLog(stdout.trim()) : null
  } catch { return null }
}

function getRepoName(repoPath) {
  return repoPath.split('/').pop()
}

export async function scanLocalDirs() {
  const dirs = ((await getSetting('local_scan_dirs')) || '').split(',').map(d => d.trim()).filter(Boolean)
  let count = 0

  // Preload existing slug→local_path map to detect collisions
  const existing = await sql`SELECT slug, local_path FROM projects WHERE local_path IS NOT NULL`
  const slugToPath = Object.fromEntries(existing.map(p => [p.slug, p.local_path]))

  for (const baseDir of dirs) {
    const repos = getRepoDirs(baseDir)
    for (const repoPath of repos) {
      const name = getRepoName(repoPath)
      let slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
      // Disambiguate slug collision with a different repo
      if (slugToPath[slug] && slugToPath[slug] !== repoPath) {
        const parent = repoPath.split('/').slice(-2, -1)[0] || ''
        slug = `${slug}-${parent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+/g, '-').replace(/-$/, '')
      }
      slugToPath[slug] = repoPath
      const commit = await getLastCommit(repoPath)

      await sql`
        INSERT INTO projects (name, slug, local_path, last_commit_at, last_commit_msg, last_commit_author)
        VALUES (${name}, ${slug}, ${repoPath}, ${commit?.date?.toISOString() || null}, ${commit?.message || null}, ${commit?.author || null})
        ON CONFLICT (slug) DO UPDATE SET
          local_path = EXCLUDED.local_path,
          last_commit_at = COALESCE(GREATEST(projects.last_commit_at, EXCLUDED.last_commit_at), projects.last_commit_at),
          last_commit_msg = CASE
            WHEN EXCLUDED.last_commit_at IS NOT NULL AND (projects.last_commit_at IS NULL OR EXCLUDED.last_commit_at > projects.last_commit_at) THEN EXCLUDED.last_commit_msg
            ELSE projects.last_commit_msg END,
          last_commit_author = CASE
            WHEN EXCLUDED.last_commit_at IS NOT NULL AND (projects.last_commit_at IS NULL OR EXCLUDED.last_commit_at > projects.last_commit_at) THEN EXCLUDED.last_commit_author
            ELSE projects.last_commit_author END,
          updated_at = now()
      `
      count++
    }
  }
  return count
}
