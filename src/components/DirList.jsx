import { useState } from 'react'

export default function DirList({ dirs, onChange }) {
  const [adding, setAdding] = useState(false)
  const [input, setInput] = useState('')

  const remove = (i) => onChange(dirs.filter((_, idx) => idx !== i))
  const add = () => {
    const val = input.trim()
    if (val && !dirs.includes(val)) onChange([...dirs, val])
    setInput(''); setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {dirs.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '8px 12px' }}>
          <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text)' }}>{d}</span>
          <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem', padding: '2px 4px', borderRadius: 4, transition: 'var(--fast)' }}
            onMouseEnter={e => e.target.style.color = 'var(--danger)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
          >✕</button>
        </div>
      ))}
      {adding
        ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false) }}
              placeholder="/path/to/directory"
              style={{ flex: 1, background: 'var(--surface)', border: '1px solid rgba(34,153,113,0.4)', borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: '0.78rem', outline: 'none', fontFamily: 'monospace' }}
            />
            <button onClick={add} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem' }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)', padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem' }}>Cancel</button>
          </div>
        )
        : (
          <button onClick={() => setAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', width: 'fit-content', transition: 'var(--fast)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'rgba(34,153,113,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--surface-border)' }}
          >
            + Add directory
          </button>
        )
      }
    </div>
  )
}
