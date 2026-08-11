import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { RENDER, TIMING } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { prefersReducedMotion } from '../utils/capabilities'
import { COIN_SLOT } from './Machine'

const HALF_PI = Math.PI / 2

function normalizeAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/** Small camera shake when the toy slips (380ms decay) */
function applyShake(cam: THREE.Camera) {
  if (refs.shakeAt <= 0 || prefersReducedMotion()) return
  const e = performance.now() - refs.shakeAt
  if (e >= 380) return
  const a = 0.05 * (1 - e / 380)
  cam.position.x += Math.sin(e * 0.11) * a
  cam.position.y += Math.sin(e * 0.147 + 1.7) * a * 0.7
}

type CineMode = 'none' | 'coin' | 'carry'

/**
 * Orbit camera: limited rotate/zoom + four-way snap (FR-301~303),
 * with cinematic direction: push in for coin-slot close-up on coin, follow the claw carrying the toy to the exit.
 */
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const snap = useRef<{ active: boolean; from: number; to: number; start: number } | null>(null)
  const cine = useRef<{
    mode: CineMode
    saved: { pos: THREE.Vector3; target: THREE.Vector3 } | null
    returning: boolean
  }>({ mode: 'none', saved: null, returning: false })
  const tmpPos = useRef(new THREE.Vector3())
  const tmpTgt = useRef(new THREE.Vector3())

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const onEnd = () => {
      if (snap.current?.active) return // Ignore during snap animation (FR-303)
      if (cine.current.mode !== 'none' || cine.current.returning) return
      const az = c.getAzimuthalAngle()
      const target = Math.round(az / HALF_PI) * HALF_PI
      const dur = prefersReducedMotion() ? 0 : TIMING.cameraSnapDuration
      snap.current = { active: true, from: az, to: target, start: performance.now() + (dur === 0 ? -1 : 0) }
      const st = useGameStore.getState()
      if (st.status === 'READY' || st.status === 'MOVING') st.setStatus('CAMERA_SNAP')
    }
    c.addEventListener('end', onEnd)
    return () => c.removeEventListener('end', onEnd)
  }, [])

  useFrame((state, delta) => {
    const c = controls.current
    if (!c) return
    refs.cameraAzimuth = c.getAzimuthalAngle()
    const cam = state.camera

    // — Cinematic director —
    const store = useGameStore.getState()
    let want: CineMode = 'none'
    if (!prefersReducedMotion()) {
      if (store.status === 'COIN') want = 'coin'
      else if (
        store.status === 'GRABBING' &&
        (refs.grabPhase === 'toExit' || refs.grabPhase === 'release' || refs.grabPhase === 'settle')
      ) {
        want = 'carry'
      }
    }
    const k = 1 - Math.exp(-4.5 * delta)

    if (want !== 'none') {
      if (cine.current.mode === 'none' && !cine.current.returning) {
        cine.current.saved = { pos: cam.position.clone(), target: c.target.clone() }
        c.enabled = false
      }
      cine.current.mode = want
      cine.current.returning = false
      if (want === 'coin') {
        tmpTgt.current.set(COIN_SLOT.x, COIN_SLOT.y + 0.05, COIN_SLOT.z)
        tmpPos.current.set(COIN_SLOT.x + 0.28, COIN_SLOT.y + 0.42, COIN_SLOT.z + 1.3)
      } else {
        // Follow the claw and toy as they move toward the exit
        tmpTgt.current.set(refs.clawPos.x, Math.max(0.15, refs.clawPos.y - 0.3), refs.clawPos.z)
        const az = refs.snappedAzimuth
        tmpPos.current.set(
          tmpTgt.current.x + Math.sin(az) * 2.1,
          tmpTgt.current.y + 0.85,
          tmpTgt.current.z + Math.cos(az) * 2.1,
        )
      }
      cam.position.lerp(tmpPos.current, k)
      c.target.lerp(tmpTgt.current, k)
      cam.lookAt(c.target)
      applyShake(cam)
      return
    }

    if (cine.current.mode !== 'none') {
      cine.current.mode = 'none'
      cine.current.returning = true
    }
    if (cine.current.returning) {
      const saved = cine.current.saved
      if (!saved) {
        cine.current.returning = false
        c.enabled = true
      } else {
        cam.position.lerp(saved.pos, k)
        c.target.lerp(saved.target, k)
        cam.lookAt(c.target)
        if (cam.position.distanceTo(saved.pos) < 0.04) {
          cam.position.copy(saved.pos)
          c.target.copy(saved.target)
          cine.current.saved = null
          cine.current.returning = false
          c.enabled = true
          c.update()
        }
      }
      return
    }

    // — Four-way snap —
    const s = snap.current
    if (s?.active) {
      const dur = prefersReducedMotion() ? 1 : TIMING.cameraSnapDuration
      const t = Math.min(1, (performance.now() - s.start) / dur)
      const diff = normalizeAngle(s.to - s.from)
      const az = s.from + diff * (1 - (1 - t) ** 3)
      c.minAzimuthAngle = az
      c.maxAzimuthAngle = az
      c.update()
      if (t >= 1) {
        c.minAzimuthAngle = -Infinity
        c.maxAzimuthAngle = Infinity
        s.active = false
        refs.snappedAzimuth = normalizeAngle(s.to)
        // Direction index: 0 front(+z) 1 right(+x) 2 back(-z) 3 left(-x)
        const idx = ((Math.round(s.to / HALF_PI) % 4) + 4) % 4
        const dir = ([0, 1, 2, 3] as const)[idx]
        const st = useGameStore.getState()
        st.setCameraDirection(dir)
        if (st.status === 'CAMERA_SNAP') st.setStatus('READY')
      }
    }
    applyShake(cam)
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={RENDER.cameraTarget}
      enablePan={false}
      minDistance={RENDER.cameraMinDistance}
      maxDistance={RENDER.cameraMaxDistance}
      minPolarAngle={RENDER.cameraPolar[0]}
      maxPolarAngle={RENDER.cameraPolar[1]}
      enableDamping
      dampingFactor={0.12}
    />
  )
}
