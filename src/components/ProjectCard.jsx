// src/components/ProjectCard.jsx
import { formatDistanceToNow } from '../utils/time.js'

const STATUS_COLORS = {
  active: 'bg-emerald-900/50 text-emerald-300',
  paused: 'bg-yellow-900/50 text-yellow-300',
  archived: 'bg-gray-800 text-gray-500',
}

export default function ProjectCard({ project }) {
  const {
    name, description, language, topics = [], stars,
    open_issues, open_prs, last_commit_at, last_commit_msg,
    last_commit_author, status, github_url, is_private
  } = project

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-gray-700 transition-colors flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100 truncate">{name}</h2>
            {is_private && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 shrink-0">private</span>
            )}
          </div>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS.active}`}>
          {status}
        </span>
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topics.slice(0, 5).map(t => (
            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-teal-900/40 text-teal-400">{t}</span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        {language && <span className="text-blue-400">{language}</span>}
        {stars > 0 && <span>&#9733; {stars}</span>}
        {open_issues > 0 && <span className="text-orange-400">{open_issues} issues</span>}
        {open_prs > 0 && <span className="text-purple-400">{open_prs} PRs</span>}
      </div>

      {/* Last commit */}
      {last_commit_at && (
        <div className="border-t border-gray-800 pt-3 text-xs text-gray-600">
          <span className="text-gray-400">{formatDistanceToNow(last_commit_at)}</span>
          {last_commit_msg && (
            <span className="ml-1 truncate block text-gray-600">{last_commit_msg}</span>
          )}
          {last_commit_author && <span className="text-gray-700"> by {last_commit_author}</span>}
        </div>
      )}

      {/* Footer links */}
      <div className="flex gap-3 mt-auto">
        {github_url && (
          <a href={github_url} target="_blank" rel="noreferrer"
            className="text-xs text-gray-600 hover:text-teal-400 transition-colors">
            GitHub &#8599;
          </a>
        )}
      </div>
    </div>
  )
}
