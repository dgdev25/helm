import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from '../utils/time.js'
import StatusPill from './StatusPill.jsx'
import TopicChip from './TopicChip.jsx'

export default function ProjectCard({ project, skeleton }) {
  const navigate = useNavigate()

  if (skeleton) {
    return (
      <div className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="skeleton" style={{ height: 16, width: '60%' }} />
        <div className="skeleton" style={{ height: 12, width: '90%' }} />
        <div className="skeleton" style={{ height: 12, width: '40%' }} />
        <div className="skeleton" style={{ height: 24, width: '100%', marginTop: 8 }} />
      </div>
    )
  }

  const {
    slug, name, description, language, topics = [], stars = 0,
    open_issues = 0, open_prs = 0, last_commit_at, last_commit_msg,
    last_commit_author, status, github_url, is_private, local_path,
  } = project

  return (
    <div
      className="glass animate-in"
      onClick={() => navigate(`/projects/${slug}`)}
      style={{
        padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
        cursor: 'pointer', opacity: status === 'archived' ? 0.6 : 1,
        transition: 'var(--fast)',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(34,153,113,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--surface-border)'}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </h2>
            {is_private && (
              <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 9999, background: 'var(--surface)', border: '1px solid var(--surface-border)', color: 'var(--text-muted)', flexShrink: 0 }}>
                private
              </span>
            )}
          </div>
          {description && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {description}
            </p>
          )}
        </div>
        <StatusPill status={status || 'active'} />
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {topics.slice(0, 5).map(t => <TopicChip key={t} label={t} />)}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {language && <span style={{ color: '#93c5fd' }}>{language}</span>}
        {stars > 0 && <span>★ {stars}</span>}
        {open_issues > 0 && <span style={{ color: '#fb923c' }}>{open_issues} issues</span>}
        {open_prs > 0 && <span style={{ color: '#a78bfa' }}>{open_prs} PRs</span>}
        {!github_url && local_path && <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>local only</span>}
      </div>

      {/* Commit footer */}
      {last_commit_at && (
        <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: 10, fontSize: '0.72rem' }}>
          <span style={{ color: 'var(--primary)' }}>{formatDistanceToNow(last_commit_at)}</span>
          {last_commit_author && <span style={{ color: 'var(--text-muted)' }}> · {last_commit_author}</span>}
          {last_commit_msg && (
            <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {last_commit_msg}
            </div>
          )}
        </div>
      )}

      {/* GitHub link */}
      {github_url && (
        <a
          href={github_url}
          target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textDecoration: 'none', marginTop: 'auto' }}
          onMouseEnter={e => e.target.style.color = 'var(--primary)'}
          onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
        >
          GitHub ↗
        </a>
      )}
    </div>
  )
}
