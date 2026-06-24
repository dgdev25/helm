import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, access } from 'fs/promises'
import { join } from 'path'

const execFileAsync = promisify(execFile)

async function readLocalContent(localPath) {
  for (const name of ['README.md', 'readme.md', 'README.txt', 'README']) {
    try {
      const content = await readFile(join(localPath, name), 'utf8')
      return content.slice(0, 4000)
    } catch {}
  }
  try {
    const pkg = JSON.parse(await readFile(join(localPath, 'package.json'), 'utf8'))
    if (pkg.description) return `package.json description: ${pkg.description}`
  } catch {}
  return null
}

export async function generateDescription(project) {
  let content = null

  if (project.local_path) {
    // Skip if path no longer exists on disk — avoids burning an AI slot on a ghost repo
    const exists = await access(project.local_path).then(() => true).catch(() => false)
    if (exists) content = await readLocalContent(project.local_path)
  }

  if (!content && project.github_full_name && process.env.GITHUB_TOKEN) {
    try {
      const { octokit } = await import('./github.js')
      const [owner, repo] = project.github_full_name.split('/')
      const { data } = await octokit.rest.repos.getReadme({ owner, repo })
      content = Buffer.from(data.content, 'base64').toString('utf8').slice(0, 3000)
    } catch {}
  }

  // Fallback: synthesise from whatever metadata we have — always have at least the name
  if (!content) {
    const meta = [
      project.language && `Language: ${project.language}`,
      project.topics?.length && `Topics: ${project.topics.join(', ')}`,
    ].filter(Boolean).join('\n')
    content = meta || `Project name: ${project.name}`
  }

  const prompt = `Project name: ${project.name}\n\n${content}\n\nWrite a single short sentence (max 15 words) for this project's GitHub About field. Describe what it does, not what it is. Return only the sentence.`

  const { stdout } = await execFileAsync(
    'claude', ['-p', prompt],
    { timeout: 30000, encoding: 'utf8' }
  )
  return stdout.trim() || null
}

export async function generateSynopsis(project) {
  let content = null

  if (project.local_path) {
    content = await readLocalContent(project.local_path)
  }

  if (!content && project.github_full_name && process.env.GITHUB_TOKEN) {
    try {
      const { octokit } = await import('./github.js')
      const [owner, repo] = project.github_full_name.split('/')
      const { data } = await octokit.rest.repos.getReadme({ owner, repo })
      content = Buffer.from(data.content, 'base64').toString('utf8').slice(0, 4000)
    } catch {}
  }

  if (!content && project.description) content = project.description
  if (!content) return null

  const prompt = `Project: ${project.name}\n\n${content}\n\nWrite a single sentence (max 20 words) describing what this project does. Be specific. Return only the sentence, no punctuation beyond a period.`

  const { stdout } = await execFileAsync(
    'claude', ['-p', prompt],
    { timeout: 30000, encoding: 'utf8' }
  )
  return stdout.trim() || null
}
