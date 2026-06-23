// src/App.jsx
import { useEffect } from 'react'
import Layout from './components/Layout.jsx'
import { useStore } from './store.js'

export default function App() {
  const { fetchProjects } = useStore()
  useEffect(() => { fetchProjects() }, [])

  return (
    <Layout>
      <div className="p-8 text-gray-400">Loading projects…</div>
    </Layout>
  )
}
