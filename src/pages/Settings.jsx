import { useState, useEffect } from 'react'
import DirList from '../components/DirList.jsx'
import SecretInput from '../components/SecretInput.jsx'
import ToggleSwitch from '../components/ToggleSwitch.jsx'

const SECTIONS = ['Local Directories', 'GitHub', 'Sync Schedule', 'Display', 'Danger Zone']

const input = (val, set, opts = {}) => (
  <input
    value={val} onChange={e => set(e.target.value)}
    style={{
      width: '100%', background: 'var(--surface)', border: '1px solid var(--surface-border)',
      borderRadius: 9, padding: '8px 12px', fontSize: '0.82rem', color: 'var(--text)', outline: 'none',
      ...opts.style,
    }}
    onFocus={e => e.target.style.borderColor = 'rgba(34,153,113,0.4)'}
    onBlur={e => e.target.style.borderColor = 'var(--surface-border)'}
    {...opts}
  />
)

function SectionCard({ title, desc, children }) {
  return (
    <div className="glass" id={title.replace(/\s+/g, '-').toLowerCase()} style={{ marginBottom: 20 }}>
      <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--surface-border)' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{title}</div>
        {desc && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{desc}</div>}
      </div>
      <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {children}
      </div>
    </div>
  )
}

function SaveButton({ onClick, saving, saved }) {
  return (
    <button
      onClick={onClick} disabled={saving}
      style={{ background: 'var(--gradient-btn)', border: '1px solid rgba(34,153,113,0.2)', color: '#fff', padding: '8px 22px', borderRadius: 9, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", transition: 'var(--fast)', width: 'fit-content' }}
    >
      {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
    </button>
  )
}

function DangerZone() {
  const [loading, setLoading] = useState(null)
  const ACTIONS = [
    {
      action: 'clear', label: 'Clear all projects',
      desc: 'Removes all projects from the database. Does not delete actual repos.',
      run: () => fetch('/api/projects', { method: 'DELETE' }),
    },
    {
      action: 'resync', label: 'Re-sync everything',
      desc: 'Triggers a full re-scan of local dirs and GitHub.',
      run: () => Promise.all([fetch('/api/sync', { method: 'POST' }), fetch('/api/scan/local', { method: 'POST' })]),
    },
    {
      action: 'reset-settings', label: 'Reset settings',
      desc: 'Settings are read from .env — edit that file and restart to reset.',
      run: () => Promise.resolve(),
    },
  ]
  const handle = async ({ action, label, run }) => {
    if (!window.confirm(`Are you sure you want to: ${label}?`)) return
    setLoading(action)
    try {
      await run()
      alert(`${label} completed.`)
    } catch (e) {
      alert('Failed: ' + e.message)
    } finally {
      setLoading(null)
    }
  }
  return (
    <div className="glass" style={{ border: '1px solid var(--danger-border)' }}>
      <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--danger-border)' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--danger)' }}>Danger Zone</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>These actions are irreversible.</div>
      </div>
      <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ACTIONS.map(item => (
          <div key={item.action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{item.label}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
            <button
              disabled={loading === item.action}
              onClick={() => handle(item)}
              style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '7px 16px', borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", flexShrink: 0 }}
            >
              {loading === item.action ? '…' : item.label}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState(SECTIONS[0])
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})

  // State per section
  const [dirs, setDirs] = useState(['/home/lyle/dev', '/home/lyle/projects'])
  const [token, setToken] = useState('')
  const [usernames, setUsernames] = useState('')
  const [syncHours, setSyncHours] = useState(6)
  const [darkMode, setDarkMode] = useState(() => (localStorage.getItem('ds-theme') || 'dark') !== 'light')
  const [compactCards, setCompactCards] = useState(() => document.documentElement.dataset.compact === 'true')

  const handleDarkMode = (val) => {
    setDarkMode(val)
    document.documentElement.dataset.theme = val ? 'dark' : 'light'
    localStorage.setItem('ds-theme', val ? 'dark' : 'light')
  }
  const handleCompact = (val) => {
    setCompactCards(val)
    document.documentElement.dataset.compact = val
    localStorage.setItem('ds-compact', val)
  }

  // Load env-derived settings from API
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(j => {
      if (!j.data) return
      const s = j.data
      if (s.localScanDirs) setDirs(s.localScanDirs)
      if (s.githubUsernames) setUsernames(s.githubUsernames)
      if (s.syncIntervalHours) setSyncHours(Number(s.syncIntervalHours))
      if (s.githubToken) setToken(s.githubToken)
    }).catch(e => console.warn('[settings] load failed:', e.message))
  }, [])

  const saveSection = async (key, body) => {
    setSaving(s => ({ ...s, [key]: true }))
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch (e) {
      alert('Save failed: ' + e.message)
    }
    setSaving(s => ({ ...s, [key]: false }))
  }

  const navStyle = (active) => ({
    padding: '7px 12px', borderRadius: 8, fontSize: '0.8rem',
    color: active ? 'var(--primary)' : 'var(--text-muted)',
    background: active ? 'var(--primary-glow)' : 'transparent',
    fontWeight: active ? 500 : 400, cursor: 'pointer',
    textDecoration: 'none', display: 'block', transition: 'var(--fast)', border: 'none', textAlign: 'left', width: '100%',
  })

  return (
    <div style={{ padding: 0 }}>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--surface-border)', padding: '12px 28px', marginBottom: 0 }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Settings</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, padding: '20px 28px 60px' }}>
        {/* Settings nav */}
        <nav style={{ position: 'sticky', top: 58, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SECTIONS.map(s => (
            <button key={s} onClick={() => setActiveSection(s)} style={navStyle(activeSection === s)}>
              {s}
            </button>
          ))}
        </nav>

        {/* Settings content */}
        <div>
          {/* Local Directories */}
          {activeSection === 'Local Directories' && (
            <SectionCard title="Local Directories" desc="Directories scanned for local git repositories.">
              <DirList dirs={dirs} onChange={setDirs} />
              <SaveButton onClick={() => saveSection('dirs', { localScanDirs: dirs })} saving={saving.dirs} saved={saved.dirs} />
            </SectionCard>
          )}

          {/* GitHub */}
          {activeSection === 'GitHub' && (
            <SectionCard title="GitHub" desc="Connect your GitHub account to sync repositories.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 500 }}>Personal Access Token</label>
                <SecretInput value={token} onChange={setToken} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" readOnly />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Read from <code>.env</code> (read-only here). Needs read:user and repo scopes; edit <code>.env</code> and restart to change.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 500 }}>GitHub Usernames</label>
                {input(usernames, setUsernames, { placeholder: 'username1,username2' })}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Comma-separated. All repos from these accounts will be synced.</span>
              </div>
              <SaveButton onClick={() => saveSection('github', { githubToken: token, githubUsernames: usernames })} saving={saving.github} saved={saved.github} />
            </SectionCard>
          )}

          {/* Sync Schedule */}
          {activeSection === 'Sync Schedule' && (
            <SectionCard title="Sync Schedule" desc="How often to automatically sync projects from GitHub and local dirs.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 500 }}>Sync interval</label>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--primary)' }}>{syncHours}h</span>
                </div>
                <input type="range" min={1} max={24} value={syncHours} onChange={e => setSyncHours(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  <span>1h</span><span>12h</span><span>24h</span>
                </div>
              </div>
              <SaveButton onClick={() => saveSection('sync', { syncIntervalHours: syncHours })} saving={saving.sync} saved={saved.sync} />
            </SectionCard>
          )}

          {/* Display */}
          {activeSection === 'Display' && (
            <SectionCard title="Display" desc="Visual preferences.">
              <ToggleSwitch checked={darkMode} onChange={handleDarkMode} label="Dark Mode" description="Use dark background and light text." />
              <ToggleSwitch checked={compactCards} onChange={handleCompact} label="Compact Cards" description="Reduce card padding for denser grid." />
              <SaveButton onClick={() => saveSection('display', { darkMode, compactCards })} saving={saving.display} saved={saved.display} />
            </SectionCard>
          )}

          {/* Danger Zone */}
          {activeSection === 'Danger Zone' && (
            <DangerZone />
          )}
        </div>
      </div>
    </div>
  )
}
