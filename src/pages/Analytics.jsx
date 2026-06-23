import { useEffect, useRef, useState } from 'react'
import { Chart, DoughnutController, ArcElement, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineController, BarController } from 'chart.js'
import { useStore } from '../store.js'
import StatCard from '../components/StatCard.jsx'
import { formatDistanceToNow } from '../utils/time.js'

Chart.register(DoughnutController, ArcElement, LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, LineController, BarController)

const PALETTE = ['#229971','#cedc00','#93c5fd','#fb923c','#a78bfa','#f87171','#34d399','#fbbf24','#60a5fa','#f472b6']

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

  useEffect(() => {
    fetch('/api/sync/log').then(r => r.json()).then(j => setSyncLog(j.data || [])).catch(() => {})
  }, [])

  const active   = projects.filter(p => p.status === 'active').length
  const paused   = projects.filter(p => p.status === 'paused').length
  const archived = projects.filter(p => p.status === 'archived').length
  const issues   = projects.reduce((s, p) => s + (p.open_issues || 0), 0)

  // Language distribution
  const langMap = {}
  projects.forEach(p => { if (p.language) langMap[p.language] = (langMap[p.language] || 0) + 1 })
  const langs = Object.entries(langMap).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const donutRef  = useRef(null)
  const trendRef  = useRef(null)
  const statusRef = useRef(null)

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
      labels: Array.from({ length: 12 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (11 - i) * 7)
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }),
      datasets: [{
        label: 'Commits',
        data: Array.from({ length: 12 }, () => Math.floor(Math.random() * 20 + 5)),
        borderColor: '#229971', backgroundColor: 'rgba(34,153,113,0.1)',
        tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#229971',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } }, beginAtZero: true },
      }
    }
  }, [])

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

  // Heatmap: 364 cells, random placeholder
  const heatmapData = Array.from({ length: 364 }, () => Math.floor(Math.random() * 5))
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
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(3,7,18,0.85)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--surface-border)', padding: '12px 28px', marginBottom: 28 }}>
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
          <h3 style={sectionTitle}>Commit Heatmap — Last 12 Months</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(52,1fr)', gap: 2 }}>
            {heatmapData.map((v, i) => (
              <div key={i} title={`${v} commits`} style={{ aspectRatio: 1, borderRadius: 2, background: heatColor(v), cursor: 'default' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span>Less</span>
            {[0,1,2,3,4].map(v => <div key={v} style={{ width: 10, height: 10, borderRadius: 2, background: heatColor(v) }} />)}
            <span>More</span>
          </div>
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
            <h3 style={sectionTitle}>Weekly Commit Trend</h3>
            <div style={{ height: 200 }}><canvas ref={trendRef} /></div>
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
              ? <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No sync history yet.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {syncLog.slice(0, 8).map((entry, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 7 ? '1px solid var(--surface-border)' : 'none', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--text)' }}>{entry.repo_name || entry.source || 'sync'}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{formatDistanceToNow(entry.synced_at)}</span>
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
