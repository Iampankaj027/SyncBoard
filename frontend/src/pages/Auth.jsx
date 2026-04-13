import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import './Auth.css'

export default function Auth() {
  const [tab, setTab] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const cardRef = useRef(null)
  const navigate = useNavigate()

  // If already logged in, redirect
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate('/dashboard')
    })
  }, [navigate])

  const handleMouseMove = (e) => {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    cardRef.current.style.setProperty('--mx', (e.clientX - rect.left) + 'px')
    cardRef.current.style.setProperty('--my', (e.clientY - rect.top) + 'px')
  }

  const switchTab = (t) => {
    setTab(t)
    setMessage({ type: '', text: '' })
  }

  // Email/Password auth
  const handleSubmit = async () => {
    setMessage({ type: '', text: '' })

    if (tab === 'register' && !name.trim()) {
      setMessage({ type: 'error', text: 'Please enter your full name.' })
      return
    }
    if (!email) {
      setMessage({ type: 'error', text: 'Please enter your email address.' })
      return
    }
    if (!password) {
      setMessage({ type: 'error', text: 'Please enter a password.' })
      return
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' })
      return
    }

    setLoading(true)
    if (tab === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else {
        navigate('/dashboard')
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: window.location.origin + '/dashboard',
        }
      })
      if (error) {
        setMessage({ type: 'error', text: error.message })
      } else if (data?.user?.identities?.length === 0) {
        setMessage({ type: 'error', text: 'This email is already registered. Try logging in.' })
      } else {
        setMessage({ type: 'success', text: '✓ Account created! Check your email to verify, then log in.' })
        setTab('login')
      }
    }
    setLoading(false)
  }

  // Google OAuth
  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard',
      }
    })
    if (error) {
      setMessage({ type: 'error', text: error.message })
      setGoogleLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="auth-body">

      {/* Orange Circuit Board SVG Background */}
      <svg className="bg-canvas" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <rect width="1440" height="900" fill="#050505"/>
        <defs>
          <pattern id="smallgrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5"/>
          </pattern>
          <pattern id="biggrid" width="200" height="200" patternUnits="userSpaceOnUse">
            <rect width="200" height="200" fill="url(#smallgrid)"/>
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.8"/>
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect width="1440" height="900" fill="url(#biggrid)"/>

        <g stroke="rgba(249,115,22,0.2)" strokeWidth="1" fill="none">
          <path d="M0,150 L200,150 L200,200 L400,200"/>
          <path d="M0,350 L100,350 L100,300 L350,300 L350,350 L500,350"/>
          <path d="M1440,120 L1200,120 L1200,170 L1000,170"/>
          <path d="M1440,400 L1300,400 L1300,450 L1100,450 L1100,400 L900,400"/>
          <path d="M0,700 L150,700 L150,650 L400,650 L400,700 L600,700"/>
          <path d="M1440,720 L1250,720 L1250,680 L1050,680"/>
          <path d="M600,900 L600,750 L700,750 L700,700"/>
          <path d="M800,0 L800,100 L850,100 L850,200"/>
          <path d="M200,900 L200,800 L300,800 L300,750 L500,750"/>
          <path d="M1100,900 L1100,820 L1000,820 L1000,750 L850,750"/>
        </g>

        <g stroke="rgba(249,115,22,0.35)" strokeWidth="1.2" fill="none" filter="url(#glow)">
          <path d="M0,500 L180,500 L180,550 L320,550"/>
          <path d="M1440,550 L1280,550 L1280,500 L1100,500"/>
          <path d="M700,0 L700,80 L650,80 L650,160 L750,160 L750,220"/>
          <path d="M400,900 L400,820 L480,820 L480,760"/>
          <path d="M1000,900 L1000,850 L920,850 L920,780 L1050,780"/>
        </g>

        <g fill="rgba(249,115,22,0.6)" filter="url(#glow)">
          <circle cx="200" cy="150" r="3"><animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite"/></circle>
          <circle cx="400" cy="200" r="3"><animate attributeName="opacity" values="0.6;1;0.6" dur="4s" repeatCount="indefinite"/></circle>
          <circle cx="350" cy="350" r="2.5"><animate attributeName="opacity" values="0.6;1;0.6" dur="2.5s" repeatCount="indefinite"/></circle>
          <circle cx="1200" cy="170" r="2.5"><animate attributeName="opacity" values="0.6;1;0.6" dur="3.5s" repeatCount="indefinite"/></circle>
          <circle cx="1300" cy="400" r="3"><animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/></circle>
          <circle cx="180" cy="500" r="3"><animate attributeName="opacity" values="0.6;1;0.6" dur="4s" repeatCount="indefinite"/></circle>
          <circle cx="700" cy="80" r="3"><animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite"/></circle>
          <circle cx="150" cy="700" r="3"><animate attributeName="opacity" values="0.6;1;0.6" dur="2.8s" repeatCount="indefinite"/></circle>
          <circle cx="1280" cy="550" r="3"><animate attributeName="opacity" values="0.6;1;0.6" dur="3.2s" repeatCount="indefinite"/></circle>
          <circle cx="850" cy="200" r="2.5"><animate attributeName="opacity" values="0.6;1;0.6" dur="4.5s" repeatCount="indefinite"/></circle>
        </g>

        <g stroke="rgba(249,115,22,0.25)" strokeWidth="1" fill="none">
          <rect x="190" y="185" width="20" height="30" rx="2"/>
          <rect x="340" y="335" width="20" height="30" rx="2"/>
          <rect x="1190" y="105" width="20" height="30" rx="2"/>
          <rect x="1290" y="385" width="20" height="30" rx="2"/>
          <rect x="390" y="635" width="20" height="30" rx="2"/>
          <rect x="640" y="65" width="20" height="30" rx="2"/>
          <rect x="170" y="485" width="20" height="30" rx="2"/>
          <rect x="1270" y="535" width="20" height="30" rx="2"/>
        </g>

        {/* Animated circuit pulses */}
        <circle r="4" fill="rgba(249,115,22,0.9)" filter="url(#glow)">
          <animateMotion dur="6s" repeatCount="indefinite" path="M0,150 L200,150 L200,200 L400,200"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="6s" repeatCount="indefinite"/>
        </circle>
        <circle r="4" fill="rgba(249,115,22,0.9)" filter="url(#glow)">
          <animateMotion dur="8s" repeatCount="indefinite" path="M1440,400 L1300,400 L1300,450 L1100,450 L1100,400 L900,400"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="8s" repeatCount="indefinite"/>
        </circle>
        <circle r="3.5" fill="rgba(251,146,60,0.9)" filter="url(#glow)">
          <animateMotion dur="7s" repeatCount="indefinite" path="M0,500 L180,500 L180,550 L320,550"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="7s" repeatCount="indefinite"/>
        </circle>
        <circle r="3.5" fill="rgba(249,115,22,0.8)" filter="url(#glow)">
          <animateMotion dur="9s" repeatCount="indefinite" path="M700,0 L700,80 L650,80 L650,160 L750,160 L750,220"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="9s" repeatCount="indefinite"/>
        </circle>
        <circle r="3" fill="rgba(234,88,12,0.85)" filter="url(#glow)">
          <animateMotion dur="10s" repeatCount="indefinite" path="M0,700 L150,700 L150,650 L400,650 L400,700 L600,700"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="10s" repeatCount="indefinite"/>
        </circle>
      </svg>

      <div className="vignette" />

      <div className="card" ref={cardRef} onMouseMove={handleMouseMove}>
        <div className="card-inner">
          <div className="logo">Sync<span>Board</span></div>
          <p className="tagline">Real-time collaborative whiteboard</p>

          <div className="tabs">
            <button className={`tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>Login</button>
            <button className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => switchTab('register')}>Register</button>
          </div>

          {message.text && <div className={`message ${message.type}`}>{message.text}</div>}

          {/* Google OAuth */}
          <button className="google-btn" onClick={handleGoogleLogin} disabled={googleLoading}>
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          {tab === 'register' && (
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} onKeyDown={handleKeyDown} />
            </div>
          )}

          <div className="form-group">
            <label>Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKeyDown} />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="password-row">
              <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown} />
              <button type="button" className="eye-btn" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                {showPassword
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          <button className="btn" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Please wait...' : tab === 'login' ? 'Login to SyncBoard' : 'Create Account'}
          </button>

          <p className="footer-text">
            {tab === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button className="switch-link" onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}>
              {tab === 'login' ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}