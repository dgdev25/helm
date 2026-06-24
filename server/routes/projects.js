// server/routes/projects.js
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { readFile, access } from 'fs/promises'
import { join } from 'path'
import sql from '../db.js'

const execFileAsync = promisify(execFile)
import { syncGitHub, syncOneRepo, octokit } from '../github.js'
import { scanLocalDirs } from '../localscanner.js'
import { generateSynopsis, generateDescription } from '../synopsis.js'
import { runPrimer } from '../primer.js'
import { launchCdp } from '../launcher.js'

// ponytail: global in-flight cap so /primer + /synopsis can't fork unbounded `claude` processes.
// Raises 429 when full; raise AI_SLOTS if you genuinely need more parallelism.
const AI_SLOTS = 2
let aiActive = 0
async function withAISlot(fn) {
  if (aiActive >= AI_SLOTS) throw Object.assign(new Error('Too many AI requests running — try again shortly'), { statusCode: 429 })
  aiActive++
  try { return await fn() } finally { aiActive-- }
}

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

      // Build weekly buckets ending today; n controlled by ?weeks= (12/26/52)
      const n = Math.min(52, Math.max(4, parseInt(req.query.weeks) || 12))
      const weeks = Array.from({ length: n }, (_, i) => {
        const end = new Date()
        end.setDate(end.getDate() - (n - 1 - i) * 7)
        end.setHours(23, 59, 59, 999)
        const start = new Date(end)
        start.setDate(start.getDate() - 6)
        start.setHours(0, 0, 0, 0)
        return { start, end, count: 0, label: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
      })

      if (project.local_path) {
        try {
          const { stdout } = await execFileAsync(
            'git', ['-C', project.local_path, 'log', '--format=%aI', `--since=${n * 7} days ago`],
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
            resp.data.slice(-n).forEach((w, i) => { weeks[i].count = w.total })
          }
        } catch (_) { /* leave counts at 0 */ }
      }

      return { data: weeks.map(({ label, count }) => ({ label, count })) }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.post('/api/projects', async (req, reply) => {
    try {
      const { localPath, githubUrl } = req.body || {}
      if (!localPath && !githubUrl) return reply.code(400).send({ error: 'Provide localPath or githubUrl' })

      let name, slug, github_url = null, github_full_name = null, local_path = null

      if (githubUrl) {
        // Extract owner/repo from URL
        const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/)
        if (!match) return reply.code(400).send({ error: 'Invalid GitHub URL' })
        github_full_name = `${match[1]}/${match[2]}`
        github_url = githubUrl.replace(/\.git$/, '')
        name = match[2]
      } else {
        local_path = localPath.trim()
        name = localPath.trim().replace(/\/$/, '').split('/').pop()
      }

      slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      // Ensure slug uniqueness
      const [existing] = await sql`SELECT slug FROM projects WHERE slug = ${slug}`
      if (existing) slug = `${slug}-${Date.now().toString(36)}`

      const [project] = await sql`
        INSERT INTO projects (name, slug, local_path, github_url, github_full_name)
        VALUES (${name}, ${slug}, ${local_path}, ${github_url}, ${github_full_name})
        RETURNING *
      `
      return { data: project }
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

  // Fire-and-forget: fills descriptions for all projects missing one, persists to DB
  app.post('/api/fill-descriptions', async (req, reply) => {
    reply.send({ data: { started: true } })
    ;(async () => {
      const projects = await sql`SELECT * FROM projects WHERE description IS NULL OR description = ''`
      for (const p of projects) {
        try {
          const description = await withAISlot(() => generateDescription(p))
          if (description) {
            await sql`UPDATE projects SET description = ${description}, updated_at = now() WHERE slug = ${p.slug}`
          }
        } catch {}
      }
    })()
  })

  // SSE chat endpoint — streams claude responses with project context
  app.post('/api/projects/:slug/chat', async (req, reply) => {
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
    if (!project) return reply.code(404).send({ error: 'Not found' })

    const { messages = [] } = req.body

    // Build context: primer state > README > metadata
    const metaParts = [
      `Project: ${project.name}`,
      project.description && `Description: ${project.description}`,
      project.synopsis && `Synopsis: ${project.synopsis}`,
      project.language && `Language: ${project.language}`,
      project.topics?.length && `Topics: ${project.topics.join(', ')}`,
      project.last_commit_msg && `Last commit: "${project.last_commit_msg}" by ${project.last_commit_author || 'unknown'}`,
      project.github_url && `GitHub: ${project.github_url}`,
    ].filter(Boolean).join('\n')

    let repoContext = ''
    if (project.local_path) {
      const exists = await access(project.local_path).then(() => true).catch(() => false)
      if (exists) {
        // Primer state is richest — prefer it
        try {
          repoContext = await readFile(join(project.local_path, '.primer/STATE.md'), 'utf8')
          repoContext = repoContext.slice(0, 4000)
        } catch {
          // Fall back to README
          for (const name of ['README.md', 'readme.md', 'README.txt']) {
            try {
              repoContext = (await readFile(join(project.local_path, name), 'utf8')).slice(0, 3000)
              break
            } catch {}
          }
        }
      }
    }

    const systemContext = `You are an expert assistant with deep knowledge of the following project. Answer questions accurately and concisely. You can help with code review, architecture decisions, debugging, planning, and anything project-related. Be direct — no filler.

=== PROJECT METADATA ===
${metaParts}
${repoContext ? `\n=== PROJECT STATE ===\n${repoContext}` : ''}`

    // Build conversation prompt
    const history = messages.map(m =>
      `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`
    ).join('\n\n')

    const prompt = `${systemContext}\n\n---\n\n${history}\n\nAssistant:`

    // SSE streaming response
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders()

    const proc = spawn('claude', ['-p', prompt], { encoding: 'utf8' })

    const send = (obj) => {
      if (!reply.raw.writableEnded) reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`)
    }

    proc.stdout.on('data', chunk => send({ text: chunk.toString() }))
    proc.stderr.on('data', chunk => console.error('[chat]', chunk.toString().trim()))
    proc.on('close', () => {
      if (!reply.raw.writableEnded) {
        reply.raw.write('data: [DONE]\n\n')
        reply.raw.end()
      }
    })
    proc.on('error', err => {
      send({ error: err.message })
      if (!reply.raw.writableEnded) { reply.raw.write('data: [DONE]\n\n'); reply.raw.end() }
    })

    req.raw.on('close', () => proc.kill())
  })

  app.post('/api/projects/:slug/primer', async (req, reply) => {
    try {
      const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (!project.local_path) return reply.code(422).send({ error: 'No local path — primer requires a local repo' })
      const result = await withAISlot(() => runPrimer(project.local_path))
      await sql`UPDATE projects SET primer_state = ${result.state}, primer_updated_at = now(), updated_at = now() WHERE slug = ${project.slug}`
      return { data: result }
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message })
    }
  })

  app.post('/api/projects/:slug/launch', async (req, reply) => {
    try {
      const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
      if (!project) return reply.code(404).send({ error: 'Not found' })
      if (!project.local_path) return reply.code(422).send({ error: 'No local path — launch requires a local repo' })
      await launchCdp(project.local_path, project.name, project.slug)
      return { data: { launched: true } }
    } catch (err) {
      return reply.code(500).send({ error: err.message })
    }
  })

  app.post('/api/projects/:slug/description', async (req, reply) => {
    try {
      const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
      if (!project) return reply.code(404).send({ error: 'Not found' })
      const description = await withAISlot(() => generateDescription(project))
      if (!description) return reply.code(422).send({ error: 'Could not generate description' })
      await sql`UPDATE projects SET description = ${description}, updated_at = now() WHERE slug = ${project.slug}`
      return { data: { description } }
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message })
    }
  })

  app.post('/api/projects/:slug/synopsis', async (req, reply) => {
    try {
      const [project] = await sql`SELECT * FROM projects WHERE slug = ${req.params.slug}`
      if (!project) return reply.code(404).send({ error: 'Not found' })
      const synopsis = await withAISlot(() => generateSynopsis(project))
      if (!synopsis) return reply.code(422).send({ error: 'Could not generate synopsis — is the `claude` CLI installed and on PATH?' })
      await sql`UPDATE projects SET synopsis = ${synopsis}, updated_at = now() WHERE slug = ${project.slug}`
      return { data: { synopsis } }
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message })
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
