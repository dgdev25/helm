// server/routes/repoLinks.js
import sql from '../db.js'
import { octokit } from '../github.js'
import { withAISlot } from '../lib/aiSlot.js'
import { scoreProjectRepos } from '../lib/repoScorer.js'
import { generateRepoQueries } from '../lib/repoDiscoverer.js'
import { upsertRepo } from './repos.js'

async function getLinksForProject(slug) {
  return sql`
    SELECT l.*, r.full_name, r.name, r.description, r.language, r.topics, r.stars, r.html_url
    FROM project_repo_links l
    JOIN repo_library r ON r.id = l.repo_id
    WHERE l.project_slug = ${slug}
    ORDER BY l.pinned DESC, l.score DESC
  `
}

export default async function repoLinksRoutes(app) {

  // AI Discovery: generate queries → search GitHub → upsert repos → score → save links
  app.post('/api/projects/:slug/discover-repos', async (req, reply) => {
    const { slug } = req.params
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${slug}`
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const results = await withAISlot(async () => {
      // Step 1: generate search queries
      const queries = await generateRepoQueries(project)
      if (!queries.length) return []

      // Step 2: search GitHub for each query, deduplicate by full_name
      const seen = new Set()
      const discovered = []
      for (const q of queries) {
        try {
          const { data } = await octokit.rest.search.repos({ q, sort: 'stars', per_page: 30 })
          for (const repo of data.items) {
            if (!seen.has(repo.full_name)) {
              seen.add(repo.full_name)
              discovered.push(repo)
            }
          }
        } catch (err) {
          console.warn(`[discover] search failed for "${q}": ${err.message}`)
        }
      }
      if (!discovered.length) return []

      // Step 3: upsert all discovered repos into repo_library
      const saved = []
      for (const r of discovered) {
        const row = await upsertRepo(r)
        saved.push(row)
      }

      // Step 4: score all against the project
      return await scoreProjectRepos(project, saved)
    })

    if (!results.length) return reply.code(422).send({ error: 'Discovery returned no results — check GITHUB_TOKEN and try again' })

    // Step 5: upsert scored links (never overwrite pinned)
    for (const r of results) {
      await sql`
        INSERT INTO project_repo_links (project_slug, repo_id, score, reason, source)
        VALUES (${slug}, ${r.repo_id}, ${r.score}, ${r.reason}, 'discover')
        ON CONFLICT (project_slug, repo_id) DO UPDATE SET
          score  = EXCLUDED.score,
          reason = EXCLUDED.reason,
          source = 'discover'
        WHERE project_repo_links.pinned = false
      `
    }

    const links = await getLinksForProject(slug)
    return { data: { discovered: results.length, saved: results.length, results: links } }
  })

  // AI Suggest: score all repos already in the library against this project
  app.post('/api/projects/:slug/suggest-repos', async (req, reply) => {
    const { slug } = req.params
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${slug}`
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const repos = await sql`SELECT id, full_name, name, description, language, topics, stars FROM repo_library ORDER BY stars DESC`
    if (!repos.length) return reply.code(422).send({ error: 'No repos in library — import some first or use Discover' })

    const results = await withAISlot(() => scoreProjectRepos(project, repos))
    if (!results.length) return reply.code(422).send({ error: 'Scorer returned no results' })

    for (const r of results) {
      await sql`
        INSERT INTO project_repo_links (project_slug, repo_id, score, reason, source)
        VALUES (${slug}, ${r.repo_id}, ${r.score}, ${r.reason}, 'ai')
        ON CONFLICT (project_slug, repo_id) DO UPDATE SET
          score  = EXCLUDED.score,
          reason = EXCLUDED.reason,
          source = 'ai'
        WHERE project_repo_links.pinned = false
      `
    }

    const links = await getLinksForProject(slug)
    return { data: { saved: results.length, results: links } }
  })

  // List links for a project
  app.get('/api/projects/:slug/repos', async (req) => {
    return { data: await getLinksForProject(req.params.slug) }
  })

  // Manual link
  app.post('/api/projects/:slug/repos', async (req, reply) => {
    const { slug } = req.params
    const repoId = parseInt(req.body?.repo_id, 10)
    if (!Number.isInteger(repoId)) return reply.code(422).send({ error: 'repo_id must be an integer' })
    const [link] = await sql`
      INSERT INTO project_repo_links (project_slug, repo_id, score, source, pinned)
      VALUES (${slug}, ${repoId}, 1.0, 'manual', true)
      ON CONFLICT (project_slug, repo_id) DO UPDATE SET pinned = true, source = 'manual'
      RETURNING *
    `
    return { data: link }
  })

  // Update (pin/unpin, edit reason)
  app.patch('/api/projects/:slug/repos/:linkId', async (req, reply) => {
    const id = parseInt(req.params.linkId, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid link id' })
    const { pinned, reason } = req.body || {}
    const updates = {}
    if (pinned  !== undefined) updates.pinned  = pinned
    if (reason  !== undefined) updates.reason  = reason
    if (!Object.keys(updates).length) return reply.code(422).send({ error: 'Nothing to update' })
    const [link] = await sql`UPDATE project_repo_links SET ${sql(updates)} WHERE id = ${id} RETURNING *`
    if (!link) return reply.code(404).send({ error: 'Link not found' })
    return { data: link }
  })

  // Remove link
  app.delete('/api/projects/:slug/repos/:linkId', async (req, reply) => {
    const id = parseInt(req.params.linkId, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid link id' })
    const [row] = await sql`DELETE FROM project_repo_links WHERE id = ${id} RETURNING id`
    if (!row) return reply.code(404).send({ error: 'Link not found' })
    return { data: { deleted: row.id } }
  })
}
