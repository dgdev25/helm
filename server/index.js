import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import cors from '@fastify/cors'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import 'dotenv/config'
import sql from './db.js'
import { startScheduler } from './sync.js'
import { getSettings, setSettings } from './settings.js'
import projectRoutes from './routes/projects.js'
import cratesRoutes from './routes/crates.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'

const app = Fastify({ logger: true })

const frontendPort = process.env.FRONTEND_PORT ?? '47621'
await app.register(cors, { origin: isDev ? `http://localhost:${frontendPort}` : false })

if (!isDev) {
  await app.register(staticPlugin, {
    root: join(__dirname, '../dist'),
    prefix: '/'
  })
}

app.get('/api/health', async () => ({ data: { ok: true } }))

app.get('/api/settings', async () => {
  const s = await getSettings()
  return {
    data: {
      localScanDirs:    s.local_scan_dirs.split(',').map(d => d.trim()).filter(Boolean),
      githubUsernames:  s.github_usernames,
      githubToken:      process.env.GITHUB_TOKEN ? '••••••••' + process.env.GITHUB_TOKEN.slice(-4) : '',
      syncIntervalHours: s.sync_interval_hours,
    }
  }
})

app.patch('/api/settings', async (req, reply) => {
  const b = req.body || {}
  await setSettings({
    ...(b.localScanDirs != null && { local_scan_dirs: Array.isArray(b.localScanDirs) ? b.localScanDirs.join(',') : b.localScanDirs }),
    ...(b.githubUsernames != null && { github_usernames: b.githubUsernames }),
    ...(b.syncIntervalHours != null && { sync_interval_hours: String(b.syncIntervalHours) }),
  })
  return { data: { ok: true } }
})

await app.register(projectRoutes)
await app.register(cratesRoutes)

// Bootstrapping: apply the full schema (all statements are IF NOT EXISTS / ON CONFLICT,
// so this is idempotent and safe on every boot — including a fresh empty DB).
await sql.file(join(__dirname, 'schema.sql')).catch(err => {
  app.log.error({ err }, 'schema bootstrap failed')
  throw err
})

startScheduler()

// ponytail: bind localhost by default — this app has no auth and exposes destructive/subprocess endpoints.
// Set HOST=0.0.0.0 (plus auth) only if you intentionally deploy it remotely.
await app.listen({ port: Number(process.env.PORT ?? process.env.BACKEND_PORT ?? '47821'), host: process.env.HOST ?? '127.0.0.1' })
