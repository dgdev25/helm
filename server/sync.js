// server/sync.js
import { syncGitHub } from './github.js'
import { scanLocalDirs } from './localscanner.js'
import { getSetting } from './settings.js'
import 'dotenv/config'

export async function startScheduler() {
  const hours = Math.max(1, Number(await getSetting('sync_interval_hours')) || 6)
  const ms = hours * 60 * 60 * 1000

  const run = async () => {
    console.log('[sync] Starting scheduled sync...')
    try {
      const count = await syncGitHub()
      console.log(`[sync] GitHub done — ${count} projects updated`)
    } catch (err) {
      console.error('[sync] GitHub sync failed:', err.message)
    }
    try {
      const local = await scanLocalDirs()
      console.log(`[sync] Local scan done — ${local} repos`)
    } catch (err) {
      console.error('[sync] Local scan failed:', err.message)
    }
  }

  setInterval(run, ms)
  console.log(`[sync] Scheduler started — every ${hours}h`)

  // Boot: run a cheap local scan immediately (fire-and-forget) so tracked repos appear without
  // waiting for the first interval. GitHub sync stays on the interval to avoid hitting the API
  // hard on restart loops.
  scanLocalDirs()
    .then(c => console.log(`[sync] boot local scan — ${c} repos`))
    .catch(e => console.error('[sync] boot local scan failed:', e.message))
}
