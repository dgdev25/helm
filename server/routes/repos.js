// server/routes/repos.js
import sql from '../db.js'
import { octokit } from '../github.js'

export async function upsertRepo(repo) {
  const [row] = await sql`
    INSERT INTO repo_library (full_name, owner, name, description, language, topics, stars, html_url, updated_at)
    VALUES (
      ${repo.full_name},
      ${repo.full_name.split('/')[0]},
      ${repo.name},
      ${repo.description || ''},
      ${repo.language || null},
      ${repo.topics || []},
      ${repo.stargazers_count ?? repo.stars ?? 0},
      ${repo.html_url},
      now()
    )
    ON CONFLICT (full_name) DO UPDATE SET
      description = EXCLUDED.description,
      language    = EXCLUDED.language,
      topics      = EXCLUDED.topics,
      stars       = EXCLUDED.stars,
      updated_at  = now()
    RETURNING *
  `
  return row
}

async function fetchUserOrOrgRepos(owner) {
  // Try user first, fall back to org
  const all = []
  try {
    for await (const page of octokit.paginate.iterator(octokit.rest.repos.listForUser, { username: owner, per_page: 100, type: 'owner' })) {
      all.push(...page.data)
    }
  } catch (e) {
    if (e.status !== 404) throw e
    for await (const page of octokit.paginate.iterator(octokit.rest.repos.listForOrg, { org: owner, per_page: 100, type: 'public' })) {
      all.push(...page.data)
    }
  }
  return all
}

export default async function reposRoutes(app) {
  // List all repos in library
  app.get('/api/repos', async (req) => {
    const { search, language, starred } = req.query
    const conditions = []
    if (search) conditions.push(sql`(r.name ILIKE ${'%' + search + '%'} OR r.description ILIKE ${'%' + search + '%'} OR r.full_name ILIKE ${'%' + search + '%'})`)
    if (language) conditions.push(sql`r.language = ${language}`)
    if (starred === 'true') conditions.push(sql`r.starred = true`)

    const rows = conditions.length
      ? await sql`
          SELECT r.*, COUNT(l.id)::int AS project_count
          FROM repo_library r
          LEFT JOIN project_repo_links l ON l.repo_id = r.id
          WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}
          GROUP BY r.id
          ORDER BY r.starred DESC, r.stars DESC`
      : await sql`
          SELECT r.*, COUNT(l.id)::int AS project_count
          FROM repo_library r
          LEFT JOIN project_repo_links l ON l.repo_id = r.id
          GROUP BY r.id
          ORDER BY r.starred DESC, r.stars DESC`
    return { data: rows }
  })

  // Import from github.com/:user, github.com/:org, or github.com/topics/:topic
  app.post('/api/repos/import-url', async (req, reply) => {
    const { url } = req.body || {}
    if (!url) return reply.code(422).send({ error: 'url required' })

    let repos = []
    const userMatch  = url.match(/github\.com\/([^/?\s]+)\/?$/)
    const topicMatch = url.match(/github\.com\/topics\/([^/?#\s]+)/)

    if (topicMatch) {
      const { data } = await octokit.rest.search.repos({
        q: `topic:${topicMatch[1]}`,
        sort: 'stars',
        per_page: 100,
      })
      repos = data.items
    } else if (userMatch) {
      repos = await fetchUserOrOrgRepos(userMatch[1])
    } else {
      return reply.code(422).send({ error: 'Unsupported URL. Use github.com/:user, github.com/:org, or github.com/topics/:topic' })
    }

    let imported = 0
    for (const r of repos) {
      await upsertRepo(r)
      imported++
    }
    return { data: { imported, total: repos.length } }
  })

  // Star / add notes
  app.patch('/api/repos/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid id' })
    const { starred, notes } = req.body || {}
    const updates = {}
    if (starred !== undefined) updates.starred = starred
    if (notes   !== undefined) updates.notes   = notes
    if (!Object.keys(updates).length) return reply.code(422).send({ error: 'Nothing to update' })
    const [row] = await sql`UPDATE repo_library SET ${sql(updates)}, updated_at = now() WHERE id = ${id} RETURNING *`
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return { data: row }
  })

  // Remove from library
  app.delete('/api/repos/:id', async (req, reply) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isInteger(id)) return reply.code(422).send({ error: 'Invalid id' })
    const [row] = await sql`DELETE FROM repo_library WHERE id = ${id} RETURNING id`
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return { data: { deleted: row.id } }
  })
}
