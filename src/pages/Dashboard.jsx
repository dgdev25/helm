import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.js'
import ProjectCard from '../components/ProjectCard.jsx'
import StatCard from '../components/StatCard.jsx'
import { formatDistanceToNow } from '../utils/time.js'
import { safeHref } from '../utils/safeHref.js'

const STATUS_CHIPS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Archived', value: 'archived' },
]

export default function Dashboard() {
  const { projects, loading, error, filters, setFilter, setFilters, fetchProjects, openChat } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const didInit = useRef(false)
  const [staleFirst, setStaleFirst] = useState(false)
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('ds-view') || 'grid')
  const [addOpen, setAddOpen] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState(null)
  const [addSaving, setAddSaving] = useState(false)

  const handleAdd = async () => {
    if (!addInput.trim()) return
    setAddSaving(true)
    setAddError(null)
    const isGitHub = addInput.includes('github.com')
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isGitHub ? { githubUrl: addInput.trim() } : { localPath: addInput.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to add project')
      setAddOpen(false)
      setAddInput('')
      await fetchProjects(filters)
    } catch (e) {
      setAddError(e.message)
    } finally {
      setAddSaving(false)
    }
  }

  // On mount: restore filters from URL
  useEffect(() => {
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const language = searchParams.get('language') || ''
    if (status || search || language) setFilters({ status, search, language })
    didInit.current = true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep URL in sync when filters change (after init)
  useEffect(() => {
    if (!didInit.current) return
    const params = {}
    if (filters.status) params.status = filters.status
    if (filters.search) params.search = filters.search
    if (filters.language) params.language = filters.language
    setSearchParams(params, { replace: true })
  }, [filters.status, filters.search, filters.language]) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = staleFirst
    ? [...projects].sort((a, b) => new Date(a.last_commit_at || 0) - new Date(b.last_commit_at || 0))
    : projects

  const active   = projects.filter(p => p.status === 'active').length
  const paused   = projects.filter(p => p.status === 'paused').length
  const issues   = projects.reduce((s, p) => s + (p.open_issues || 0), 0)
  const langs    = [...new Set(projects.map(p => p.language).filter(Boolean))]
  const allTopics = [...new Set(projects.flatMap(p => p.topics || []))].sort()

  const displayed = (filters.topic
    ? sorted.filter(p => (p.topics || []).includes(filters.topic))
    : sorted)

  const chipStyle = (selected) => ({
    padding: '5px 14px', borderRadius: 9999, fontSize: '0.78rem', cursor: 'pointer',
    border: `1px solid ${selected ? 'var(--primary)' : 'var(--surface-border)'}`,
    background: selected ? 'var(--primary-glow)' : 'var(--surface)',
    color: selected ? 'var(--primary)' : 'var(--text-muted)',
    fontWeight: selected ? 500 : 400, transition: 'var(--fast)',
  })

  return (
    <div style={{ padding: '24px 28px 40px', maxWidth: 1400 }}>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', margin: '-24px -28px 28px', padding: '12px 28px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Projects</span>
        </div>
        {/* Add project */}
        <button
          onClick={() => setAddOpen(true)}
          style={{ background: 'var(--gradient-btn)', border: '1px solid rgba(34,153,113,0.2)', borderRadius: 8, padding: '5px 12px', fontSize: '0.78rem', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >+ Add</button>
        {/* Topics filter */}
        {allTopics.length > 0 && (
          <select
            value={filters.topic}
            onChange={e => setFilter('topic', e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '5px 10px', fontSize: '0.78rem', color: 'var(--text)', outline: 'none' }}
          >
            <option value="">All topics</option>
            {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {/* Language filter */}
        {langs.length > 0 && (
          <select
            value={filters.language}
            onChange={e => setFilter('language', e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '5px 10px', fontSize: '0.78rem', color: 'var(--text)', outline: 'none' }}
          >
            <option value="">All languages</option>
            {langs.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {/* Search */}
        <input
          type="search"
          placeholder="Search…"
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          style={{
            background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8,
            padding: '5px 12px', fontSize: '0.78rem', color: 'var(--text)', outline: 'none', width: 200,
          }}
        />
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Projects" value={projects.length} sub={`${active} active, ${paused} paused`} />
        <StatCard label="Active" value={active} sub="currently in progress" accent="var(--status-active-text)" />
        <StatCard label="Open Issues" value={issues} sub="across all repos" accent="#fb923c" />
        <StatCard label="Languages" value={langs.length} sub="unique tech stack" accent="var(--accent)" />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_CHIPS.map(({ label, value }) => (
          <button key={value} style={chipStyle(filters.status === value)} onClick={() => setFilter('status', value)}>

            {label}
          </button>
        ))}
        <button
          onClick={() => setStaleFirst(s => !s)}
          style={chipStyle(staleFirst)}
          title={staleFirst ? 'Showing stale-first — click for newest-first' : 'Showing newest-first — click for stale-first'}
        >
          {staleFirst ? '↑ Stale first' : '↓ Newest first'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[['grid','▦'],['list','☰']].map(([mode, icon]) => (
            <button key={mode} onClick={() => { setViewMode(mode); localStorage.setItem('ds-view', mode) }}
              title={mode === 'grid' ? 'Card grid' : 'List view'}
              style={{ background: viewMode === mode ? 'var(--primary-glow)' : 'var(--surface)', border: `1px solid ${viewMode === mode ? 'var(--primary)' : 'var(--surface-border)'}`, borderRadius: 8, padding: '4px 10px', fontSize: '0.9rem', color: viewMode === mode ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
            >{icon}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Grid / List */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {loading && !projects.length
            ? Array.from({ length: 8 }).map((_, i) => <ProjectCard key={i} skeleton />)
            : displayed.map(p => <ProjectCard key={p.slug || p.name} project={p} />)
          }
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* List header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 80px 70px 110px 80px', gap: 12, padding: '6px 14px', fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            <span>Name</span><span>Description</span><span>Language</span><span>Stars</span><span>Last commit</span><span></span>
          </div>
          {displayed.map(p => (
            <div
              key={p.slug || p.name}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/projects/${p.slug}`)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate(`/projects/${p.slug}`)}
              className="glass animate-in"
              style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 80px 70px 110px 80px', gap: 12, padding: '10px 14px', alignItems: 'center', cursor: 'pointer', borderRadius: 10, transition: 'var(--fast)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(34,153,113,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--surface-border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: p.status === 'paused' ? '#fb923c' : p.status === 'archived' ? 'var(--text-dim)' : 'var(--primary)' }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description || '—'}</span>
              <span style={{ fontSize: '0.72rem', color: '#93c5fd' }}>{p.language || '—'}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.stars > 0 ? `★ ${p.stars}` : '—'}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.last_commit_at ? formatDistanceToNow(p.last_commit_at) : '—'}</span>
              <button
                onClick={e => { e.stopPropagation(); openChat(p) }}
                style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', color: 'var(--text-dim)', cursor: 'pointer' }}
                onMouseEnter={e => { e.target.style.borderColor = 'rgba(34,153,113,0.4)'; e.target.style.color = 'var(--primary)' }}
                onMouseLeave={e => { e.target.style.borderColor = 'var(--surface-border)'; e.target.style.color = 'var(--text-dim)' }}
              >✦ Chat</button>
            </div>
          ))}
        </div>
      )}

      {!loading && !projects.length && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          No projects found. Click "Sync Now" to import from GitHub and local dirs.
        </div>
      )}

      {/* Add project modal */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setAddOpen(false)}>
          <div className="glass" style={{ width: 480, padding: 28 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Add Project</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 18 }}>Enter a local path (e.g. <code>/home/user/myrepo</code>) or GitHub URL.</p>
            <input
              autoFocus
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="/home/user/myrepo  or  https://github.com/user/repo"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 9, padding: '9px 12px', fontSize: '0.82rem', color: 'var(--text)', outline: 'none', marginBottom: 12 }}
            />
            {addError && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginBottom: 10 }}>{addError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAddOpen(false)} style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '7px 18px', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAdd} disabled={addSaving} style={{ background: 'var(--gradient-btn)', border: '1px solid rgba(34,153,113,0.2)', borderRadius: 8, padding: '7px 18px', fontSize: '0.8rem', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                {addSaving ? 'Adding…' : 'Add Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
