import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store.js'

const NAV = [
  { label: 'All Projects', status: '', icon: '▦' },
  { label: 'Active',       status: 'active',   icon: '▶' },
  { label: 'Paused',       status: 'paused',   icon: '⏸' },
  { label: 'Archived',     status: 'archived', icon: '⌂' },
]

const BOTTOM_NAV = [
  { label: 'Analytics', to: '/analytics', icon: '↑' },
  { label: 'Settings',  to: '/settings',  icon: '⚙' },
]

export default function Sidebar() {
  const { filters, setFilters, triggerSync, loading, projects } = useStore()
  const location = useLocation()
  const navigate = useNavigate()

  const counts = {
    active:   projects.filter(p => p.status === 'active').length,
    paused:   projects.filter(p => p.status === 'paused').length,
    archived: projects.filter(p => p.status === 'archived').length,
  }

  const navItemStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
    borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer', transition: 'var(--fast)',
    textDecoration: 'none', border: 'none', background: active ? 'var(--primary-glow)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-muted)', fontWeight: active ? 500 : 400,
    width: '100%', textAlign: 'left',
  })

  const isProjectsActive = (status) =>
    location.pathname === '/' && filters.status === status

  const handleNavClick = (status) => {
    setFilters({ status, search: '', language: '' })
    if (location.pathname !== '/') navigate('/')
  }

  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: 'var(--bg-2)',
      borderRight: '1px solid var(--surface-border)',
      display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--surface-border)' }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 700, background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          Deathstar
        </h1>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Project Dashboard</p>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', padding: '8px 8px 4px', marginTop: 8 }}>
          Projects
        </div>
        {NAV.map(({ label, status, icon }) => (
          <button
            key={label}
            onClick={() => handleNavClick(status)}
            style={navItemStyle(isProjectsActive(status))}
          >
            <span style={{ fontSize: '0.9em', opacity: 0.7 }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {status && counts[status] > 0 && (
              <span style={{
                background: 'var(--surface)', border: '1px solid var(--surface-border)',
                borderRadius: 9999, padding: '1px 6px', fontSize: '0.65rem',
                color: 'var(--text-muted)', fontFamily: 'monospace',
              }}>
                {counts[status]}
              </span>
            )}
          </button>
        ))}

        <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', padding: '8px 8px 4px', marginTop: 8 }}>
          Tools
        </div>
        {BOTTOM_NAV.map(({ label, to, icon }) => (
          <Link key={label} to={to} style={navItemStyle(location.pathname === to)}>
            <span style={{ fontSize: '0.9em', opacity: 0.7 }}>{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      {/* Sync footer */}
      <div style={{ padding: 12, borderTop: '1px solid var(--surface-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={triggerSync}
          disabled={loading}
          style={{
            background: 'var(--gradient-btn)', border: '1px solid rgba(34,153,113,0.2)',
            color: 'var(--primary)', padding: '9px 14px', borderRadius: 9, fontSize: '0.8rem',
            fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Space Grotesk',sans-serif",
            transition: 'var(--fast)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '↻ Syncing…' : '↻ Sync Now'}
        </button>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'monospace' }}>
          {projects.length} projects loaded
        </div>
      </div>
    </aside>
  )
}
