import { remainingToys, useGameStore } from '../store/gameStore'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'
import { refs } from '../store/refs'
import { GRIP, COIN } from '../config/gameConfig'

export function ResultModal() {
  const resultInfo = useGameStore((s) => s.resultInfo)
  const successes = useGameStore((s) => s.successes)
  const toys = useGameStore((s) => s.toys)
  const coins = useGameStore((s) => s.coins)
  const playAgain = useGameStore((s) => s.playAgain)
  const closeResult = useGameStore((s) => s.closeResult)
  const openOverlay = useGameStore((s) => s.openOverlay)
  const t = useT()
  if (!resultInfo) return null
  const ok = resultInfo.result === 'success'
  const remaining = remainingToys(toys)

  return (
    <div className="modal-backdrop see-through" role="dialog" aria-modal="true" aria-label={t.result.aria}>
      <div className={`modal result-card ${ok ? 'success' : 'fail'}`}>
        <button
          className="modal-close"
          aria-label="close"
          onClick={() => {
            sound.play('click')
            closeResult()
          }}
        >
          ✕
        </button>
        <div className="result-icon" aria-hidden>
          {ok ? '🎉' : '💨'}
        </div>
        <h2>{ok ? t.result.successTitle : t.result.failTitle}</h2>
        <p>
          {ok
            ? t.result.successBody(t.result.seconds((resultInfo.timeMs / 1000).toFixed(1)), successes, remaining)
            : resultInfo.slipped
              ? t.result.slipped
              : resultInfo.bounced
                ? t.result.bounced
                : t.result.failBody}
        </p>
        {ok && <p className="hint-text">{t.result.coinReward(COIN.winReward)}</p>}
        {!ok && refs.slipStreak >= GRIP.pityAfter && (
          <p className="hint-text">{t.result.pityReady}</p>
        )}
        {coins === 0 && <p className="hint-text">{t.result.noCoins}</p>}
        <div className="btn-row">
          <button
            className="btn"
            onClick={() => {
              sound.play('click')
              openOverlay('confirmRestart')
            }}
          >
            {t.result.restart}
          </button>
          <button
            className="btn primary"
            autoFocus
            disabled={remaining > 0 && coins === 0}
            onClick={() => {
              sound.play('click')
              playAgain()
            }}
          >
            {remaining > 0 ? t.result.playAgain : t.result.viewSummary}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PauseMenu() {
  const resume = useGameStore((s) => s.resume)
  const openOverlay = useGameStore((s) => s.openOverlay)
  const overlay = useGameStore((s) => s.overlay)
  const t = useT()
  if (overlay !== 'none') return null

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.pause.aria}>
      <div className="modal">
        <h2>{t.pause.title}</h2>
        <div className="menu-list">
          <button className="btn primary" autoFocus onClick={() => { sound.play('click'); resume() }}>
            {t.pause.resume}
          </button>
          <button className="btn" onClick={() => { sound.play('click'); openOverlay('settings') }}>
            {t.pause.settings}
          </button>
          <button className="btn" onClick={() => { sound.play('click'); openOverlay('history') }}>
            {t.pause.history}
          </button>
          <button className="btn" onClick={() => { sound.play('click'); openOverlay('help') }}>
            {t.pause.help}
          </button>
          <button className="btn danger" onClick={() => { sound.play('click'); openOverlay('confirmRestart') }}>
            {t.pause.restart}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CompletedScreen() {
  const attempts = useGameStore((s) => s.attempts)
  const successes = useGameStore((s) => s.successes)
  const stats = useGameStore((s) => s.stats)
  const restartGame = useGameStore((s) => s.restartGame)
  const t = useT()

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.completed.aria}>
      <div className="modal result-card success">
        <div className="result-icon" aria-hidden>🏆</div>
        <h2>{t.completed.title}</h2>
        <p>
          {t.completed.body(
            attempts,
            successes,
            stats.fastestTime != null ? t.result.seconds((stats.fastestTime / 1000).toFixed(1)) : null,
          )}
        </p>
        <button className="btn primary" autoFocus onClick={() => { sound.play('click'); restartGame() }}>
          {t.completed.restart}
        </button>
      </div>
    </div>
  )
}

export function ConfirmRestart() {
  const restartGame = useGameStore((s) => s.restartGame)
  const closeOverlay = useGameStore((s) => s.closeOverlay)
  const t = useT()
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.confirmRestart.aria}>
      <div className="modal">
        <h2>{t.confirmRestart.title}</h2>
        <p>{t.confirmRestart.body}</p>
        <div className="btn-row">
          <button className="btn" autoFocus onClick={() => { sound.play('click'); closeOverlay() }}>
            {t.confirmRestart.cancel}
          </button>
          <button className="btn danger" onClick={() => { sound.play('click'); restartGame() }}>
            {t.confirmRestart.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HelpModal() {
  const closeOverlay = useGameStore((s) => s.closeOverlay)
  const t = useT()
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.help.aria}>
      <div className="modal help-card">
        <h2>{t.help.title}</h2>
        <ul className="help-list">
          {t.help.items.map(([k, v]) => (
            <li key={k}>
              <b>{k}</b> · {v}
            </li>
          ))}
        </ul>
        <button className="btn primary" autoFocus onClick={() => { sound.play('click'); closeOverlay() }}>
          {t.help.ok}
        </button>
      </div>
    </div>
  )
}

export function ErrorScreen() {
  const errorMessage = useGameStore((s) => s.errorMessage)
  const retryFromError = useGameStore((s) => s.retryFromError)
  const t = useT()
  const msg = errorMessage === 'contextLost' ? t.error.contextLost : errorMessage ?? t.error.unknown
  return (
    <div className="screen error-screen" role="alert">
      <div className="result-icon" aria-hidden>⚠️</div>
      <h2>{t.error.title}</h2>
      <p>{msg}</p>
      <div className="btn-row">
        <button className="btn" onClick={() => window.location.reload()}>{t.error.refresh}</button>
        <button className="btn primary" onClick={retryFromError}>{t.error.retry}</button>
      </div>
    </div>
  )
}

export function UnsupportedScreen() {
  const reason = useGameStore((s) => s.unsupportedReason)
  const t = useT()
  const msg = reason === 'initFail' ? t.unsupported.initFail : t.unsupported.noWebgl
  return (
    <div className="screen error-screen" role="alert">
      <div className="result-icon" aria-hidden>🚫</div>
      <h2>{t.unsupported.title}</h2>
      <p>{msg}</p>
      <p className="hint-text">{t.unsupported.hint}</p>
    </div>
  )
}
