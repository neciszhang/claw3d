import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { CLAW, PHYSICS } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { CameraRig } from './CameraRig'
import { Claw } from './Claw'
import { GrabController } from './GrabController'
import { Machine } from './Machine'
import { MinimapRenderer } from './MinimapRenderer'
import { PerfMonitor, Stage } from './Stage'
import { Toys, toyRegistry } from './Toys'

/** Notify the state machine once all 3D assets are loaded (Suspense resolved) */
function LoadedSignal() {
  const status = useGameStore((s) => s.status)
  const finishLoading = useGameStore((s) => s.finishLoading)
  useEffect(() => {
    if (status === 'LOADING') finishLoading()
  }, [status, finishLoading])
  return null
}

/** RESETTING: reset the claw and notify that rebuild is complete (FR-106 / FR-505) */
function ResetHandler() {
  const status = useGameStore((s) => s.status)
  const finishReset = useGameStore((s) => s.finishReset)
  useEffect(() => {
    if (status === 'RESETTING') {
      refs.clawPos.x = CLAW.homeX
      refs.clawPos.y = CLAW.restY
      refs.clawPos.z = CLAW.homeZ
      refs.closeProgress = 0
      const id = window.setTimeout(finishReset, 300)
      return () => window.clearTimeout(id)
    }
  }, [status, finishReset])
  return null
}

/** Freeze shadow map updates when the scene is idle (no movement/grab and all toys sleeping) */
function ShadowController() {
  const lastActive = useRef(performance.now())
  useFrame(({ gl }) => {
    const status = useGameStore.getState().status
    let active =
      status === 'GRABBING' || status === 'MOVING' || status === 'RESETTING' || status === 'LOADING'
    if (!active) {
      for (const body of toyRegistry.values()) {
        if (!body.isSleeping()) {
          active = true
          break
        }
      }
    }
    const now = performance.now()
    if (active) lastActive.current = now
    gl.shadowMap.autoUpdate = now - lastActive.current < 2000
  })
  return null
}

export function Scene() {
  const quality = useGameStore((s) => s.settings.quality)
  const debug = useGameStore((s) => s.settings.debug)
  const status = useGameStore((s) => s.status)
  const resetNonce = useGameStore((s) => s.resetNonce)

  return (
    <>
      <color attach="background" args={['#150d2e']} />
      <fog attach="fog" args={['#0c0722', 13, 30]} />
      {/* Hemisphere covers the ambient term too (fewer lights = cheaper fragments) */}
      <hemisphereLight args={['#cfd8ff', '#3a2a55', 2.0]} />
      <directionalLight
        position={[2.5, 4, 2]}
        intensity={2.2}
        castShadow={quality === 'high'}
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-2.2}
        shadow-camera-near={1}
        shadow-camera-far={12}
      />
      {/* Single interior fill light (was 3 point lights) */}
      <pointLight position={[0, 1.4, 0.4]} intensity={3.2} distance={6} />
      <Stage />
      <PerfMonitor />
      <ShadowController />

      <Physics
        key={resetNonce}
        gravity={PHYSICS.gravity}
        paused={status === 'PAUSED' || status === 'RESETTING'}
        debug={debug}
      >
        <Machine />
        <Toys />
        <Claw />
        <GrabController />
      </Physics>

      <LoadedSignal />
      <ResetHandler />
      <CameraRig />
      <MinimapRenderer />
    </>
  )
}
