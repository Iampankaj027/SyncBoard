import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export default function PolyhedronBg() {
  const mountRef = useRef(null)

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // ─── Scene Setup ───
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.z = 5.5

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    // ─── Post-processing: Bloom ───
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      1.8,   // strength
      0.4,   // radius
      0.2    // threshold
    )
    composer.addPass(bloomPass)

    // ─── Colors ───
    const ORANGE = new THREE.Color(0xf97316)
    const ORANGE_DIM = new THREE.Color(0xea580c)
    const ORANGE_BRIGHT = new THREE.Color(0xfb923c)
    const ORANGE_HOT = new THREE.Color(0xff6600)

    // ═══ MASTER GROUP (everything rotates together slowly) ═══
    const masterGroup = new THREE.Group()
    scene.add(masterGroup)

    // ─── 1) Main Icosahedron Wireframe ───
    const icoGeo = new THREE.IcosahedronGeometry(2.2, 0)
    const icoWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(icoGeo),
      new THREE.LineBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.45 })
    )
    masterGroup.add(icoWire)

    // ─── 2) Vertex Spheres on Icosahedron ───
    const vertexPositions = icoGeo.getAttribute('position')
    const uniqueVerts = []
    const seen = new Set()
    for (let i = 0; i < vertexPositions.count; i++) {
      const x = vertexPositions.getX(i).toFixed(4)
      const y = vertexPositions.getY(i).toFixed(4)
      const z = vertexPositions.getZ(i).toFixed(4)
      const key = `${x},${y},${z}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueVerts.push(new THREE.Vector3(parseFloat(x), parseFloat(y), parseFloat(z)))
      }
    }

    const vertexSpheres = []
    uniqueVerts.forEach(v => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 16, 16),
        new THREE.MeshBasicMaterial({ color: ORANGE_BRIGHT })
      )
      sphere.position.copy(v)
      masterGroup.add(sphere)
      vertexSpheres.push(sphere)
    })

    // ─── 3) Inner Dodecahedron (counter-rotating) ───
    const dodecGeo = new THREE.DodecahedronGeometry(1.2, 0)
    const dodecWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(dodecGeo),
      new THREE.LineBasicMaterial({ color: ORANGE_DIM, transparent: true, opacity: 0.3 })
    )
    masterGroup.add(dodecWire)

    // ─── 4) Core Octahedron (innermost, bright) ───
    const octGeo = new THREE.OctahedronGeometry(0.5, 0)
    const octWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(octGeo),
      new THREE.LineBasicMaterial({ color: ORANGE_HOT, transparent: true, opacity: 0.7 })
    )
    masterGroup.add(octWire)

    // Core glow sphere
    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 32, 32),
      new THREE.MeshBasicMaterial({ color: ORANGE_HOT, transparent: true, opacity: 0.35 })
    )
    masterGroup.add(coreGlow)

    // ─── 5) Orbiting Particle Ring ───
    const ringCount = 60
    const ringGeo = new THREE.BufferGeometry()
    const ringPositions = new Float32Array(ringCount * 3)
    const ringColors = new Float32Array(ringCount * 3)
    const ringAngles = [] // store initial angles for animation

    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2
      const radius = 3.2 + (Math.random() - 0.5) * 0.4
      const yOffset = (Math.random() - 0.5) * 0.5
      ringPositions[i * 3] = Math.cos(angle) * radius
      ringPositions[i * 3 + 1] = yOffset
      ringPositions[i * 3 + 2] = Math.sin(angle) * radius
      ringAngles.push({ angle, radius, yOffset, speed: 0.15 + Math.random() * 0.15 })

      const c = new THREE.Color().lerpColors(ORANGE_DIM, ORANGE_BRIGHT, Math.random())
      ringColors[i * 3] = c.r
      ringColors[i * 3 + 1] = c.g
      ringColors[i * 3 + 2] = c.b
    }

    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPositions, 3))
    ringGeo.setAttribute('color', new THREE.BufferAttribute(ringColors, 3))

    const ringPoints = new THREE.Points(ringGeo, new THREE.PointsMaterial({
      size: 0.04,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    masterGroup.add(ringPoints)

    // ─── 6) Floating Dust Particles (scattered) ───
    const dustCount = 80
    const dustGeo = new THREE.BufferGeometry()
    const dustPositions = new Float32Array(dustCount * 3)
    const dustData = []

    for (let i = 0; i < dustCount; i++) {
      const r = 2 + Math.random() * 5
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      dustPositions[i * 3 + 2] = r * Math.cos(phi)
      dustData.push({ speed: 0.002 + Math.random() * 0.005, offset: Math.random() * 100 })
    }

    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))

    const dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      size: 0.02,
      color: ORANGE,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }))
    scene.add(dustPoints) // outside master group for parallax feel

    // ─── 7) Connection Lines (center to select vertices) ───
    const linesMaterial = new THREE.LineBasicMaterial({
      color: ORANGE,
      transparent: true,
      opacity: 0.12,
    })
    uniqueVerts.forEach((v, i) => {
      if (i % 3 === 0) { // only every 3rd vertex for subtlety
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), v])
        const line = new THREE.Line(lineGeo, linesMaterial)
        masterGroup.add(line)
      }
    })

    // ─── Mouse Interaction ───
    let mouseX = 0, mouseY = 0
    const onMouseMove = (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouseMove)

    // ─── Resize Handler ───
    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    // ─── Animation Loop ───
    const clock = new THREE.Clock()
    let animId

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Master group slow rotation + mouse influence
      masterGroup.rotation.y = t * 0.12 + mouseX * 0.3
      masterGroup.rotation.x = Math.sin(t * 0.08) * 0.15 + mouseY * 0.2

      // Inner dodecahedron counter-rotation
      dodecWire.rotation.y = -t * 0.25
      dodecWire.rotation.z = t * 0.15

      // Core octahedron fast spin
      octWire.rotation.y = t * 0.6
      octWire.rotation.x = t * 0.4

      // Core glow pulse
      const pulse = 0.25 + Math.sin(t * 2) * 0.15
      coreGlow.material.opacity = pulse
      coreGlow.scale.setScalar(1 + Math.sin(t * 2.5) * 0.15)

      // Vertex spheres pulse
      vertexSpheres.forEach((s, i) => {
        const p = 0.8 + Math.sin(t * 3 + i * 0.5) * 0.3
        s.material.opacity = p
        s.scale.setScalar(0.8 + Math.sin(t * 2 + i) * 0.3)
      })

      // Ring particles orbit
      const rp = ringGeo.getAttribute('position')
      for (let i = 0; i < ringCount; i++) {
        const d = ringAngles[i]
        const a = d.angle + t * d.speed
        rp.setXYZ(i,
          Math.cos(a) * d.radius,
          d.yOffset + Math.sin(t * 0.5 + i) * 0.15,
          Math.sin(a) * d.radius
        )
      }
      rp.needsUpdate = true

      // Dust float
      const dp = dustGeo.getAttribute('position')
      for (let i = 0; i < dustCount; i++) {
        const y = dp.getY(i) + Math.sin(t * dustData[i].speed * 10 + dustData[i].offset) * 0.002
        dp.setY(i, y)
      }
      dp.needsUpdate = true

      // Floating bob
      masterGroup.position.y = Math.sin(t * 0.5) * 0.15

      // Icosahedron wireframe opacity breath
      icoWire.material.opacity = 0.35 + Math.sin(t * 0.8) * 0.1

      composer.render()
    }

    animate()

    // ─── Cleanup ───
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      composer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  )
}
