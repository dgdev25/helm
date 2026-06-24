import { useEffect, useRef, useState } from 'react'
import { Chart, DoughnutController, ArcElement, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineController, BarController } from 'chart.js'
import { useStore } from '../store.js'
import StatCard from '../components/StatCard.jsx'
import { formatDistanceToNow } from '../utils/time.js'

Chart.register(DoughnutController, ArcElement, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineController, BarController)

const PALETTE = ['#229971','#cedc00','#93c5fd','#fb923c','#a78bfa','#f87171','#34d399','#fbbf24','#60a5fa','#f472b6']

function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

function useChart(ref, config, deps) {
  const inst = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    if (inst.current) inst.current.destroy()
    inst.current = new Chart(ref.current, config)
    return () => { if (inst.current) inst.current.destroy() }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Analytics() {
  const { projects } = useStore()
  const [syncLog, setSyncLog] = useState([])
  const [syncLogError, setSyncLogError] = useState(null)
  const [weeklyData, setWeeklyData] = useState([])
  const [heatmapData, setHeatmapData] = useState({})
  const [someComputing, setSomeComputing] = useState(false)

  useEffect(() => {
    fetch('/api/sync/log')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(j => setSyncLog(j.data || []))
      .catch(e => setSyncLogError(e.message))
  }, [])

  // Fetch commit-activity for all slugged projects and aggregate
  useEffect(() => {
    const slugged = projects.filter(p => p.slug)
    if (!slugged.length) return

    const WEEKS = 12
    Promise.all(
      slugged.map(p =>
        fetch(`/api/projects/${p.slug}/commit-activity?weeks=${WEEKS}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then(results => {
      let computing = false
      // weekMap: isoWeek -> total commits (key = "YYYY-WNN")
      const weekMap = {}
      // heatMap: "YYYY-MM-DD" -> count
      const heatMap = {}

      results.forEach(res => {
        if (!res) return
        if (res.computing) { computing = true; return }
        const rows = res.data || []
        rows.forEach(({ week, commits }) => {
          if (!week) return
          // week is a date string (start of week, e.g. "2024-05-06")
          const d = new Date(week)
          // isoWeek key for weekly trend
          const y = d.getFullYear()
          const weekNum = getISOWeek(d)
          const key = `${y}-W${String(weekNum).padStart(2, '0')}`
          weekMap[key] = (weekMap[key] || 0) + (commits || 0)
          // heatmap: accumulate by exact date (start of week proxy)
          const dateKey = d.toISOString().slice(0, 10)
          heatMap[dateKey] = (heatMap[dateKey] || 0) + (commits || 0)
        })
      })

      setSomeComputing(computing)

      // Build ordered array for the trend chart (last WEEKS weeks)
      const now = new Date()
      const trend = []
      for (let i = WEEKS - 1; i >= 0; i--) {
        const d = new Date(now)
        d.setDate(d.getDate() - i * 7)
        const y = d.getFullYear()
        const wn = getISOWeek(d)
        const key = `${y}-W${String(wn).padStart(2, '0')}`
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        trend.push({ label, commits: weekMap[key] || 0 })
      }
      setWeeklyData(trend)
      setHeatmapData(heatMap)
    })
  }, [projects]) // eslint-disable-line react-hooks/exhaustive-deps

  const active   = projects.filter(p => p.status === 'active').length
  const paused   = projects.filter(p => p.status === 'paused').length
  const archived = projects.filter(p => p.status === 'archived').length
  const issues   = projects.reduce((s, p) => s + (p.open_issues || 0), 0)

  // Language distribution
  const langMap = {}
  projects.forEach(p => { if (p.language) langMap[p.language] = (langMap[p.language] || 0) + 1 })
  const langs = Object.entries(langMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const donutRef  = useRef(null)
  const statusRef = useRef(null)
  const trendRef  = useRef(null)

  useChart(donutRef, {
    type: 'doughnut',
    data: {
      labels: langs.map(([l]) => l),
      datasets: [{ data: langs.map(([, c]) => c), backgroundColor: PALETTE, borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}` } } },
      cutout: '68%',
    }
  }, [projects.length])

  useChart(trendRef, {
    type: 'line',
    data: {
      labels: weeklyData.map(d => d.label),
      datasets: [{
        data: weeklyData.map(d => d.commits),
        borderColor: '#229971',
        backgroundColor: 'rgba(34,153,113,0.12)',
        pointRadius: 3,
        pointBackgroundColor: '#229971',
        tension: 0.35,
        fill: true,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 6 } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 }, beginAtZero: true },
      }
    }
  }, [weeklyData])

  useChart(statusRef, {
    type: 'bar',
    data: {
      labels: ['Active', 'Paused', 'Archived'],
      datasets: [{
        data: [active, paused, archived],
        backgroundColor: ['rgba(16,185,129,0.6)', 'rgba(234,179,8,0.6)', 'rgba(100,116,139,0.6)'],
        borderColor: ['#34d399', '#fbbf24', '#64748b'],
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 }, beginAtZero: true },
      }
    }
  }, [active, paused, archived])

  const heatColor = (v) => {
    if (v === 0) return 'var(--surface)'
    if (v === 1) return 'rgba(34,153,113,0.3)'
    if (v === 2) return 'rgba(34,153,113,0.5)'
    if (v === 3) return 'rgba(34,153,113,0.7)'
    return '#229971'
  }

  const cardStyle = { padding: 20 }
  const sectionTitle = { fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }

  return (
    <div style={{ padding: '0 0 60px' }}>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--surface-border)', padding: '12px 28px', marginBottom: 28 }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Analytics</span>
      </div>

      <div style={{ padding: '0 28px' }}>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Total Projects" value={projects.length} />
          <StatCard label="Active" value={active} accent="var(--status-active-text)" />
          <StatCard label="Open Issues" value={issues} accent="#fb923c" />
          <StatCard label="Languages" value={langs.length} accent="var(--accent)" />
        </div>

        {/* Heatmap */}
        <div className="glass animate-in" style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 10 }}>
            Commit Heatmap — Last 52 Weeks
            {someComputing && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>⚠ Some projects still computing</span>}
          </h3>
          {(() => {
            // Build a 52-week × 7-day grid anchored to today
            const today = new Date()
            const cells = []
            // Go back 52 weeks from the Sunday on or before today
            const dow = today.getDay() // 0=Sun
            const gridEnd = new Date(today)
            gridEnd.setDate(gridEnd.getDate() - dow) // last Sunday
            for (let w = 51; w >= 0; w--) {
              for (let d = 0; d < 7; d++) {
                const cell = new Date(gridEnd)
                cell.setDate(gridEnd.getDate() - w * 7 + d)
                const key = cell.toISOString().slice(0, 10)
                cells.push({ key, v: heatmapData[key] || 0 })
              }
            }
            const hasAny = Object.values(heatmapData).some(v => v > 0)
            if (!hasAny) {
              return (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '8px 0' }}>
                  No commit activity data yet — data loads as projects sync.
                </div>
              )
            }
            return (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(52, 12px)', gridTemplateRows: 'repeat(7, 12px)', gap: 2, width: 'fit-content' }}>
                  {cells.map(({ key, v }) => (
                    <div
                      key={key}
                      title={`${key}: ${v} commit${v !== 1 ? 's' : ''}`}
                      style={{ width: 12, height: 12, borderRadius: 2, background: heatColor(v) }}
                    />
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Charts row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div className="glass animate-in" style={cardStyle}>
            <h3 style={sectionTitle}>Languages</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'center' }}>
              <div style={{ height: 200 }}><canvas ref={donutRef} /></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {langs.slice(0, 8).map(([l, c], i) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                      <span style={{ color: 'var(--text)' }}>{l}</span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass animate-in" style={cardStyle}>
            <h3 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 10 }}>
              Weekly Commit Trend
              {someComputing && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)' }}>⚠ computing…</span>}
            </h3>
            {weeklyData.length > 0
              ? <div style={{ height: 200 }}><canvas ref={trendRef} /></div>
              : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>⬛</span>
                  <span>Loading commit history…</span>
                </div>
            }
          </div>
        </div>

        {/* Charts row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="glass animate-in" style={cardStyle}>
            <h3 style={sectionTitle}>Project Status</h3>
            <div style={{ height: 200 }}><canvas ref={statusRef} /></div>
          </div>

          <div className="glass animate-in" style={cardStyle}>
            <h3 style={sectionTitle}>Recent Sync Log</h3>
            {syncLog.length === 0
              ? <p style={{ color: syncLogError ? 'var(--danger)' : 'var(--text-muted)', fontSize: '0.82rem' }}>{syncLogError ? `Failed to load: ${syncLogError}` : 'No sync history yet.'}</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {syncLog.slice(0, 8).map((entry, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 7 ? '1px solid var(--surface-border)' : 'none', fontSize: '0.75rem', gap: 12 }}>
                      <span style={{ color: entry.status === 'error' ? 'var(--danger)' : 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.message || `sync — ${entry.projects_updated ?? 0} updated`}
                      </span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatDistanceToNow(entry.synced_at)}</span>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
