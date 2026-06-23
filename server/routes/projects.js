// server/routes/projects.js
import { execFile } from 'child_process'
import { promisify } from 'util'
import sql from '../db.js'

const execFileAsync = promisify(execFile)
import { syncGitHub, syncOneRepo, octokit } from '../github.js'
import { scanLocalDirs } from '../localscanner.js'

export default async function projectRoutes(app) {
  app.get('/api/projects', async (req, reply) => {
    try {
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
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/api/projects/:slug', async (req, reply) => {
    try {
      const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
      if (!project) return reply.code(404).send({ error: 'Not found' })
      return { data: project }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.patch('/api/projects/:slug', async (req, reply) => {
    try {
      if (!req.body || typeof req.body !== 'object') {
        return reply.code(400).send({ error: 'No valid fields' })
      }
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
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.get('/api/projects/:slug/commit-activity', async (req, reply) => {
    try {
      const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
      if (!project) return reply.code(404).send({ error: 'Not found' })

      // Build 12 weekly buckets ending today
      const weeks = Array.from({ length: 12 }, (_, i) => {
        const end = new Date()
        end.setDate(end.getDate() - (11 - i) * 7)
        end.setHours(23, 59, 59, 999)
        const start = new Date(end)
        start.setDate(start.getDate() - 6)
        start.setHours(0, 0, 0, 0)
        return { start, end, count: 0, label: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
      })

      if (project.local_path) {
        try {
          const { stdout } = await execFileAsync(
            'git', ['-C', project.local_path, 'log', '--format=%aI', '--since=84 days ago'],
            { encoding: 'utf8', timeout: 5000 }
          )
          for (const line of stdout.trim().split('\n').filter(Boolean)) {
            const d = new Date(line.trim())
            if (isNaN(d.getTime())) continue
            for (const w of weeks) {
              if (d >= w.start && d <= w.end) { w.count++; break }
            }
          }
        } catch { /* repo not found or no commits — leave counts at 0 */ }
      } else if (project.github_full_name && process.env.GITHUB_TOKEN) {
        try {
          const [owner, repo] = project.github_full_name.split('/')
          const resp = await octokit.request('GET /repos/{owner}/{repo}/stats/commit_activity', { owner, repo })
          if (resp.status === 202) {
            // GitHub is still computing — tell the client to retry
            return { data: weeks.map(({ label }) => ({ label, count: 0 })), computing: true }
          }
          // GitHub returns 52 weeks oldest-first; take the last 12
          if (Array.isArray(resp.data)) {
            resp.data.slice(-12).forEach((w, i) => { weeks[i].count = w.total })
          }
        } catch (_) { /* leave counts at 0 */ }
      }

      return { data: weeks.map(({ label, count }) => ({ label, count })) }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.delete('/api/projects', async (req, reply) => {
    try {
      const result = await sql`DELETE FROM projects`
      return { data: { deleted: result.count } }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.delete('/api/projects/:slug', async (req, reply) => {
    try {
      const [project] = await sql`DELETE FROM projects WHERE slug = ${req.params.slug} RETURNING slug`
      if (!project) return reply.code(404).send({ error: 'Not found' })
      return { data: { deleted: project.slug } }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.post('/api/projects/:slug/sync', async (req, reply) => {
    try {
      const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (!project.github_full_name) return reply.code(400).send({ error: 'No GitHub repo linked' })

      const count = await syncOneRepo(project.github_full_name)
      return { data: { updated: count } }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
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

  app.get('/api/sync/log', async (req, reply) => {
    try {
      const log = await sql`SELECT * FROM github_sync_log ORDER BY synced_at DESC LIMIT 20`
      return { data: log }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })
}
