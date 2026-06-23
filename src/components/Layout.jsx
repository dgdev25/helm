import Sidebar from './Sidebar.jsx'

export default function Layout({ children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowAuto: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
