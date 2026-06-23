// server/sync.js
import { syncGitHub } from './github.js'
import { scanLocalDirs } from './localscanner.js'
import 'dotenv/config'

export function startScheduler() {
  const hours = Math.max(1, Number(process.env.SYNC_INTERVAL_HOURS) || 6)
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
}
