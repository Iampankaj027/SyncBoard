import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect } from 'react'
import PolyhedronBg from './components/PolyhedronBg'

// Lazy load pages for faster initial load
const Auth = lazy(() => import('./pages/Auth'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Board = lazy(() => import('./pages/Board'))

// Smooth page loader
function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#050505', zIndex: 999,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid rgba(249,115,22,0.15)',
        borderTopColor: '#f97316',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// Layout wrapper that controls PolyhedronBg visibility
function AppLayout() {
  const location = useLocation()
  const isDashboard = location.pathname === '/dashboard'
  const [bgReady, setBgReady] = useState(false)

  // Mount polyhedron once, never unmount
  useEffect(() => {
    setBgReady(true)
  }, [])

  return (
    <>
      {/* Polyhedron persists across ALL routes — just hidden on non-dashboard */}
      {bgReady && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2,
          pointerEvents: 'none',
          opacity: isDashboard ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}>
          <PolyhedronBg />
        </div>
      )}

      <div className="page-transition" key={location.pathname}>
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            <Route path="/" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/board/:roomId" element={<Board />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </div>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}

export default App