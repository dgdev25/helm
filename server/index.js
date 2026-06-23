import Fastify from 'fastify'
import staticPlugin from '@fastify/static'
import cors from '@fastify/cors'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import 'dotenv/config'
import { startScheduler } from './sync.js'
import { syncGitHub } from './github.js'
import { scanLocalDirs } from './localscanner.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'

const app = Fastify({ logger: true })

await app.register(cors, { origin: isDev ? 'http://localhost:7338' : false })

if (!isDev) {
  await app.register(staticPlugin, {
    root: join(__dirname, '../dist'),
    prefix: '/'
  })
}

app.get('/api/health', async () => ({ data: { ok: true } }))

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

startScheduler()

await app.listen({ port: Number(process.env.PORT) || 7337 })
