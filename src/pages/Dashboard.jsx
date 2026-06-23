import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store.js'
import ProjectCard from '../components/ProjectCard.jsx'
import StatCard from '../components/StatCard.jsx'

const STATUS_CHIPS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Archived', value: 'archived' },
]

export default function Dashboard() {
  const { projects, loading, error, filters, setFilter, setFilters } = useStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const didInit = useRef(false)

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

  const active   = projects.filter(p => p.status === 'active').length
  const paused   = projects.filter(p => p.status === 'paused').length
  const issues   = projects.reduce((s, p) => s + (p.open_issues || 0), 0)
  const langs    = [...new Set(projects.map(p => p.language).filter(Boolean))]

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
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {loading && !projects.length
          ? Array.from({ length: 8 }).map((_, i) => <ProjectCard key={i} skeleton />)
          : projects.map(p => <ProjectCard key={p.slug || p.name} project={p} />)
        }
      </div>

      {!loading && !projects.length && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          No projects found. Click "Sync Now" to import from GitHub and local dirs.
        </div>
      )}
    </div>
  )
}
