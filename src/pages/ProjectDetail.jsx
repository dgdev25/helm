import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, BarController } from 'chart.js'
import { useStore } from '../store.js'
import { formatDistanceToNow } from '../utils/time.js'
import { safeHref } from '../utils/safeHref.js'
import StatusPill from '../components/StatusPill.jsx'
import TopicChip from '../components/TopicChip.jsx'
import CommitList from '../components/CommitList.jsx'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, BarController)

async function fetchProject(slug) {
  const res = await fetch(`/api/projects/${slug}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Not found')
  return json.data
}

export default function ProjectDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { patchProject, projects } = useStore()
  const chartRef = useRef(null)
  const chartInstance = useRef(null)

  const [project, setProject] = useState(() => projects.find(p => p.slug === slug) || null)
  const [loading, setLoading] = useState(!project)
  const [error, setError] = useState(null)
  const [statusVal, setStatusVal] = useState(project?.status || 'active')
  const [deleting, setDeleting] = useState(false)
  const [activity, setActivity] = useState(null) // null = loading, [] = no data
  const [primer, setPrimer] = useState(null)
  const [primerRunning, setPrimerRunning] = useState(false)
  const [primerError, setPrimerError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setStatusVal('')
    fetchProject(slug)
      .then(p => { setProject(p); setStatusVal(p.status); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [slug])

  // Fetch real commit activity from git log / GitHub API
  useEffect(() => {
    fetch(`/api/projects/${slug}/commit-activity`)
      .then(r => r.json())
      .then(j => setActivity(j.computing ? 'computing' : (j.data || [])))
      .catch(() => setActivity([]))
  }, [slug])

  useEffect(() => {
    // Always destroy previous instance before branching (canvas may be replaced by empty-state div)
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null }
    if (!chartRef.current || !Array.isArray(activity)) return
    chartInstance.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels: activity.map(w => w.label),
        datasets: [{
          label: 'Commits',
          data: activity.map(w => w.count),
          backgroundColor: 'rgba(34,153,113,0.5)',
          borderColor: '#229971',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => items[0].label } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', font: { size: 10 }, stepSize: 1 }, beginAtZero: true, min: 0 },
        }
      }
    })
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null } }
  }, [activity])

  const handleStatusChange = async (newStatus) => {
    setStatusVal(newStatus)
    try {
      await patchProject(slug, { status: newStatus })
      setProject(p => ({ ...p, status: newStatus }))
    } catch (e) {
      setError(e.message)
    }
  }

  const handlePrimer = async () => {
    setPrimerRunning(true)
    setPrimerError(null)
    try {
      const res = await fetch(`/api/projects/${slug}/primer`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Primer failed')
      setPrimer(json.data.state)
    } catch (e) {
      setPrimerError(e.message)
    } finally {
      setPrimerRunning(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Remove "${project.name}" from dashboard? This does not delete the actual repository.`)) return
    setDeleting(true)
    try {
      await fetch(`/api/projects/${slug}`, { method: 'DELETE' })
      navigate('/')
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  if (loading) return (
    <div style={{ padding: '0 0 60px' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--surface-border)', padding: '12px 28px' }}>
        <div className="skeleton" style={{ height: 14, width: 200 }} />
      </div>
      <div style={{ padding: '32px 28px 0', marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 14 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="skeleton" style={{ height: 22, width: '40%' }} />
            <div className="skeleton" style={{ height: 14, width: '70%' }} />
            <div className="skeleton" style={{ height: 12, width: '30%' }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, padding: '0 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="glass skeleton" style={{ height: 200 }} />
          <div className="glass skeleton" style={{ height: 120 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass skeleton" style={{ height: 90 }} />
          <div className="glass skeleton" style={{ height: 120 }} />
        </div>
      </div>
    </div>
  )
  if (error || !project) return (
    <div style={{ padding: 40, color: 'var(--danger)' }}>{error || 'Project not found'}</div>
  )

  const p = project

  return (
    <div style={{ padding: '0 0 60px' }}>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--surface-border)', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link to="/" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}>Projects</Link>
        <span style={{ color: 'var(--text-dim)' }}>/</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>{p.name}</span>
      </div>

      {/* Hero */}
      <div style={{ padding: '32px 28px 0', borderBottom: '1px solid var(--surface-border)', background: 'var(--gradient-surf)', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--primary-glow)', border: '1px solid rgba(34,153,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
            {p.github_url ? '⎇' : '◉'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>{p.name}</h1>
              <StatusPill status={p.status || 'active'} />
              {p.is_private && <span style={{ fontSize: '0.65rem', padding: '2px 7px', borderRadius: 9999, background: 'var(--surface)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)' }}>private</span>}
            </div>
            {p.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 10 }}>{p.description}</p>}
            <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              {p.language && <span style={{ color: '#93c5fd' }}>{p.language}</span>}
              {p.stars > 0 && <span>★ {p.stars}</span>}
              {p.last_commit_at && <span>Last commit {formatDistanceToNow(p.last_commit_at)}</span>}
              {p.local_path && <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{p.local_path}</span>}
            </div>
          </div>
        </div>
        {(p.topics || []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 20 }}>
            {p.topics.map(t => <TopicChip key={t} label={t} />)}
          </div>
        )}
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, padding: '0 28px', alignItems: 'start' }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Commit activity */}
          <div className="glass" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Commit Activity (12 weeks)</h3>
            {activity === null
              ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>
              : activity === 'computing'
                ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>GitHub is computing stats — check back in a moment</div>
                : activity.every(w => w.count === 0)
                  ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No commits in the last 12 weeks</div>
                  : <div style={{ height: 160 }}><canvas ref={chartRef} /></div>
            }
          </div>

          {/* Recent commits */}
          <div className="glass" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Recent Commits</h3>
            <CommitList project={p} />
          </div>

          {/* Primer output */}
          {primer && (
            <div className="glass" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600 }}>✦ Project Primer</h3>
                <button
                  onClick={() => setPrimer(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  ✕
                </button>
              </div>
              <pre style={{
                fontSize: '0.75rem', lineHeight: 1.7, color: 'var(--text-muted)',
                fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                margin: 0, maxHeight: 600, overflowY: 'auto',
              }}>
                {primer}
              </pre>
              <button
                onClick={handlePrimer}
                disabled={primerRunning}
                style={{ marginTop: 14, background: 'none', border: '1px dashed var(--surface-border)', borderRadius: 6, padding: '4px 12px', fontSize: '0.72rem', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
              >
                {primerRunning ? 'Running…' : '↻ Re-run'}
              </button>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Status */}
          <div className="glass" style={{ padding: 18 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>Status</div>
            <select
              value={statusVal}
              onChange={e => handleStatusChange(e.target.value)}
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: '0.82rem', outline: 'none' }}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Info */}
          <div className="glass" style={{ padding: 18 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>Info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Source', p.github_url ? 'GitHub' : 'Local'],
                p.open_issues > 0 && ['Issues', p.open_issues],
                p.open_prs > 0 && ['PRs', p.open_prs],
                p.stars > 0 && ['Stars', p.stars],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--text)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Links */}
          {p.github_url && (
            <div className="glass" style={{ padding: 18 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>Links</div>
              <a href={safeHref(p.github_url)} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', display: 'block', marginBottom: 6 }}>
                GitHub repository ↗
              </a>
              {p.homepage && (
                <a href={safeHref(p.homepage)} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', display: 'block' }}>
                  Homepage ↗
                </a>
              )}
            </div>
          )}

          {/* Primer */}
          {p.local_path && (
            <div className="glass" style={{ padding: 18 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>Project Primer</div>
              <button
                onClick={handlePrimer}
                disabled={primerRunning}
                style={{
                  width: '100%', padding: '8px 14px', background: 'var(--gradient-btn)',
                  border: '1px solid rgba(34,153,113,0.2)', borderRadius: 8, color: '#fff',
                  fontSize: '0.8rem', cursor: primerRunning ? 'wait' : 'pointer',
                  fontFamily: "'Space Grotesk',sans-serif", transition: 'var(--fast)',
                  opacity: primerRunning ? 0.7 : 1,
                }}
              >
                {primerRunning ? '✦ Running primer…' : '✦ Run /primers'}
              </button>
              {primerError && <p style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: 8 }}>{primerError}</p>}
            </div>
          )}

          {/* Danger zone */}
          <div className="glass" style={{ padding: 18, borderColor: 'var(--danger-border)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--danger)', marginBottom: 12 }}>Danger Zone</div>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ width: '100%', padding: '8px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
            >
              {deleting ? 'Removing…' : 'Remove from Dashboard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
