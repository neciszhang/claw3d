import { describe, expect, it } from 'vitest'
import { TOY_TYPES, TOY_TYPE_MAP, rollToyType } from '../config/gameConfig'

describe('toy types', () => {
  it('map covers every type with consistent keys', () => {
    for (const def of TOY_TYPES) {
      expect(TOY_TYPE_MAP[def.key]).toBe(def)
    }
  })

  it('every type has sane numbers', () => {
    for (const def of TOY_TYPES) {
      expect(def.weight).toBeGreaterThan(0)
      expect(def.scale).toBeGreaterThan(0.5)
      expect(def.scale).toBeLessThan(1.5)
      expect(def.stars).toBeGreaterThanOrEqual(1)
      expect(def.slipFactor).toBeGreaterThan(0)
    }
  })

  it('rollToyType respects the weight boundaries', () => {
    expect(rollToyType(() => 0).key).toBe(TOY_TYPES[0].key)
    expect(rollToyType(() => 0.999999).key).toBe(TOY_TYPES[TOY_TYPES.length - 1].key)
  })

  it('rollToyType distribution roughly follows weights', () => {
    let seed = 42
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const counts: Record<string, number> = {}
    for (let i = 0; i < 20000; i++) {
      const k = rollToyType(rand).key
      counts[k] = (counts[k] ?? 0) + 1
    }
    const total = TOY_TYPES.reduce((s, t) => s + t.weight, 0)
    for (const def of TOY_TYPES) {
      const expected = (def.weight / total) * 20000
      expect(counts[def.key]).toBeGreaterThan(expected * 0.7)
      expect(counts[def.key]).toBeLessThan(expected * 1.3)
    }
  })
})
