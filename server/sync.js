// server/sync.js
import cron from 'node-cron'
import { syncGitHub } from './github.js'
import 'dotenv/config'

export function startScheduler() {
  const hours = Math.max(1, Number(process.env.SYNC_INTERVAL_HOURS) || 6)
  const cronExpr = `0 */${hours} * * *`

  cron.schedule(cronExpr, async () => {
    console.log('[sync] Starting scheduled GitHub sync...')
    try {
      const count = await syncGitHub()
      console.log(`[sync] Done — ${count} projects updated`)
    } catch (err) {
      console.error('[sync] GitHub sync failed:', err.message)
    }
  })

  console.log(`[sync] Scheduler started — every ${hours}h`)
}
