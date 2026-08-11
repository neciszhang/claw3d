import { minimapLayout } from '../game/MinimapRenderer'
import { remainingToys, useGameStore } from '../store/gameStore'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'
import { useEffect, useState } from 'react'

export function HUD() {
  const status = useGameStore((s) => s.status)
  const attempts = useGameStore((s) => s.attempts)
  const toys = useGameStore((s) => s.toys)
  const successes = useGameStore((s) => s.successes)
  const coins = useGameStore((s) => s.coins)
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const pause = useGameStore((s) => s.pause)
  const openOverlay = useGameStore((s) => s.openOverlay)
  const dailyBonus = useGameStore((s) => s.dailyBonus)
  const clearDailyBonus = useGameStore((s) => s.clearDailyBonus)
  const t = useT()
  const [vw, setVw] = useState(() => window.innerWidth)

  // Daily bonus toast: wait until the player reaches the playable screen, then show for 4s (avoid being covered by the tutorial modal)
  const bonusVisible =
    dailyBonus > 0 && (status === 'READY' || status === 'MOVING' || status === 'COIN')
  useEffect(() => {
    if (!bonusVisible) return
    const id = window.setTimeout(clearDailyBonus, 4000)
    return () => window.clearTimeout(id)
  }, [bonusVisible, clearDailyBonus])

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const mm = minimapLayout(vw)
  const canPause = status === 'READY' || status === 'MOVING' || status === 'UNPAID'

  return (
    <>
      <div className="hud-top">
        <div className="hud-left" aria-live="polite">
          <span className={`hud-chip status-${status.toLowerCase()}`}>
            {t.status[status] ?? status}
          </span>
          <span className="hud-chip coin-chip">{t.hud.coins(coins)}</span>
          <span className="hud-chip">{t.hud.grabs(attempts)}</span>
          <span className="hud-chip">{t.hud.wins(successes)}</span>
          <span className="hud-chip">{t.hud.left(remainingToys(toys))}</span>
          {successes > 0 && (
            <div className="collection-bar" aria-label={t.hud.wins(successes)}>
              {Array.from({ length: Math.min(successes, 8) }).map((_, i) => (
                <span key={i} className="collect-dog" aria-hidden>
                  🐶
                </span>
              ))}
              {successes > 8 && <span className="collect-more">+{successes - 8}</span>}
            </div>
          )}
        </div>
        <div className="hud-right">
          <button
            className="icon-btn"
            aria-label={settings.sfx ? t.settings.off : t.settings.on}
            aria-pressed={settings.sfx}
            onClick={() => {
              const next = !settings.sfx
              updateSettings({ sfx: next, music: next })
              sound.syncMusic()
              if (next) sound.play('click')
            }}
          >
            {settings.sfx ? '♪' : '♪̸'}
            <i className="btn-label">{settings.sfx ? t.hud.soundOn : t.hud.soundOff}</i>
          </button>
          <button
            className="icon-btn"
            aria-label={t.hud.help}
            onClick={() => {
              sound.play('click')
              openOverlay('help')
            }}
          >
            ?<i className="btn-label">{t.hud.help}</i>
          </button>
          <button
            className="icon-btn"
            data-role="settings"
            aria-label={t.hud.settings}
            disabled={!canPause}
            onClick={() => {
              sound.play('click')
              openOverlay('settings')
            }}
          >
            ⚙<i className="btn-label">{t.hud.settings}</i>
          </button>
          <button
            className="icon-btn"
            data-role="pause"
            aria-label={t.hud.pause}
            disabled={!canPause}
            onClick={() => {
              sound.play('click')
              pause()
            }}
          >
            ⏸<i className="btn-label">{t.hud.pause}</i>
          </button>
        </div>
      </div>
      {bonusVisible && (
        <div className="daily-bonus-toast" role="status">
          {t.hud.dailyBonus(dailyBonus)}
        </div>
      )}
      {settings.minimap && (
        <div
          className="minimap-frame"
          aria-label={t.hud.minimapAria}
          style={{ width: mm.size, height: mm.size, top: mm.top, right: mm.right }}
        />
      )}
    </>
  )
}
