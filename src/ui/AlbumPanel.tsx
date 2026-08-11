import { ACHIEVEMENTS, useGameStore } from '../store/gameStore'
import { TOY_TYPES } from '../config/gameConfig'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'

const RARITY_CLASS = { common: 'r-common', rare: 'r-rare', hidden: 'r-hidden' } as const

/** Collection album: toy catalogue with rarity, owned counts, stars, and achievements */
export function AlbumPanel() {
  const progress = useGameStore((s) => s.progress)
  const closeOverlay = useGameStore((s) => s.closeOverlay)
  const t = useT()
  const A = t.album

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={A.title}>
      <div className="modal album-card">
        <button
          className="modal-close"
          aria-label="close"
          onClick={() => {
            sound.play('click')
            closeOverlay()
          }}
        >
          ✕
        </button>
        <h2>{A.title}</h2>
        <p className="album-stars">⭐ {progress.stars}</p>
        <div className="album-grid">
          {TOY_TYPES.map((toy) => {
            const count = progress.collection[toy.key] ?? 0
            const owned = count > 0
            return (
              <div key={toy.key} className={`album-cell ${RARITY_CLASS[toy.rarity]}${owned ? '' : ' locked'}`}>
                <span className="album-icon" style={owned ? { color: toy.tint } : undefined}>
                  {owned ? '🐶' : '❓'}
                </span>
                <b>{owned || toy.rarity !== 'hidden' ? A.toys[toy.key] : '???'}</b>
                <i>{A.rarity[toy.rarity]}</i>
                <em>{owned ? `×${count}` : A.notOwned}</em>
              </div>
            )
          })}
        </div>
        <h3>{A.achievements}</h3>
        <div className="album-achievements">
          {ACHIEVEMENTS.map((a) => {
            const owned = progress.achievements.includes(a.id)
            return (
              <div key={a.id} className={`ach-row${owned ? ' owned' : ''}`}>
                <span>{owned ? '🏆' : '🔒'}</span>
                <div>
                  <b>{A.achv[a.id]?.name ?? a.id}</b>
                  <i>{A.achv[a.id]?.desc ?? ''}</i>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
