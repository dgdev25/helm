import { useNavigate, useLocation } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter',sans-serif", padding: 24, textAlign: 'center',
      backgroundImage: `linear-gradient(rgba(34,153,113,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(34,153,113,0.03) 1px,transparent 1px)`,
      backgroundSize: '40px 40px',
    }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(5rem,15vw,9rem)', fontWeight: 700, background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1, marginBottom: 24 }}>
        404
      </div>
      <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: '1.3rem', fontWeight: 700, marginBottom: 10 }}>Page not found</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 8 }}>
        The page you're looking for doesn't exist.
      </p>
      <code style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--primary)', background: 'var(--primary-subtle)', border: '1px solid var(--chip-border)', padding: '4px 12px', borderRadius: 6, marginBottom: 32 }}>
        {location.pathname}
      </code>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'var(--gradient)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 10, fontSize: '0.85rem', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}
        >
          Go Home
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)', padding: '10px 24px', borderRadius: 10, fontSize: '0.85rem', cursor: 'pointer', fontFamily: "'Space Grotesk',sans-serif" }}
        >
          ← Back
        </button>
      </div>
    </div>
  )
}
