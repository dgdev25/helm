import { useState } from 'react'

export default function SecretInput({ value, onChange, placeholder, readOnly }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} readOnly={readOnly}
        style={{
          width: '100%', background: 'var(--surface)', border: '1px solid var(--surface-border)',
          borderRadius: 9, padding: '8px 40px 8px 12px', fontSize: '0.82rem', color: 'var(--text)',
          outline: 'none', fontFamily: show ? 'monospace' : 'inherit',
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(34,153,113,0.4)'}
        onBlur={e => e.target.style.borderColor = 'var(--surface-border)'}
      />
      <button
        type="button" onClick={() => setShow(s => !s)}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', padding: 4 }}
      >
        {show ? 'hide' : 'show'}
      </button>
    </div>
  )
}
