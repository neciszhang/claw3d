import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { ASSETS, RENDER } from './config/gameConfig'
import { Scene } from './game/Scene'
import { clearInterrupted, markInterrupted, useGameStore } from './store/gameStore'
import { detectWebGL } from './utils/capabilities'
import { useKeyboard } from './hooks/useKeyboard'
import { sound } from './audio/soundManager'
import { HUD } from './ui/HUD'
import { Joystick } from './ui/Joystick'
import { StartButton } from './ui/StartButton'
import { LoadingScreen } from './ui/LoadingScreen'
import { Tutorial } from './ui/Tutorial'
import {
  CompletedScreen,
  ConfirmRestart,
  ErrorScreen,
  HelpModal,
  PauseMenu,
  ResultModal,
  UnsupportedScreen,
} from './ui/Modals'
import { ConfirmClear, HistoryDrawer, SettingsPanel } from './ui/SettingsPanel'
import { PerfPanel } from './ui/PerfPanel'
import { SkipButton } from './ui/SkipButton'
import { AlbumPanel } from './ui/AlbumPanel'
import { PhotoBar } from './ui/PhotoBar'

export default function App() {
  const status = useGameStore((s) => s.status)
  const overlay = useGameStore((s) => s.overlay)
  const quality = useGameStore((s) => s.settings.quality)
  const setUnsupported = useGameStore((s) => s.setUnsupported)
  const setStatus = useGameStore((s) => s.setStatus)
  const fatalError = useGameStore((s) => s.fatalError)
  const [canvasKey, setCanvasKey] = useState(0)

  useKeyboard()

  // BOOT: environment detection (FR-001)
  useEffect(() => {
    if (useGameStore.getState().status !== 'BOOT') return
    const { ok, reason } = detectWebGL()
    if (!ok) setUnsupported(reason ?? 'noWebgl')
    else setStatus('LOADING')
  }, [setUnsupported, setStatus])

  const language = useGameStore((s) => s.settings.language)
  const photoMode = useGameStore((s) => s.photoMode)
  const leftHanded = useGameStore((s) => s.settings.leftHanded)
  useEffect(() => {
    document.title = language === 'zh' ? '3D 娃娃机' : '3D Claw Machine'
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  // Coin sound: played uniformly when entering COIN state
  useEffect(() => {
    if (status === 'COIN') {
      sound.play('coin')
      sound.vibrate(30)
    }
  }, [status])

  // Unlock audio on first interaction; auto-pause + mute when the tab goes to the background
  useEffect(() => {
    const unlock = () => sound.unlock()
    const onVisibility = () => {
      if (document.hidden) {
        sound.stopMusic()
        const st = useGameStore.getState()
        if (st.status === 'READY' || st.status === 'MOVING' || st.status === 'CAMERA_SNAP') st.pause()
      } else {
        sound.syncMusic()
      }
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Interrupted-round protection: flag the round on pagehide; refund settles on next load.
  // A bfcache restore (pageshow with persisted=true) means the round is still alive → clear the flag.
  useEffect(() => {
    const onHide = () => {
      const st = useGameStore.getState()
      if (st.status === 'GRABBING' || st.status === 'COIN') markInterrupted()
    }
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) clearInterrupted()
    }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('pageshow', onShow)
    }
  }, [])

  const retryLoad = () => {
    for (const a of [ASSETS.box.webp, ASSETS.box.fallback, ASSETS.dog.webp, ASSETS.dog.fallback, ASSETS.claw.webp]) {
      try {
        useGLTF.clear(a)
      } catch {
        // ignore
      }
    }
    setStatus('LOADING')
    setCanvasKey((k) => k + 1)
  }

  if (status === 'UNSUPPORTED') return <UnsupportedScreen />

  const inGame = !['BOOT', 'LOADING', 'ERROR', 'UNSUPPORTED'].includes(status)

  return (
    <div className="app-root">
      {status !== 'BOOT' && status !== 'ERROR' && (
        <Canvas
          key={canvasKey}
          className="game-canvas"
          shadows={quality === 'high'}
          dpr={quality === 'high' ? Math.min(window.devicePixelRatio, RENDER.maxDpr) : RENDER.lowDpr}
          camera={{
            position: [0, 1.7, RENDER.cameraRadius],
            fov: 45,
            near: 0.1,
            far: 60,
          }}
          gl={{ toneMappingExposure: 1.35, powerPreference: 'high-performance', stencil: false }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', (e) => {
              e.preventDefault()
              fatalError('contextLost')
            })
          }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      )}

      {inGame && photoMode && <PhotoBar />}
      {inGame && !photoMode && (
        <div className={`ui-layer${leftHanded ? ' swap-hands' : ''}`}>
          <HUD />
          <Joystick />
          <StartButton />
          <SkipButton />
          <PerfPanel />
        </div>
      )}

      <LoadingScreen onRetry={retryLoad} />
      {status === 'ERROR' && <ErrorScreen />}
      {status === 'TUTORIAL' && <Tutorial />}
      {status === 'RESULT' && overlay === 'none' && <ResultModal />}
      {status === 'PAUSED' && <PauseMenu />}
      {status === 'COMPLETED' && overlay === 'none' && <CompletedScreen />}
      {overlay === 'settings' && <SettingsPanel />}
      {overlay === 'help' && <HelpModal />}
      {overlay === 'history' && <HistoryDrawer />}
      {overlay === 'confirmRestart' && <ConfirmRestart />}
      {overlay === 'confirmClear' && <ConfirmClear />}
      {overlay === 'album' && <AlbumPanel />}
    </div>
  )
}
