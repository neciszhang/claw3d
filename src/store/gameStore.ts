import { create } from 'zustand'
import {
  COIN,
  DIFFICULTY,
  STORAGE_KEYS,
  TOY,
  type Difficulty,
  type Quality,
} from '../config/gameConfig'
import { storageGet, storageRemove, storageSet } from './persistence'
import { clearMovementInput, refs, resetRoundRefs } from './refs'

export type GameStatus =
  | 'BOOT'
  | 'UNSUPPORTED'
  | 'LOADING'
  | 'TUTORIAL'
  | 'COIN'
  | 'READY'
  | 'MOVING'
  | 'CAMERA_SNAP'
  | 'GRABBING'
  | 'RESULT'
  | 'PAUSED'
  | 'RESETTING'
  | 'COMPLETED'
  | 'ERROR'

export type Overlay = 'none' | 'settings' | 'help' | 'history' | 'confirmRestart' | 'confirmClear'

export interface ToyMeta {
  id: number
  status: 'inBox' | 'held' | 'out'
  spawn: [number, number]
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
}

const defaultStats: Stats = { attempts: 0, successes: 0, fastestTime: null, recent: [] }

function buildToys(difficulty: Difficulty): ToyMeta[] {
  return DIFFICULTY[difficulty].layout.slice(0, TOY.count).map((spawn, i) => ({
    id: i,
    status: 'inBox',
    spawn,
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
  resultInfo: { result: 'success' | 'fail'; timeMs: number; bounced?: boolean } | null
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
  finishRound: (result: 'success' | 'fail', timeMs: number, bounced?: boolean) => void
  setToyStatus: (id: number, status: ToyMeta['status']) => void
  playAgain: () => void
  restartGame: () => void
  finishReset: () => void
  pause: () => void
  resume: () => void
  openOverlay: (o: Overlay) => void
  closeOverlay: () => void
  updateSettings: (patch: Partial<Settings>) => void
  clearStats: () => void
  fatalError: (msg: string) => void
  retryFromError: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  status: 'BOOT',
  statusBeforePause: 'READY',
  cameraDirection: 0,
  toys: buildToys(storageGet(STORAGE_KEYS.settings, defaultSettings).difficulty),
  attempts: 0,
  successes: 0,
  coins: COIN.perGame,
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
      get().insertCoin()
      set({ tutorialStep: 0, loadError: null })
    } else {
      set({ status: 'TUTORIAL', tutorialStep: 0, loadError: null })
    }
  },

  setTutorialStep: (n) => set({ tutorialStep: n }),
  finishTutorial: () => {
    storageSet(STORAGE_KEYS.tutorial, { done: true })
    set({ tutorialDone: true })
    get().insertCoin()
  },

  /** 投币：消耗一枚金币进入 COIN 动画，结束后才可操作 */
  insertCoin: () => {
    const { coins } = get()
    if (coins <= 0) {
      set({ status: 'READY' })
      return false
    }
    refs.coinStart = performance.now()
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

  finishRound: (result, timeMs, bounced) => {
    const { stats, attempts, successes } = get()
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
    set({
      status: 'RESULT',
      resultInfo: { result, timeMs, bounced },
      attempts: attempts + 1,
      successes: successes + (result === 'success' ? 1 : 0),
      stats: nextStats,
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

  restartGame: () => {
    const { settings } = get()
    clearMovementInput()
    resetRoundRefs()
    set((st) => ({
      status: 'RESETTING',
      overlay: 'none',
      resultInfo: null,
      toys: buildToys(settings.difficulty),
      attempts: 0,
      successes: 0,
      coins: COIN.perGame,
      resetNonce: st.resetNonce + 1,
    }))
  },

  finishReset: () => {
    if (get().status === 'RESETTING') get().insertCoin()
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
