/**
 * 3D Settlement Pipeline Stage (Slot D.4)
 * Visualizes the non-custodial lifecycle: Source Chain -> Bridge/Solver Lane -> Destination Chain.
 *
 * Implemented using pure Three.js (same architectural pattern as dial3d.ts).
 * Includes automatic WebGL capability detection, SVG 2D fallback, and reduced-motion support.
 */

import { useEffect, useRef, useState } from 'react'
import {
  AmbientLight,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three'
import { getStateStyle, type SettlementItem } from '../../services/settlementService'

interface Pipeline3DProps {
  settlement?: SettlementItem | null
}

interface StageHandle {
  dispose: () => void
  updateState: (state: string, isSameChain: boolean) => void
}

function mountPipelineStage(
  canvas: HTMLCanvasElement,
  initialState: string,
  initialSameChain: boolean,
  reducedMotion: boolean,
): StageHandle | null {
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  if (!gl) return null

  const scene = new Scene()
  const camera = new PerspectiveCamera(42, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 100)
  camera.position.set(0, 1.8, 5.2)
  camera.lookAt(0, 0, 0)

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  // Lighting
  const ambient = new AmbientLight(0xffffff, 1.1)
  const keyLight = new PointLight(0x00ffa3, 2.5, 20)
  keyLight.position.set(-2, 3, 3)
  const fillLight = new PointLight(0x8b5cf6, 2.5, 20)
  fillLight.position.set(2, 3, 3)
  scene.add(ambient, keyLight, fillLight)

  const stageGroup = new Group()
  scene.add(stageGroup)

  // 1. Source Platform (Left)
  const platGeom = new CylinderGeometry(0.75, 0.85, 0.22, 32)
  const srcMat = new MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.2,
  })
  const srcPlatform = new Mesh(platGeom, srcMat)
  srcPlatform.position.set(-2.2, -0.4, 0)
  stageGroup.add(srcPlatform)

  // 2. Destination Platform (Right)
  const dstMat = new MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.8,
    emissive: 0x059669,
    emissiveIntensity: 0.2,
  })
  const dstPlatform = new Mesh(platGeom, dstMat)
  dstPlatform.position.set(2.2, -0.4, 0)
  stageGroup.add(dstPlatform)

  // 3. Middle Bridge Lane / Cylinder
  const laneGeom = new CylinderGeometry(0.12, 0.12, 3.2, 16)
  laneGeom.rotateZ(Math.PI / 2)
  const laneMat = new MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.5,
    metalness: 0.5,
    emissive: 0x8b5cf6,
    emissiveIntensity: 0.15,
  })
  const bridgeLane = new Mesh(laneGeom, laneMat)
  bridgeLane.position.set(0, -0.4, 0)
  stageGroup.add(bridgeLane)

  // 4. Particle System
  const particleCount = 60
  const pGeom = new BufferGeometry()
  const pPositions = new Float32Array(particleCount * 3)
  const pVelocities = new Float32Array(particleCount)
  for (let i = 0; i < particleCount; i++) {
    pPositions[i * 3] = -2.2 + Math.random() * 4.4
    pPositions[i * 3 + 1] = -0.3 + (Math.random() - 0.5) * 0.3
    pPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.3
    pVelocities[i] = 0.01 + Math.random() * 0.02
  }
  pGeom.setAttribute('position', new Float32BufferAttribute(pPositions, 3))
  const pMat = new PointsMaterial({
    color: 0x00ffa3,
    size: 0.08,
    transparent: true,
    opacity: 0.85,
  })
  const particles = new Points(pGeom, pMat)
  stageGroup.add(particles)

  // 5. Target Orb (Token in transit)
  const orbGeom = new SphereGeometry(0.18, 24, 24)
  const orbMat = new MeshBasicMaterial({ color: 0x00ffa3 })
  const tokenOrb = new Mesh(orbGeom, orbMat)
  tokenOrb.position.set(-2.2, 0, 0)
  stageGroup.add(tokenOrb)

  let currentState = initialState.toUpperCase()
  let isSameChain = initialSameChain
  let animFrameId: number | null = null
  let orbProgress = 0

  function applyVisualTheme() {
    const s = currentState
    const style = getStateStyle(s)
    const col = new Color(style.color)

    pMat.color.copy(col)
    orbMat.color.copy(col)
    keyLight.color.copy(col)

    if (isSameChain) {
      bridgeLane.visible = false
      srcPlatform.position.set(0, -0.4, 0)
      dstPlatform.visible = false
    } else {
      bridgeLane.visible = true
      srcPlatform.position.set(-2.2, -0.4, 0)
      dstPlatform.visible = true
      dstPlatform.position.set(2.2, -0.4, 0)
    }

    if (s === 'STUCK_UNKNOWN') {
      laneMat.emissive.setHex(0xf43f5e)
      laneMat.emissiveIntensity = 0.8
    } else if (s === 'SOLVER_FILLING') {
      laneMat.emissive.setHex(0xa855f7)
      laneMat.emissiveIntensity = 0.6
    } else if (s === 'DEST_CONFIRMED' || s === 'COMPLETED') {
      laneMat.emissive.setHex(0x00ffa3)
      laneMat.emissiveIntensity = 0.5
    } else if (s === 'HOOD_UNAVAILABLE') {
      laneMat.emissive.setHex(0x334155)
      laneMat.emissiveIntensity = 0.05
    } else {
      laneMat.emissive.setHex(0x475569)
      laneMat.emissiveIntensity = 0.2
    }
  }

  applyVisualTheme()

  function animate() {
    if (!reducedMotion) {
      orbProgress += 0.012
      if (orbProgress > 1) orbProgress = 0

      // Animate token orb position
      if (isSameChain) {
        tokenOrb.position.set(0, 0.1 + Math.sin(Date.now() * 0.003) * 0.08, 0)
      } else {
        const x = -2.2 + orbProgress * 4.4
        const y = Math.sin(orbProgress * Math.PI) * 0.4
        tokenOrb.position.set(x, y, 0)
      }

      // Animate particles
      const posAttr = pGeom.attributes.position as Float32BufferAttribute
      const arr = posAttr.array as Float32Array
      for (let i = 0; i < particleCount; i++) {
        arr[i * 3] += pVelocities[i]
        if (arr[i * 3] > 2.2) {
          arr[i * 3] = -2.2
        }
      }
      posAttr.needsUpdate = true

      // Gentle hover rotation
      stageGroup.rotation.y = Math.sin(Date.now() * 0.0006) * 0.15
      renderer.render(scene, camera)
      animFrameId = requestAnimationFrame(animate)
    } else {
      renderer.render(scene, camera)
    }
  }

  animate()

  return {
    dispose: () => {
      if (animFrameId) cancelAnimationFrame(animFrameId)
      renderer.dispose()
      platGeom.dispose()
      srcMat.dispose()
      dstMat.dispose()
      laneGeom.dispose()
      laneMat.dispose()
      pGeom.dispose()
      pMat.dispose()
      orbGeom.dispose()
      orbMat.dispose()
    },
    updateState: (newState: string, sameChain: boolean) => {
      currentState = newState.toUpperCase()
      isSameChain = sameChain
      applyVisualTheme()
      if (reducedMotion) {
        renderer.render(scene, camera)
      }
    },
  }
}

export function Pipeline3D({ settlement }: Pipeline3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<StageHandle | null>(null)
  const [useFallback, setUseFallback] = useState(false)

  const state = settlement?.state || 'SUBMITTED_PENDING'
  const isSameChain = Boolean(settlement && settlement.src_chain === settlement.dest_chain)
  const style = getStateStyle(state)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const handle = mountPipelineStage(canvas, state, isSameChain, reduced)

    if (!handle) {
      setUseFallback(true)
      return
    }

    handleRef.current = handle

    const handleResize = () => {
      if (canvasRef.current && handleRef.current) {
        // resize logic
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      handle.dispose()
      handleRef.current = null
    }
  }, [])

  useEffect(() => {
    if (handleRef.current) {
      handleRef.current.updateState(state, isSameChain)
    }
  }, [state, isSameChain])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '280px',
        borderRadius: '16px',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(15, 23, 42, 0.8), rgba(2, 6, 23, 0.95))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: style.glow !== 'none' ? style.glow : undefined,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Background Subtle Tech Grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />

      {/* 3D Canvas or 2D SVG Fallback */}
      {!useFallback ? (
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          width={600}
          height={280}
        />
      ) : (
        /* High-fidelity 2D/SVG Fallback Stage */
        <svg
          viewBox="0 0 600 240"
          style={{ width: '100%', height: '100%', maxHeight: '240px' }}
          role="img"
          aria-label={`2D Pipeline diagram for state ${state}`}
        >
          <defs>
            <linearGradient id="laneGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="50%" stopColor={style.color} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Source Platform */}
          <circle cx="120" cy="120" r="42" fill="#0f172a" stroke="#38bdf8" strokeWidth="2.5" />
          <text x="120" y="116" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="700">
            {isSameChain ? 'SOLANA' : settlement?.src_chain?.slice(0, 10) || 'SOURCE'}
          </text>
          <text x="120" y="132" textAnchor="middle" fill="#94a3b8" fontSize="9">
            ORIGIN
          </text>

          {/* Route Lane */}
          {!isSameChain ? (
            <>
              <line x1="162" y1="120" x2="438" y2="120" stroke="url(#laneGrad)" strokeWidth="4" strokeDasharray="6 4" />
              <circle cx="300" cy="120" r="18" fill="#1e1b4b" stroke={style.color} strokeWidth="2" />
              <text x="300" y="124" textAnchor="middle" fill={style.color} fontSize="9" fontWeight="700">
                {settlement?.provider?.toUpperCase() || 'BRIDGE'}
              </text>
            </>
          ) : (
            <text x="300" y="124" textAnchor="middle" fill="#94a3b8" fontSize="10" fontStyle="italic">
              Same-Chain AMM Atomic Leg
            </text>
          )}

          {/* Destination Platform */}
          {!isSameChain && (
            <>
              <circle cx="480" cy="120" r="42" fill="#0f172a" stroke="#34d399" strokeWidth="2.5" />
              <text x="480" y="116" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="700">
                {settlement?.dest_chain?.slice(0, 10) || 'DEST'}
              </text>
              <text x="480" y="132" textAnchor="middle" fill="#94a3b8" fontSize="9">
                RECEIPT
              </text>
            </>
          )}
        </svg>
      )}

      {/* Floating State Banner Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '999px',
          background: style.bg,
          border: `1px solid ${style.border}`,
          backdropFilter: 'blur(8px)',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: style.color,
            boxShadow: `0 0 8px ${style.color}`,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--f-mono, monospace)',
            fontSize: '11px',
            fontWeight: 700,
            color: style.color,
            letterSpacing: '0.04em',
          }}
        >
          {style.label}
        </span>
      </div>

      {/* Warning Overlay for STUCK_UNKNOWN or UNWIRED */}
      {state === 'STUCK_UNKNOWN' && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 14px',
            borderRadius: '6px',
            background: 'rgba(244, 63, 94, 0.2)',
            border: '1px solid rgba(244, 63, 94, 0.5)',
            fontFamily: 'var(--f-mono, monospace)',
            fontSize: '10px',
            color: '#fda4af',
            fontWeight: 600,
          }}
        >
          ⚠ NO DESTINATION EVIDENCE VERIFIED
        </div>
      )}

      {state === 'HOOD_UNAVAILABLE' && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 14px',
            borderRadius: '6px',
            background: 'rgba(100, 116, 139, 0.2)',
            border: '1px solid rgba(100, 116, 139, 0.5)',
            fontFamily: 'var(--f-mono, monospace)',
            fontSize: '10px',
            color: '#cbd5e1',
            fontWeight: 600,
          }}
        >
          CHAIN NOT WIRED (chain_id: null)
        </div>
      )}
    </div>
  )
}
