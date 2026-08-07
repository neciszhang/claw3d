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

/** 所有 3D 资源加载完成后（Suspense 解除）通知状态机 */
function LoadedSignal() {
  const status = useGameStore((s) => s.status)
  const finishLoading = useGameStore((s) => s.finishLoading)
  useEffect(() => {
    if (status === 'LOADING') finishLoading()
  }, [status, finishLoading])
  return null
}

/** RESETTING：复位抓手并通知重建完成（FR-106 / FR-505） */
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

/** 场景静止（无移动/抓取且玩偶全部休眠）时冻结阴影贴图重算 */
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
      <hemisphereLight args={['#cfd8ff', '#3a2a55', 0.9]} />
      <ambientLight intensity={1.15} />
      <directionalLight
        position={[2.5, 4, 2]}
        intensity={2.2}
        castShadow={quality === 'high'}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-2.2}
        shadow-camera-near={1}
        shadow-camera-far={12}
      />
      <pointLight position={[0, 1.8, 0]} intensity={2.2} distance={5} />
      <pointLight position={[0, 0.6, 0.6]} intensity={1.2} distance={3.5} />
      <pointLight position={[0, 2.5, 3]} intensity={1.0} distance={9} />
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
