import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('github sync', () => {
  it('maps repo to project shape', async () => {
    const { repoToProject } = await import('./github.js')
    const repo = {
      name: 'my-app',
      full_name: 'user/my-app',
      description: 'A test app',
      html_url: 'https://github.com/user/my-app',
      topics: ['react', 'node'],
      language: 'JavaScript',
      stargazers_count: 5,
      open_issues_count: 2,
      private: false,
      pushed_at: '2026-06-01T12:00:00Z',
      default_branch: 'main'
    }
    const project = repoToProject(repo)
    assert.equal(project.slug, 'my-app')
    assert.equal(project.stars, 5)
    assert.equal(project.open_issues, 2)
    assert.deepEqual(project.topics, ['react', 'node'])
  })
})
