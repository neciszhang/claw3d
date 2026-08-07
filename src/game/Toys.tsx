import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { SkeletonUtils } from 'three-stdlib'
import { ASSETS, PHYSICS, TOY } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { supportsWebP } from '../utils/capabilities'

export function dogModelUrl(): string {
  return supportsWebP() ? ASSETS.dog.webp : ASSETS.dog.fallback
}

/** Grab controller manipulates toy rigid bodies directly through this registry */
export const toyRegistry = new Map<number, RapierRigidBody>()

const COLLECT_DELAY = 1500
const COLLECT_DURATION = 800

function Toy({ id, spawn }: { id: number; spawn: [number, number] }) {
  const { scene } = useGLTF(dogModelUrl())
  const status = useGameStore((s) => s.toys.find((t) => t.id === id)?.status)
  const [gone, setGone] = useState(false)
  const bodyRef = useRef<RapierRigidBody | null>(null)
  const visual = useRef<THREE.Group>(null)
  const collect = useRef<{ start: number; fromY: number } | null>(null)

  const model = useMemo(() => {
    const cloned = SkeletonUtils.clone(scene)
    cloned.traverse((o: any) => {
      if (o.isMesh) o.castShadow = true
    })
    return cloned
  }, [scene])

  // Delay briefly after a toy falls into the exit, then play the collect animation (approach A: recycle to prevent pile-up)
  useEffect(() => {
    if (status !== 'out') return
    const timer = window.setTimeout(() => {
      const body = bodyRef.current
      if (!body) return
      body.setBodyType(2, true) // KinematicPositionBased
      collect.current = { start: performance.now(), fromY: body.translation().y }
    }, COLLECT_DELAY)
    return () => window.clearTimeout(timer)
  }, [status])

  useFrame(() => {
    const c = collect.current
    const body = bodyRef.current
    if (!c || !body || gone) return
    const t = (performance.now() - c.start) / COLLECT_DURATION
    if (t >= 1) {
      // Immediately disable colliders (sensor + clear collision groups, no physics step needed), then park the rigid body off-screen
      for (let i = 0; i < body.numColliders(); i++) {
        const collider = body.collider(i)
        collider.setSensor(true)
        collider.setCollisionGroups(0)
      }
      body.wakeUp()
      body.setNextKinematicTranslation({ x: 30 + id * 2, y: -60, z: 30 })
      if (visual.current) visual.current.visible = false
      setGone(true)
      return
    }
    body.wakeUp()
    const pos = body.translation()
    body.setNextKinematicTranslation({
      x: pos.x,
      y: c.fromY + t * 0.45,
      z: pos.z,
    })
    const s = Math.max(0.01, 1 - t * t)
    visual.current?.scale.setScalar(s)
  })

  return (
    <RigidBody
      ref={(body) => {
        if (!body) return
        bodyRef.current = body
        toyRegistry.set(id, body)
        return () => {
          bodyRef.current = null
          toyRegistry.delete(id)
        }
      }}
      colliders={false}
      position={[spawn[0], PHYSICS.floorY + TOY.radius + 0.02, spawn[1]]}
      userData={{ toyId: id }}
      linearDamping={0.4}
      angularDamping={0.6}
    >
      <BallCollider args={[TOY.radius]} />
      <group ref={visual}>
        <group position={[-1.28, -0.23, 0.06]}>
          <primitive object={model} />
        </group>
      </group>
    </RigidBody>
  )
}

export function Toys() {
  const toys = useGameStore((s) => s.toys)
  return (
    <>
      {toys.map((t) => (
        <Toy key={t.id} id={t.id} spawn={t.spawn} />
      ))}
    </>
  )
}
