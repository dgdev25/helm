// src/components/Sidebar.jsx
import { useStore } from '../store.js'

const NAV = [
  { label: 'All Projects', status: '' },
  { label: 'Active', status: 'active' },
  { label: 'Paused', status: 'paused' },
  { label: 'Archived', status: 'archived' },
]

export default function Sidebar() {
  const { filters, setFilter, triggerSync, loading } = useStore()

  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-gray-800">
        <h1 className="text-lg font-bold text-teal-400 tracking-tight">Deathstar</h1>
        <p className="text-xs text-gray-500 mt-0.5">Project Dashboard</p>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV.map(({ label, status }) => (
          <button
            key={label}
            onClick={() => setFilter('status', status)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors
              ${filters.status === status
                ? 'bg-teal-900/50 text-teal-300 font-medium'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={triggerSync}
          disabled={loading}
          className="w-full px-3 py-2 bg-teal-800 hover:bg-teal-700 disabled:opacity-50 rounded text-sm text-teal-100 transition-colors"
        >
          {loading ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
    </aside>
  )
}
