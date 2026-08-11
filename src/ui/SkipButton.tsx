import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { useT } from '../i18n'

/** Shown while the claw returns home after a decided round; lets the player skip straight to the result */
export function SkipButton() {
  const status = useGameStore((s) => s.status)
  const [phase, setPhase] = useState(refs.grabPhase)
  const t = useT()

  useEffect(() => {
    if (status !== 'GRABBING') return
    const id = window.setInterval(() => setPhase(refs.grabPhase), 150)
    return () => window.clearInterval(id)
  }, [status])

  if (status !== 'GRABBING' || phase !== 'return' || refs.skipAnim) return null
  return (
    <button
      className="skip-btn"
      onClick={() => {
        refs.skipAnim = true
      }}
    >
      {t.start.skip}
    </button>
  )
}
