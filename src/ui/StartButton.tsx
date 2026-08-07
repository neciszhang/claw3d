import { remainingToys, useGameStore } from '../store/gameStore'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'

export function StartButton() {
  const status = useGameStore((s) => s.status)
  const toys = useGameStore((s) => s.toys)
  const startGrab = useGameStore((s) => s.startGrab)
  const t = useT()

  const grabbing = status === 'GRABBING'
  const enabled = (status === 'READY' || status === 'MOVING') && remainingToys(toys) > 0

  return (
    <button
      className={`start-btn${grabbing ? ' grabbing' : ''}`}
      disabled={!enabled}
      aria-label={t.start.aria}
      aria-disabled={!enabled}
      onClick={() => {
        if (startGrab()) {
          sound.unlock()
          sound.play('click')
          sound.play('descend')
          sound.vibrate(40)
        }
      }}
    >
      {grabbing ? t.start.grabbing : t.start.label}
    </button>
  )
}
