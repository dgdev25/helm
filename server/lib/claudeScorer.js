// server/lib/claudeScorer.js
// ponytail: strategy pattern — ruvectorScorer.js will export the same signature
import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

export async function scoreProjectCrates(project, crates) {
  // Compress crate catalogue: id|name|category|description (first 80 chars)
  const catalogue = crates.map(c =>
    `${c.id}|${c.name}|${c.category}|${(c.description || '').slice(0, 80)}`
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

  const prompt = `You are a Rust dependency advisor. Given a project context and a catalogue of Rust crates, return the top crates most relevant to this project.

PROJECT:
${projectContext}

CRATE CATALOGUE (format: id|name|category|description):
${catalogue}

Return ONLY a JSON array of up to 20 objects, sorted by relevance descending:
[{"crate_id": <number>, "score": <0.0-1.0>, "reason": "<one sentence why>"}]

Rules:
- Only include crates with score >= 0.3
- reason must be specific to this project, not generic
- Return raw JSON only, no markdown, no explanation`

  try {
    const { stdout } = await exec('claude', ['-p', prompt], { timeout: 60000 })
    // Strip any accidental markdown fences
    const json = stdout.replace(/```json|```/g, '').trim()
    const results = JSON.parse(json)
    if (!Array.isArray(results)) return []
    return results
      .filter(r => r.crate_id && typeof r.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  } catch {
    return []
  }
}
