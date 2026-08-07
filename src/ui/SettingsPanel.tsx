import { useState } from 'react'
import { DIFFICULTY, type Difficulty } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'

function Toggle({ label, value, onChange, onText, offText }: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  onText: string
  offText: string
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`toggle${value ? ' on' : ''}`}
        onClick={() => {
          sound.play('click')
          onChange(!value)
        }}
      >
        <i />
        <em className="toggle-text">{value ? onText : offText}</em>
      </button>
    </label>
  )
}

export function SettingsPanel() {
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const closeOverlay = useGameStore((s) => s.closeOverlay)
  const openOverlay = useGameStore((s) => s.openOverlay)
  const restartGame = useGameStore((s) => s.restartGame)
  const setTutorialStep = useGameStore((s) => s.setTutorialStep)
  const setStatus = useGameStore((s) => s.setStatus)
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(null)
  const t = useT()
  const S = t.settings

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={S.title}>
      <div className="modal settings-card">
        <h2>{S.title}</h2>
        <label className="setting-row">
          <span>{S.language}</span>
          <div className="seg" role="radiogroup" aria-label={S.language}>
            {(['en', 'zh'] as const).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={settings.language === l}
                className={settings.language === l ? 'on' : ''}
                onClick={() => { sound.play('click'); updateSettings({ language: l }) }}
              >
                {l === 'en' ? 'English' : '中文'}
              </button>
            ))}
          </div>
        </label>
        <Toggle label={S.music} value={settings.music} onChange={(v) => { updateSettings({ music: v }); sound.syncMusic() }} onText={S.on} offText={S.off} />
        <Toggle label={S.sfx} value={settings.sfx} onChange={(v) => updateSettings({ sfx: v })} onText={S.on} offText={S.off} />
        <Toggle label={S.vibration} value={settings.vibration} onChange={(v) => updateSettings({ vibration: v })} onText={S.on} offText={S.off} />
        <Toggle label={S.minimap} value={settings.minimap} onChange={(v) => updateSettings({ minimap: v })} onText={S.on} offText={S.off} />
        <Toggle label={S.debug} value={settings.debug} onChange={(v) => updateSettings({ debug: v })} onText={S.on} offText={S.off} />
        <Toggle label={S.perf} value={settings.perfPanel} onChange={(v) => updateSettings({ perfPanel: v })} onText={S.on} offText={S.off} />
        <label className="setting-row">
          <span>{S.quality}</span>
          <div className="seg" role="radiogroup" aria-label={S.quality}>
            {(['high', 'low'] as const).map((q) => (
              <button
                key={q}
                role="radio"
                aria-checked={settings.quality === q}
                className={settings.quality === q ? 'on' : ''}
                onClick={() => { sound.play('click'); updateSettings({ quality: q }) }}
              >
                {q === 'high' ? S.qualityHigh : S.qualityLow}
              </button>
            ))}
          </div>
        </label>
        <label className="setting-row">
          <span>{S.difficulty}</span>
          <div className="seg" role="radiogroup" aria-label={S.difficulty}>
            {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={settings.difficulty === d}
                className={settings.difficulty === d ? 'on' : ''}
                onClick={() => {
                  sound.play('click')
                  if (d !== settings.difficulty) setPendingDifficulty(d)
                }}
              >
                {S.diffNames[d]}
              </button>
            ))}
          </div>
        </label>
        {pendingDifficulty && (
          <div className="inline-confirm" role="alertdialog" aria-label={S.diffConfirmAria}>
            <p>{S.diffConfirm(S.diffNames[pendingDifficulty])}</p>
            <div className="btn-row">
              <button className="btn" onClick={() => { sound.play('click'); setPendingDifficulty(null) }}>{S.cancel}</button>
              <button
                className="btn danger"
                onClick={() => {
                  sound.play('click')
                  updateSettings({ difficulty: pendingDifficulty })
                  setPendingDifficulty(null)
                  restartGame()
                }}
              >
                {S.confirmSwitch}
              </button>
            </div>
          </div>
        )}
        <div className="menu-list" style={{ marginTop: 12 }}>
          <button
            className="btn"
            onClick={() => {
              sound.play('click')
              closeOverlay()
              setTutorialStep(0)
              setStatus('TUTORIAL')
            }}
          >
            {S.showTutorial}
          </button>
          <button className="btn danger" onClick={() => { sound.play('click'); openOverlay('confirmClear') }}>
            {S.clear}
          </button>
          <button className="btn primary" onClick={() => { sound.play('click'); closeOverlay() }}>
            {S.back}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmClear() {
  const clearStats = useGameStore((s) => s.clearStats)
  const openOverlay = useGameStore((s) => s.openOverlay)
  const t = useT()
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.confirmClear.aria}>
      <div className="modal">
        <h2>{t.confirmClear.title}</h2>
        <p>{t.confirmClear.body}</p>
        <div className="btn-row">
          <button className="btn" autoFocus onClick={() => { sound.play('click'); openOverlay('settings') }}>
            {t.confirmClear.cancel}
          </button>
          <button className="btn danger" onClick={() => { sound.play('click'); clearStats() }}>
            {t.confirmClear.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HistoryDrawer() {
  const stats = useGameStore((s) => s.stats)
  const closeOverlay = useGameStore((s) => s.closeOverlay)
  const t = useT()
  const rate = stats.attempts > 0 ? Math.round((stats.successes / stats.attempts) * 100) : 0

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.history.aria}>
      <div className="modal history-card">
        <h2>{t.history.title}</h2>
        <div className="stats-grid">
          <div><b>{stats.attempts}</b><span>{t.history.attempts}</span></div>
          <div><b>{stats.successes}</b><span>{t.history.wins}</span></div>
          <div><b>{rate}%</b><span>{t.history.rate}</span></div>
          <div><b>{stats.fastestTime != null ? `${(stats.fastestTime / 1000).toFixed(1)}s` : '—'}</b><span>{t.history.fastest}</span></div>
        </div>
        <h3>{t.history.recent}</h3>
        {stats.recent.length === 0 ? (
          <p className="hint-text">{t.history.empty}</p>
        ) : (
          <ul className="recent-list">
            {stats.recent.map((r, i) => (
              <li key={r.at + '-' + i} className={r.result}>
                <span>{r.result === 'success' ? t.history.win : t.history.lose}</span>
                <span>{(r.timeMs / 1000).toFixed(1)}s</span>
                <span>{new Date(r.at).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
        <button className="btn primary" autoFocus onClick={() => { sound.play('click'); closeOverlay() }}>
          {t.history.back}
        </button>
      </div>
    </div>
  )
}
