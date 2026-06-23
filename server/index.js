import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import cors from '@fastify/cors'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import 'dotenv/config'
import { startScheduler } from './sync.js'
import projectRoutes from './routes/projects.js'

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

app.get('/api/settings', async () => ({
  data: {
    localScanDirs:    (process.env.LOCAL_SCAN_DIRS || '').split(',').filter(Boolean),
    githubUsernames:  process.env.GITHUB_USERNAMES || '',
    githubToken:      process.env.GITHUB_TOKEN ? '••••••••' + process.env.GITHUB_TOKEN.slice(-4) : '',
    syncIntervalHours: process.env.SYNC_INTERVAL_HOURS || '6',
  }
}))

// ponytail: settings PATCH is a stub — wiring live env writes is out of scope
app.patch('/api/settings', async () => ({ data: { ok: true } }))

await app.register(projectRoutes)

startScheduler()

await app.listen({ port: Number(process.env.PORT ?? process.env.BACKEND_PORT ?? '47821') })
