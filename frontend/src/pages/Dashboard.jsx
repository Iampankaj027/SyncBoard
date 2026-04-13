import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [roomId, setRoomId] = useState('')
  const [roomName, setRoomName] = useState('')
  const [error, setError] = useState('')
  const [recentRooms, setRecentRooms] = useState([])

  // Profile modal state
  const [profileOpen, setProfileOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' })
  const fileInputRef = useRef(null)

  const navigate = useNavigate()

  // Fetch authenticated user + recent rooms
  useEffect(() => {
    // Load rooms immediately from localStorage (no wait)
    try {
      const rooms = JSON.parse(localStorage.getItem('syncboard_recent_rooms') || '[]')
      setRecentRooms(rooms)
    } catch (_) {}

    const getUser = async () => {
      // Use getSession (cached, instant) instead of getUser (network call)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { navigate('/'); return }
      const user = session.user
      setUser(user)
      setEditName(user.user_metadata?.full_name || '')
      setAvatarUrl(user.user_metadata?.avatar_url || null)
      setLoading(false)
    }
    getUser()
  }, [navigate])

  // Generate random room ID
  const generateRoomId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let id = ''
    for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length))
    setRoomId(id)
    setError('')
  }

  // Join room
  const handleJoinRoom = () => {
    const trimmed = roomId.trim()
    if (!trimmed) { setError('Please enter a Room ID.'); return }
    if (trimmed.length < 3) { setError('Room ID must be at least 3 characters.'); return }

    try {
      const recent = JSON.parse(localStorage.getItem('syncboard_recent_rooms') || '[]')
      const filtered = recent.filter(r => r.id !== trimmed)
      filtered.unshift({
        id: trimmed,
        name: roomName.trim() || null,
        lastVisited: new Date().toISOString(),
      })
      localStorage.setItem('syncboard_recent_rooms', JSON.stringify(filtered.slice(0, 10)))
    } catch (_) {}

    navigate(`/board/${trimmed}`)
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleJoinRoom() }

  const removeRecentRoom = (e, id) => {
    e.stopPropagation()
    const updated = recentRooms.filter(r => r.id !== id)
    setRecentRooms(updated)
    localStorage.setItem('syncboard_recent_rooms', JSON.stringify(updated))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  // ═══════════════════════════════════════
  // PROFILE — Avatar upload + name update
  // ═══════════════════════════════════════
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    if (!file.type.startsWith('image/')) {
      setProfileMsg({ type: 'error', text: 'Please select an image file.' })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMsg({ type: 'error', text: 'Image must be under 2MB.' })
      return
    }

    setUploading(true)
    setProfileMsg({ type: '', text: '' })

    try {
      // Create a unique filename
      const ext = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${ext}`
      const filePath = `avatars/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        // If bucket doesn't exist, fall back to base64
        console.warn('Storage upload failed, using base64:', uploadError.message)
        const reader = new FileReader()
        reader.onload = async (ev) => {
          const base64Url = ev.target.result
          const { error: updateError } = await supabase.auth.updateUser({
            data: { avatar_url: base64Url }
          })
          if (updateError) {
            setProfileMsg({ type: 'error', text: updateError.message })
          } else {
            setAvatarUrl(base64Url)
            setUser(prev => ({
              ...prev,
              user_metadata: { ...prev.user_metadata, avatar_url: base64Url }
            }))
            setProfileMsg({ type: 'success', text: 'Profile picture updated!' })
          }
          setUploading(false)
        }
        reader.readAsDataURL(file)
        return
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Save URL to user metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl }
      })

      if (updateError) {
        setProfileMsg({ type: 'error', text: updateError.message })
      } else {
        setAvatarUrl(publicUrl)
        setUser(prev => ({
          ...prev,
          user_metadata: { ...prev.user_metadata, avatar_url: publicUrl }
        }))
        setProfileMsg({ type: 'success', text: 'Profile picture updated!' })
      }
    } catch (err) {
      setProfileMsg({ type: 'error', text: 'Upload failed. Please try again.' })
    }
    setUploading(false)
  }

  const handleRemoveAvatar = async () => {
    setUploading(true)
    const { error } = await supabase.auth.updateUser({
      data: { avatar_url: null }
    })
    if (!error) {
      setAvatarUrl(null)
      setUser(prev => ({
        ...prev,
        user_metadata: { ...prev.user_metadata, avatar_url: null }
      }))
      setProfileMsg({ type: 'success', text: 'Profile picture removed.' })
    }
    setUploading(false)
  }

  const handleUpdateName = async () => {
    if (!editName.trim()) return
    setProfileMsg({ type: '', text: '' })
    const { error } = await supabase.auth.updateUser({
      data: { full_name: editName.trim() }
    })
    if (error) {
      setProfileMsg({ type: 'error', text: error.message })
    } else {
      setUser(prev => ({
        ...prev,
        user_metadata: { ...prev.user_metadata, full_name: editName.trim() }
      }))
      setProfileMsg({ type: 'success', text: 'Name updated!' })
    }
  }

  // User display
  const displayName = user?.user_metadata?.full_name || 'User'
  const firstName = displayName.split(' ')[0]
  const displayEmail = user?.email || ''
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const googleAvatar = user?.user_metadata?.picture // Google provides 'picture' field

  // Determine best avatar source
  const currentAvatar = avatarUrl || googleAvatar || null

  if (loading) {
    return <div className="dash-loading"><div className="spinner" /></div>
  }

  return (
    <div className="dashboard">

      {/* PolyhedronBg is rendered at App level — no need here */}

      <div className="dash-particles">
        {[...Array(10)].map((_, i) => <div key={i} className="particle" />)}
      </div>
      <div className="dash-vignette" />

      <div className="dash-content">

        {/* ═══ Navbar ═══ */}
        <nav className="dash-navbar">
          <div className="nav-logo">Sync<span>Board</span></div>
          <div className="nav-right">
            <div className="nav-user" onClick={() => { setProfileOpen(true); setProfileMsg({ type: '', text: '' }) }} style={{ cursor: 'pointer' }} title="Edit Profile">
              {currentAvatar
                ? <img src={currentAvatar} alt="Avatar" className="nav-avatar-img" />
                : <div className="nav-avatar">{initials}</div>
              }
              <div className="nav-user-info">
                <span className="nav-user-name">{displayName}</span>
                <span className="nav-user-email">{displayEmail}</span>
              </div>
            </div>
            <button className="nav-logout-btn" onClick={handleLogout} id="logout-btn">Sign Out</button>
          </div>
        </nav>

        {/* ═══ Main ═══ */}
        <main className="dash-main">

          {/* Hero */}
          <div className="dash-hero">
            <h1 className="dash-greeting">
              Welcome back, {firstName} <span className="wave">👋</span>
            </h1>
            <p className="dash-subtitle">
              Create or join a whiteboard room to start collaborating in real-time.
            </p>
          </div>

          {/* ═══ Compact Join Room Bar ═══ */}
          <div className="glass-panel join-bar" style={{ animation: 'fadeUp 0.6s ease' }}>
            <div className="join-bar-header">
              <h2 className="panel-title" style={{ marginBottom: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, verticalAlign: -3, marginRight: 8 }}>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13 12H3" />
                </svg>
                Join or Create a Room
              </h2>
            </div>

            {error && <div className="dash-error" style={{ marginTop: 14 }}>{error}</div>}

            <div className="join-bar-row">
              <div className="join-field">
                <label className="room-label">Room ID</label>
                <div className="room-input-row">
                  <input className="room-input" type="text" placeholder="e.g. design-team-01"
                    value={roomId} onChange={e => { setRoomId(e.target.value); setError('') }}
                    onKeyDown={handleKeyDown} id="room-id-input"
                  />
                  <button className="generate-btn" onClick={generateRoomId} title="Generate random ID" id="generate-room-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="join-field">
                <label className="room-label">Room Name <span style={{ opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                <input className="room-input" type="text" placeholder="e.g. Sprint Planning Board"
                  value={roomName} onChange={e => setRoomName(e.target.value)}
                  onKeyDown={handleKeyDown} id="room-name-input"
                />
              </div>

              <div className="join-field join-field-btn">
                <button className="join-btn" onClick={handleJoinRoom} disabled={!roomId.trim()} id="join-room-btn">
                  Join Room
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ═══ Recent Rooms ═══ */}
          {recentRooms.length > 0 && (
            <div className="recent-rooms-section" style={{ animation: 'fadeUp 0.7s 0.1s ease both' }}>
              <div className="glass-panel">
                <div className="recent-rooms-header">
                  <h2 className="panel-title">Recent Rooms</h2>
                  <button className="clear-history-btn"
                    onClick={() => { localStorage.removeItem('syncboard_recent_rooms'); setRecentRooms([]) }}
                  >Clear All</button>
                </div>
                <p className="panel-desc">Jump back into a previous session.</p>
                <div className="recent-rooms-grid">
                  {recentRooms.map(room => (
                    <div key={room.id} className="recent-room-card" onClick={() => navigate(`/board/${room.id}`)}>
                      <div className="recent-room-icon">🎨</div>
                      <div className="recent-room-info">
                        {room.name && <div className="recent-room-name">{room.name}</div>}
                        <div className="recent-room-id">{room.id}</div>
                        <div className="recent-room-time">
                          {new Date(room.lastVisited).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <button className="recent-room-delete" onClick={(e) => removeRecentRoom(e, room.id)} title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                      <svg className="recent-room-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ Bottom Grid ═══ */}
          <div className="dash-grid bottom-grid" style={{ animation: 'fadeUp 0.8s 0.15s ease both' }}>
            <div className="glass-panel">
              <h2 className="panel-title">Quick Stats</h2>
              <p className="panel-desc">Your SyncBoard at a glance.</p>
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-icon">🎨</div><div className="stat-value">∞</div><div className="stat-label">Canvas Size</div></div>
                <div className="stat-card"><div className="stat-icon">👥</div><div className="stat-value">Live</div><div className="stat-label">Multiplayer</div></div>
                <div className="stat-card"><div className="stat-icon">☁️</div><div className="stat-value">Auto</div><div className="stat-label">Cloud Sync</div></div>
                <div className="stat-card"><div className="stat-icon">⚡</div><div className="stat-value">&lt;50ms</div><div className="stat-label">Latency</div></div>
              </div>
            </div>
            <div className="glass-panel">
              <h2 className="panel-title">How It Works</h2>
              <div className="steps-list">
                <div className="step-item"><div className="step-num">1</div><div className="step-text"><strong>Create or join</strong> a room using any ID</div></div>
                <div className="step-item"><div className="step-num">2</div><div className="step-text"><strong>Draw freely</strong> on the infinite canvas</div></div>
                <div className="step-item"><div className="step-num">3</div><div className="step-text"><strong>Collaborate live</strong> — changes sync instantly</div></div>
              </div>
            </div>
          </div>
        </main>

        <footer className="dash-footer">
          <span className="footer-left">© 2026 SyncBoard — Real-time Collaborative Whiteboard</span>
          <div className="footer-right"><div className="footer-dot" /> All systems operational</div>
        </footer>
      </div>

      {/* ═══════════════════════════════════════
          PROFILE MODAL
         ═══════════════════════════════════════ */}
      {profileOpen && (
        <div className="profile-overlay" onClick={() => setProfileOpen(false)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <button className="profile-close" onClick={() => setProfileOpen(false)}>×</button>
            <h2 className="profile-title">Your Profile</h2>

            {/* Avatar */}
            <div className="profile-avatar-section">
              <div className="profile-avatar-wrapper" onClick={() => !uploading && fileInputRef.current?.click()}>
                {currentAvatar
                  ? <img src={currentAvatar} alt="Avatar" className="profile-avatar-img" />
                  : <div className="profile-avatar-fallback">{initials}</div>
                }
                <div className="profile-avatar-overlay">
                  {uploading
                    ? <div className="profile-spinner" />
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                  }
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
              </div>
              <p className="profile-avatar-hint">Click to upload (max 2MB)</p>
              {currentAvatar && (
                <button className="profile-remove-avatar" onClick={handleRemoveAvatar} disabled={uploading}>
                  Remove photo
                </button>
              )}
            </div>

            {/* Name */}
            <div className="profile-field">
              <label className="profile-label">Display Name</label>
              <div className="profile-name-row">
                <input
                  className="profile-input"
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Your name"
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdateName() }}
                />
                <button className="profile-save-btn" onClick={handleUpdateName} disabled={editName.trim() === displayName}>
                  Save
                </button>
              </div>
            </div>

            {/* Email (read-only) */}
            <div className="profile-field">
              <label className="profile-label">Email</label>
              <input className="profile-input profile-input-readonly" type="email" value={displayEmail} readOnly />
            </div>

            {/* Auth provider */}
            <div className="profile-field">
              <label className="profile-label">Sign-in Method</label>
              <div className="profile-provider">
                {user?.app_metadata?.provider === 'google'
                  ? <><svg viewBox="0 0 24 24" width="16" height="16"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Google</>
                  : <><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> Email & Password</>
                }
              </div>
            </div>

            {profileMsg.text && <div className={`profile-msg ${profileMsg.type}`}>{profileMsg.text}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
