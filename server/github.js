// server/github.js
import { Octokit } from '@octokit/rest'
import sql from './db.js'
import { getSetting } from './settings.js'
import 'dotenv/config'

export const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

// ponytail: pure slug disambiguator. If `baseSlug` is already taken by a *different* repo
// (different github_full_name / local_path), append the owner so two distinct projects never
// silently merge onto one row. `taken` maps slug -> identity key.
export function disambiguateSlug(baseSlug, identityKey, taken) {
  if (!taken[baseSlug] || taken[baseSlug] === identityKey) return baseSlug
  const owner = (identityKey.split('/')[0] || '').toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const candidate = `${baseSlug}-${owner}`.replace(/-+/g, '-').replace(/-+$/, '')
  if (!taken[candidate] || taken[candidate] === identityKey) return candidate
  // Edge case: owner-suffixed slug already taken by a third identity — append counter
  let n = 2
  while (taken[`${candidate}-${n}`] && taken[`${candidate}-${n}`] !== identityKey) n++
  return `${candidate}-${n}`
}

export function repoToProject(repo) {
  return {
    name: repo.name,
    slug: repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    description: repo.description || '',
    github_url: repo.html_url,
    github_full_name: repo.full_name,
    topics: repo.topics || [],
    language: repo.language || null,
    stars: repo.stargazers_count,
    open_issues: repo.open_issues_count,
    is_private: repo.private,
    last_commit_at: repo.pushed_at,
    last_commit_msg: null,
    last_commit_author: null,
  }
}

export async function fetchGitHubRepos(username) {
  const repos = []
  for await (const response of octokit.paginate.iterator(
    octokit.rest.repos.listForUser,
    { username, per_page: 100, type: 'owner' }
  )) {
    repos.push(...response.data)
  }
  return repos
}

export async function syncOneRepo(fullName) {
  const [owner, repoName] = fullName.split('/')
  const { data: repo } = await octokit.rest.repos.get({ owner, repo: repoName })
  const project = repoToProject(repo)

  // Disambiguate against any existing row holding this slug under a different repo
  const rows = await sql`SELECT slug, github_full_name FROM projects WHERE slug = ${project.slug}`
  const taken = Object.fromEntries(rows.map(r => [r.slug, r.github_full_name]))
  project.slug = disambiguateSlug(project.slug, repo.full_name, taken)
  try {
    const { data: commits } = await octokit.rest.repos.listCommits({ owner, repo: repoName, per_page: 1 })
    if (commits.length) {
      project.last_commit_msg = commits[0].commit.message.split('\n')[0]
      project.last_commit_author = commits[0].commit.author?.name || ''
      project.last_commit_at = commits[0].commit.author?.date || repo.pushed_at
    }
  } catch (err) { console.warn(`[sync] commits failed for ${fullName}: ${err.message}`) }
  await sql`
    INSERT INTO projects ${sql(project, 'name', 'slug', 'description', 'github_url', 'github_full_name', 'topics', 'language', 'stars', 'open_issues', 'is_private', 'last_commit_at', 'last_commit_msg', 'last_commit_author')}
    ON CONFLICT (slug) DO UPDATE SET
      description = EXCLUDED.description, topics = EXCLUDED.topics, language = EXCLUDED.language,
      stars = EXCLUDED.stars, open_issues = EXCLUDED.open_issues,
      last_commit_at = EXCLUDED.last_commit_at, last_commit_msg = EXCLUDED.last_commit_msg,
      last_commit_author = EXCLUDED.last_commit_author, updated_at = now()
  `
  return 1
}

async function inParallel(items, concurrency, fn) {
  const results = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    results.push(...await Promise.all(batch.map(fn)))
  }
  return results
}

export async function syncGitHub() {
  const usernames = ((await getSetting('github_usernames')) || '').split(',').map(u => u.trim()).filter(Boolean)
  let updated = 0

  // Preload existing commit timestamps to skip unchanged repos (avoids N+1 API calls)
  const existing = await sql`SELECT slug, last_commit_at, github_full_name FROM projects`
  const knownAt = Object.fromEntries(existing.map(p => [p.slug, p.last_commit_at ? new Date(p.last_commit_at).getTime() : 0]))
  const slugTaken = Object.fromEntries(existing.map(p => [p.slug, p.github_full_name]))

  for (const username of usernames) {
    const repos = await fetchGitHubRepos(username)

    // Build project objects and tag each with whether it needs a commit fetch
    const items = repos.map(repo => {
      const project = repoToProject(repo)
      project.slug = disambiguateSlug(project.slug, repo.full_name, slugTaken)
      slugTaken[project.slug] = repo.full_name
      const needsCommit = new Date(repo.pushed_at).getTime() > (knownAt[project.slug] || 0)
      return { repo, project, needsCommit }
    })

    // Fetch commits for stale repos in parallel batches of 5
    const stale = items.filter(item => item.needsCommit)
    await inParallel(stale, 5, async ({ repo, project }) => {
      try {
        const [owner, repoName] = repo.full_name.split('/')
        const { data: commits } = await octokit.rest.repos.listCommits({
          owner, repo: repoName, per_page: 1
        })
        if (commits.length) {
          project.last_commit_msg = commits[0].commit.message.split('\n')[0]
          project.last_commit_author = commits[0].commit.author?.name || ''
          project.last_commit_at = commits[0].commit.author?.date || repo.pushed_at
        }
      } catch (err) { console.warn(`[sync] Failed to fetch commits for ${repo.full_name}: ${err.message}`) }
    })

    // Upsert all projects sequentially (DB writes, manageable volume)
    for (const { project } of items) {
      await sql`
        INSERT INTO projects ${sql(project, 'name', 'slug', 'description', 'github_url', 'github_full_name', 'topics', 'language', 'stars', 'open_issues', 'is_private', 'last_commit_at', 'last_commit_msg', 'last_commit_author')}
        ON CONFLICT (slug) DO UPDATE SET
          description = EXCLUDED.description,
          topics = EXCLUDED.topics,
          language = EXCLUDED.language,
          stars = EXCLUDED.stars,
          open_issues = EXCLUDED.open_issues,
          last_commit_at = EXCLUDED.last_commit_at,
          last_commit_msg = EXCLUDED.last_commit_msg,
          last_commit_author = EXCLUDED.last_commit_author,
          updated_at = now()
      `
      updated++
    }
  }

  await sql`
    INSERT INTO github_sync_log (status, message, projects_updated)
    VALUES ('ok', ${`Synced ${usernames.join(', ')}`}, ${updated})
  `
  return updated
}
