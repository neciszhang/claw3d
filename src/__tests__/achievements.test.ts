import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '../store/gameStore'

const baseCtx = {
  result: 'success' as 'success' | 'fail',
  timeMs: 15000,
  slipped: false,
  streak: 1,
  attemptsTotal: 5,
  successesTotal: 1,
  collection: { shiba: 1 } as Record<string, number>,
  settings: {
    minimap: true,
    aimAssist: true,
    difficulty: 'normal',
  } as never,
}

function check(id: string, ctx: Partial<typeof baseCtx>): boolean {
  const a = ACHIEVEMENTS.find((x) => x.id === id)!
  return a.check({ ...baseCtx, ...ctx } as never)
}

describe('achievements', () => {
  it('firstWin unlocks on the first success', () => {
    expect(check('firstWin', { successesTotal: 1 })).toBe(true)
    expect(check('firstWin', { result: 'fail', successesTotal: 0 })).toBe(false)
  })

  it('oneShot requires winning the very first attempt', () => {
    expect(check('oneShot', { attemptsTotal: 1 })).toBe(true)
    expect(check('oneShot', { attemptsTotal: 2 })).toBe(false)
  })

  it('streak3 requires 3 consecutive wins', () => {
    expect(check('streak3', { streak: 3 })).toBe(true)
    expect(check('streak3', { streak: 2 })).toBe(false)
  })

  it('luckyRoll requires a slipped toy that still won', () => {
    expect(check('luckyRoll', { slipped: true })).toBe(true)
    expect(check('luckyRoll', { slipped: false })).toBe(false)
    expect(check('luckyRoll', { slipped: true, result: 'fail' })).toBe(false)
  })

  it('fast10 requires winning within 10 seconds', () => {
    expect(check('fast10', { timeMs: 9000 })).toBe(true)
    expect(check('fast10', { timeMs: 11000 })).toBe(false)
  })

  it('collectAll requires one of every toy type', () => {
    expect(
      check('collectAll', {
        collection: { shiba: 1, snow: 2, sakura: 1, golden: 1, cosmic: 1 },
      }),
    ).toBe(true)
    expect(check('collectAll', { collection: { shiba: 5 } })).toBe(false)
  })
})
