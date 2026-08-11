import { beforeEach, describe, expect, it } from 'vitest'
import { clearInterrupted, markInterrupted } from '../store/gameStore'
import { storageGet } from '../store/persistence'
import { STORAGE_KEYS } from '../config/gameConfig'

const readWallet = () =>
  storageGet(STORAGE_KEYS.wallet, { coins: 0, lastBonusDay: '', pendingRefund: false })

describe('interrupted-round refund flag', () => {
  beforeEach(() => {
    window.localStorage.setItem(
      STORAGE_KEYS.wallet,
      JSON.stringify({ coins: 10, lastBonusDay: '2026-1-1', pendingRefund: false }),
    )
  })

  it('markInterrupted sets the flag without touching coins', () => {
    markInterrupted()
    const w = readWallet()
    expect(w.pendingRefund).toBe(true)
    expect(w.coins).toBe(10)
  })

  it('is idempotent across repeated pagehide events', () => {
    markInterrupted()
    markInterrupted()
    markInterrupted()
    const w = readWallet()
    expect(w.pendingRefund).toBe(true)
    expect(w.coins).toBe(10) // still exactly one pending refund, no accumulation
  })

  it('clearInterrupted drops the flag when the round resumes from bfcache', () => {
    markInterrupted()
    clearInterrupted()
    const w = readWallet()
    expect(w.pendingRefund).toBe(false)
    expect(w.coins).toBe(10)
  })
})
