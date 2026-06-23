import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import sql from '../db.js'
import projectRoutes from './projects.js'

describe('GET /api/projects', () => {
  let app

  before(async () => {
    app = Fastify()
    await app.register(projectRoutes)
    // Seed one project
    await sql`DELETE FROM projects WHERE slug = 'test-project'`
    await sql`INSERT INTO projects (name, slug, description, status) VALUES ('Test Project', 'test-project', 'A test', 'active')`
  })

  after(async () => {
    await sql`DELETE FROM projects WHERE slug = 'test-project'`
    await sql.end()
    await app.close()
  })

  it('returns project list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body)
    assert.ok(Array.isArray(body.data))
    assert.ok(body.data.some(p => p.slug === 'test-project'))
  })

  it('returns single project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/test-project' })
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).data.slug, 'test-project')
  })

  it('404 for unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/does-not-exist' })
    assert.equal(res.statusCode, 404)
  })
})
