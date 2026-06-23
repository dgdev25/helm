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

await app.register(projectRoutes)

startScheduler()

await app.listen({ port: Number(process.env.PORT ?? process.env.BACKEND_PORT ?? '47821') })
