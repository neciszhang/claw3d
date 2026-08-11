import { minimapLayout } from '../game/MinimapRenderer'
import { remainingToys, useGameStore } from '../store/gameStore'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'
import { refs } from '../store/refs'
import { useEffect, useRef, useState } from 'react'

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
  const stars = useGameStore((s) => s.progress.stars)
  const shakeUsed = useGameStore((s) => s.shakeUsed)
  const shakeMachine = useGameStore((s) => s.shakeMachine)
  const achievementFlash = useGameStore((s) => s.achievementFlash)
  const clearAchievementFlash = useGameStore((s) => s.clearAchievementFlash)
  const slipFlash = useGameStore((s) => s.slipFlash)
  const clearSlipFlash = useGameStore((s) => s.clearSlipFlash)
  const resultInfo = useGameStore((s) => s.resultInfo)
  const attempts2 = useGameStore((s) => s.attempts)
  const t = useT()
  const [vw, setVw] = useState(() => window.innerWidth)
  const [menuOpen, setMenuOpen] = useState(false)
  const nextView = useRef(-1)

  // Daily bonus toast: wait until the player reaches the playable screen, then show for 4s (avoid being covered by the tutorial modal)
  const bonusVisible =
    dailyBonus > 0 && (status === 'READY' || status === 'MOVING' || status === 'COIN')
  useEffect(() => {
    if (!bonusVisible) return
    const id = window.setTimeout(clearDailyBonus, 4000)
    return () => window.clearTimeout(id)
  }, [bonusVisible, clearDailyBonus])

  // Achievement unlock toast
  useEffect(() => {
    if (!achievementFlash) return
    const id = window.setTimeout(clearAchievementFlash, 3200)
    return () => window.clearTimeout(id)
  }, [achievementFlash, clearAchievementFlash])

  // Slip callout: show the reason for ~1.6s right at the moment of slipping
  useEffect(() => {
    if (!slipFlash) return
    const id = window.setTimeout(clearSlipFlash, 1600)
    return () => window.clearTimeout(id)
  }, [slipFlash, clearSlipFlash])

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
          <span className={`hud-chip hide-mobile status-${status.toLowerCase()}`}>
            {t.status[status] ?? status}
          </span>
          <span className="hud-chip coin-chip">{t.hud.coins(coins)}</span>
          <button
            className="hud-chip star-chip"
            aria-label={t.album.title}
            onClick={() => {
              sound.play('click')
              openOverlay('album')
            }}
          >
            ⭐ {stars}
          </button>
          <span className="hud-chip hide-mobile">{t.hud.grabs(attempts)}</span>
          <span className="hud-chip hide-mobile">{t.hud.wins(successes)}</span>
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
            aria-label={t.hud.view}
            onClick={() => {
              sound.play('click')
              nextView.current = (nextView.current + 1) % 3
              refs.viewRequest = nextView.current
            }}
          >
            🎥<i className="btn-label">{t.hud.view}</i>
          </button>
          <button
            className="icon-btn"
            aria-label={t.hud.shake}
            disabled={shakeUsed || !(status === 'READY' || status === 'MOVING' || status === 'UNPAID')}
            onClick={() => {
              sound.play('close')
              sound.vibrate([30, 30, 30])
              shakeMachine()
            }}
          >
            🫨<i className="btn-label">{t.hud.shake}</i>
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
          <button
            className="icon-btn"
            aria-label={t.hud.more}
            aria-expanded={menuOpen}
            onClick={() => {
              sound.play('click')
              setMenuOpen((v) => !v)
            }}
          >
            ⋯<i className="btn-label">{t.hud.more}</i>
          </button>
          {menuOpen && (
            <div className="hud-menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  const next = !settings.sfx
                  updateSettings({ sfx: next, music: next })
                  sound.syncMusic()
                  if (next) sound.play('click')
                }}
              >
                {settings.sfx ? '♪' : '♪̸'} {settings.sfx ? t.hud.soundOn : t.hud.soundOff}
              </button>
              <button role="menuitem" onClick={() => { sound.play('click'); setMenuOpen(false); openOverlay('album') }}>
                📔 {t.album.title}
              </button>
              <button role="menuitem" onClick={() => { sound.play('click'); setMenuOpen(false); openOverlay('history') }}>
                🕘 {t.hud.history}
              </button>
              <button role="menuitem" onClick={() => { sound.play('click'); setMenuOpen(false); openOverlay('help') }}>
                ❓ {t.hud.help}
              </button>
              <button
                role="menuitem"
                data-role="settings"
                disabled={!canPause}
                onClick={() => { sound.play('click'); setMenuOpen(false); openOverlay('settings') }}
              >
                ⚙️ {t.hud.settings}
              </button>
            </div>
          )}
        </div>
      </div>
      {achievementFlash && (
        <div className="achievement-toast" role="status">
          🏆 {t.album.achv[achievementFlash]?.name ?? achievementFlash}
        </div>
      )}
      {slipFlash && (
        <div className="slip-flash" role="status">
          {t.result.slipFlash[slipFlash.reason]}
        </div>
      )}
      {resultInfo?.result === 'success' && (
        <div key={attempts2} className="coin-fly" aria-hidden>
          🪙
        </div>
      )}
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
