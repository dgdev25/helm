import { formatDistanceToNow } from '../utils/time.js'

// Accepts commits array: [{sha, message, author, date}]
// Falls back to last_commit fields from a project object
export default function CommitList({ commits = [], project }) {
  const items = commits.length
    ? commits
    : project?.last_commit_msg
      ? [{ sha: project.last_commit_hash || '?', message: project.last_commit_msg, author: project.last_commit_author, date: project.last_commit_at }]
      : []

  if (!items.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No commits recorded.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((c, i) => (
        <div key={c.sha || i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid var(--surface-border)' : 'none', alignItems: 'flex-start' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.message || 'No message'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {c.author && <span>{c.author} · </span>}
              {c.date && <span>{formatDistanceToNow(c.date)}</span>}
            </div>
          </div>
          {c.sha && c.sha !== '?' && (
            <code style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--primary)', background: 'var(--primary-subtle)', border: '1px solid var(--chip-border)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
              {String(c.sha).slice(0, 7)}
            </code>
          )}
        </div>
      ))}
    </div>
  )
}
