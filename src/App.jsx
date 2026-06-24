import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import Analytics from './pages/Analytics.jsx'
import Settings from './pages/Settings.jsx'
import NotFound from './pages/NotFound.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { useStore } from './store.js'
import BulkPrimerModal from './components/BulkPrimerModal.jsx'

// Apply saved preferences before first paint
const saved = localStorage.getItem('ds-theme')
if (saved) document.documentElement.dataset.theme = saved
const compact = localStorage.getItem('ds-compact')
if (compact) document.documentElement.dataset.compact = compact

export default function App() {
  const { fetchProjects } = useStore()
  useEffect(() => { fetchProjects() }, [])

  return (
    <BrowserRouter>
      <ThemeToggle />
      <BulkPrimerModal />
      <Routes>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/projects/:slug" element={<Layout><ProjectDetail /></Layout>} />
        <Route path="/analytics" element={<Layout><Analytics /></Layout>} />
        <Route path="/settings" element={<Layout><Settings /></Layout>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
