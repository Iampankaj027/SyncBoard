import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { io } from 'socket.io-client'
import './Board.css'

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

// ─── 15 Color presets ───
const PRESETS = [
  '#ffffff','#f97316','#ef4444','#eab308','#22c55e',
  '#3b82f6','#a855f7','#ec4899','#06b6d4','#10b981',
  '#f43f5e','#8b5cf6','#64748b','#854d0e','#000000',
]

// ─── 15 Shapes (MS Paint style) ───
const SHAPES = [
  { id: 'line',     label: 'Line',          key: 'L' },
  { id: 'arrow',    label: 'Arrow',         key: 'A' },
  { id: 'rect',     label: 'Rectangle',     key: 'R' },
  { id: 'roundrect',label: 'Rounded Rect',  key: null },
  { id: 'circle',   label: 'Ellipse',       key: 'C' },
  { id: 'triangle', label: 'Triangle',      key: 'T' },
  { id: 'righttri', label: 'Right Triangle', key: null },
  { id: 'diamond',  label: 'Diamond',       key: 'D' },
  { id: 'pentagon', label: 'Pentagon',       key: null },
  { id: 'hexagon',  label: 'Hexagon',       key: null },
  { id: 'octagon',  label: 'Octagon',       key: null },
  { id: 'star5',    label: '5-Point Star',  key: null },
  { id: 'star6',    label: '6-Point Star',  key: null },
  { id: 'heart',    label: 'Heart',         key: null },
  { id: 'cross',    label: 'Cross / Plus',  key: null },
]

const GRID_MODES = ['none', 'dots', 'lines', 'graph']

// ─── Polygon helper ───
const polyPoints = (cx, cy, rx, ry, n, startAngle = -Math.PI / 2) => {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = startAngle + (2 * Math.PI * i) / n
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
  }
  return pts
}

// ─── Star helper ───
const starPoints = (cx, cy, rx, ry, n, inner = 0.4) => {
  const pts = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n
    const r = i % 2 === 0 ? 1 : inner
    pts.push({ x: cx + rx * r * Math.cos(a), y: cy + ry * r * Math.sin(a) })
  }
  return pts
}

export default function Board() {
  const { roomId } = useParams()
  const navigate = useNavigate()

  // ─── State ───
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#ffffff')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [bgMode, setBgMode] = useState('dark')
  const [gridMode, setGridMode] = useState('dots')
  const [showClear, setShowClear] = useState(false)
  const [showShapes, setShowShapes] = useState(false)
  const [eraserPos, setEraserPos] = useState({ x: 0, y: 0 })
  const [recentColors, setRecentColors] = useState([])
  const [roomName, setRoomName] = useState('')
  const [liveUsers, setLiveUsers] = useState(1)
  const [cursors, setCursors] = useState({})
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [userName, setUserName] = useState('User')

  // ─── Refs ───
  const mainCanvasRef = useRef(null)
  const tempCanvasRef = useRef(null)
  const mainCtxRef = useRef(null)
  const tempCtxRef = useRef(null)
  const strokesRef = useRef([])
  const redoStackRef = useRef([])
  const laserStrokesRef = useRef([])
  const isDrawingRef = useRef(false)
  const currentStrokeRef = useRef(null)
  const colorInputRef = useRef(null)
  const socketRef = useRef(null)
  const cursorThrottleRef = useRef(0)
  const chatEndRef = useRef(null)
  const laserCanvasRef = useRef(null)
  const laserCtxRef = useRef(null)
  const [, forceUpdate] = useState(0)

  // ─── Auth + Load strokes + Save recent room ───
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { navigate('/'); return }
      const user = session.user
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
      setUserName(name)

      // Read room name from localStorage
      try {
        const recent = JSON.parse(localStorage.getItem('syncboard_recent_rooms') || '[]')
        const room = recent.find(r => r.id === roomId)
        if (room?.name) setRoomName(room.name)
      } catch (_) {}

      // ─── Connect Socket.IO ───
      const socket = io(API)
      socketRef.current = socket

      socket.on('connect', () => {
        console.log('Socket connected:', socket.id)
        socket.emit('join-room', { roomId, userName: name })
      })

      // Receive stroke from another user
      socket.on('receive-stroke', (stroke) => {
        // Laser strokes go to the laser layer (temporary)
        if (stroke.type === 'laser') {
          laserStrokesRef.current = [...laserStrokesRef.current, { ...stroke, time: Date.now() }]
          return
        }
        strokesRef.current = [...strokesRef.current, stroke]
        const ctx = mainCtxRef.current
        if (ctx) renderStroke(ctx, stroke)
        forceUpdate(n => n + 1)
      })

      // Another user undid a stroke
      socket.on('stroke-undone', () => {
        if (strokesRef.current.length === 0) return
        strokesRef.current = strokesRef.current.slice(0, -1)
        redrawMain()
        forceUpdate(n => n + 1)
      })

      // Another user cleared the board
      socket.on('board-cleared', () => {
        strokesRef.current = []
        redrawMain()
        const tctx = tempCtxRef.current
        if (tctx) tctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
        forceUpdate(n => n + 1)
      })

      // Live user count
      socket.on('room-users', (count) => {
        setLiveUsers(count)
      })

      // Live cursors from other users
      socket.on('cursor-update', ({ id, name: n, x, y }) => {
        setCursors(prev => ({ ...prev, [id]: { name: n, x, y } }))
      })
      socket.on('cursor-remove', (id) => {
        setCursors(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      })

      // Chat messages
      socket.on('chat-receive', (msg) => {
        setChatMessages(prev => [...prev, msg])
      })

      // Update recent rooms in localStorage (preserve existing name)
      try {
        const recent = JSON.parse(localStorage.getItem('syncboard_recent_rooms') || '[]')
        const existing = recent.find(r => r.id === roomId)
        const filtered = recent.filter(r => r.id !== roomId)
        filtered.unshift({
          id: roomId,
          name: existing?.name || null,
          lastVisited: new Date().toISOString(),
        })
        localStorage.setItem('syncboard_recent_rooms', JSON.stringify(filtered.slice(0, 10)))
      } catch (_) {}

      // Load existing strokes from backend
      try {
        const res = await fetch(`${API}/api/strokes/${roomId}`)
        if (res.ok) {
          const data = await res.json()
          if (data && data.length > 0) {
            strokesRef.current = data.map(d => d.path_data)
            // Wait for canvas to be ready, then redraw
            setTimeout(() => { redrawMain(); forceUpdate(n => n + 1) }, 100)
          }
        }
      } catch (err) {
        console.warn('Failed to load strokes:', err)
      }
    }
    init()

    // Cleanup socket on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [navigate, roomId])

  // ─── Canvas setup ───
  useEffect(() => {
    const setup = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      ;[mainCanvasRef, tempCanvasRef, laserCanvasRef].forEach(ref => {
        const c = ref.current
        if (!c) return
        c.width = w * dpr
        c.height = h * dpr
        c.style.width = w + 'px'
        c.style.height = h + 'px'
        const ctx = c.getContext('2d')
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (ref === mainCanvasRef) mainCtxRef.current = ctx
        else if (ref === tempCanvasRef) tempCtxRef.current = ctx
        else laserCtxRef.current = ctx
      })
      redrawMain()
    }
    setup()
    window.addEventListener('resize', setup)
    return () => window.removeEventListener('resize', setup)
  }, [])

  const redrawMain = useCallback(() => {
    const ctx = mainCtxRef.current
    if (!ctx) return
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    strokesRef.current.forEach(s => renderStroke(ctx, s))
  }, [])

  // ─── Laser tick loop (fade after 3s) ───
  useEffect(() => {
    let raf
    const tick = () => {
      const now = Date.now()
      const ctx = laserCtxRef.current
      if (ctx && laserStrokesRef.current.length > 0) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
        laserStrokesRef.current = laserStrokesRef.current.filter(ls => {
          const age = now - ls.time
          if (age > 3500) return false // fully gone
          const alpha = age < 2500 ? 1 : 1 - (age - 2500) / 1000
          renderLaserStroke(ctx, ls, alpha)
          return true
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const renderLaserStroke = (ctx, ls, alpha) => {
    const pts = ls.points
    if (!pts || pts.length < 2) return
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#ff2222'
    ctx.lineWidth = 3
    ctx.shadowColor = '#ff0000'
    ctx.shadowBlur = 18
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
    // second pass for intense glow
    ctx.shadowBlur = 40
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ff6666'
    ctx.stroke()
    ctx.restore()
  }

  // ─── Track recent color ───
  const addRecent = (c) => {
    if (PRESETS.includes(c) && PRESETS.indexOf(c) < 5) return // skip common presets
    setRecentColors(prev => {
      const f = prev.filter(x => x !== c)
      return [c, ...f].slice(0, 6)
    })
  }

  // ═══════════════════════════════
  // RENDERING
  // ═══════════════════════════════
  const renderStroke = (ctx, stroke) => {
    if (stroke.tool === 'eraser') return // eraser strokes are not rendered
    ctx.save()
    ctx.lineWidth = stroke.width
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
    ctx.globalCompositeOperation = 'source-over'

    // Highlighter: semi-transparent, flat caps
    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.35
      ctx.lineCap = 'square'
      ctx.lineJoin = 'miter'
    }
    // Brush: softer edge via shadow trick
    if (stroke.tool === 'brush') {
      ctx.shadowColor = stroke.color
      ctx.shadowBlur = stroke.width * 0.6
    }

    if (stroke.type === 'freehand') renderFreehand(ctx, stroke)
    else if (stroke.type === 'shape') renderShape(ctx, stroke)
    ctx.restore()
  }

  const renderFreehand = (ctx, stroke) => {
    const pts = stroke.points
    if (!pts || pts.length === 0) return
    if (pts.length === 1) {
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my)
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
    ctx.stroke()
  }

  const renderShape = (ctx, stroke) => {
    const { shapeType, start, end } = stroke
    if (!start || !end) return
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const w = Math.abs(end.x - start.x)
    const h = Math.abs(end.y - start.y)
    const cx = (start.x + end.x) / 2
    const cy = (start.y + end.y) / 2

    const drawPoly = (pts) => {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.closePath()
      ctx.stroke()
    }

    switch (shapeType) {
      case 'line':
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
        break

      case 'arrow': {
        const dx = end.x - start.x, dy = end.y - start.y
        const angle = Math.atan2(dy, dx)
        const headLen = Math.min(22, Math.sqrt(dx * dx + dy * dy) * 0.3)
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(end.x, end.y)
        ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6))
        ctx.moveTo(end.x, end.y)
        ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6))
        ctx.stroke()
        break
      }

      case 'rect':
        ctx.beginPath()
        ctx.strokeRect(x, y, w, h)
        break

      case 'roundrect': {
        const r = Math.min(20, w * 0.2, h * 0.2)
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + w - r, y)
        ctx.arcTo(x + w, y, x + w, y + r, r)
        ctx.lineTo(x + w, y + h - r)
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
        ctx.lineTo(x + r, y + h)
        ctx.arcTo(x, y + h, x, y + h - r, r)
        ctx.lineTo(x, y + r)
        ctx.arcTo(x, y, x + r, y, r)
        ctx.closePath()
        ctx.stroke()
        break
      }

      case 'circle':
        ctx.beginPath()
        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
        break

      case 'triangle': {
        const mid = (start.x + end.x) / 2
        ctx.beginPath()
        ctx.moveTo(mid, Math.min(start.y, end.y))
        ctx.lineTo(Math.max(start.x, end.x), Math.max(start.y, end.y))
        ctx.lineTo(Math.min(start.x, end.x), Math.max(start.y, end.y))
        ctx.closePath()
        ctx.stroke()
        break
      }

      case 'righttri':
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + h)
        ctx.lineTo(x + w, y + h)
        ctx.closePath()
        ctx.stroke()
        break

      case 'diamond':
        drawPoly([{ x: cx, y }, { x: x + w, y: cy }, { x: cx, y: y + h }, { x, y: cy }])
        break

      case 'pentagon':
        drawPoly(polyPoints(cx, cy, w / 2, h / 2, 5))
        break

      case 'hexagon':
        drawPoly(polyPoints(cx, cy, w / 2, h / 2, 6))
        break

      case 'octagon':
        drawPoly(polyPoints(cx, cy, w / 2, h / 2, 8))
        break

      case 'star5':
        drawPoly(starPoints(cx, cy, w / 2, h / 2, 5, 0.38))
        break

      case 'star6':
        drawPoly(starPoints(cx, cy, w / 2, h / 2, 6, 0.5))
        break

      case 'heart': {
        ctx.beginPath()
        const topY = y + h * 0.3
        ctx.moveTo(cx, y + h)
        ctx.bezierCurveTo(x - w * 0.1, cy, x, y - h * 0.05, cx, topY)
        ctx.bezierCurveTo(x + w, y - h * 0.05, x + w + w * 0.1, cy, cx, y + h)
        ctx.stroke()
        break
      }

      case 'cross': {
        const bw = w / 3, bh = h / 3
        ctx.beginPath()
        ctx.moveTo(x + bw, y)
        ctx.lineTo(x + 2 * bw, y)
        ctx.lineTo(x + 2 * bw, y + bh)
        ctx.lineTo(x + w, y + bh)
        ctx.lineTo(x + w, y + 2 * bh)
        ctx.lineTo(x + 2 * bw, y + 2 * bh)
        ctx.lineTo(x + 2 * bw, y + h)
        ctx.lineTo(x + bw, y + h)
        ctx.lineTo(x + bw, y + 2 * bh)
        ctx.lineTo(x, y + 2 * bh)
        ctx.lineTo(x, y + bh)
        ctx.lineTo(x + bw, y + bh)
        ctx.closePath()
        ctx.stroke()
        break
      }

      default: break
    }
  }

  // ─── Position helper ───
  const getPos = (e) => {
    if (e.touches?.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
    return { x: e.clientX, y: e.clientY }
  }

  const isShapeTool = (t) => SHAPES.some(s => s.id === t)
  const isPenLike = (t) => ['pen','brush','highlighter'].includes(t)

  // ─── Stroke-level eraser: check if point is near any stroke ───
  const eraseAtPoint = (pos) => {
    const radius = strokeWidth * 2
    let changed = false
    strokesRef.current = strokesRef.current.filter(s => {
      if (s.type === 'freehand' && s.points) {
        for (const p of s.points) {
          const dx = p.x - pos.x, dy = p.y - pos.y
          if (dx * dx + dy * dy < (radius + s.width) * (radius + s.width)) {
            changed = true
            return false // remove this stroke
          }
        }
      } else if (s.type === 'shape' && s.start && s.end) {
        const cx = (s.start.x + s.end.x) / 2, cy = (s.start.y + s.end.y) / 2
        const hw = Math.abs(s.end.x - s.start.x) / 2 + s.width
        const hh = Math.abs(s.end.y - s.start.y) / 2 + s.width
        if (Math.abs(pos.x - cx) < hw + radius && Math.abs(pos.y - cy) < hh + radius) {
          changed = true
          return false
        }
      }
      return true
    })
    if (changed) {
      redrawMain()
      forceUpdate(n => n + 1)
    }
  }

  // ═══ POINTER HANDLERS ═══
  const onPointerDown = (e) => {
    e.preventDefault()
    const pos = getPos(e)
    isDrawingRef.current = true

    if (tool === 'eraser') {
      eraseAtPoint(pos)
      currentStrokeRef.current = { tool: 'eraser' } // placeholder
    } else if (tool === 'laser') {
      currentStrokeRef.current = {
        type: 'laser', points: [pos], time: Date.now(),
      }
    } else if (isPenLike(tool)) {
      const w = tool === 'highlighter' ? strokeWidth * 4 : tool === 'brush' ? strokeWidth * 2 : strokeWidth
      currentStrokeRef.current = {
        type: 'freehand', points: [pos],
        color, width: w, tool,
      }
      const ctx = mainCtxRef.current
      if (ctx) {
        ctx.save()
        if (tool === 'highlighter') {
          ctx.globalAlpha = 0.35
          ctx.fillStyle = color
        } else {
          ctx.fillStyle = color
        }
        if (tool === 'brush') {
          ctx.shadowColor = color
          ctx.shadowBlur = w * 0.6
        }
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, w / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    } else if (isShapeTool(tool)) {
      currentStrokeRef.current = {
        type: 'shape', shapeType: tool,
        start: pos, end: pos,
        color, width: strokeWidth, tool: 'shape',
      }
    }
  }

  const onPointerMove = (e) => {
    e.preventDefault()
    const pos = getPos(e)
    if (tool === 'eraser') setEraserPos(pos)
    if (!isDrawingRef.current || !currentStrokeRef.current) return

    if (tool === 'eraser') {
      eraseAtPoint(pos)
    } else if (tool === 'laser') {
      currentStrokeRef.current.points.push(pos)
      // Live preview on laser canvas
      const ctx = laserCtxRef.current
      if (ctx) {
        const pts = currentStrokeRef.current.points
        if (pts.length >= 2) {
          ctx.save()
          ctx.strokeStyle = '#ff2222'
          ctx.lineWidth = 3
          ctx.shadowColor = '#ff0000'
          ctx.shadowBlur = 18
          ctx.beginPath()
          const a = pts[pts.length - 2], b = pts[pts.length - 1]
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
          ctx.restore()
        }
      }
    } else if (isPenLike(tool)) {
      currentStrokeRef.current.points.push(pos)
      const ctx = mainCtxRef.current
      const pts = currentStrokeRef.current.points
      if (ctx && pts.length >= 2) {
        ctx.save()
        ctx.strokeStyle = currentStrokeRef.current.color
        ctx.lineWidth = currentStrokeRef.current.width
        if (currentStrokeRef.current.tool === 'highlighter') {
          ctx.globalAlpha = 0.35
          ctx.lineCap = 'square'
          ctx.lineJoin = 'miter'
        }
        if (currentStrokeRef.current.tool === 'brush') {
          ctx.shadowColor = currentStrokeRef.current.color
          ctx.shadowBlur = currentStrokeRef.current.width * 0.6
        }
        ctx.beginPath()
        if (pts.length === 2) {
          ctx.moveTo(pts[0].x, pts[0].y)
          ctx.lineTo(pts[1].x, pts[1].y)
        } else {
          const a = pts[pts.length - 3], b = pts[pts.length - 2], c2 = pts[pts.length - 1]
          ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2)
          ctx.quadraticCurveTo(b.x, b.y, (b.x + c2.x) / 2, (b.y + c2.y) / 2)
        }
        ctx.stroke()
        ctx.restore()
      }
    } else if (isShapeTool(tool)) {
      currentStrokeRef.current.end = pos
      const ctx = tempCtxRef.current
      if (ctx) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
        renderStroke(ctx, currentStrokeRef.current)
      }
    }
  }

  const onPointerUp = (e) => {
    if (e) e.preventDefault()
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    if (currentStrokeRef.current) {
      // Laser: add to laser strokes (no permanent save)
      if (currentStrokeRef.current.type === 'laser') {
        if (currentStrokeRef.current.points.length >= 2) {
          const ls = { ...currentStrokeRef.current, time: Date.now() }
          laserStrokesRef.current = [...laserStrokesRef.current, ls]
          // Broadcast laser to others
          if (socketRef.current) {
            socketRef.current.emit('draw-stroke', { roomId, stroke: ls })
          }
        }
        currentStrokeRef.current = null
        return
      }

      // Eraser: already handled in move, just cleanup
      if (currentStrokeRef.current.tool === 'eraser') {
        currentStrokeRef.current = null
        return
      }

      if (isShapeTool(tool) && e) currentStrokeRef.current.end = getPos(e)

      const ok = currentStrokeRef.current.type === 'freehand'
        ? currentStrokeRef.current.points.length >= 1
        : true

      if (ok) {
        const finishedStroke = currentStrokeRef.current
        strokesRef.current = [...strokesRef.current, finishedStroke]
        redoStackRef.current = [] // clear redo on new stroke

        // Track recent color
        if (finishedStroke.tool !== 'eraser') {
          addRecent(finishedStroke.color)
        }

        if (finishedStroke.type === 'shape') {
          const ctx = mainCtxRef.current
          if (ctx) renderStroke(ctx, finishedStroke)
          const tctx = tempCtxRef.current
          if (tctx) tctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
        }

        // Save stroke to backend
        fetch(`${API}/api/strokes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, path_data: finishedStroke }),
        }).catch(err => console.warn('Failed to save stroke:', err))

        // Broadcast to other users via socket
        if (socketRef.current) {
          socketRef.current.emit('draw-stroke', { roomId, stroke: finishedStroke })
        }

        forceUpdate(n => n + 1)
      }
      currentStrokeRef.current = null
    }
  }

  // ─── Undo / Redo / Clear ───
  const handleUndo = useCallback(() => {
    if (strokesRef.current.length === 0) return
    const removed = strokesRef.current[strokesRef.current.length - 1]
    redoStackRef.current = [...redoStackRef.current, removed]
    strokesRef.current = strokesRef.current.slice(0, -1)
    redrawMain()
    forceUpdate(n => n + 1)
    if (socketRef.current) socketRef.current.emit('undo-stroke', roomId)
  }, [redrawMain, roomId])

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    const stroke = redoStackRef.current[redoStackRef.current.length - 1]
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    strokesRef.current = [...strokesRef.current, stroke]
    const ctx = mainCtxRef.current
    if (ctx) renderStroke(ctx, stroke)
    forceUpdate(n => n + 1)
    // Also broadcast the stroke to others
    if (socketRef.current) socketRef.current.emit('draw-stroke', { roomId, stroke })
  }, [roomId])

  const handleClear = () => {
    strokesRef.current = []
    redrawMain()
    const tctx = tempCtxRef.current
    if (tctx) tctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    setShowClear(false)
    forceUpdate(n => n + 1)

    // Delete from backend
    fetch(`${API}/api/strokes/${roomId}`, { method: 'DELETE' })
      .catch(err => console.warn('Failed to clear strokes:', err))

    // Broadcast clear
    if (socketRef.current) socketRef.current.emit('clear-board', roomId)
  }

  // ─── BG / Grid toggles ───
  const toggleBg = () => {
    setBgMode(b => {
      const next = b === 'dark' ? 'light' : 'dark'
      if (next === 'light' && color === '#ffffff') setColor('#000000')
      if (next === 'dark' && color === '#000000') setColor('#ffffff')
      return next
    })
  }

  const cycleGrid = () => setGridMode(g => GRID_MODES[(GRID_MODES.indexOf(g) + 1) % GRID_MODES.length])

  // ─── Custom color picker ───
  const onCustomColor = (e) => {
    const c = e.target.value
    setColor(c)
    if (tool === 'eraser') setTool('pen')
    addRecent(c)
  }

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const fn = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); handleUndo() }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); handleRedo() }
      if (e.key === 'p') setTool('pen')
      if (e.key === 'b') setTool('brush')
      if (e.key === 'h') setTool('highlighter')
      if (e.key === 'e') setTool('eraser')
      const shape = SHAPES.find(s => s.key && s.key.toLowerCase() === e.key)
      if (shape) setTool(shape.id)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [handleUndo, handleRedo])

  // ─── Cursor emission (throttled) ───
  const emitCursor = useCallback((e) => {
    const now = Date.now()
    if (now - cursorThrottleRef.current < 50) return
    cursorThrottleRef.current = now
    if (socketRef.current) {
      socketRef.current.emit('cursor-move', { roomId, x: e.clientX, y: e.clientY })
    }
  }, [roomId])

  // ─── Chat helpers ───
  const sendChat = () => {
    const text = chatInput.trim()
    if (!text || !socketRef.current) return
    socketRef.current.emit('chat-message', { roomId, text })
    setChatInput('')
  }

  // Auto-scroll chat + unread
  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0)
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else if (chatMessages.length > 0) {
      setUnreadCount(prev => prev + 1)
    }
  }, [chatMessages.length, chatOpen])

  // ─── Export canvas ───
  const exportCanvas = () => {
    const mainC = mainCanvasRef.current
    if (!mainC) return
    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth, h = window.innerHeight
    const exportC = document.createElement('canvas')
    exportC.width = w * dpr
    exportC.height = h * dpr
    const ctx = exportC.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = bgMode === 'dark' ? '#0a0a0a' : '#f5f5f4'
    ctx.fillRect(0, 0, w, h)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    strokesRef.current.forEach(s => renderStroke(ctx, s))
    const link = document.createElement('a')
    link.download = `syncboard-${roomId}.png`
    link.href = exportC.toDataURL('image/png')
    link.click()
  }

  // Close shapes popover
  useEffect(() => {
    if (!showShapes) return
    const close = () => setShowShapes(false)
    setTimeout(() => window.addEventListener('click', close), 0)
    return () => window.removeEventListener('click', close)
  }, [showShapes])

  // ═══ SHAPE ICONS ═══
  const sIcon = (id, size = 19) => {
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' }
    switch (id) {
      case 'line':     return <svg {...p}><line x1="5" y1="19" x2="19" y2="5" /></svg>
      case 'arrow':    return <svg {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg>
      case 'rect':     return <svg {...p}><rect x="3" y="3" width="18" height="18" /></svg>
      case 'roundrect':return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="4" /></svg>
      case 'circle':   return <svg {...p}><ellipse cx="12" cy="12" rx="9" ry="7" /></svg>
      case 'triangle': return <svg {...p}><path d="M12 4L21 20H3L12 4z" /></svg>
      case 'righttri': return <svg {...p}><path d="M4 4L4 20L20 20Z" /></svg>
      case 'diamond':  return <svg {...p}><path d="M12 2L22 12L12 22L2 12Z" /></svg>
      case 'pentagon': return <svg {...p}><path d="M12 2L21.5 9.5L18.5 20.5H5.5L2.5 9.5Z" /></svg>
      case 'hexagon':  return <svg {...p}><path d="M12 2L21 7V17L12 22L3 17V7Z" /></svg>
      case 'octagon':  return <svg {...p}><path d="M8 2H16L22 8V16L16 22H8L2 16V8Z" /></svg>
      case 'star5':    return <svg {...p}><path d="M12 2l2.9 6.3L22 9.3l-5 5.2L18.2 22 12 18.3 5.8 22 7 14.5 2 9.3l7.1-1L12 2z" /></svg>
      case 'star6':    return <svg {...p}><path d="M12 2l3.5 7H22l-6 5 3.5 8L12 17l-7.5 5L8 14 2 9h6.5z" /></svg>
      case 'heart':    return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
      case 'cross':    return <svg {...p}><path d="M9 2H15V9H22V15H15V22H9V15H2V9H9Z" /></svg>
      default:         return null
    }
  }

  // ─── Grid icon ───
  const gridIcon = () => {
    switch (gridMode) {
      case 'none':  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
      case 'dots':  return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="6" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="18" cy="6" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/><circle cx="6" cy="18" r="1.5"/><circle cx="12" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/></svg>
      case 'lines': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="18" x2="22" y2="18"/></svg>
      case 'graph': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="6" x2="22" y2="6"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="18" x2="22" y2="18"/><line x1="6" y1="2" x2="6" y2="22"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="18" y1="2" x2="18" y2="22"/></svg>
      default: return null
    }
  }

  const isShape = isShapeTool(tool)
  const activeShape = SHAPES.find(s => s.id === tool)
  const strokeCount = strokesRef.current.length

  return (
    <div className="board-container" data-bg={bgMode} data-tool={tool === 'laser' ? 'crosshair' : tool}>
      {gridMode !== 'none' && <div className={`board-grid-overlay grid-${gridMode}`} />}

      <canvas ref={mainCanvasRef} className="board-canvas-main"
        onMouseDown={onPointerDown}
        onMouseMove={(e) => { onPointerMove(e); emitCursor(e) }}
        onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
      />
      <canvas ref={tempCanvasRef} className="board-canvas-temp" style={{ pointerEvents: 'none' }} />
      <canvas ref={laserCanvasRef} className="board-canvas-laser" style={{ pointerEvents: 'none' }} />

      {tool === 'eraser' && (
        <div className="eraser-ring" style={{ left: eraserPos.x, top: eraserPos.y, width: strokeWidth * 4, height: strokeWidth * 4 }} />
      )}

      {/* ═══ Live Cursors ═══ */}
      {Object.entries(cursors).map(([id, c]) => (
        <div key={id} className="live-cursor" style={{ left: c.x, top: c.y }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#f97316" stroke="#000" strokeWidth="1">
            <path d="M5 3l14 7-6 2-2 6z" />
          </svg>
          <span className="cursor-label">{c.name}</span>
        </div>
      ))}

      {/* ═══ TOP BAR ═══ */}
      <div className="board-topbar">
        <div className="topbar-group">
          <button className="glass-btn" onClick={() => navigate('/dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Dashboard
          </button>
        </div>
        <div className="topbar-group">
          <button className="glass-btn" onClick={toggleBg} title={`Switch to ${bgMode === 'dark' ? 'light' : 'dark'}`}>
            {bgMode === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          <button className="glass-btn" onClick={cycleGrid} title={`Grid: ${gridMode}`}>
            {gridIcon()}
            <span style={{ fontSize: 11, textTransform: 'capitalize' }}>{gridMode}</span>
          </button>
          <div className="room-badge">
            <div className="room-dot" />
            {roomName && <span className="room-badge-name">{roomName}</span>}
            {roomName && <span style={{ opacity: 0.3 }}>·</span>}
            <span>{roomName ? '' : 'Room: '}<span className="room-badge-id">{roomId}</span></span>
          </div>
          <div className="glass-btn users-badge" style={{ cursor: 'default', gap: 5 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span style={{ fontWeight: 600 }}>{liveUsers}</span>
          </div>
          <button className="glass-btn" onClick={exportCanvas} title="Export as PNG">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button className={`glass-btn chat-toggle ${chatOpen ? 'active' : ''}`} onClick={() => setChatOpen(v => !v)} title="Chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unreadCount > 0 && !chatOpen && <span className="chat-unread">{unreadCount}</span>}
          </button>
        </div>
      </div>

      {/* ═══ BOTTOM TOOLBAR ═══ */}
      <div className="board-toolbar">

        {/* Pen */}
        <button className={`t-btn ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
          </svg>
          <span className="tip">Pen (P)</span>
        </button>

        {/* Brush */}
        <button className={`t-btn ${tool === 'brush' ? 'active' : ''}`} onClick={() => setTool('brush')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3z"/>
            <path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/>
          </svg>
          <span className="tip">Brush (B)</span>
        </button>

        {/* Highlighter */}
        <button className={`t-btn ${tool === 'highlighter' ? 'active' : ''}`} onClick={() => setTool('highlighter')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>
          </svg>
          <span className="tip">Highlighter (H)</span>
        </button>

        {/* Laser */}
        <button className={`t-btn laser-btn ${tool === 'laser' ? 'active' : ''}`} onClick={() => setTool('laser')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
          </svg>
          <span className="tip">Laser Pointer</span>
        </button>

        {/* Eraser */}
        <button className={`t-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 20H7L3 16l9-9 8 8-4 4z"/><path d="M6.5 13.5L12 8"/>
          </svg>
          <span className="tip">Eraser (E)</span>
        </button>

        <div className="toolbar-sep" />

        {/* Shapes */}
        <div className="shapes-popover-anchor" onClick={e => e.stopPropagation()}>
          <button className={`t-btn ${isShape ? 'active' : ''}`} onClick={() => setShowShapes(v => !v)}>
            {isShape ? sIcon(tool) : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
            <span className="tip">{activeShape ? activeShape.label : 'Shapes'}</span>
          </button>
          {showShapes && (
            <div className="shapes-popover">
              {SHAPES.map(s => (
                <button key={s.id} className={`t-btn ${tool === s.id ? 'active' : ''}`}
                  onClick={() => { setTool(s.id); setShowShapes(false) }}
                  title={s.label + (s.key ? ` (${s.key})` : '')}
                >
                  {sIcon(s.id)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar-sep" />

        {/* Recent Colors */}
        {recentColors.length > 0 && (
          <>
            <div className="swatches recent-swatches">
              {recentColors.map(c => (
                <button key={c} className={`swatch swatch-sm ${color === c && tool !== 'eraser' ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }}
                  title={`Recent: ${c}`}
                />
              ))}
            </div>
            <div className="toolbar-sep" />
          </>
        )}

        {/* Preset Colors */}
        <div className="swatches">
          {PRESETS.map(c => (
            <button key={c}
              className={`swatch ${color === c && tool !== 'eraser' ? 'active' : ''}`}
              style={{
                background: c,
                border: c === '#ffffff' ? '2px solid rgba(200,200,200,0.4)' : c === '#000000' ? '2px solid rgba(128,128,128,0.4)' : undefined,
                borderColor: color === c && tool !== 'eraser' ? '#f97316' : undefined,
              }}
              onClick={() => { setColor(c); if (tool === 'eraser') setTool('pen') }}
            />
          ))}
        </div>

        {/* Custom Color Picker */}
        <button className="t-btn color-picker-btn" onClick={() => colorInputRef.current?.click()} title="Custom Color">
          <div className="rainbow-ring" />
          <input ref={colorInputRef} type="color" className="hidden-color-input" value={color} onChange={onCustomColor} />
          <span className="tip">Custom Color</span>
        </button>

        <div className="toolbar-sep" />

        {/* Width */}
        <div className="width-group">
          <div className="w-preview">
            <div className="w-dot" style={{ width: Math.max(3, strokeWidth), height: Math.max(3, strokeWidth), background: tool === 'eraser' ? 'rgba(128,128,128,0.5)' : color }} />
          </div>
          <input type="range" className="w-slider" min="1" max="24" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} />
        </div>

        <div className="toolbar-sep" />

        {/* Undo */}
        <button className="t-btn" onClick={handleUndo} style={{ opacity: strokeCount === 0 ? 0.3 : 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
          <span className="tip">Undo (Ctrl+Z)</span>
        </button>

        {/* Redo */}
        <button className="t-btn" onClick={handleRedo} style={{ opacity: redoStackRef.current.length === 0 ? 0.3 : 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
          </svg>
          <span className="tip">Redo (Ctrl+Y)</span>
        </button>

        {/* Clear */}
        <button className="t-btn" onClick={() => setShowClear(true)} style={{ opacity: strokeCount === 0 ? 0.3 : 1 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
          <span className="tip">Clear Board</span>
        </button>
      </div>

      {/* ═══ Clear Confirm ═══ */}
      {showClear && (
        <div className="confirm-overlay" onClick={() => setShowClear(false)}>
          <div className="confirm-card" onClick={e => e.stopPropagation()}>
            <h3>Clear Board?</h3>
            <p>This will erase everything. This cannot be undone.</p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setShowClear(false)}>Cancel</button>
              <button className="confirm-yes" onClick={handleClear}>Clear Everything</button>
            </div>
          </div>
        </div>
      )}
      {/* ═══ Chat Panel ═══ */}
      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-header">
            <span className="chat-title">Room Chat</span>
            <button className="chat-close" onClick={() => setChatOpen(false)}>×</button>
          </div>
          <div className="chat-messages">
            {chatMessages.length === 0 && (
              <div className="chat-empty">No messages yet. Say hello! 👋</div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.id === socketRef.current?.id ? 'mine' : ''}`}>
                <span className="chat-msg-name">{m.name}</span>
                <span className="chat-msg-text">{m.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-row">
            <input
              className="chat-input"
              type="text"
              placeholder="Type a message..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
            />
            <button className="chat-send" onClick={sendChat} disabled={!chatInput.trim()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
