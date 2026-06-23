// server/github.js
import { Octokit } from '@octokit/rest'
import sql from './db.js'
import 'dotenv/config'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

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
    last_commit_at: repo.pushed_at
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

export async function syncGitHub() {
  const usernames = (process.env.GITHUB_USERNAMES || '').split(',').map(u => u.trim()).filter(Boolean)
  let updated = 0

  for (const username of usernames) {
    const repos = await fetchGitHubRepos(username)
    for (const repo of repos) {
      const project = repoToProject(repo)

      // Fetch last commit details
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
