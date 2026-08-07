import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { RENDER } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { useT } from '../i18n'

export function LoadingScreen({ onRetry }: { onRetry: () => void }) {
  const { progress, errors, item } = useProgress()
  const status = useGameStore((s) => s.status)
  const [timedOut, setTimedOut] = useState(false)
  const [waitMore, setWaitMore] = useState(0)
  const t = useT()

  useEffect(() => {
    if (status !== 'LOADING') return
    setTimedOut(false)
    const id = window.setTimeout(() => setTimedOut(true), RENDER.loadTimeoutMs)
    return () => window.clearTimeout(id)
  }, [status, waitMore])

  if (status !== 'LOADING') return null
  const hasError = errors.length > 0

  return (
    <div className="screen loading-screen" role="status" aria-live="polite">
      <h1 className="game-title">{t.title}</h1>
      <div className="loader-claw" aria-hidden>
        🕹️
      </div>
      {!hasError && (
        <>
          <div className="progress-track">
            <div className="progress-bar" style={{ width: `${Math.floor(progress)}%` }} />
          </div>
          <p className="progress-text">{t.loading.progress(Math.floor(progress), item ? shortName(item) : '')}</p>
        </>
      )}
      {hasError && (
        <div className="load-error">
          <p>{t.loading.failed}</p>
          <p className="load-error-detail">{errors.map(shortName).join(', ')}</p>
          <button className="btn primary" onClick={onRetry}>
            {t.loading.retry}
          </button>
        </div>
      )}
      {!hasError && timedOut && (
        <div className="load-error">
          <p>{t.loading.slow}</p>
          <div className="btn-row">
            <button
              className="btn"
              onClick={() => {
                setWaitMore((n) => n + 1)
              }}
            >
              {t.loading.wait}
            </button>
            <button className="btn primary" onClick={onRetry}>
              {t.loading.retry}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function shortName(url: string): string {
  try {
    return url.split('/').pop() ?? url
  } catch {
    return url
  }
}
