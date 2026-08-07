import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'

/** Bottom-left performance panel: FPS / frame time / draw calls / triangles */
export function PerfPanel() {
  const enabled = useGameStore((s) => s.settings.perfPanel)
  const [, force] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => force((n) => n + 1), 500)
    return () => window.clearInterval(id)
  }, [enabled])

  if (!enabled) return null
  const p = refs.perf
  const fpsClass = p.fps >= 45 ? 'good' : p.fps >= 30 ? 'ok' : 'bad'

  return (
    <div className="perf-panel" aria-label="performance">
      <div className={`perf-fps ${fpsClass}`}>{p.fps} FPS</div>
      <div>{p.ms} ms</div>
      <div>DC {p.drawCalls}</div>
      <div>△ {(p.triangles / 1000).toFixed(1)}k</div>
    </div>
  )
}
