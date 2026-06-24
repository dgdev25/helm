// server/routes/crateLinks.js
import sql from '../db.js'
import { withAISlot } from '../lib/aiSlot.js'
import { scoreProjectCrates } from '../lib/claudeScorer.js'

export default async function crateLinksRoutes(app) {

  // AI suggest — idempotent, upserts results
  app.post('/api/projects/:slug/suggest-crates', async (req, reply) => {
    const { slug } = req.params
    const [project] = await sql`SELECT * FROM projects WHERE slug = ${slug}`
    if (!project) return reply.code(404).send({ error: 'Project not found' })

    const crates = await sql`SELECT id, name, description, category FROM crate_library ORDER BY name`
    if (!crates.length) return reply.code(422).send({ error: 'No crates in library — import some first' })

    const results = await withAISlot(() => scoreProjectCrates(project, crates))
    if (!results.length) return reply.code(422).send({ error: 'Scorer returned no results' })

    for (const r of results) {
      await sql`
        INSERT INTO project_crate_links (project_slug, crate_id, score, reason, source)
        VALUES (${slug}, ${r.crate_id}, ${r.score}, ${r.reason}, 'ai')
        ON CONFLICT (project_slug, crate_id) DO UPDATE SET
          score  = EXCLUDED.score,
          reason = EXCLUDED.reason,
          source = 'ai'
        WHERE project_crate_links.pinned = false
      `
    }

    // Return saved links with crate info
    const saved = await sql`
      SELECT l.*, c.name AS crate_name, c.category AS crate_category
      FROM project_crate_links l
      JOIN crate_library c ON c.id = l.crate_id
      WHERE l.project_slug = ${slug}
      ORDER BY l.score DESC
    `
    return { data: { saved: results.length, results: saved } }
  })

  // List links for a project
  app.get('/api/projects/:slug/crates', async (req) => {
    const { slug } = req.params
    const links = await sql`
      SELECT l.*, c.name, c.version, c.category, c.description, c.crates_io_url, c.docs_url
      FROM project_crate_links l
      JOIN crate_library c ON c.id = l.crate_id
      WHERE l.project_slug = ${slug}
      ORDER BY l.pinned DESC, l.score DESC
    `
    return { data: links }
  })

  // Manual link
  app.post('/api/projects/:slug/crates', async (req, reply) => {
    const { slug } = req.params
    const { crate_id } = req.body || {}
    if (!crate_id) return reply.code(422).send({ error: 'crate_id required' })
    const [link] = await sql`
      INSERT INTO project_crate_links (project_slug, crate_id, score, source, pinned)
      VALUES (${slug}, ${crate_id}, 1.0, 'manual', true)
      ON CONFLICT (project_slug, crate_id) DO UPDATE SET pinned = true, source = 'manual'
      RETURNING *
    `
    return { data: link }
  })

  // Update link (pin/unpin, edit reason)
  app.patch('/api/projects/:slug/crates/:linkId', async (req, reply) => {
    const { linkId } = req.params
    const { pinned, reason } = req.body || {}
    const updates = {}
    if (pinned !== undefined) updates.pinned = pinned
    if (reason !== undefined) updates.reason = reason
    if (!Object.keys(updates).length) return reply.code(422).send({ error: 'Nothing to update' })
    const [link] = await sql`
      UPDATE project_crate_links SET ${sql(updates)} WHERE id = ${linkId} RETURNING *
    `
    if (!link) return reply.code(404).send({ error: 'Link not found' })
    return { data: link }
  })

  // Remove link
  app.delete('/api/projects/:slug/crates/:linkId', async (req, reply) => {
    const { linkId } = req.params
    const [row] = await sql`DELETE FROM project_crate_links WHERE id = ${linkId} RETURNING id`
    if (!row) return reply.code(404).send({ error: 'Link not found' })
    return { data: { deleted: row.id } }
  })
}
