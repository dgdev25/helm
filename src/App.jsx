import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Analytics from './pages/Analytics.jsx'
import Settings from './pages/Settings.jsx'
import NotFound from './pages/NotFound.jsx'
import Crates from './pages/Crates.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import { useStore } from './store.js'

// Apply saved preferences before first paint
const saved = localStorage.getItem('ds-theme')
if (saved) document.documentElement.dataset.theme = saved
const compact = localStorage.getItem('ds-compact')
if (compact) document.documentElement.dataset.compact = compact

export default function App() {
  const { fetchProjects, appName, setAppName } = useStore()
  useEffect(() => {
    fetchProjects()
    // Sync app name from server on load
    fetch('/api/settings').then(r => r.json()).then(j => {
      if (j.data?.appName) setAppName(j.data.appName)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    document.title = `${appName} — Project Dashboard`
  }, [appName])

  return (
    <BrowserRouter>
      <ThemeToggle />
      <ChatPanel />
      <Routes>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/projects/:slug" element={<Layout><ProjectDetail /></Layout>} />
        <Route path="/projects/:slug/crates" element={<Layout><ProjectDetail initialTab="Crates" /></Layout>} />
        <Route path="/analytics" element={<Layout><Analytics /></Layout>} />
        <Route path="/crates" element={<Layout><Crates /></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
