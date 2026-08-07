import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { sound } from '../audio/soundManager'

/** 桌面端键盘：WASD/方向键移动，空格/回车抓取，Esc 暂停（FR-206 / 11.3） */
export function useKeyboard() {
  useEffect(() => {
    const pressed = new Set<string>()

    const syncVector = () => {
      let x = 0
      let y = 0
      if (pressed.has('ArrowLeft') || pressed.has('KeyA')) x -= 1
      if (pressed.has('ArrowRight') || pressed.has('KeyD')) x += 1
      if (pressed.has('ArrowUp') || pressed.has('KeyW')) y -= 1
      if (pressed.has('ArrowDown') || pressed.has('KeyS')) y += 1
      const mag = Math.hypot(x, y)
      refs.keyboard.x = mag > 0 ? x / Math.max(1, mag) : 0
      refs.keyboard.y = mag > 0 ? y / Math.max(1, mag) : 0
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) && ['Space', 'Enter'].includes(e.code)) {
        return // 让按钮自身处理回车/空格
      }
      const store = useGameStore.getState()
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
        e.preventDefault()
        pressed.add(e.code)
        syncVector()
        return
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (store.startGrab()) {
          sound.unlock()
          sound.play('descend')
        }
        return
      }
      if (e.code === 'Escape') {
        if (store.overlay !== 'none') store.closeOverlay()
        else if (store.status === 'PAUSED') store.resume()
        else store.pause()
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      pressed.delete(e.code)
      syncVector()
    }
    const onBlur = () => {
      pressed.clear()
      syncVector()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
