export default function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {description && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ position: 'relative', width: 40, height: 22, flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
        <div onClick={() => onChange(!checked)} style={{
          position: 'absolute', inset: 0,
          background: checked ? 'var(--primary)' : 'var(--surface)',
          border: `1px solid ${checked ? 'var(--primary)' : 'var(--surface-border)'}`,
          borderRadius: 9999, cursor: 'pointer', transition: 'var(--normal)',
        }}>
          <div style={{
            position: 'absolute', top: 2, left: checked ? 20 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: checked ? '#fff' : 'var(--text-muted)',
            transition: 'var(--normal)',
          }} />
        </div>
      </div>
    </label>
  )
}
