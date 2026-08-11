export type Difficulty = 'easy' | 'normal' | 'hard'
export type Quality = 'high' | 'low'

const BASE = import.meta.env.BASE_URL

export const ASSETS = {
  box: { webp: `${BASE}models/boxoutnew.glb`, fallback: `${BASE}models/boxoutnewWithOutWebp.glb` },
  dog: { webp: `${BASE}models/dogout.glb`, fallback: `${BASE}models/dogoutWithOutWebp.glb` },
  claw: { webp: `${BASE}models/clawoutnew.glb`, fallback: `${BASE}models/clawoutnew.glb` },
}

export const PHYSICS = {
  gravity: [0, -10, 0] as [number, number, number],
  floorY: -0.12,
  wallX: 0.85,
  wallZFront: 0.82,
  wallZBack: -0.83,
  wallTop: 2.05,
  // Exit chute (drop hole at front-right corner of the cabinet)
  hole: { minX: 0.16, maxX: 0.81, minZ: 0.39, maxZ: 0.84 },
  chuteFloorY: -0.58,
  guardWallTop: 0.42,
}

export const CLAW = {
  boundsX: [-0.6, 0.58] as [number, number],
  boundsZ: [-0.63, 0.6] as [number, number],
  restY: 0.95,
  bottomY: 0.0,
  homeX: 0,
  homeZ: 0,
  exitX: 0.49,
  exitZ: 0.58,
  baseMoveSpeed: 1.5,
  minSpeedFactor: 0.25,
  // Rod top snap height (inside the fixed gantry, world coordinates)
  rodTopY: 1.95,
  // Three-prong sensor: radius and height around the claw center (relative to claw group origin)
  sensorRing: 0.2,
  sensorRingClosed: 0.055,
  sensorHeight: 0.07,
}

export const COIN = {
  perGame: 15,
  dailyBonus: 5, // coins granted on first entry each day
  winReward: 1, // coins returned per win (must stay below the per-round cost to avoid inflation)
}

/** Grip & slip: player actions influence the outcome (aim accuracy, movement speed, difficulty) */
export const GRIP = {
  base: 0.1, // weak-grip probability floor even with a perfect grab
  eccentric: 0.5, // extra slip probability scaled by aim eccentricity (0..1)
  swingThreshold: 0.05, // swing amplitude above which fast movement adds slip hazard
  swingHazard: 4.0, // hazard rate per second per unit of swing above the threshold
  difficultyFactor: { easy: 0.7, normal: 1.0, hard: 1.35 } as Record<Difficulty, number>,
  pityAfter: 2, // after N consecutive slips the grip locks and the next catch holds (payout cycle)
}

export const TIMING = {
  coinDuration: 950,
  descendDuration: 2000,
  closeDuration: 1000,
  ascendDuration: 2000,
  moveExitDuration: 1400,
  releaseDuration: 900,
  settleDuration: 4000,
  returnDuration: 1700,
  failAscendDuration: 900, // accelerated recall when nothing was caught
  failReturnDuration: 900, // faster home return after a failed round
  coinFastDuration: 650, // shortened coin animation for consecutive plays
  cameraSnapDuration: 250,
  phaseTimeoutExtra: 8000,
}

export const RENDER = {
  maxDpr: 1.5,
  lowDpr: 1.0,
  minimapMaxSize: 200,
  cameraTarget: [0, 0.45, 0] as [number, number, number],
  cameraRadius: 4.6,
  cameraMinDistance: 3.2,
  cameraMaxDistance: 6.5,
  cameraPolar: [Math.PI * 0.28, Math.PI * 0.52] as [number, number],
  loadTimeoutMs: 15000,
}

export const TOY = {
  radius: 0.175,
  count: 10,
}

export type Rarity = 'common' | 'rare' | 'hidden'
export type ToyTypeKey = 'shiba' | 'snow' | 'sakura' | 'golden' | 'cosmic'

export interface ToyTypeDef {
  key: ToyTypeKey
  rarity: Rarity
  /** Instance tint multiplied over the base texture */
  tint: string
  scale: number
  density: number
  /** Multiplier applied to the slip chance (heavier / slipperier toys) */
  slipFactor: number
  /** Stars awarded per catch */
  stars: number
  /** Spawn weight */
  weight: number
}

export const TOY_TYPES: ToyTypeDef[] = [
  { key: 'shiba', rarity: 'common', tint: '#ffffff', scale: 1.0, density: 1.0, slipFactor: 1.0, stars: 1, weight: 46 },
  { key: 'snow', rarity: 'common', tint: '#d9e8ff', scale: 0.94, density: 0.9, slipFactor: 0.95, stars: 1, weight: 22 },
  { key: 'sakura', rarity: 'rare', tint: '#ffb3d2', scale: 1.0, density: 1.0, slipFactor: 1.15, stars: 3, weight: 15 },
  { key: 'golden', rarity: 'rare', tint: '#ffd257', scale: 1.08, density: 1.35, slipFactor: 1.3, stars: 4, weight: 11 },
  { key: 'cosmic', rarity: 'hidden', tint: '#b48cff', scale: 0.9, density: 0.85, slipFactor: 1.45, stars: 8, weight: 6 },
]

export const TOY_TYPE_MAP: Record<ToyTypeKey, ToyTypeDef> = Object.fromEntries(
  TOY_TYPES.map((t) => [t.key, t]),
) as Record<ToyTypeKey, ToyTypeDef>

/** Weighted random toy type */
export function rollToyType(rand: () => number = Math.random): ToyTypeDef {
  const total = TOY_TYPES.reduce((s, t) => s + t.weight, 0)
  let r = rand() * total
  for (const t of TOY_TYPES) {
    r -= t.weight
    if (r <= 0) return t
  }
  return TOY_TYPES[0]
}

export interface DifficultyPreset {
  label: string
  speedFactor: number
  sensorRadius: number
  layout: [number, number][]
}

const sparse: [number, number][] = [
  [0, 0.05], [-0.42, -0.1], [0.42, -0.1], [-0.2, -0.45],
  [0.2, -0.45], [0, -0.25], [-0.45, 0.28], [0.35, 0.22],
]
const normal: [number, number][] = [
  [0, 0], [-0.4, 0.15], [0.4, 0.05], [-0.55, -0.25], [0.55, -0.3],
  [-0.2, -0.35], [0.2, -0.5], [0, 0.35], [-0.5, 0.45], [0.45, -0.55],
]
const dense: [number, number][] = [
  [-0.6, 0.45], [-0.62, 0.1], [-0.6, -0.25], [-0.58, -0.58], [-0.25, -0.6],
  [0.15, -0.6], [0.55, -0.58], [0.6, -0.2], [0.28, -0.35], [-0.28, -0.4],
]

export const DIFFICULTY: Record<Difficulty, DifficultyPreset> = {
  easy: { label: 'Easy', speedFactor: 0.8, sensorRadius: 0.085, layout: sparse },
  normal: { label: 'Normal', speedFactor: 1.0, sensorRadius: 0.06, layout: normal },
  hard: { label: 'Hard', speedFactor: 1.2, sensorRadius: 0.042, layout: dense },
}

export const STORAGE_KEYS = {
  settings: 'claw3d.settings.v1',
  stats: 'claw3d.stats.v1',
  tutorial: 'claw3d.tutorialDone.v1',
  wallet: 'claw3d.wallet.v1',
  progress: 'claw3d.progress.v1',
}
