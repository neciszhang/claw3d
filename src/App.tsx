import { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { ASSETS, RENDER } from './config/gameConfig'
import { Scene } from './game/Scene'
import { useGameStore } from './store/gameStore'
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

export default function App() {
  const status = useGameStore((s) => s.status)
  const overlay = useGameStore((s) => s.overlay)
  const quality = useGameStore((s) => s.settings.quality)
  const setUnsupported = useGameStore((s) => s.setUnsupported)
  const setStatus = useGameStore((s) => s.setStatus)
  const fatalError = useGameStore((s) => s.fatalError)
  const [canvasKey, setCanvasKey] = useState(0)

  useKeyboard()

  // BOOT：环境检测（FR-001）
  useEffect(() => {
    if (useGameStore.getState().status !== 'BOOT') return
    const { ok, reason } = detectWebGL()
    if (!ok) setUnsupported(reason ?? 'noWebgl')
    else setStatus('LOADING')
  }, [setUnsupported, setStatus])

  const language = useGameStore((s) => s.settings.language)
  useEffect(() => {
    document.title = language === 'zh' ? '3D 娃娃机' : '3D Claw Machine'
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  // 投币音效：进入 COIN 状态统一播放
  useEffect(() => {
    if (status === 'COIN') {
      sound.play('coin')
      sound.vibrate(30)
    }
  }, [status])

  // 首次交互解锁音频；切后台停音乐并清输入
  useEffect(() => {
    const unlock = () => sound.unlock()
    const onVisibility = () => {
      if (document.hidden) sound.stopMusic()
      else sound.syncMusic()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      document.removeEventListener('visibilitychange', onVisibility)
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

      {inGame && (
        <div className="ui-layer">
          <HUD />
          <Joystick />
          <StartButton />
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
    </div>
  )
}
