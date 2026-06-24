// src/components/RelatedRepos.jsx
import { useState, useEffect, useCallback, useRef } from 'react'

const LANG_COLOR = {
  'Rust': '#f97316', 'TypeScript': '#3b82f6', 'JavaScript': '#eab308',
  'Python': '#a3e635', 'Go': '#06b6d4', 'C': '#6b7280', 'C++': '#8b5cf6',
  'Zig': '#f59e0b', 'Ruby': '#ef4444', 'Java': '#f97316',
}

const TH = { padding: '6px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }
const TD = { padding: '8px 10px', borderBottom: '1px solid var(--surface-border)', verticalAlign: 'middle' }

function fmt(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n) }

function ScoreBar({ score }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.8 ? 'var(--primary)' : score >= 0.5 ? '#fbbf24' : 'var(--text-dim)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color, minWidth: 30 }}>{pct}%</span>
    </div>
  )
}

function RepoRow({ link, onPin, onRemove }) {
  const lc = LANG_COLOR[link.language] || 'var(--text-muted)'
  return (
    <tr>
      <td style={TD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <a href={link.html_url} target="_blank" rel="noreferrer"
            style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.82rem' }}>
            {link.full_name}
          </a>
          {link.source === 'manual' && (
            <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 9999, padding: '1px 6px' }}>manual</span>
          )}
        </div>
      </td>
      <td style={TD}>
        {link.language && (
          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 9999, background: `${lc}18`, border: `1px solid ${lc}`, color: lc }}>{link.language}</span>
        )}
      </td>
      <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        ★ {fmt(link.stars || 0)}
      </td>
      <td style={TD}>
        {link.score > 0 && link.source !== 'manual'
          ? <ScoreBar score={link.score} />
          : <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>—</span>}
      </td>
      <td style={{ ...TD, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <span title={link.reason} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {link.reason || '—'}
        </span>
      </td>
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onPin(link)} title={link.pinned ? 'Unpin' : 'Pin'}
            style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: link.pinned ? '#fbbf24' : 'var(--text-dim)', cursor: 'pointer' }}>
            {link.pinned ? '★' : '☆'}
          </button>
          <button onClick={() => onRemove(link)} title="Remove"
            style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 6, padding: '3px 7px', fontSize: '0.72rem', color: 'var(--text-dim)', cursor: 'pointer' }}>×</button>
        </div>
      </td>
    </tr>
  )
}

export default function RelatedRepos({ slug }) {
  const [links, setLinks]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [suggesting, setSuggesting]   = useState(false)
  const [error, setError]             = useState(null)
  const [search, setSearch]           = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${slug}/repos`).then(r => r.json())
      setLinks(res.data || [])
    } catch (e) {
      setError(e.message || 'Failed to load repos')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  const discover = async () => {
    setDiscovering(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${slug}/discover-repos`, { method: 'POST' }).then(r => r.json())
      if (res.error) { setError(res.error); return }
      await load()
    } catch (e) {
      setError(e.message || 'Discovery failed')
    } finally {
      setDiscovering(false)
    }
  }

  const suggest = async () => {
    setSuggesting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${slug}/suggest-repos`, { method: 'POST' }).then(r => r.json())
      if (res.error) { setError(res.error); return }
      await load()
    } catch (e) {
      setError(e.message || 'Suggest failed')
    } finally {
      setSuggesting(false)
    }
  }

  const togglePin = async (link) => {
    await fetch(`/api/projects/${slug}/repos/${link.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !link.pinned }),
    })
    setLinks(ls => ls.map(l => l.id === link.id ? { ...l, pinned: !l.pinned } : l))
  }

  const remove = async (link) => {
    await fetch(`/api/projects/${slug}/repos/${link.id}`, { method: 'DELETE' })
    setLinks(ls => ls.filter(l => l.id !== link.id))
  }

  const searchTimerRef = useRef(null)
  const doSearch = (q) => {
    setSearch(q)
    clearTimeout(searchTimerRef.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const { data } = await fetch(`/api/repos?search=${encodeURIComponent(q)}`).then(r => r.json())
        const linked = new Set(links.map(l => l.full_name))
        setSearchResults((data || []).filter(r => !linked.has(r.full_name)).slice(0, 8))
      } finally {
        setSearching(false)
      }
    }, 250)
  }

  const addManual = async (repo) => {
    setSearchResults([])
    setSearch('')
    await fetch(`/api/projects/${slug}/repos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_id: repo.id }),
    })
    await load()
  }

  const pinned    = links.filter(l => l.pinned)
  const suggested = links.filter(l => !l.pinned)
  const busy      = discovering || suggesting

  return (
    <div style={{ padding: '0 0 32px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
          Related Repos {links.length > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>({links.length})</span>}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={discover} disabled={busy}
            style={{ padding: '6px 14px', background: busy ? 'var(--surface)' : 'var(--primary)', color: busy ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', cursor: busy ? 'default' : 'pointer' }}>
            {discovering ? 'Discovering…' : '⎇ Discover'}
          </button>
          <button onClick={suggest} disabled={busy}
            style={{ padding: '6px 14px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: '0.78rem', cursor: busy ? 'default' : 'pointer' }}>
            {suggesting ? 'Suggesting…' : '✦ Suggest from Library'}
          </button>
        </div>
      </div>

      {error && <div style={{ marginBottom: 12, fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</div>}

      {/* Manual search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => doSearch(e.target.value)}
          onBlur={() => setTimeout(() => setSearchResults([]), 150)}
          placeholder="Search repos to add manually…"
          style={{ width: '100%', padding: '7px 12px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, color: 'var(--text)', boxSizing: 'border-box' }}
        />
        {searchResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, zIndex: 20, marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
            {searchResults.map(r => (
              <button key={r.id} onClick={() => addManual(r)}
                style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--surface-border)' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text)', flex: 1 }}>{r.full_name}</span>
                {r.language && <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{r.language}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>}

      {!loading && links.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <p style={{ marginBottom: 12 }}>No related repos yet.</p>
          <p style={{ fontSize: '0.75rem' }}>
            Click <strong>⎇ Discover</strong> to search GitHub using AI-generated queries, or <strong>✦ Suggest from Library</strong> to score repos already imported.
          </p>
        </div>
      )}

      {links.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
              <th style={TH}>Repo</th>
              <th style={TH}>Language</th>
              <th style={TH}>Stars</th>
              <th style={TH}>Relevance</th>
              <th style={TH}>Reason</th>
              <th style={TH}></th>
            </tr>
          </thead>
          {pinned.length > 0 && (
            <tbody>
              <tr><td colSpan={6} style={{ padding: '6px 0 2px', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Pinned</td></tr>
              {pinned.map(l => <RepoRow key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
            </tbody>
          )}
          {suggested.length > 0 && (
            <tbody>
              <tr><td colSpan={6} style={{ padding: '6px 0 2px', fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Suggestions</td></tr>
              {suggested.map(l => <RepoRow key={l.id} link={l} onPin={togglePin} onRemove={remove} />)}
            </tbody>
          )}
        </table>
      )}
    </div>
  )
}
