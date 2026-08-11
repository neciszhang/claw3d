import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CLAW, DIFFICULTY, GRIP, PHYSICS, TIMING } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs, type GrabPhase } from '../store/refs'
import { toyRegistry } from './Toys'
import { sound } from '../audio/soundManager'

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (t: number) => THREE.MathUtils.clamp(t, 0, 1)

const _tiltE = new THREE.Euler()
const _tiltQ = new THREE.Quaternion()

interface Anchor {
  x: number
  z: number
  off0: { x: number; y: number; z: number }
  off: { x: number; y: number; z: number }
  settleResult: 'success' | 'fail'
  bounced: boolean
  /** Carry progress (0..1) at which this round is scheduled to slip; -1 = firm grip, no slip */
  slipAt: number
  slipped: boolean
  swing: { x: number; z: number; vx: number; vz: number }
  prev: { x: number; z: number }
  vel: { x: number; z: number }
  rot0: THREE.Quaternion
}

const PHASE_DURATION: Record<GrabPhase, number> = {
  idle: 0,
  descend: TIMING.descendDuration,
  close: TIMING.closeDuration,
  judge: 50,
  ascend: TIMING.ascendDuration,
  toExit: TIMING.moveExitDuration,
  release: TIMING.releaseDuration,
  settle: TIMING.settleDuration,
  return: TIMING.returnDuration,
}

function setPhase(p: GrabPhase) {
  refs.grabPhase = p
  refs.phaseStart = performance.now()
}

/** Drives joystick movement and the entire grab timeline (FR-401~409) */
export function GrabController() {
  const grabAnchor = useRef<Anchor>({
    x: 0,
    z: 0,
    off0: { x: 0, y: 0, z: 0 },
    off: { x: 0, y: 0, z: 0 },
    settleResult: 'fail',
    bounced: false,
    slipAt: -1,
    slipped: false,
    swing: { x: 0, z: 0, vx: 0, vz: 0 },
    prev: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot0: new THREE.Quaternion(),
  })

  useFrame((_, delta) => {
    const store = useGameStore.getState()
    const status = store.status
    const now = performance.now()

    // — Coin animation: unlock controls when done —
    if (status === 'COIN') {
      if (now - refs.coinStart >= TIMING.coinDuration) store.setStatus('READY')
      return
    }

    // — Movement (READY / MOVING; suspended when an overlay is open) —
    if (status === 'READY' || status === 'MOVING') {
      if (store.overlay !== 'none') {
        if (status === 'MOVING') store.setStatus('READY')
        refs.moveVec.x = 0
        refs.moveVec.z = 0
        return
      }
      const jx = refs.joystick.x || refs.keyboard.x
      const jy = refs.joystick.y || refs.keyboard.y
      const mag = Math.min(1, Math.hypot(jx, jy))
      if (mag > 0.05) {
        const az = refs.snappedAzimuth
        // Screen right = (cos az, -sin az), screen up = (-sin az, -cos az)
        const up = -jy
        const wx = jx * Math.cos(az) + up * -Math.sin(az)
        const wz = jx * -Math.sin(az) + up * -Math.cos(az)
        refs.moveVec.x = wx
        refs.moveVec.z = wz
        const speedFactor = DIFFICULTY[store.settings.difficulty].speedFactor
        const speed =
          CLAW.baseMoveSpeed *
          speedFactor *
          THREE.MathUtils.lerp(CLAW.minSpeedFactor, 1, mag)
        refs.clawPos.x = THREE.MathUtils.clamp(
          refs.clawPos.x + wx * speed * delta,
          CLAW.boundsX[0],
          CLAW.boundsX[1],
        )
        refs.clawPos.z = THREE.MathUtils.clamp(
          refs.clawPos.z + wz * speed * delta,
          CLAW.boundsZ[0],
          CLAW.boundsZ[1],
        )
        if (status === 'READY') store.setStatus('MOVING')
      } else {
        refs.moveVec.x = 0
        refs.moveVec.z = 0
        if (status === 'MOVING') store.setStatus('READY')
      }
      return
    }

    if (status !== 'GRABBING') return

    // — Timeout protection (FR-408) —
    const phaseDur = PHASE_DURATION[refs.grabPhase]
    const elapsed = now - refs.phaseStart
    if (elapsed > phaseDur + TIMING.phaseTimeoutExtra) {
      console.error('[claw] Grab phase timeout, force reset', refs.grabPhase)
      releaseToy(true)
      refs.closeProgress = 0
      refs.clawPos.y = CLAW.restY
      setPhase('idle')
      store.finishRound('fail', now - refs.roundStartedAt)
      return
    }
    const t = clamp01(phaseDur === 0 ? 1 : elapsed / phaseDur)

    switch (refs.grabPhase) {
      case 'descend': {
        refs.clawPos.y = THREE.MathUtils.lerp(CLAW.restY, CLAW.bottomY, easeInOut(t))
        if (t >= 1) {
          setPhase('close')
          sound.play('close')
        }
        break
      }
      case 'close': {
        // Close fast to 82% → bite pause → final squeeze (theatrical half-close hold)
        refs.closeProgress =
          t < 0.55
            ? easeInOut(t / 0.55) * 0.82
            : t < 0.75
              ? 0.82
              : 0.82 + easeInOut((t - 0.75) / 0.25) * 0.18
        if (t >= 1) setPhase('judge')
        break
      }
      case 'judge': {
        if (t >= 1) {
          const candidate = judgeCandidate()
          refs.candidateToyId = candidate
          if (candidate >= 0) {
            const body = toyRegistry.get(candidate)
            if (body) {
              const pos = body.translation()
              const a = grabAnchor.current
              a.off0.x = THREE.MathUtils.clamp(pos.x - refs.clawPos.x, -0.13, 0.13)
              a.off0.z = THREE.MathUtils.clamp(pos.z - refs.clawPos.z, -0.13, 0.13)
              a.off0.y = THREE.MathUtils.clamp(pos.y - refs.clawPos.y, -0.06, 0.1)
              a.off = { ...a.off0 }
              const rot = body.rotation()
              a.rot0.set(rot.x, rot.y, rot.z, rot.w)
              a.swing.x = a.swing.z = a.swing.vx = a.swing.vz = 0
              a.prev.x = refs.clawPos.x
              a.prev.z = refs.clawPos.z
              a.vel.x = a.vel.z = 0
              a.slipped = false
              // Grip roll: fixed random slip chance (independent of aim, like real arcades); grip locks after pityAfter consecutive slips
              const slipChance =
                store.settings.steadyGrip || refs.slipStreak >= GRIP.pityAfter ? 0 : GRIP.slipChance
              // Slip window 0.15~0.75, biased toward the ascent and early carry (claw not over the chute yet, so a slip always falls back into the pit)
              a.slipAt =
                Math.random() < slipChance ? 0.15 + 0.6 * Math.pow(Math.random(), 1.4) : -1
              body.setBodyType(2, true) // KinematicPositionBased
              useGameStore.getState().setToyStatus(candidate, 'held')
            } else {
              // Toy reference lost: treat this round as a failure
              console.error('[claw] Toy rigid body reference lost', candidate)
              refs.candidateToyId = -1
            }
          }
          setPhase('ascend')
        }
        break
      }
      case 'ascend': {
        refs.clawPos.y = THREE.MathUtils.lerp(CLAW.bottomY, CLAW.restY, easeInOut(t))
        const a = grabAnchor.current
        const held = refs.candidateToyId >= 0 && !a.slipped
        if (refs.candidateToyId < 0) refs.closeProgress = Math.max(0, 1 - t * 2.5)
        if (held) {
          // Smoothly pull the toy from the grab point into the claw center during the first half, avoiding teleport
          const k = easeInOut(Math.min(1, t * 2))
          a.off.x = THREE.MathUtils.lerp(a.off0.x, 0, k)
          a.off.z = THREE.MathUtils.lerp(a.off0.z, 0, k)
          a.off.y = THREE.MathUtils.lerp(a.off0.y, 0.02, k)
          updateSwing(a, delta)
          if (a.slipAt >= 0 && t * 0.35 >= a.slipAt) slipToy(a)
          else followToy(a)
        }
        if (t >= 1) {
          if (refs.candidateToyId >= 0) {
            grabAnchor.current.x = refs.clawPos.x
            grabAnchor.current.z = refs.clawPos.z
            setPhase('toExit')
          } else {
            setPhase('idle')
            store.finishRound('fail', now - refs.roundStartedAt)
            sound.play('fail')
            sound.vibrate(80)
          }
        }
        break
      }
      case 'toExit': {
        // Move sequentially: first half X, second half Z (FR-406)
        const tx = clamp01(t * 2)
        const tz = clamp01(t * 2 - 1)
        refs.clawPos.x = THREE.MathUtils.lerp(grabAnchor.current.x, CLAW.exitX, easeInOut(tx))
        refs.clawPos.z = THREE.MathUtils.lerp(grabAnchor.current.z, CLAW.exitZ, easeInOut(tz))
        const a = grabAnchor.current
        if (!a.slipped) {
          updateSwing(a, delta)
          if (a.slipAt >= 0 && 0.35 + t * 0.65 >= a.slipAt) slipToy(a)
          else followToy(a)
        }
        if (t >= 1) {
          if (a.slipped) {
            // Already slipped: skip the release animation and go straight to settling for a faster result
            setPhase('settle')
          } else {
            releaseToy(false)
            setPhase('release')
          }
        }
        break
      }
      case 'release': {
        refs.closeProgress = Math.max(0, 1 - t * 2)
        if (t >= 1) setPhase('settle')
        break
      }
      case 'settle': {
        // Toy may bounce back into the pit: only counts as a grab if it truly enters the exit chute
        const id = refs.candidateToyId
        const body = id >= 0 ? toyRegistry.get(id) : undefined
        if (!body) {
          grabAnchor.current.settleResult = 'fail'
          grabAnchor.current.bounced = false
          refs.candidateToyId = -1
          grabAnchor.current.x = refs.clawPos.x
          grabAnchor.current.z = refs.clawPos.z
          setPhase('return')
          break
        }
        const pos = body.translation()
        // Center below the cabinet floor and within the hole boundary: entered the chute shaft, cannot bounce back
        const inChute =
          pos.y < -0.12 &&
          pos.x > PHYSICS.hole.minX &&
          pos.x < PHYSICS.hole.maxX &&
          pos.z > PHYSICS.hole.minZ &&
          pos.z < 0.96
        // Slipped round: the toy has usually landed back in the pit; shorten the settle window to 1.2s (still allowing a lucky roll into the chute)
        const settleDone = grabAnchor.current.slipped ? elapsed >= 1200 : t >= 1
        if (inChute || settleDone) {
          grabAnchor.current.settleResult = inChute ? 'success' : 'fail'
          grabAnchor.current.bounced = !inChute && !grabAnchor.current.slipped
          useGameStore.getState().setToyStatus(id, inChute ? 'out' : 'inBox')
          if (inChute) {
            sound.play('drop')
            // Trigger ground burst effect when the camera pulls back to panoramic view
            refs.successPulseAt = performance.now()
          }
          refs.candidateToyId = -1
          grabAnchor.current.x = refs.clawPos.x
          grabAnchor.current.z = refs.clawPos.z
          setPhase('return')
        }
        break
      }
      case 'return': {
        refs.clawPos.x = THREE.MathUtils.lerp(grabAnchor.current.x, CLAW.homeX, easeInOut(t))
        refs.clawPos.z = THREE.MathUtils.lerp(grabAnchor.current.z, CLAW.homeZ, easeInOut(t))
        if (t >= 1) {
          setPhase('idle')
          const result = grabAnchor.current.settleResult
          store.finishRound(
            result,
            now - refs.roundStartedAt,
            grabAnchor.current.bounced,
            result !== 'success' && grabAnchor.current.slipped,
          )
          if (result === 'success') {
            refs.slipStreak = 0
            sound.play('success')
            sound.vibrate([60, 40, 120])
          } else {
            sound.play('fail')
            sound.vibrate(80)
          }
        }
        break
      }
      case 'idle':
        break
    }
  })

  return null
}

/** Intersect the hit sets of all three prongs; a toy hit by all three is a valid candidate */
function judgeCandidate(): number {
  const [a, b, c] = refs.clawHits
  for (const id of a) {
    if (b.has(id) && c.has(id)) {
      const toy = useGameStore.getState().toys.find((t) => t.id === id)
      if (toy && toy.status === 'inBox') return id
    }
  }
  return -1
}

/** Spring-damper swing: claw acceleration drives the hanging toy sway */
function updateSwing(a: Anchor, delta: number) {
  const dt = Math.min(Math.max(delta, 1e-4), 0.05)
  const vx = (refs.clawPos.x - a.prev.x) / dt
  const vz = (refs.clawPos.z - a.prev.z) / dt
  const ax = (vx - a.vel.x) / dt
  const az = (vz - a.vel.z) / dt
  a.vel.x = vx
  a.vel.z = vz
  a.prev.x = refs.clawPos.x
  a.prev.z = refs.clawPos.z
  const s = a.swing
  s.vx += (-26 * s.x - 4.2 * s.vx - ax * 0.045) * dt
  s.vz += (-26 * s.z - 4.2 * s.vz - az * 0.045) * dt
  s.x = THREE.MathUtils.clamp(s.x + s.vx * dt, -0.09, 0.09)
  s.z = THREE.MathUtils.clamp(s.z + s.vz * dt, -0.09, 0.09)
}

/** Mid-carry slip: switch back to a dynamic body and fall with the swing momentum */
function slipToy(a: Anchor) {
  a.slipped = true
  refs.slipStreak += 1
  refs.shakeAt = performance.now()
  sound.play('slip')
  sound.vibrate(60)
  const id = refs.candidateToyId
  const body = id >= 0 ? toyRegistry.get(id) : undefined
  if (!body) return
  body.setBodyType(0, true) // Dynamic
  body.wakeUp()
  body.setLinvel(
    { x: a.vel.x * 0.5 + a.swing.vx * 1.5, y: -0.4, z: a.vel.z * 0.5 + a.swing.vz * 1.5 },
    true,
  )
  body.setAngvel(
    { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 6 },
    true,
  )
}

function followToy(a: Anchor) {
  const id = refs.candidateToyId
  if (id < 0) return
  const body = toyRegistry.get(id)
  if (!body) return
  // Sleeping kinematic bodies skip mesh sync, so keep them awake
  body.wakeUp()
  const s = a.swing
  body.setNextKinematicTranslation({
    x: refs.clawPos.x + a.off.x + s.x,
    y: refs.clawPos.y + a.off.y - 0.02 - (Math.abs(s.x) + Math.abs(s.z)) * 0.18,
    z: refs.clawPos.z + a.off.z + s.z,
  })
  // Hanging tilt: lean toward the swing direction for a loose, dangling feel
  _tiltE.set(s.z * 2.4, 0, -s.x * 2.4)
  _tiltQ.setFromEuler(_tiltE).multiply(a.rot0)
  body.setNextKinematicRotation(_tiltQ)
}

function releaseToy(forced: boolean) {
  const id = refs.candidateToyId
  if (id < 0) return
  const body = toyRegistry.get(id)
  if (body) {
    body.setBodyType(0, true) // Dynamic
    body.wakeUp()
  }
  if (forced) {
    useGameStore.getState().setToyStatus(id, 'inBox')
    refs.candidateToyId = -1
  }
}
