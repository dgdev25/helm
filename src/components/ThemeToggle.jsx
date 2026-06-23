import { useState, useEffect } from 'react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('ds-theme')
    return saved ? saved === 'dark' : true
  })

  useEffect(() => {
    const theme = dark ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('ds-theme', theme)
  }, [dark])

  return (
    <button
      onClick={() => setDark(d => !d)}
      title="Toggle theme"
      style={{
        position: 'fixed', top: 14, right: 16, zIndex: 1000,
        background: 'var(--surface)', border: '1px solid var(--surface-border)',
        backdropFilter: 'blur(16px)', borderRadius: 9999, padding: '6px 14px',
        cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)',
        transition: 'var(--fast)', display: 'flex', alignItems: 'center', gap: 6,
      }}
    >
      {dark ? '☀ Light' : '◑ Dark'}
    </button>
  )
}
