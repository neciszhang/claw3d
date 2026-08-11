import { useEffect, useState } from 'react'
import { remainingToys, useGameStore } from '../store/gameStore'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'

export function StartButton() {
  const status = useGameStore((s) => s.status)
  const toys = useGameStore((s) => s.toys)
  const coins = useGameStore((s) => s.coins)
  const startGrab = useGameStore((s) => s.startGrab)
  const insertCoin = useGameStore((s) => s.insertCoin)
  const coinHint = useGameStore((s) => s.coinHint)
  const t = useT()
  const [hintOn, setHintOn] = useState(false)

  // Touched the joystick without a coin: pulse the button and show a hint bubble
  useEffect(() => {
    if (coinHint === 0) return
    setHintOn(true)
    const id = window.setTimeout(() => setHintOn(false), 1600)
    return () => window.clearTimeout(id)
  }, [coinHint])

  const grabbing = status === 'GRABBING'
  const unpaid = status === 'UNPAID'
  const enabled = unpaid
    ? coins > 0 && remainingToys(toys) > 0
    : (status === 'READY' || status === 'MOVING') && remainingToys(toys) > 0

  return (
    <>
      {hintOn && unpaid && (
        <div className="coin-hint" role="status">
          {t.start.insertFirst}
        </div>
      )}
      <button
        className={`start-btn${grabbing ? ' grabbing' : ''}${hintOn && unpaid ? ' attention' : ''}`}
        disabled={!enabled}
        aria-label={unpaid ? t.start.insert : t.start.aria}
        aria-disabled={!enabled}
        onClick={() => {
          sound.unlock()
          if (unpaid) {
            if (insertCoin()) sound.play('click')
            return
          }
          if (startGrab()) {
            sound.play('click')
            sound.play('descend')
            sound.vibrate(40)
          }
        }}
      >
        {grabbing ? t.start.grabbing : unpaid ? t.start.insert : t.start.label}
      </button>
    </>
  )
}
