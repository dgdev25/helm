// src/components/SearchBar.jsx
import { useStore } from '../store.js'

export default function SearchBar({ languages }) {
  const { filters, setFilter } = useStore()

  return (
    <div className="flex gap-3 items-center">
      <input
        type="text"
        placeholder="Search projects…"
        value={filters.search}
        onChange={e => setFilter('search', e.target.value)}
        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-teal-600"
      />
      <select
        value={filters.language}
        onChange={e => setFilter('language', e.target.value)}
        className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-teal-600"
      >
        <option value="">All languages</option>
        {languages.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
    </div>
  )
}
