import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'

/** Minimal toolbar shown in photo mode: capture PNG / exit */
export function PhotoBar() {
  const setPhotoMode = useGameStore((s) => s.setPhotoMode)
  const t = useT()
  return (
    <div className="photo-bar">
      <button
        className="btn primary"
        onClick={() => {
          sound.play('click')
          refs.captureRequest = true
        }}
      >
        📸 {t.photo.capture}
      </button>
      <button
        className="btn"
        onClick={() => {
          sound.play('click')
          setPhotoMode(false)
        }}
      >
        ✕ {t.photo.exit}
      </button>
    </div>
  )
}
