import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, BarController } from 'chart.js'
import { useStore } from '../store.js'
import { formatDistanceToNow } from '../utils/time.js'
import { safeHref } from '../utils/safeHref.js'
import StatusPill from '../components/StatusPill.jsx'
import TopicChip from '../components/TopicChip.jsx'
import CommitList from '../components/CommitList.jsx'
import RelatedCrates from '../components/RelatedCrates.jsx'
import RelatedRepos from '../components/RelatedRepos.jsx'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, BarController)

function renderMarkdown(md) {
  if (!md) return null
  const text = md.replace(/<!--[\s\S]*?-->/g, '').trim()
  const lines = text.split('\n')
  const els = []
  let i = 0
  const fmt = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('# ')) {
      els.push(<h1 key={i} className="pm-h1" dangerouslySetInnerHTML={{ __html: fmt(line.slice(2)) }} />)
    } else if (line.startsWith('## ')) {
      els.push(<h2 key={i} className="pm-h2" dangerouslySetInnerHTML={{ __html: fmt(line.slice(3)) }} />)
    } else if (line.startsWith('### ')) {
      els.push(<h3 key={i} className="pm-h3" dangerouslySetInnerHTML={{ __html: fmt(line.slice(4)) }} />)
    } else if (/^[-*] /.test(line)) {
      const items = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(<li key={i} dangerouslySetInnerHTML={{ __html: fmt(lines[i].slice(2)) }} />)
        i++
      }
      els.push(<ul key={`ul-${i}`} className="pm-ul">{items}</ul>)
      continue
    } else if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} dangerouslySetInnerHTML={{ __html: fmt(lines[i].replace(/^\d+\. /, '')) }} />)
        i++
      }
      els.push(<ol key={`ol-${i}`} className="pm-ul">{items}</ol>)
      continue
    } else if (line.trim()) {
      els.push(<p key={i} className="pm-p" dangerouslySetInnerHTML={{ __html: fmt(line) }} />)
    }
    i++
  }
  return els
}

function extractRoadmap(md) {
  if (!md) return ''
  const match = md.match(/## Roadmap[^\n]*\n([\s\S]*?)(?=\n## |$)/)
  return match ? match[1].replace(/<!--[\s\S]*?-->/g, '').trim() : ''
}

function extractSessionLog(md) {
  if (!md) return []
  const match = md.match(/## Session log[^\n]*\n([\s\S]*?)(?=\n## |$)/)
  if (!match) return []
  return match[1].trim().split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim())
    .reverse() // most recent first
}

async function fetchProject(slug) {
  const res = await fetch(`/api/projects/${slug}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Not found')
  return json.data
}

export default function ProjectDetail({ initialTab }) {
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
  const [chartWeeks, setChartWeeks] = useState(12)
  const [primer, setPrimer] = useState(project?.primer_state || null)
  const [primerRunning, setPrimerRunning] = useState(false)
  const [primerError, setPrimerError] = useState(null)
  const [primerUpdatedAt, setPrimerUpdatedAt] = useState(project?.primer_updated_at || null)
  const [synopsis, setSynopsis] = useState(project?.synopsis || null)
  const [synopsisRunning, setSynopsisRunning] = useState(false)
  const [roadmapDiff, setRoadmapDiff] = useState(null) // {removed, added} after a launch refresh
  const [activeTab, setActiveTab] = useState(initialTab || 'Overview')

  useEffect(() => {
    setLoading(true)
    setError(null)
    setStatusVal('')
    fetchProject(slug)
      .then(p => { setProject(p); setStatusVal(p.status); if (p.primer_state) setPrimer(p.primer_state); if (p.primer_updated_at) setPrimerUpdatedAt(p.primer_updated_at); if (p.synopsis) setSynopsis(p.synopsis); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [slug])

  // Fetch real commit activity from git log / GitHub API
  useEffect(() => {
    setActivity(null)
    fetch(`/api/projects/${slug}/commit-activity?weeks=${chartWeeks}`)
      .then(r => r.json())
      .then(j => setActivity(j.computing ? 'computing' : (j.data || [])))
      .catch(() => setActivity([]))
  }, [slug, chartWeeks])

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
      setPrimerUpdatedAt(new Date().toISOString())
    } catch (e) {
      setPrimerError(e.message)
    } finally {
      setPrimerRunning(false)
    }
  }

  const handleLaunch = async () => {
    try {
      const roadmapBefore = extractRoadmap(primer)
      setRoadmapDiff(null)
      const res = await fetch(`/api/projects/${slug}/launch`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Launch failed')

      // Poll until primer_updated_at changes (session finished + primer re-ran), max 20 min
      const baseline = primerUpdatedAt
      const deadline = Date.now() + 20 * 60 * 1000
      const poll = setInterval(async () => {
        if (Date.now() > deadline) { clearInterval(poll); return }
        try {
          const p = await fetchProject(slug)
          if (p.primer_updated_at && p.primer_updated_at !== baseline) {
            setPrimer(p.primer_state)
            setPrimerUpdatedAt(p.primer_updated_at)
            // Diff the roadmap sections
            const roadmapAfter = extractRoadmap(p.primer_state)
            const before = roadmapBefore.split('\n').filter(Boolean)
            const after = roadmapAfter.split('\n').filter(Boolean)
            const removed = before.filter(l => !after.includes(l))
            const added = after.filter(l => !before.includes(l))
            if (removed.length || added.length) setRoadmapDiff({ removed, added })
            clearInterval(poll)
          }
        } catch {}
      }, 5000)
    } catch (e) {
      setPrimerError(e.message)
    }
  }

  const handleSynopsis = async () => {
    setSynopsisRunning(true)
    try {
      const res = await fetch(`/api/projects/${slug}/synopsis`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Synopsis failed')
      setSynopsis(json.data.synopsis)
    } finally {
      setSynopsisRunning(false)
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

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: '0 28px', marginBottom: 24, borderBottom: '1px solid var(--surface-border)' }}>
        {['Overview', 'Crates', 'Repos'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              navigate(
                tab === 'Crates' ? `/projects/${slug}/crates`
                : tab === 'Repos' ? `/projects/${slug}/repos`
                : `/projects/${slug}`
              )
            }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              padding: '10px 16px',
              fontSize: '0.82rem',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: "'Space Grotesk',sans-serif",
              marginBottom: -1,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Crates tab */}
      {activeTab === 'Crates' && (
        <div style={{ padding: '0 28px' }}>
          <RelatedCrates slug={slug} />
        </div>
      )}

      {/* Repos tab */}
      {activeTab === 'Repos' && (
        <div style={{ padding: '0 28px' }}>
          <RelatedRepos slug={slug} />
        </div>
      )}

      {/* Two-column body */}
      {activeTab === 'Overview' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, padding: '0 28px', alignItems: 'start' }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Commit activity */}
          <div className="glass" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Commit Activity</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{w:12,label:'12w'},{w:26,label:'6m'},{w:52,label:'1y'}].map(({w,label}) => (
                  <button key={w} onClick={() => setChartWeeks(w)} style={{ background: chartWeeks===w ? 'var(--primary-glow)' : 'none', border: `1px solid ${chartWeeks===w ? 'var(--primary)' : 'var(--surface-border)'}`, borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', color: chartWeeks===w ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
            </div>
            {activity === null
              ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>
              : activity === 'computing'
                ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>GitHub is computing stats — check back in a moment</div>
                : activity.every(w => w.count === 0)
                  ? <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No commits in the last {chartWeeks === 52 ? '1 year' : chartWeeks === 26 ? '6 months' : '12 weeks'}</div>
                  : <div style={{ height: 160 }}><canvas ref={chartRef} /></div>
            }
          </div>

          {/* Recent commits */}
          <div className="glass" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 16 }}>Recent Commits</h3>
            <CommitList project={p} />
          </div>

          {/* Primer output */}
          {p.local_path && (
            <div className="glass" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 600 }}>✦ Project Primer</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {primerUpdatedAt && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {new Date(primerUpdatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  )}
                  {primer && p.local_path && (
                    <button
                      onClick={handleLaunch}
                      style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', color: '#000', cursor: 'pointer', fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif" }}
                    >
                      ⚡ Launch
                    </button>
                  )}
                  {primer && (
                    <button
                      onClick={handlePrimer}
                      disabled={primerRunning}
                      style={{ background: 'none', border: '1px dashed var(--surface-border)', borderRadius: 6, padding: '3px 10px', fontSize: '0.72rem', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
                    >
                      {primerRunning ? 'Running…' : '↻ Re-run'}
                    </button>
                  )}
                </div>
              </div>
              {primerRunning && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '20px 0' }}>Running /primers on {p.local_path}…</div>
              )}
              {primerError && <p style={{ fontSize: '0.72rem', color: 'var(--danger)', marginBottom: 12 }}>{primerError}</p>}
              {roadmapDiff && (
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--surface-border)', fontSize: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>Roadmap updated after session</div>
                  {roadmapDiff.removed.map((l, i) => <div key={`r${i}`} style={{ color: '#f87171', fontFamily: 'monospace' }}>− {l}</div>)}
                  {roadmapDiff.added.map((l, i) => <div key={`a${i}`} style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>+ {l}</div>)}
                  <button onClick={() => setRoadmapDiff(null)} style={{ marginTop: 8, background: 'none', border: 'none', fontSize: '0.68rem', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}>Dismiss</button>
                </div>
              )}
              {primer && !primerRunning ? (
                <>
                  <div style={{ maxHeight: 600, overflowY: 'auto' }} className="pm-body">
                    {renderMarkdown(primer)}
                  </div>
                  {extractSessionLog(primer).length > 0 && (
                    <details style={{ marginTop: 16 }}>
                      <summary style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                        Session log ({extractSessionLog(primer).length})
                      </summary>
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {extractSessionLog(primer).map((entry, i) => (
                          <div key={i} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: 12, borderLeft: '2px solid var(--surface-border)', fontFamily: 'monospace' }}>
                            {entry}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              ) : !primerRunning && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                  No primer yet — click "✦ Run /primers" in the sidebar to generate one.
                </div>
              )}
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

          {/* Synopsis */}
          <div className="glass" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Synopsis</div>
              <button onClick={handleSynopsis} disabled={synopsisRunning} style={{ background: 'none', border: 'none', fontSize: '0.7rem', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}>
                {synopsisRunning ? '…' : '↻'}
              </button>
            </div>
            {synopsis
              ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55, borderLeft: '2px solid var(--primary)', paddingLeft: 10 }}>{synopsis}</p>
              : <button onClick={handleSynopsis} disabled={synopsisRunning} style={{ background: 'none', border: '1px dashed var(--surface-border)', borderRadius: 6, padding: '5px 12px', fontSize: '0.75rem', color: 'var(--text-dim)', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}>{synopsisRunning ? '✦ Generating…' : '✦ Generate synopsis'}</button>
            }
          </div>

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
      </div>}
    </div>
  )
}
