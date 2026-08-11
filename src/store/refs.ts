// Hot data read/written every frame, bypassing React state to avoid re-renders
export type GrabPhase =
  | 'idle'
  | 'descend'
  | 'close'
  | 'judge'
  | 'ascend'
  | 'toExit'
  | 'release'
  | 'settle'
  | 'return'

interface HotRefs {
  joystick: { x: number; y: number }
  keyboard: { x: number; y: number }
  moveVec: { x: number; z: number }
  clawPos: { x: number; y: number; z: number }
  coinStart: number
  cameraAzimuth: number
  snappedAzimuth: number
  grabPhase: GrabPhase
  phaseStart: number
  closeProgress: number
  candidateToyId: number
  clawHits: [Set<number>, Set<number>, Set<number>]
  roundStartedAt: number
  successPulseAt: number
  shakeAt: number
  slipStreak: number
  clawShakeAt: number
  /** One-shot camera preset request: 0 front / 1 side / 2 top, -1 = none */
  viewRequest: number
  captureRequest: boolean
  coinDuration: number
  skipAnim: boolean
  perf: { fps: number; ms: number; drawCalls: number; triangles: number }
}

export const refs: HotRefs = {
  joystick: { x: 0, y: 0 },
  keyboard: { x: 0, y: 0 },
  moveVec: { x: 0, z: 0 },
  clawPos: { x: 0, y: 1.02, z: 0 },
  coinStart: 0,
  cameraAzimuth: 0,
  snappedAzimuth: 0,
  grabPhase: 'idle',
  phaseStart: 0,
  closeProgress: 0,
  candidateToyId: -1,
  clawHits: [new Set(), new Set(), new Set()],
  roundStartedAt: 0,
  successPulseAt: 0,
  shakeAt: 0,
  slipStreak: 0,
  clawShakeAt: 0,
  viewRequest: -1,
  captureRequest: false,
  coinDuration: 950,
  skipAnim: false,
  perf: { fps: 0, ms: 0, drawCalls: 0, triangles: 0 },
}

export function clearMovementInput(): void {
  refs.joystick.x = 0
  refs.joystick.y = 0
  refs.keyboard.x = 0
  refs.keyboard.y = 0
  refs.moveVec.x = 0
  refs.moveVec.z = 0
}

export function resetRoundRefs(): void {
  refs.grabPhase = 'idle'
  refs.closeProgress = 0
  refs.skipAnim = false
  refs.candidateToyId = -1
  refs.clawHits.forEach((s) => s.clear())
}

// Expose hot refs for automated tests/debugging (dev only)
if (import.meta.env.DEV) {
  ;(window as unknown as { __refs?: typeof refs }).__refs = refs
}
