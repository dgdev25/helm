// server/lib/repoScorer.js
// ponytail: strategy pattern — swap this for ruvectorRepoScorer.js when embeddings are ready
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export async function scoreProjectRepos(project, repos) {
  const catalogue = repos.map(r =>
    `${r.id}|${r.full_name}|${r.language || 'unknown'}|${(r.description || '').slice(0, 100)}`
  ).join('\n')

  const projectContext = [
    `Name: <project-name>${(project.name || '').replace(/[<>]/g, '')}</project-name>`,
    `Language: ${project.language || 'unknown'}`,
    `Topics: ${(project.topics || []).join(', ') || 'none'}`,
    `Description: <project-desc>${(project.description || '').replace(/[<>]/g, '')}</project-desc>`,
    project.primer_state
      ? `\nPrimer (truncated):\n${project.primer_state.slice(0, 3000)}`
      : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are a software project advisor. Given a project context and a list of GitHub repositories, identify which repos are most relevant and useful to this project.

PROJECT:
${projectContext}

REPO CATALOGUE (format: id|full_name|language|description):
${catalogue}

Return ONLY a JSON array of up to 20 objects, sorted by relevance descending:
[{"repo_id": <number>, "score": <0.0-1.0>, "reason": "<one sentence why this repo is relevant to this specific project>"}]

Rules:
- Only include repos with score >= 0.3
- reason must be specific to this project, not generic
- Prefer repos in the same language as the project or that provide useful tooling
- Return raw JSON only, no markdown, no explanation`

  try {
    const { stdout } = await exec('claude', ['-p', prompt], { timeout: 60000 })
    const json = stdout.replace(/```json|```/g, '').trim()
    const results = JSON.parse(json)
    if (!Array.isArray(results)) return []
    return results
      .filter(r => r.repo_id && typeof r.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  } catch {
    return []
  }
}
