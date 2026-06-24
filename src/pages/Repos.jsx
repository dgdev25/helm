import { useState, useEffect, useCallback } from 'react'

const LANG_COLOR = {
  'Rust': '#f97316', 'TypeScript': '#3b82f6', 'JavaScript': '#eab308',
  'Python': '#a3e635', 'Go': '#06b6d4', 'C': '#6b7280', 'C++': '#8b5cf6',
  'Zig': '#f59e0b', 'Ruby': '#ef4444', 'Java': '#f97316', 'Swift': '#f97316',
}

function fmt(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export default function Repos() {
  const [repos, setRepos]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [search, setSearch]       = useState('')
  const [langFilter, setLangFilter] = useState('')
  const [editNotes, setEditNotes] = useState(null) // { id, notes }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)     params.set('search', search)
      if (langFilter) params.set('language', langFilter)
      const { data } = await fetch(`/api/repos?${params}`).then(r => r.json())
      setRepos(data || [])
    } catch {
      setRepos([])
    } finally {
      setLoading(false)
    }
  }, [search, langFilter])

  useEffect(() => { load() }, [load])

  const importFromUrl = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/repos/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      }).then(r => r.json())
      setImportResult(res.error ? { error: res.error } : { ok: `Imported ${res.data.imported} repos` })
      if (!res.error) { setImportUrl(''); load() }
    } catch (e) {
      setImportResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  const toggleStar = async (repo) => {
    setRepos(rs => rs.map(r => r.id === repo.id ? { ...r, starred: !r.starred } : r))
    try {
      await fetch(`/api/repos/${repo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: !repo.starred }),
      })
    } catch {
      setRepos(rs => rs.map(r => r.id === repo.id ? { ...r, starred: repo.starred } : r))
    }
  }

  const deleteRepo = async (repo) => {
    setRepos(rs => rs.filter(r => r.id !== repo.id))
    try {
      await fetch(`/api/repos/${repo.id}`, { method: 'DELETE' })
    } catch {
      setRepos(rs => [...rs, repo])
    }
  }

  const saveNotes = async () => {
    if (!editNotes) return
    try {
      await fetch(`/api/repos/${editNotes.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes.notes }),
      })
      setRepos(rs => rs.map(r => r.id === editNotes.id ? { ...r, notes: editNotes.notes } : r))
    } catch {}
    setEditNotes(null)
  }

  const languages = [...new Set(repos.map(r => r.language).filter(Boolean))].sort()

  return (
    <div style={{ padding: '0 0 60px' }}>
      {/* Topbar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--topbar-bg)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--surface-border)', padding: '12px 28px' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Repo Library</span>
      </div>

      <div style={{ padding: '24px 28px' }}>
        {/* Import bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && importFromUrl()}
            placeholder="github.com/ruvnet  ·  github.com/topics/mcp  ·  github.com/tokio-rs"
            style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'monospace' }}
          />
          <button
            onClick={importFromUrl}
            disabled={importing || !importUrl.trim()}
            style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.82rem', cursor: importing ? 'default' : 'pointer', opacity: importing ? 0.6 : 1 }}
          >
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
        {importResult && (
          <div style={{ fontSize: '0.75rem', marginBottom: 12, color: importResult.error ? 'var(--danger)' : 'var(--primary)' }}>
            {importResult.error || importResult.ok}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search repos…"
            style={{ flex: 1, padding: '6px 10px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 6, color: 'var(--text)' }}
          />
          <select
            value={langFilter}
            onChange={e => setLangFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '0.8rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 6, color: 'var(--text)' }}
          >
            <option value="">All languages</option>
            {languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {repos.length} repos
          </span>
        </div>

        {/* Notes editor */}
        {editNotes && (
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8 }}>
            <textarea
              autoFocus
              value={editNotes.notes}
              onChange={e => setEditNotes(n => ({ ...n, notes: e.target.value }))}
              rows={3}
              style={{ width: '100%', fontSize: '0.8rem', background: 'transparent', border: 'none', color: 'var(--text)', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
              placeholder="Add notes…"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={saveNotes} style={{ padding: '4px 12px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer' }}>Save</button>
              <button onClick={() => setEditNotes(null)} style={{ padding: '4px 12px', background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer', color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading
          ? <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>
          : repos.length === 0
          ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>⎇</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 6 }}>No repos yet</div>
              <div style={{ fontSize: '0.8rem' }}>Import from a GitHub user, org, or topic URL above.</div>
            </div>
          )
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <colgroup>
                <col style={{ width: 240 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 70 }} />
                <col />
                <col style={{ width: 80 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-border)' }}>
                  {['Repo', 'Language', 'Stars', 'Description', ''].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repos.map(r => {
                  const lc = LANG_COLOR[r.language] || 'var(--text-muted)'
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                        <a href={r.html_url} target="_blank" rel="noreferrer"
                          style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none', fontSize: '0.82rem' }}>
                          {r.full_name}
                        </a>
                        {r.project_count > 0 && (
                          <span style={{ marginLeft: 6, fontSize: '0.6rem', padding: '1px 5px', borderRadius: 9999, background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                            {r.project_count} project{r.project_count > 1 ? 's' : ''}
                          </span>
                        )}
                        {r.notes && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{r.notes}</div>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                        {r.language && (
                          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 9999, background: `${lc}18`, border: `1px solid ${lc}`, color: lc }}>
                            {r.language}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        ★ {fmt(r.stars)}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {r.description}
                      </td>
                      <td style={{ padding: '8px 10px', verticalAlign: 'middle', display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => toggleStar(r)}
                          title={r.starred ? 'Unstar' : 'Star'}
                          style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', color: r.starred ? '#fbbf24' : 'var(--text-dim)' }}
                        >
                          {r.starred ? '★' : '☆'}
                        </button>
                        <button
                          onClick={() => setEditNotes({ id: r.id, notes: r.notes || '' })}
                          title="Edit notes"
                          style={{ background: 'none', border: 'none', fontSize: '0.82rem', cursor: 'pointer', color: r.notes ? 'var(--primary)' : 'var(--text-dim)' }}
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => deleteRepo(r)}
                          title="Remove from library"
                          style={{ background: 'none', border: 'none', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-dim)' }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}
