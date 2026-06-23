const styles = {
  active:   { background: 'var(--status-active-bg)',   color: 'var(--status-active-text)',   border: '1px solid var(--status-active-border)' },
  paused:   { background: 'var(--status-paused-bg)',   color: 'var(--status-paused-text)',   border: '1px solid var(--status-paused-border)' },
  archived: { background: 'var(--status-archived-bg)', color: 'var(--status-archived-text)', border: '1px solid var(--status-archived-border)' },
}

export default function StatusPill({ status }) {
  const s = styles[status] || styles.active
  return (
    <span style={{ ...s, padding: '2px 10px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 500, textTransform: 'capitalize' }}>
      {status}
    </span>
  )
}
