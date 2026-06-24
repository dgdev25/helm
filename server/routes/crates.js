// server/routes/crates.js
import { readFile, readdir, cp, mkdir } from 'fs/promises'
import { join, basename } from 'path'
import sql from '../db.js'

const SCAN_ROOTS = [
  '/mnt/datadisk/repos/rUvnet',
  '/mnt/datadisk/repos/rUvnet/crates',
]

// Auto-categorise by crate name/description keywords
function categorise(name, desc) {
  const s = `${name} ${desc || ''}`.toLowerCase()
  if (s.match(/vector|hnsw|embed|index|search|semantic/)) return 'Vector DB'
  if (s.match(/neural|fann|fann|llm|ai|ml|model|inference|learn/)) return 'Neural / ML'
  if (s.match(/quantum|qudag|qvm|q-space/)) return 'Quantum'
  if (s.match(/agent|swarm|harness|orchestrat|multi-agent|daa/)) return 'Agent / Orchestration'
  if (s.match(/graph|neo4j|dag|knowledge|kg/)) return 'Graph / DAG'
  if (s.match(/stream|lang.?graph|pipe|channel|flow/)) return 'Streaming / Dataflow'
  if (s.match(/crypto|cipher|hash|sign|vault|secure/)) return 'Cryptography'
  if (s.match(/robot|drone|kinematic|motion/)) return 'Robotics'
  if (s.match(/memory|cache|storage|persist|db|sqlite/)) return 'Storage / Memory'
  if (s.match(/wasm|web|http|server|api|rest/)) return 'Web / API'
  return 'Utility'
}

async function parseCargo(tomlPath) {
  try {
    const raw = await readFile(tomlPath, 'utf8')
    const get = (key) => {
      const m = raw.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))
      return m ? m[1] : null
    }
    const name = get('name')
    if (!name) return null
    return {
      name,
      version: get('version'),
      description: get('description'),
    }
  } catch { return null }
}

// Find top-level Cargo.tomls (depth ≤ 2 from root, skip target/node_modules)
async function findCrates(root) {
  const found = []
  try {
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (['target', 'node_modules', '.git'].includes(entry.name)) continue
      const dir = join(root, entry.name)
      const cargoPath = join(dir, 'Cargo.toml')
      const meta = await parseCargo(cargoPath).catch(() => null)
      if (meta) {
        found.push({ ...meta, source_path: dir })
      }
    }
  } catch {}
  return found
}

export default async function cratesRoutes(app) {
  // List all crates in library
  app.get('/api/crates', async (req) => {
    const { search, category, starred } = req.query
    let q = sql`SELECT * FROM crate_library`
    const conditions = []
    if (search) conditions.push(sql`(name ILIKE ${'%' + search + '%'} OR description ILIKE ${'%' + search + '%'})`)
    if (category) conditions.push(sql`category = ${category}`)
    if (starred === 'true') conditions.push(sql`starred = true`)

    const rows = conditions.length
      ? await sql`SELECT * FROM crate_library WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)} ORDER BY starred DESC, name`
      : await sql`SELECT * FROM crate_library ORDER BY starred DESC, name`
    return { data: rows }
  })

  // Scan rUvnet directories and upsert into library
  app.post('/api/crates/scan', async (req, reply) => {
    const found = []
    for (const root of SCAN_ROOTS) {
      const crates = await findCrates(root)
      found.push(...crates)
    }

    // Deduplicate by name (keep the one with a description)
    const deduped = new Map()
    for (const c of found) {
      if (!deduped.has(c.name) || c.description) deduped.set(c.name, c)
    }

    let upserted = 0
    for (const c of deduped.values()) {
      await sql`
        INSERT INTO crate_library (name, version, description, category, source_path, updated_at)
        VALUES (${c.name}, ${c.version}, ${c.description}, ${categorise(c.name, c.description)}, ${c.source_path}, now())
        ON CONFLICT (name) DO UPDATE SET
          version = EXCLUDED.version,
          description = COALESCE(NULLIF(EXCLUDED.description,''), crate_library.description),
          category = EXCLUDED.category,
          source_path = EXCLUDED.source_path,
          updated_at = now()
      `
      upserted++
    }

    return { data: { upserted, total: deduped.size } }
  })

  // Update a crate (star, notes, category)
  app.patch('/api/crates/:id', async (req, reply) => {
    const { starred, notes, category, tags } = req.body
    const updates = {}
    if (starred !== undefined) updates.starred = starred
    if (notes !== undefined) updates.notes = notes
    if (category !== undefined) updates.category = category
    if (tags !== undefined) updates.tags = tags

    const [row] = await sql`
      UPDATE crate_library SET ${sql(updates)}, updated_at = now()
      WHERE id = ${req.params.id} RETURNING *
    `
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return { data: row }
  })

  // Copy crate source into a project's local directory
  app.post('/api/crates/:id/copy', async (req, reply) => {
    const { targetProjectSlug } = req.body
    const [crate] = await sql`SELECT * FROM crate_library WHERE id = ${req.params.id}`
    if (!crate) return reply.code(404).send({ error: 'Crate not found' })
    if (!crate.source_path) return reply.code(422).send({ error: 'No source path on disk' })

    const [project] = await sql`SELECT * FROM projects WHERE slug = ${targetProjectSlug}`
    if (!project?.local_path) return reply.code(422).send({ error: 'Target project has no local path' })

    const dest = join(project.local_path, 'crates', crate.name)
    await mkdir(dest, { recursive: true })
    await cp(crate.source_path, dest, { recursive: true, filter: (src) => !src.includes('/target/') })

    return {
      data: {
        dest,
        tomlSnippet: `${crate.name} = { path = "./crates/${crate.name}" }`,
      }
    }
  })

  // Delete from library (doesn't touch disk)
  app.delete('/api/crates/:id', async (req, reply) => {
    const [row] = await sql`DELETE FROM crate_library WHERE id = ${req.params.id} RETURNING id`
    if (!row) return reply.code(404).send({ error: 'Not found' })
    return { data: { deleted: row.id } }
  })
}
