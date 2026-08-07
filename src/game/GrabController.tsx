import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CLAW, DIFFICULTY, PHYSICS, TIMING } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs, type GrabPhase } from '../store/refs'
import { toyRegistry } from './Toys'
import { sound } from '../audio/soundManager'

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (t: number) => THREE.MathUtils.clamp(t, 0, 1)

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
  const grabAnchor = useRef({
    x: 0,
    z: 0,
    off0: { x: 0, y: 0, z: 0 },
    off: { x: 0, y: 0, z: 0 },
    settleResult: 'fail' as 'success' | 'fail',
    bounced: false,
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
        refs.closeProgress = t
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
        const held = refs.candidateToyId >= 0
        if (!held) refs.closeProgress = Math.max(0, 1 - t * 2.5)
        if (held) {
          // Smoothly pull the toy from the grab point into the claw center during the first half, avoiding teleport
          const a = grabAnchor.current
          const k = easeInOut(Math.min(1, t * 2))
          a.off.x = THREE.MathUtils.lerp(a.off0.x, 0, k)
          a.off.z = THREE.MathUtils.lerp(a.off0.z, 0, k)
          a.off.y = THREE.MathUtils.lerp(a.off0.y, 0.02, k)
          followToy(a.off)
        }
        if (t >= 1) {
          if (held) {
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
        followToy(grabAnchor.current.off)
        if (t >= 1) {
          releaseToy(false)
          setPhase('release')
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
        if (inChute || t >= 1) {
          grabAnchor.current.settleResult = inChute ? 'success' : 'fail'
          grabAnchor.current.bounced = !inChute
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
          store.finishRound(result, now - refs.roundStartedAt, grabAnchor.current.bounced)
          if (result === 'success') {
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

function followToy(off: { x: number; y: number; z: number }) {
  const id = refs.candidateToyId
  if (id < 0) return
  const body = toyRegistry.get(id)
  if (!body) return
  // Sleeping kinematic bodies skip mesh sync, so keep them awake
  body.wakeUp()
  body.setNextKinematicTranslation({
    x: refs.clawPos.x + off.x,
    y: refs.clawPos.y + off.y,
    z: refs.clawPos.z + off.z,
  })
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
