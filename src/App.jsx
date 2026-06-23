// src/App.jsx
import { useEffect } from 'react'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import { useStore } from './store.js'

export default function App() {
  const { fetchProjects } = useStore()
  useEffect(() => { fetchProjects() }, [])
  return <Layout><Dashboard /></Layout>
}
