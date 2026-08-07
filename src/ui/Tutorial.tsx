import { useGameStore } from '../store/gameStore'
import { sound } from '../audio/soundManager'
import { useT } from '../i18n'

export function Tutorial() {
  const step = useGameStore((s) => s.tutorialStep)
  const setTutorialStep = useGameStore((s) => s.setTutorialStep)
  const finishTutorial = useGameStore((s) => s.finishTutorial)
  const t = useT()
  const steps = t.tutorial.steps
  const cur = steps[Math.min(step, steps.length - 1)]
  const last = step >= steps.length - 1

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t.tutorial.aria}>
      <div className="modal tutorial-card">
        <div className="tutorial-icon" aria-hidden>
          {cur.icon}
        </div>
        <h2>
          {t.tutorial.stepOf(step + 1, steps.length)} · {cur.title}
        </h2>
        <p>{cur.text}</p>
        <div className="tutorial-dots" aria-hidden>
          {steps.map((_, i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        <div className="btn-row">
          <button
            className="btn"
            onClick={() => {
              sound.unlock()
              sound.play('click')
              finishTutorial()
            }}
          >
            {t.tutorial.skip}
          </button>
          <button
            className="btn primary"
            onClick={() => {
              sound.unlock()
              sound.play('click')
              if (last) finishTutorial()
              else setTutorialStep(step + 1)
            }}
          >
            {last ? t.tutorial.play : t.tutorial.next}
          </button>
        </div>
      </div>
    </div>
  )
}
