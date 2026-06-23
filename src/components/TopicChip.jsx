export default function TopicChip({ label }) {
  return (
    <span style={{
      background: 'var(--chip-bg)', color: 'var(--chip-text)',
      border: '1px solid var(--chip-border)',
      padding: '2px 8px', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 500,
    }}>
      {label}
    </span>
  )
}
