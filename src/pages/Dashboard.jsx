// src/pages/Dashboard.jsx
import { useStore } from '../store.js'
import ProjectCard from '../components/ProjectCard.jsx'
import SearchBar from '../components/SearchBar.jsx'

export default function Dashboard() {
  const { projects, loading, error } = useStore()

  const languages = [...new Set(projects.map(p => p.language).filter(Boolean))].sort()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-100 mb-1">Projects</h2>
        <p className="text-sm text-gray-500">{projects.length} total</p>
      </div>

      <div className="mb-6">
        <SearchBar languages={languages} />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && !projects.length ? (
        <div className="text-gray-600 text-sm">Loading&hellip;</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map(p => <ProjectCard key={p.slug} project={p} />)}
        </div>
      )}

      {!loading && !projects.length && (
        <div className="text-gray-600 text-sm text-center py-16">
          No projects found. Click &ldquo;Sync Now&rdquo; to import from GitHub and local dirs.
        </div>
      )}
    </div>
  )
}
