import { useStore } from '../store.js'

export default function BulkPrimerBanner() {
  const bulkPrimer = useStore(s => s.bulkPrimer)
  const cancelBulkPrimers = useStore(s => s.cancelBulkPrimers)

  if (!bulkPrimer) return null

  const { done, total, current } = bulkPrimer
  const pct = total > 0 ? (done / total) * 100 : 0

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '48px',
      zIndex: 35,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: '12px',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      background: 'var(--topbar-bg, rgba(255,255,255,0.72))',
      borderTop: '1px solid var(--border, rgba(0,0,0,0.08))',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
    }}>
      {/* Progress bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: '3px',
        width: `${pct}%`,
        background: 'var(--accent, #22c55e)',
        transition: 'width 0.3s ease',
      }} />

      {/* Label */}
      <span style={{
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text, #111)',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        ✦ Priming projects: {done}/{total}{current ? ` — ${current}` : ''}
      </span>

      {/* Cancel button */}
      <button
        onClick={cancelBulkPrimers}
        style={{
          flexShrink: 0,
          padding: '4px 12px',
          fontSize: '12px',
          fontWeight: 600,
          borderRadius: '6px',
          border: '1px solid var(--border, rgba(0,0,0,0.12))',
          background: 'transparent',
          color: 'var(--text, #111)',
          cursor: 'pointer',
          lineHeight: '20px',
        }}
      >
        Cancel
      </button>
    </div>
  )
}
