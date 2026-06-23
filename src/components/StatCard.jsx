export default function StatCard({ label, value, sub, accent }) {
  return (
    <div className="glass animate-in" style={{ padding: '20px 22px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '1.8rem', fontWeight: 700, color: accent || 'var(--primary)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>
      )}
    </div>
  )
}
