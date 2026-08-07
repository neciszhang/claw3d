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

type CineMode = 'none' | 'coin' | 'carry'

/**
 * 轨道相机：受限旋转/缩放 + 四向吸附（FR-301~303），
 * 并带运镜导演：投币时推近投币口特写，抓到玩偶后跟拍移送出口。
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
      if (snap.current?.active) return // 吸附动画期间忽略（FR-303）
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

    // —— 运镜导演 ——
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
        // 跟拍抓手与玩偶移向出口
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

    // —— 四向吸附 ——
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
        // 方向索引：0 前(+z) 1 右(+x) 2 后(-z) 3 左(-x)
        const idx = ((Math.round(s.to / HALF_PI) % 4) + 4) % 4
        const dir = ([0, 1, 2, 3] as const)[idx]
        const st = useGameStore.getState()
        st.setCameraDirection(dir)
        if (st.status === 'CAMERA_SNAP') st.setStatus('READY')
      }
    }
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
