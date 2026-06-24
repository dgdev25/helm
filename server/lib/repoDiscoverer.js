// server/lib/repoDiscoverer.js
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export async function generateRepoQueries(project) {
  const projectContext = [
    `Name: <project-name>${(project.name || '').replace(/[<>]/g, '')}</project-name>`,
    `Language: ${project.language || 'unknown'}`,
    `Topics: ${(project.topics || []).join(', ') || 'none'}`,
    `Description: <project-desc>${(project.description || '').replace(/[<>]/g, '')}</project-desc>`,
    project.primer_state
      ? `Primer (truncated):\n${project.primer_state.slice(0, 2000)}`
      : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are a software discovery assistant. Given a project, generate GitHub repository search queries that will surface the most relevant open-source repositories.

PROJECT:
${projectContext}

Generate 3 to 5 concise GitHub search queries that would surface useful libraries, tools, frameworks, or reference implementations for this project.

Rules:
- Each query should be 2-5 words, suitable for GitHub's search bar
- Vary the angle: cover core stack, tooling, protocols, and domain
- Prefer queries that match the project's primary language (e.g. append "rust" or "typescript" where useful)
- Return ONLY a JSON array of strings, no explanation:
["query one", "query two", "query three"]`

  try {
    const { stdout } = await exec('claude', ['-p', prompt], { timeout: 30000 })
    const json = stdout.replace(/```json|```/g, '').trim()
    const queries = JSON.parse(json)
    if (!Array.isArray(queries)) return []
    return queries.filter(q => typeof q === 'string').slice(0, 5)
  } catch {
    return []
  }
}
