import { useStore } from '../store.js'

const STATUS_ICON  = { pending: '·', running: '…', done: '✓', error: '✗' }
const STATUS_COLOR = {
  pending: 'var(--text-dim)',
  running: 'var(--text)',
  done:    'var(--primary)',
  error:   'var(--danger)',
}

export default function BulkPrimerModal() {
  const bulkPrimer = useStore(s => s.bulkPrimer)
  if (!bulkPrimer) return null

  const pct = bulkPrimer.total > 0 ? (bulkPrimer.done / bulkPrimer.total) * 100 : 0

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ width: 520, padding: 28, display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)', border: '1px solid var(--surface-border)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 4 }}>✦ Running Primers</h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {bulkPrimer.done} of {bulkPrimer.total} complete
            {bulkPrimer.current && <> · <span style={{ color: 'var(--primary)' }}>{bulkPrimer.current}</span></>}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, borderRadius: 9999, background: 'var(--surface-border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 9999, background: 'var(--primary)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
        </div>

        {/* Item list */}
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {bulkPrimer.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.78rem', padding: '5px 0', borderBottom: '1px solid var(--surface-border)' }}>
              <span style={{ width: 16, textAlign: 'center', flexShrink: 0, color: STATUS_COLOR[item.status] }}>
                {STATUS_ICON[item.status]}
              </span>
              <span style={{ flex: 1, color: STATUS_COLOR[item.status], fontWeight: item.status === 'running' ? 600 : 400 }}>
                {item.name}
              </span>
              {item.status !== 'pending' && (
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                  {item.status === 'running' ? 'running…' : item.status}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
