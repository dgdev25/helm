import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../store.js'

const CATEGORIES = ['All', 'Vector DB', 'Neural / ML', 'Quantum', 'Agent / Orchestration', 'Graph / DAG', 'Streaming / Dataflow', 'Cryptography', 'Robotics', 'Storage / Memory', 'Web / API', 'Utility', 'Uncategorized']

const CAT_COLOR = {
  'Vector DB': '#6ee7b7',
  'Neural / ML': '#93c5fd',
  'Quantum': '#d8b4fe',
  'Agent / Orchestration': '#34d399',
  'Graph / DAG': '#fbbf24',
  'Streaming / Dataflow': '#f472b6',
  'Cryptography': '#fb923c',
  'Robotics': '#60a5fa',
  'Storage / Memory': '#a78bfa',
  'Web / API': '#4ade80',
  'Utility': 'var(--text-muted)',
}

export default function Crates() {
  const projects = useStore(s => s.projects)
  const [crates, setCrates] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [starred, setStarred] = useState(false)
  const [copying, setCopying] = useState(null)
  const [copyTarget, setCopyTarget] = useState('')
  const [copyResult, setCopyResult] = useState(null)
  const [editNotes, setEditNotes] = useState(null) // { id, notes }

  const localProjects = projects.filter(p => p.local_path)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (category !== 'All') params.set('category', category)
    if (starred) params.set('starred', 'true')
    const res = await fetch(`/api/crates?${params}`).then(r => r.json())
    setCrates(res.data || [])
    setLoading(false)
  }, [search, category, starred])

  useEffect(() => { load() }, [load])

  const scan = async () => {
    setScanning(true)
    const res = await fetch('/api/crates/scan', { method: 'POST' }).then(r => r.json())
    setScanning(false)
    await load()
    return res.data
  }

  const toggle = async (id, field, val) => {
    await fetch(`/api/crates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: val }),
    })
    setCrates(cs => cs.map(c => c.id === id ? { ...c, [field]: val } : c))
  }

  const saveNotes = async () => {
    if (!editNotes) return
    await fetch(`/api/crates/${editNotes.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: editNotes.notes }),
    })
    setCrates(cs => cs.map(c => c.id === editNotes.id ? { ...c, notes: editNotes.notes } : c))
    setEditNotes(null)
  }

  const copyToProject = async (crate) => {
    if (!copyTarget) return
    setCopying(crate.id)
    setCopyResult(null)
    const res = await fetch(`/api/crates/${crate.id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetProjectSlug: copyTarget }),
    }).then(r => r.json())
    setCopying(null)
    if (res.data) setCopyResult({ crate: crate.name, ...res.data })
    else setCopyResult({ error: res.error })
  }

  const categories = [...new Set(crates.map(c => c.category).filter(Boolean))].sort()

  return (
    <div style={{ padding: '24px 28px 40px', maxWidth: 1400 }}>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', margin: '-24px -28px 28px', padding: '12px 28px', borderBottom: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>⬡ Crate Library</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 10 }}>{crates.length} crates</span>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          style={{ background: scanning ? 'var(--surface)' : 'var(--gradient-btn)', border: '1px solid rgba(34,153,113,0.2)', borderRadius: 8, padding: '5px 14px', fontSize: '0.78rem', color: scanning ? 'var(--text-muted)' : '#fff', cursor: scanning ? 'wait' : 'pointer', fontWeight: 600 }}
        >
          {scanning ? '⟳ Scanning…' : '⟳ Scan rUvnet'}
        </button>
        <input
          type="search" placeholder="Search crates…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '5px 12px', fontSize: '0.78rem', color: 'var(--text)', outline: 'none', width: 200 }}
        />
      </div>

      {/* Copy result banner */}
      {copyResult && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: copyResult.error ? 'var(--danger-bg)' : 'rgba(34,153,113,0.08)', border: `1px solid ${copyResult.error ? 'var(--danger-border)' : 'rgba(34,153,113,0.25)'}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {copyResult.error ? (
            <span style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>Error: {copyResult.error}</span>
          ) : (
            <div>
              <span style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 500 }}>✓ {copyResult.crate} copied</span>
              <code style={{ display: 'block', marginTop: 4, fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '3px 8px', borderRadius: 6 }}>
                {copyResult.tomlSnippet}
              </code>
            </div>
          )}
          <button onClick={() => setCopyResult(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {['All', ...categories].map(cat => (
          <button key={cat} onClick={() => setCategory(cat)} style={{
            padding: '4px 12px', borderRadius: 9999, fontSize: '0.75rem', cursor: 'pointer',
            border: `1px solid ${category === cat ? (CAT_COLOR[cat] || 'var(--primary)') : 'var(--surface-border)'}`,
            background: category === cat ? `${(CAT_COLOR[cat] || 'var(--primary)')}18` : 'var(--surface)',
            color: category === cat ? (CAT_COLOR[cat] || 'var(--primary)') : 'var(--text-muted)',
            transition: 'var(--fast)',
          }}>{cat}</button>
        ))}
        <button onClick={() => setStarred(s => !s)} style={{
          marginLeft: 'auto', padding: '4px 12px', borderRadius: 9999, fontSize: '0.75rem', cursor: 'pointer',
          border: `1px solid ${starred ? '#fbbf24' : 'var(--surface-border)'}`,
          background: starred ? 'rgba(251,191,36,0.1)' : 'var(--surface)',
          color: starred ? '#fbbf24' : 'var(--text-muted)',
        }}>★ Starred</button>
      </div>

      {/* Copy target selector */}
      {localProjects.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Copy to project:</span>
          <select
            value={copyTarget}
            onChange={e => setCopyTarget(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: 'var(--text)', outline: 'none' }}
          >
            <option value="">— select a project —</option>
            {localProjects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
          {copyTarget && <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>then click ↓ on any crate</span>}
        </div>
      )}

      {/* Empty state */}
      {!loading && crates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>⬡</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20 }}>
            No crates in library yet.
          </p>
          <button onClick={scan} disabled={scanning} style={{ background: 'var(--gradient-btn)', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: '0.82rem', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {scanning ? 'Scanning…' : '⟳ Scan rUvnet now'}
          </button>
        </div>
      )}

      {/* Crate grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {crates.map(c => (
          <div key={c.id} className="glass animate-in" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
                  {c.version && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', flexShrink: 0 }}>v{c.version}</span>}
                </div>
                <span style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: 9999, background: `${CAT_COLOR[c.category] || 'var(--text-muted)'}18`, border: `1px solid ${CAT_COLOR[c.category] || 'var(--surface-border)'}`, color: CAT_COLOR[c.category] || 'var(--text-dim)', marginTop: 4, display: 'inline-block' }}>
                  {c.category}
                </span>
              </div>
              <button
                onClick={() => toggle(c.id, 'starred', !c.starred)}
                title={c.starred ? 'Unstar' : 'Star this crate'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: c.starred ? '#fbbf24' : 'var(--text-dim)', flexShrink: 0, padding: 2 }}
              >★</button>
            </div>

            {/* Description */}
            {c.description && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {c.description}
              </p>
            )}

            {/* Source path */}
            {c.source_path && (
              <code style={{ fontSize: '0.63rem', color: 'var(--text-dim)', background: 'var(--surface)', padding: '3px 7px', borderRadius: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {c.source_path}
              </code>
            )}

            {/* cargo add snippet */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: '0.68rem', color: 'var(--primary)', background: 'rgba(34,153,113,0.06)', border: '1px solid rgba(34,153,113,0.15)', padding: '3px 8px', borderRadius: 6 }}>
                cargo add {c.name}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(`cargo add ${c.name}`)}
                title="Copy to clipboard"
                style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.65rem', color: 'var(--text-dim)', cursor: 'pointer' }}
              >⎘</button>
            </div>

            {/* Notes */}
            {editNotes?.id === c.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  value={editNotes.notes}
                  onChange={e => setEditNotes(n => ({ ...n, notes: e.target.value }))}
                  rows={3}
                  style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '6px 8px', fontSize: '0.72rem', color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveNotes} style={{ flex: 1, background: 'var(--gradient-btn)', border: 'none', borderRadius: 6, padding: '4px', fontSize: '0.72rem', color: '#fff', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditNotes(null)} style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '4px 10px', fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : c.notes ? (
              <p onClick={() => setEditNotes({ id: c.id, notes: c.notes })} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', borderLeft: '2px solid var(--surface-border)', paddingLeft: 8, cursor: 'text', lineHeight: 1.5 }}>
                {c.notes}
              </p>
            ) : null}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
              <button
                onClick={() => setEditNotes({ id: c.id, notes: c.notes || '' })}
                style={{ flex: 1, background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '4px', fontSize: '0.68rem', color: 'var(--text-dim)', cursor: 'pointer' }}
              >✎ Notes</button>
              {copyTarget && (
                <button
                  onClick={() => copyToProject(c)}
                  disabled={copying === c.id}
                  style={{ flex: 1, background: copying === c.id ? 'var(--surface)' : 'rgba(34,153,113,0.08)', border: '1px solid rgba(34,153,113,0.25)', borderRadius: 6, padding: '4px', fontSize: '0.68rem', color: 'var(--primary)', cursor: copying === c.id ? 'wait' : 'pointer' }}
                >
                  {copying === c.id ? '⟳ Copying…' : '↓ Copy to project'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
