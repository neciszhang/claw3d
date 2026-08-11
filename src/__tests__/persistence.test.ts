import { beforeEach, describe, expect, it } from 'vitest'
import { storageGet, storageRemove, storageSet } from '../store/persistence'

describe('persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('roundtrips objects and merges over the fallback', () => {
    storageSet('k', { a: 1 })
    expect(storageGet('k', { a: 0, b: 2 })).toEqual({ a: 1, b: 2 })
  })

  it('returns the fallback for missing keys', () => {
    expect(storageGet('missing', { x: 7 })).toEqual({ x: 7 })
  })

  it('returns the fallback for corrupted JSON', () => {
    window.localStorage.setItem('bad', '{oops')
    expect(storageGet('bad', { ok: true })).toEqual({ ok: true })
  })

  it('removes keys', () => {
    storageSet('gone', { v: 1 })
    storageRemove('gone')
    expect(storageGet('gone', { v: 0 })).toEqual({ v: 0 })
  })
})
