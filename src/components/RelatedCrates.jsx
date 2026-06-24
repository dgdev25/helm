// src/components/RelatedCrates.jsx
import { useState, useEffect, useCallback } from 'react'

const CAT_COLOR = {
  'Vector DB': '#6ee7b7', 'Neural / ML': '#93c5fd', 'Quantum': '#d8b4fe',
  'Agent / Orchestration': '#34d399', 'Graph / DAG': '#fbbf24',
  'Streaming / Dataflow': '#f472b6', 'Cryptography': '#fb923c',
  'Robotics': '#60a5fa', 'Storage / Memory': '#a78bfa',
  'Web / API': '#4ade80', 'Utility': 'var(--text-muted)',
}

export default function RelatedCrates({ slug }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${slug}/crates`).then(r => r.json())
      setLinks(res.data || [])
    } catch (e) {
      setError(e.message || 'Failed to load crates')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  const suggest = async () => {
    setSuggesting(true)
    setError(null)
    const res = await fetch(`/api/projects/${slug}/suggest-crates`, { method: 'POST' }).then(r => r.json())
    setSuggesting(false)
    if (res.error) { setError(res.error); return }
    await load()
  }

  const togglePin = async (link) => {
    await fetch(`/api/projects/${slug}/crates/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !link.pinned }),
    })
    setLinks(ls => ls.map(l => l.id === link.id ? { ...l, pinned: !l.pinned } : l))
  }

  const remove = async (link) => {
    await fetch(`/api/projects/${slug}/crates/${link.id}`, { method: 'DELETE' })
    setLinks(ls => ls.filter(l => l.id !== link.id))
  }

  const searchCrates = async (q) => {
    setSearch(q)
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/crates?search=${encodeURIComponent(q)}`).then(r => r.json())
    const existing = new Set(links.map(l => l.name))
    setSearchResults((res.data || []).filter(c => !existing.has(c.name)).slice(0, 8))
    setSearching(false)
  }

  const addManual = async (crate) => {
    await fetch(`/api/projects/${slug}/crates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crate_id: crate.id }),
    })
    setSearch('')
    setSearchResults([])
    await load()
  }

  const pinned = links.filter(l => l.pinned)
  const suggested = links.filter(l => !l.pinned)

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>
          Related Crates {links.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({links.length})</span>}
        </span>
        <button
          onClick={suggest}
          disabled={suggesting}
          style={{
            background: suggesting ? 'var(--surface)' : 'var(--gradient-btn)',
            border: '1px solid rgba(34,153,113,0.2)', borderRadius: 8,
            padding: '5px 14px', fontSize: '0.78rem', fontWeight: 600,
            color: suggesting ? 'var(--text-muted)' : '#fff',
            cursor: suggesting ? 'wait' : 'pointer',
          }}
        >
          {suggesting ? '✦ Analysing…' : links.length ? '✦ Re-suggest' : '✦ AI Suggest'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: '0.78rem', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Manual search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          type="search"
          placeholder="Search crates to add manually…"
          value={search}
          onChange={e => searchCrates(e.target.value)}
          onBlur={() => setTimeout(() => setSearchResults([]), 150)}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '7px 12px', fontSize: '0.78rem', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
        />
        {searchResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-2)', border: '1px solid var(--surface-border)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
            {searchResults.map(c => (
              <button
                key={c.id}
                onClick={() => addManual(c)}
                style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--surface-border)' }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text)', flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 9999, background: `${CAT_COLOR[c.category] || 'var(--text-muted)'}18`, color: CAT_COLOR[c.category] || 'var(--text-dim)' }}>{c.category}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>}

      {!loading && links.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <p style={{ marginBottom: 12 }}>No related crates yet.</p>
          <p style={{ fontSize: '0.75rem' }}>Click <strong>AI Suggest</strong> to analyse this project against the crate library.</p>
        </div>
      )}

      {/* Pinned crates */}
      {pinned.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 8 }}>Pinned</div>
          {pinned.map(l => <CrateLink key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
        </div>
      )}

      {/* AI suggestions */}
      {suggested.length > 0 && (
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 8 }}>AI Suggestions</div>
          {suggested.map(l => <CrateLink key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
        </div>
      )}
    </div>
  )
}

function CrateLink({ link, onPin, onRemove }) {
  const color = CAT_COLOR[link.category] || 'var(--text-muted)'
  return (
    <div className="glass" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700 }}>{link.name}</span>
          {link.version && <span style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>v{link.version}</span>}
          <span style={{ fontSize: '0.63rem', padding: '1px 6px', borderRadius: 9999, background: `${color}18`, border: `1px solid ${color}`, color }}>{link.category}</span>
          {link.source === 'manual' && <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 9999, padding: '1px 6px' }}>manual</span>}
        </div>
        {link.reason && <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>{link.reason}</p>}
        <code style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: 4, display: 'block' }}>cargo add {link.name}</code>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => onPin(link)}
          title={link.pinned ? 'Unpin' : 'Pin'}
          style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: link.pinned ? '#fbbf24' : 'var(--text-dim)', cursor: 'pointer' }}
        >
          {link.pinned ? '★' : '☆'}
        </button>
        <button
          onClick={() => onRemove(link)}
          title="Remove"
          style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: 'var(--text-dim)', cursor: 'pointer' }}
        >×</button>
      </div>
    </div>
  )
}
