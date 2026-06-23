// server/routes/projects.js
import sql from '../db.js'
import { syncGitHub } from '../github.js'
import { scanLocalDirs } from '../localscanner.js'

export default async function projectRoutes(app) {
  app.get('/api/projects', async (req, reply) => {
    const { search, status, language } = req.query
    const projects = await sql`
      SELECT * FROM projects
      WHERE TRUE
        ${search ? sql`AND (name ILIKE ${'%' + search + '%'} OR description ILIKE ${'%' + search + '%'})` : sql``}
        ${status ? sql`AND status = ${status}` : sql``}
        ${language ? sql`AND language = ${language}` : sql``}
      ORDER BY last_commit_at DESC NULLS LAST
    `
    return { data: projects }
  })

  app.get('/api/projects/:slug', async (req, reply) => {
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
    if (!project) return reply.code(404).send({ error: 'Not found' })
    return { data: project }
  })

  app.patch('/api/projects/:slug', async (req, reply) => {
    const allowed = ['status', 'description']
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    )
    if (!Object.keys(updates).length) return reply.code(400).send({ error: 'No valid fields' })

    const [project] = await sql`
      UPDATE projects SET ${sql(updates)}, updated_at = now()
      WHERE slug = ${req.params.slug}
      RETURNING *
    `
    if (!project) return reply.code(404).send({ error: 'Not found' })
    return { data: project }
  })

  app.post('/api/projects/:slug/sync', async (req, reply) => {
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
    if (!project) return reply.code(404).send({ error: 'Not found' })
    if (!project.github_full_name) return reply.code(400).send({ error: 'No GitHub repo linked' })

    const count = await syncGitHub()
    return { data: { updated: count } }
  })

  app.post('/api/sync', async (req, reply) => {
    try {
      const count = await syncGitHub()
      return { data: { updated: count } }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.post('/api/scan/local', async (req, reply) => {
    try {
      const count = await scanLocalDirs()
      return { data: { scanned: count } }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/api/sync/log', async () => {
    const log = await sql`SELECT * FROM github_sync_log ORDER BY synced_at DESC LIMIT 20`
    return { data: log }
  })
}
