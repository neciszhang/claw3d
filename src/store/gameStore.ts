import { create } from 'zustand'
import {
  COIN,
  DIFFICULTY,
  STORAGE_KEYS,
  TIMING,
  TOY,
  TOY_TYPES,
  TOY_TYPE_MAP,
  rollToyType,
  type Difficulty,
  type Quality,
  type ToyTypeKey,
} from '../config/gameConfig'
import { storageGet, storageRemove, storageSet } from './persistence'
import { clearMovementInput, refs, resetRoundRefs } from './refs'

export type GameStatus =
  | 'BOOT'
  | 'UNSUPPORTED'
  | 'LOADING'
  | 'TUTORIAL'
  | 'COIN'
  | 'UNPAID'
  | 'READY'
  | 'MOVING'
  | 'CAMERA_SNAP'
  | 'GRABBING'
  | 'RESULT'
  | 'PAUSED'
  | 'RESETTING'
  | 'COMPLETED'
  | 'ERROR'

export interface Progress {
  stars: number
  collection: Partial<Record<ToyTypeKey, number>>
  achievements: string[]
}

export type SlipReason = 'eccentric' | 'fastMove' | 'weakGrip'

export type Overlay = 'none' | 'settings' | 'help' | 'history' | 'confirmRestart' | 'confirmClear' | 'album'

export interface ToyMeta {
  id: number
  status: 'inBox' | 'held' | 'out'
  spawn: [number, number]
  type: ToyTypeKey
}

export interface Settings {
  music: boolean
  sfx: boolean
  vibration: boolean
  minimap: boolean
  quality: Quality
  difficulty: Difficulty
  debug: boolean
  perfPanel: boolean
  language: 'en' | 'zh'
  /** Steady-grip mode: a grabbed toy never slips (assist/demo) */
  steadyGrip: boolean
  /** Aim assist: projection ring under the claw with a catchable hint */
  aimAssist: boolean
  /** Auto cinematic camera (coin close-up / carry follow); off = fully manual */
  autoCamera: boolean
  /** Left-handed layout: joystick on the right, start button on the left */
  leftHanded: boolean
  /** Joystick re-centers to wherever the finger lands (mobile) */
  joystickFollow: boolean
  /** Slow the claw near a catchable toy for precise aiming */
  precisionSlow: boolean
}

export interface RoundRecord {
  result: 'success' | 'fail'
  timeMs: number
  at: number
}

export interface Stats {
  attempts: number
  successes: number
  fastestTime: number | null
  recent: RoundRecord[]
}

const defaultSettings: Settings = {
  music: true,
  sfx: true,
  vibration: true,
  minimap: true,
  quality: 'high',
  difficulty: 'normal',
  debug: false,
  perfPanel: false,
  language: 'en',
  steadyGrip: false,
  aimAssist: true,
  autoCamera: true,
  leftHanded: false,
  joystickFollow: false,
  precisionSlow: true,
}

const defaultStats: Stats = { attempts: 0, successes: 0, fastestTime: null, recent: [] }

function buildToys(difficulty: Difficulty): ToyMeta[] {
  return DIFFICULTY[difficulty].layout.slice(0, TOY.count).map((spawn, i) => ({
    id: i,
    status: 'inBox' as const,
    spawn,
    type: rollToyType().key,
  }))
}

interface GameStore {
  status: GameStatus
  statusBeforePause: GameStatus
  cameraDirection: 0 | 1 | 2 | 3
  toys: ToyMeta[]
  attempts: number
  successes: number
  coins: number
  dailyBonus: number
  coinHint: number
  slipFlash: { reason: SlipReason; at: number } | null
  progress: Progress
  /** Recently unlocked achievement ids queued for the toast */
  achievementFlash: string | null
  photoMode: boolean
  resultInfo: { result: 'success' | 'fail'; timeMs: number; bounced?: boolean; slipped?: boolean; slipReason?: SlipReason | null } | null
  overlay: Overlay
  loadError: string | null
  resetNonce: number
  tutorialDone: boolean
  tutorialStep: number
  settings: Settings
  stats: Stats
  unsupportedReason: string | null
  errorMessage: string | null

  setStatus: (s: GameStatus) => void
  setUnsupported: (reason: string) => void
  setLoadError: (msg: string | null) => void
  finishLoading: () => void
  setTutorialStep: (n: number) => void
  finishTutorial: () => void
  setCameraDirection: (d: 0 | 1 | 2 | 3) => void
  startGrab: () => boolean
  insertCoin: () => boolean
  finishRound: (result: 'success' | 'fail', timeMs: number, bounced?: boolean, slipped?: boolean, slipReason?: SlipReason | null, wonToyId?: number) => void
  setToyStatus: (id: number, status: ToyMeta['status']) => void
  playAgain: () => void
  closeResult: () => void
  restartGame: () => void
  finishReset: () => void
  clearDailyBonus: () => void
  askCoin: () => void
  /** One machine shake per game: nudges all toys with random impulses */
  shakeUsed: boolean
  shakeMachine: () => void
  flashSlip: (reason: SlipReason) => void
  clearSlipFlash: () => void
  clearAchievementFlash: () => void
  setPhotoMode: (on: boolean) => void
  pause: () => void
  resume: () => void
  openOverlay: (o: Overlay) => void
  closeOverlay: () => void
  updateSettings: (patch: Partial<Settings>) => void
  clearStats: () => void
  fatalError: (msg: string) => void
  retryFromError: () => void
}

/** Local wallet: coins persist across sessions; a daily bonus is granted on first entry each day */
function localDay(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
const initialWallet = (() => {
  const w = storageGet(STORAGE_KEYS.wallet, {
    coins: COIN.perGame,
    lastBonusDay: '',
    pendingRefund: false,
  })
  const today = localDay()
  const bonus = w.lastBonusDay === today ? 0 : COIN.dailyBonus
  // Settle the interrupted-round refund exactly once, at load time
  const refund = w.pendingRefund ? 1 : 0
  // Bankruptcy relief: top up to 5 coins on entry (after the daily bonus) so the game never soft-locks
  const coins = Math.max(w.coins + bonus + refund, 5)
  storageSet(STORAGE_KEYS.wallet, { coins, lastBonusDay: today, pendingRefund: false })
  return { coins, bonus }
})()
/**
 * Interrupted-round protection. pagehide can fire repeatedly without the page being
 * destroyed (bfcache), so never mutate the coin count here — only set an idempotent
 * flag. The actual refund is settled exactly once on the next page load; if the page
 * comes back alive from bfcache the flag is cleared because the round continues.
 */
export function markInterrupted(): void {
  const w = storageGet(STORAGE_KEYS.wallet, { coins: 0, lastBonusDay: '', pendingRefund: false })
  storageSet(STORAGE_KEYS.wallet, { ...w, pendingRefund: true })
}

export function clearInterrupted(): void {
  const w = storageGet(STORAGE_KEYS.wallet, { coins: 0, lastBonusDay: '', pendingRefund: false })
  if (w.pendingRefund) storageSet(STORAGE_KEYS.wallet, { ...w, pendingRefund: false })
}

const defaultProgress: Progress = { stars: 0, collection: {}, achievements: [] }

interface AchievementCtx {
  result: 'success' | 'fail'
  timeMs: number
  slipped: boolean
  streak: number
  attemptsTotal: number
  successesTotal: number
  collection: Partial<Record<ToyTypeKey, number>>
  settings: Settings
}

/** Session-scoped success streak (not persisted) */
let currentStreak = 0

/** Late-bound toy body registry (set by Toys.tsx) to avoid a circular import */
export const toyBodies = new Map<number, { wakeUp: () => void; applyImpulse: (v: { x: number; y: number; z: number }, wake: boolean) => void }>()

export const ACHIEVEMENTS: { id: string; check: (c: AchievementCtx) => boolean }[] = [
  { id: 'firstWin', check: (c) => c.result === 'success' && c.successesTotal >= 1 },
  { id: 'oneShot', check: (c) => c.result === 'success' && c.attemptsTotal === 1 },
  { id: 'streak3', check: (c) => c.streak >= 3 },
  { id: 'luckyRoll', check: (c) => c.result === 'success' && c.slipped },
  { id: 'fast10', check: (c) => c.result === 'success' && c.timeMs <= 10000 },
  { id: 'hardWin', check: (c) => c.result === 'success' && c.settings.difficulty === 'hard' },
  { id: 'noAssist', check: (c) => c.result === 'success' && !c.settings.aimAssist },
  { id: 'noMinimap', check: (c) => c.result === 'success' && !c.settings.minimap },
  {
    id: 'collectAll',
    check: (c) => TOY_TYPES.every((t) => (c.collection[t.key] ?? 0) > 0),
  },
]

function persistProgress(p: Progress): void {
  storageSet(STORAGE_KEYS.progress, p)
}

function persistCoins(coins: number): void {
  const w = storageGet(STORAGE_KEYS.wallet, { coins, lastBonusDay: localDay() })
  // A live coin transaction means the round economy is being settled normally,
  // so any stale pendingRefund flag is dropped on purpose
  storageSet(STORAGE_KEYS.wallet, {
    coins,
    lastBonusDay: w.lastBonusDay || localDay(),
    pendingRefund: false,
  })
}

export const useGameStore = create<GameStore>((set, get) => ({
  status: 'BOOT',
  statusBeforePause: 'READY',
  cameraDirection: 0,
  toys: buildToys(storageGet(STORAGE_KEYS.settings, defaultSettings).difficulty),
  attempts: 0,
  successes: 0,
  coins: initialWallet.coins,
  dailyBonus: initialWallet.bonus,
  coinHint: 0,
  shakeUsed: false,
  slipFlash: null,
  progress: storageGet(STORAGE_KEYS.progress, defaultProgress),
  achievementFlash: null,
  photoMode: false,
  resultInfo: null,
  overlay: 'none',
  loadError: null,
  resetNonce: 0,
  tutorialDone: storageGet(STORAGE_KEYS.tutorial, { done: false }).done,
  tutorialStep: 0,
  settings: storageGet(STORAGE_KEYS.settings, defaultSettings),
  stats: storageGet(STORAGE_KEYS.stats, defaultStats),
  unsupportedReason: null,
  errorMessage: null,

  setStatus: (s) => set({ status: s }),
  setUnsupported: (reason) => set({ status: 'UNSUPPORTED', unsupportedReason: reason }),
  setLoadError: (msg) => set({ loadError: msg }),

  finishLoading: () => {
    const { tutorialDone } = get()
    if (tutorialDone) {
      // No auto-coin on entry: wait for the player to press 'Insert'
      set({ status: 'UNPAID', tutorialStep: 0, loadError: null })
    } else {
      set({ status: 'TUTORIAL', tutorialStep: 0, loadError: null })
    }
  },

  setTutorialStep: (n) => set({ tutorialStep: n }),
  finishTutorial: () => {
    storageSet(STORAGE_KEYS.tutorial, { done: true })
    set({ tutorialDone: true, status: 'UNPAID' })
  },

  /** Insert coin: consume one coin and enter the COIN animation; controls unlock when it finishes */
  insertCoin: () => {
    const { coins } = get()
    if (coins <= 0) {
      set({ status: 'UNPAID' })
      return false
    }
    refs.coinStart = performance.now()
    // Consecutive plays get a shortened coin animation
    refs.coinDuration = get().attempts > 0 ? TIMING.coinFastDuration : TIMING.coinDuration
    refs.skipAnim = false
    persistCoins(coins - 1)
    set({ status: 'COIN', coins: coins - 1 })
    return true
  },

  setCameraDirection: (d) => set({ cameraDirection: d }),

  startGrab: () => {
    const { status, overlay } = get()
    if (overlay !== 'none') return false
    if (status !== 'READY' && status !== 'MOVING') return false
    clearMovementInput()
    resetRoundRefs()
    refs.grabPhase = 'descend'
    refs.phaseStart = performance.now()
    refs.roundStartedAt = performance.now()
    set({ status: 'GRABBING' })
    return true
  },

  finishRound: (result, timeMs, bounced, slipped, slipReason, wonToyId) => {
    const { stats, attempts, successes, coins, toys, progress, settings } = get()
    const record: RoundRecord = { result, timeMs, at: Date.now() }
    const nextStats: Stats = {
      attempts: stats.attempts + 1,
      successes: stats.successes + (result === 'success' ? 1 : 0),
      fastestTime:
        result === 'success'
          ? stats.fastestTime == null
            ? timeMs
            : Math.min(stats.fastestTime, timeMs)
          : stats.fastestTime,
      recent: [record, ...stats.recent].slice(0, 10),
    }
    storageSet(STORAGE_KEYS.stats, nextStats)
    // Reward coins on a win to encourage another round
    const nextCoins = result === 'success' ? coins + COIN.winReward : coins
    if (nextCoins !== coins) persistCoins(nextCoins)
    // Collection & stars: rarity-based star reward, duplicates keep counting
    let nextProgress = progress
    let unlocked: string | null = null
    if (result === 'success' && wonToyId != null) {
      const toyType = toys.find((t) => t.id === wonToyId)?.type ?? 'shiba'
      const def = TOY_TYPE_MAP[toyType]
      const collection = { ...progress.collection, [toyType]: (progress.collection[toyType] ?? 0) + 1 }
      nextProgress = { ...progress, stars: progress.stars + def.stars, collection }
    }
    // Achievements
    const ctx = {
      result,
      timeMs,
      slipped: !!slipped,
      streak: result === 'success' ? currentStreak + 1 : 0,
      attemptsTotal: nextStats.attempts,
      successesTotal: nextStats.successes,
      collection: nextProgress.collection,
      settings,
    }
    currentStreak = ctx.streak
    for (const a of ACHIEVEMENTS) {
      if (nextProgress.achievements.includes(a.id)) continue
      if (a.check(ctx)) {
        nextProgress = { ...nextProgress, achievements: [...nextProgress.achievements, a.id] }
        unlocked = a.id
      }
    }
    if (nextProgress !== progress) persistProgress(nextProgress)
    set({
      status: 'RESULT',
      resultInfo: { result, timeMs, bounced, slipped, slipReason },
      attempts: attempts + 1,
      successes: successes + (result === 'success' ? 1 : 0),
      coins: nextCoins,
      stats: nextStats,
      progress: nextProgress,
      ...(unlocked ? { achievementFlash: unlocked } : {}),
    })
  },

  setToyStatus: (id, status) =>
    set((st) => ({ toys: st.toys.map((t) => (t.id === id ? { ...t, status } : t)) })),

  playAgain: () => {
    const { toys } = get()
    const remaining = toys.filter((t) => t.status === 'inBox').length
    if (remaining === 0) {
      set({ resultInfo: null, status: 'COMPLETED' })
      return
    }
    set({ resultInfo: null })
    get().insertCoin()
  },

  /** Close the result modal without paying: enter the unpaid state; pressing 'Insert' resumes play */
  closeResult: () => set({ resultInfo: null, status: 'UNPAID' }),

  restartGame: () => {
    const { settings, coins } = get()
    clearMovementInput()
    resetRoundRefs()
    // Coins live in the persistent wallet: restarting never resets them, only applies bankruptcy relief
    const nextCoins = Math.max(coins, 5)
    if (nextCoins !== coins) persistCoins(nextCoins)
    set((st) => ({
      status: 'RESETTING',
      overlay: 'none',
      resultInfo: null,
      toys: buildToys(settings.difficulty),
      attempts: 0,
      successes: 0,
      coins: nextCoins,
      shakeUsed: false,
      resetNonce: st.resetNonce + 1,
    }))
  },

  clearDailyBonus: () => set({ dailyBonus: 0 }),

  shakeMachine: () => {
    const { shakeUsed, status, toys } = get()
    if (shakeUsed) return
    if (status !== 'READY' && status !== 'MOVING' && status !== 'UNPAID') return
    refs.shakeAt = performance.now()
    for (const toy of toys) {
      if (toy.status !== 'inBox') continue
      const body = toyBodies.get(toy.id)
      if (!body) continue
      body.wakeUp()
      body.applyImpulse(
        { x: (Math.random() - 0.5) * 0.02, y: Math.random() * 0.025, z: (Math.random() - 0.5) * 0.02 },
        true,
      )
    }
    set({ shakeUsed: true })
  },

  /** Instant on-screen callout at the moment the toy slips */
  flashSlip: (reason) => set({ slipFlash: { reason, at: Date.now() } }),
  clearSlipFlash: () => set({ slipFlash: null }),
  clearAchievementFlash: () => set({ achievementFlash: null }),
  setPhotoMode: (on) => set({ photoMode: on, overlay: 'none' }),

  /** Joystick touched without a coin: remind the player to insert one (throttled to 1.5s) */
  askCoin: () => {
    const now = Date.now()
    if (now - get().coinHint > 1500) set({ coinHint: now })
  },

  finishReset: () => {
    if (get().status === 'RESETTING') set({ status: 'UNPAID' })
  },

  pause: () => {
    const { status } = get()
    if (status !== 'READY' && status !== 'MOVING') return
    clearMovementInput()
    set({ status: 'PAUSED', statusBeforePause: status })
  },

  resume: () => {
    if (get().status === 'PAUSED') set({ status: 'READY', overlay: 'none' })
  },

  openOverlay: (o) => set({ overlay: o }),
  closeOverlay: () => set({ overlay: 'none' }),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    storageSet(STORAGE_KEYS.settings, next)
    set({ settings: next })
  },

  clearStats: () => {
    storageRemove(STORAGE_KEYS.stats)
    set({ stats: defaultStats, overlay: 'none' })
  },

  fatalError: (msg) => {
    clearMovementInput()
    set({ status: 'ERROR', errorMessage: msg })
  },

  retryFromError: () =>
    set((st) => ({ status: 'LOADING', errorMessage: null, resetNonce: st.resetNonce + 1 })),
}))

export function remainingToys(toys: ToyMeta[]): number {
  return toys.filter((t) => t.status === 'inBox').length
}

// Expose the store for automated tests/debugging (dev only)
if (import.meta.env.DEV) {
  ;(window as unknown as { __gameStore?: typeof useGameStore }).__gameStore = useGameStore
}
