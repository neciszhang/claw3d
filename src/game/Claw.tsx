import { useEffect, useMemo, useRef } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { ASSETS, CLAW, DIFFICULTY } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'

const RAIL_Y = 1.97
const WHEEL_R = 0.055

/**
 * Claw: GLB skeletal animation drives the three-prong open/close, the rod stretches with descent,
 * and three sensor rigid bodies follow the claw tips for grab detection (FR-404).
 */
export function Claw() {
  const group = useRef<THREE.Group>(null)
  const rod = useRef<THREE.Object3D | null>(null)
  const topBox = useRef<THREE.Object3D | null>(null)
  const crossBar = useRef<THREE.Mesh>(null)
  const wheelL = useRef<THREE.Group>(null)
  const wheelR = useRef<THREE.Group>(null)
  const lastZ = useRef(0)
  const wheelRoll = useRef(0)
  const tipOpen = useRef<(THREE.Vector3 | null)[]>([null, null, null])
  const tipClosed = useRef<(THREE.Vector3 | null)[]>([null, null, null])
  const sensors = useRef<(RapierRigidBody | null)[]>([null, null, null])
  const { scene, animations } = useGLTF(ASSETS.claw.webp)
  const { actions, mixer } = useAnimations(animations, group)
  const sensorRadius = useGameStore((s) => DIFFICULTY[s.settings.difficulty].sensorRadius)

  const model = useMemo(() => {
    scene.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true
        o.frustumCulled = false
      }
      // Hide built-in collision helper boxes from the model
      if (/^cube\d/.test(o.name)) o.visible = false
    })
    rod.current = scene.getObjectByName('long') ?? null
    topBox.current = scene.getObjectByName('top-box') ?? null
    if (topBox.current) {
      // Narrow the gantry to prevent overrunning the side rails at X boundaries
      topBox.current.scale.set(0.7, 1, 0.85)
    }
    // Built-in claw tip helper boxes: cube1~3 are open positions, cube1-1~3-1 are closed positions (claw group local coords)
    scene.updateMatrixWorld(true)
    const center = (name: string) => {
      const node = scene.getObjectByName(name)
      if (!node) return null
      return new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())
    }
    tipOpen.current = [center('cube1'), center('cube2'), center('cube3')]
    tipClosed.current = [center('cube1-1'), center('cube2-1'), center('cube3-1')]
    return scene
  }, [scene])

  useEffect(() => {
    const action = Object.values(actions)[0]
    if (action) {
      action.reset().play()
      action.paused = true
    }
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const { clawPos, closeProgress } = refs
    g.position.set(clawPos.x, clawPos.y, clawPos.z)
    // Catch jolt: brief decaying jitter right after a successful judge
    const je = performance.now() - refs.clawShakeAt
    if (refs.clawShakeAt > 0 && je < 220) {
      const amp = 0.012 * (1 - je / 220)
      g.position.x += Math.sin(je * 0.16) * amp
      g.position.y += Math.sin(je * 0.23 + 1.3) * amp
    }

    // Sample skeletal open/close animation by progress
    const action = Object.values(actions)[0]
    if (action) {
      const clip = action.getClip()
      action.time = THREE.MathUtils.clamp(closeProgress, 0, 1) * (clip.duration - 0.001)
      mixer.update(0)
    }

    // Rod stretches from the cabinet top to the claw head; the top-box stays fixed at the top and does not descend
    if (rod.current) {
      const topLocal = CLAW.rodTopY - clawPos.y
      const span = Math.max(0.05, topLocal - 0.86)
      rod.current.position.y = topLocal
      rod.current.scale.y = span / 0.082
    }
    if (topBox.current) {
      topBox.current.position.y = CLAW.restY - clawPos.y
    }
    if (crossBar.current) {
      crossBar.current.position.z = clawPos.z
    }
    // Rail wheels: follow the crossbar and roll by displacement
    const dz = clawPos.z - lastZ.current
    lastZ.current = clawPos.z
    wheelRoll.current += dz / WHEEL_R
    for (const w of [wheelL.current, wheelR.current]) {
      if (!w) continue
      w.position.z = clawPos.z
      w.rotation.x = wheelRoll.current
    }

    // Interpolate sensors between the model's built-in open/closed claw-tip helper box positions by close progress
    const ring = THREE.MathUtils.lerp(CLAW.sensorRing, CLAW.sensorRingClosed, closeProgress)
    for (let i = 0; i < 3; i++) {
      const body = sensors.current[i]
      if (!body) continue
      const open = tipOpen.current[i]
      const closed = tipClosed.current[i]
      if (open && closed) {
        body.setNextKinematicTranslation({
          x: clawPos.x + THREE.MathUtils.lerp(open.x, closed.x, closeProgress),
          y: clawPos.y + THREE.MathUtils.lerp(open.y, closed.y, closeProgress),
          z: clawPos.z + THREE.MathUtils.lerp(open.z, closed.z, closeProgress),
        })
      } else {
        const ang = (i * Math.PI * 2) / 3
        body.setNextKinematicTranslation({
          x: clawPos.x + Math.cos(ang) * ring,
          y: clawPos.y + CLAW.sensorHeight,
          z: clawPos.z + Math.sin(ang) * ring,
        })
      }
    }
  })

  return (
    <>
      {/* Gantry rails: side rails hugging the cabinet top frame + a crossbar that moves with the claw Z */}
      <mesh position={[-0.86, RAIL_Y, 0]}>
        <boxGeometry args={[0.07, 0.07, 1.66]} />
        <meshStandardMaterial color="#c3c9d4" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position={[0.86, RAIL_Y, 0]}>
        <boxGeometry args={[0.07, 0.07, 1.66]} />
        <meshStandardMaterial color="#c3c9d4" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh ref={crossBar} position={[0, RAIL_Y, 0]}>
        <boxGeometry args={[1.79, 0.055, 0.1]} />
        <meshStandardMaterial color="#a9b0bd" metalness={0.7} roughness={0.32} />
      </mesh>
      {/* Walking wheels at both ends of the crossbar, riding on the side rails and rolling with movement */}
      <group ref={wheelL} position={[-0.86, RAIL_Y + 0.07, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.045, 20]} />
          <meshStandardMaterial color="#3c4250" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.052, 12]} />
          <meshStandardMaterial color="#c3c9d4" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
      <group ref={wheelR} position={[0.86, RAIL_Y + 0.07, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.045, 20]} />
          <meshStandardMaterial color="#3c4250" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.052, 12]} />
          <meshStandardMaterial color="#c3c9d4" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
      <group ref={group}>
        <primitive object={model} />
      </group>
      {[0, 1, 2].map((i) => (
        <RigidBody
          key={i}
          type="kinematicPosition"
          colliders={false}
          ref={(body) => {
            sensors.current[i] = body
            return () => {
              sensors.current[i] = null
            }
          }}
          position={[Math.cos((i * Math.PI * 2) / 3) * CLAW.sensorRing, CLAW.restY, Math.sin((i * Math.PI * 2) / 3) * CLAW.sensorRing]}
        >
          {/* Solid prong bodies: tip + finger segments physically push toys while closing (ported from the legacy convex-prong feel) */}
          <BallCollider args={[0.055]} />
          <BallCollider args={[0.045]} position={[0, 0.085, 0]} />
          <BallCollider
            args={[sensorRadius]}
            sensor
            onIntersectionEnter={({ other }) => {
              const toyId = (other.rigidBody?.userData as { toyId?: number } | undefined)?.toyId
              if (toyId != null) refs.clawHits[i].add(toyId)
            }}
            onIntersectionExit={({ other }) => {
              const toyId = (other.rigidBody?.userData as { toyId?: number } | undefined)?.toyId
              if (toyId != null) refs.clawHits[i].delete(toyId)
            }}
          />
        </RigidBody>
      ))}
    </>
  )
}
