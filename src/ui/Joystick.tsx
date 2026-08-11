import { useEffect, useRef } from 'react'
import { refs } from '../store/refs'
import { useGameStore } from '../store/gameStore'
import { useT } from '../i18n'

const SIZE = 120
const KNOB = 52

/** Bottom-left virtual joystick: continuous angle + magnitude (FR-201/202/204/205) */
export function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const activePointer = useRef<number | null>(null)
  const t = useT()

  useEffect(() => {
    const base = baseRef.current
    const knob = knobRef.current
    if (!base || !knob) return

    const setVector = (clientX: number, clientY: number) => {
      const rect = base.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = (clientX - cx) / (rect.width / 2)
      let dy = (clientY - cy) / (rect.height / 2)
      const mag = Math.hypot(dx, dy)
      if (mag > 1) {
        dx /= mag
        dy /= mag
      }
      const st = useGameStore.getState().status
      if (st !== 'READY' && st !== 'MOVING') {
        if (st === 'UNPAID') useGameStore.getState().askCoin()
        dx = 0
        dy = 0
      }
      refs.joystick.x = dx
      refs.joystick.y = dy
      knob.style.transform = `translate(${dx * (SIZE - KNOB) * 0.5}px, ${dy * (SIZE - KNOB) * 0.5}px)`
      knob.classList.toggle('active', mag > 0.02)
    }

    const reset = () => {
      if (useGameStore.getState().settings.joystickFollow) resetBasePos()
      activePointer.current = null
      refs.joystick.x = 0
      refs.joystick.y = 0
      knob.style.transform = 'translate(0px, 0px)'
      knob.classList.remove('active')
    }

    const onDown = (e: PointerEvent) => {
      if (activePointer.current != null) return
      activePointer.current = e.pointerId
      base.setPointerCapture(e.pointerId)
      setVector(e.clientX, e.clientY)
    }
    // Follow mode: the stick re-centers to wherever the finger lands inside the zone
    const zone = zoneRef.current
    const onZoneDown = (e: PointerEvent) => {
      if (!useGameStore.getState().settings.joystickFollow) return
      if (activePointer.current != null) return
      const half = SIZE / 2
      base.style.left = `${e.clientX - half}px`
      base.style.top = `${e.clientY - half}px`
      base.style.right = 'auto'
      base.style.bottom = 'auto'
      activePointer.current = e.pointerId
      base.setPointerCapture(e.pointerId)
      setVector(e.clientX, e.clientY)
    }
    const resetBasePos = () => {
      base.style.left = ''
      base.style.top = ''
      base.style.right = ''
      base.style.bottom = ''
    }
    zone?.addEventListener('pointerdown', onZoneDown)
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointer.current) return
      setVector(e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointer.current) return
      reset()
    }
    const onBlur = () => reset()
    const onVisibility = () => {
      if (document.hidden) reset()
    }

    base.addEventListener('pointerdown', onDown)
    base.addEventListener('pointermove', onMove)
    base.addEventListener('pointerup', onUp)
    base.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      base.removeEventListener('pointerdown', onDown)
      base.removeEventListener('pointermove', onMove)
      base.removeEventListener('pointerup', onUp)
      base.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      zone?.removeEventListener('pointerdown', onZoneDown)
      reset()
    }
  }, [])

  return (
    <>
      <div ref={zoneRef} className="joystick-zone" aria-hidden />
      <div
        ref={baseRef}
        className="joystick"
        role="application"
        aria-label={t.hud.joystickAria}
        style={{ width: SIZE, height: SIZE }}
      >
      <div className="joystick-cross" aria-hidden>
        <span>▲</span>
        <span>▶</span>
        <span>▼</span>
        <span>◀</span>
      </div>
        <div ref={knobRef} className="joystick-knob" style={{ width: KNOB, height: KNOB }} />
      </div>
    </>
  )
}
