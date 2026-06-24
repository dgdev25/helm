import { useStore } from '../store.js'

export default function BulkPrimerProgress() {
  const bulkPrimer = useStore(s => s.bulkPrimer)
  if (!bulkPrimer) return null

  const pct = bulkPrimer.total > 0 ? (bulkPrimer.done / bulkPrimer.total) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--primary)' }}>✦ Primers running</span>
        <span style={{ fontFamily: 'monospace' }}>{bulkPrimer.done}/{bulkPrimer.total}</span>
      </div>
      <div style={{ height: 4, borderRadius: 9999, background: 'var(--surface-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 9999, background: 'var(--primary)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
      </div>
      {bulkPrimer.current && (
        <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bulkPrimer.current}
        </div>
      )}
    </div>
  )
}
