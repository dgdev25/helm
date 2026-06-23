import { useNavigate } from 'react-router-dom'

export default function ServerError({ error }) {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter',sans-serif", padding: 24, textAlign: 'center',
    }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(5rem,15vw,9rem)', fontWeight: 700, color: 'var(--danger)', lineHeight: 1, marginBottom: 24 }}>
        500
      </div>
      <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: '1.3rem', fontWeight: 700, marginBottom: 10 }}>Something went wrong</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 24 }}>An unexpected error occurred on the server.</p>
      {error && (
        <pre style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: 16, borderRadius: 10, maxWidth: 500, textAlign: 'left', marginBottom: 24, overflowX: 'auto' }}>
          {String(error)}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => window.location.reload()}
          style={{ background: 'var(--gradient)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: '0.85rem', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}
        >
          Retry
        </button>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)', padding: '10px 24px', borderRadius: 10, fontSize: '0.85rem', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
        >
          Go Home
        </button>
      </div>
    </div>
  )
}
