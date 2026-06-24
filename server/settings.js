// server/settings.js
// ponytail: key/value settings in the `settings` table, with .env as the first-run default.
// DB overrides env once a value is saved. The GitHub token stays env-only (secret; Octokit
// is built from it at import), so it is intentionally not a key here.
import sql from './db.js'
import 'dotenv/config'

const DEFAULTS = {
  local_scan_dirs: process.env.LOCAL_SCAN_DIRS || '',
  github_usernames: process.env.GITHUB_USERNAMES || '',
  sync_interval_hours: process.env.SYNC_INTERVAL_HOURS || '6',
  app_name: 'Helm',
}

export async function getSettings() {
  const rows = await sql`SELECT key, value FROM settings`
  const fromDb = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return { ...DEFAULTS, ...fromDb }
}

export async function getSetting(key) {
  const [row] = await sql`SELECT value FROM settings WHERE key = ${key}`
  return row?.value ?? DEFAULTS[key]
}

export async function setSettings(partial) {
  for (const [key, value] of Object.entries(partial)) {
    if (!(key in DEFAULTS)) continue // ignore unknown keys
    await sql`
      INSERT INTO settings (key, value) VALUES (${key}, ${String(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `
  }
}
