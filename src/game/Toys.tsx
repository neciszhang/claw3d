import { useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { ASSETS, PHYSICS, TOY, TOY_TYPE_MAP, type ToyTypeKey } from '../config/gameConfig'
import { toyBodies, useGameStore } from '../store/gameStore'
import { supportsWebP } from '../utils/capabilities'

export function dogModelUrl(): string {
  return supportsWebP() ? ASSETS.dog.webp : ASSETS.dog.fallback
}

/** Grab controller manipulates toy rigid bodies directly through this registry */
export const toyRegistry = new Map<number, RapierRigidBody>()
/** Per-toy visual scale driven by the collect animation; consumed by ToyInstances */
const toyScale = new Map<number, number>()

const COLLECT_DELAY = 1500
const COLLECT_DURATION = 800
const VISUAL_OFFSET = new THREE.Matrix4().makeTranslation(-1.28, -0.23, 0.06)

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _base = new THREE.Matrix4()
const _m = new THREE.Matrix4()
const _c = new THREE.Color()

/** Physics + game logic only; rendering is done by ToyInstances in a single pass per submesh */
function ToyBody({ id, spawn, type }: { id: number; spawn: [number, number]; type: ToyTypeKey }) {
  const def = TOY_TYPE_MAP[type]
  const status = useGameStore((s) => s.toys.find((t) => t.id === id)?.status)
  const [gone, setGone] = useState(false)
  const bodyRef = useRef<RapierRigidBody | null>(null)
  const collect = useRef<{ start: number; fromY: number } | null>(null)

  useEffect(() => {
    toyScale.set(id, 1)
    return () => {
      toyScale.delete(id)
    }
  }, [id])

  // Delay briefly after a toy falls into the exit, then play the collect animation (recycle to prevent pile-up)
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
      toyScale.set(id, 0)
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
    toyScale.set(id, Math.max(0.01, 1 - t * t))
  })

  return (
    <RigidBody
      ref={(body) => {
        if (!body) return
        bodyRef.current = body
        toyRegistry.set(id, body)
        toyBodies.set(id, body)
        return () => {
          bodyRef.current = null
          toyRegistry.delete(id)
          toyBodies.delete(id)
        }
      }}
      colliders={false}
      position={[spawn[0], PHYSICS.floorY + TOY.radius + 0.35 + (id % 5) * 0.16, spawn[1]]}
      userData={{ toyId: id }}
      linearDamping={0.4}
      angularDamping={0.6}
    >
      <BallCollider args={[TOY.radius * def.scale]} density={def.density} />
    </RigidBody>
  )
}

/**
 * All toys rendered with instancedMesh (one draw call per GLB submesh instead of
 * submeshes × toy count), following r3f scaling-performance guidance.
 */
function ToyInstances({ ids }: { ids: number[] }) {
  const types = useGameStore((s) => s.toys.map((toy) => toy.type).join(','))
  const { scene } = useGLTF(dogModelUrl())
  const parts = useMemo(() => {
    const src = scene.clone(true)
    src.updateMatrixWorld(true)
    const list: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[] = []
    src.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        list.push({
          geometry: mesh.geometry,
          material: mesh.material as THREE.Material,
          local: mesh.matrixWorld.clone(),
        })
      }
    })
    return list
  }, [scene])
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([])

  // Per-instance tint from the toy type (instanceColor keeps one draw call per submesh)
  useEffect(() => {
    const toys = useGameStore.getState().toys
    for (const im of meshRefs.current) {
      if (!im) continue
      for (let i = 0; i < toys.length; i++) {
        im.setColorAt(i, _c.set(TOY_TYPE_MAP[toys[i].type].tint))
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true
    }
  }, [types, parts])

  useFrame(() => {
    const toys = useGameStore.getState().toys
    for (let i = 0; i < ids.length; i++) {
      const body = toyRegistry.get(ids[i])
      const sc = toyScale.get(ids[i]) ?? 1
      if (!body || sc <= 0.001) {
        _base.makeScale(0, 0, 0)
      } else {
        const t = body.translation()
        const r = body.rotation()
        _p.set(t.x, t.y, t.z)
        _q.set(r.x, r.y, r.z, r.w)
        _s.setScalar(sc * TOY_TYPE_MAP[toys[i]?.type ?? 'shiba'].scale)
        _base.compose(_p, _q, _s).multiply(VISUAL_OFFSET)
      }
      for (let k = 0; k < parts.length; k++) {
        const im = meshRefs.current[k]
        if (!im) continue
        _m.multiplyMatrices(_base, parts[k].local)
        im.setMatrixAt(i, _m)
      }
    }
    for (const im of meshRefs.current) {
      if (im) im.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {parts.map((p, k) => (
        <instancedMesh
          key={k}
          ref={(el) => {
            meshRefs.current[k] = el
          }}
          args={[p.geometry, p.material, ids.length]}
          castShadow
          frustumCulled={false}
        />
      ))}
    </>
  )
}

export function Toys() {
  const toys = useGameStore((s) => s.toys)
  // Depend on length only: toy ids never change within a game, and an unstable
  // reference would re-create the instancedMeshes (r3f pitfalls: avoid re-mounting)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => toys.map((t) => t.id), [toys.length])
  return (
    <>
      {toys.map((t) => (
        <ToyBody key={t.id} id={t.id} spawn={t.spawn} type={t.type} />
      ))}
      <ToyInstances ids={ids} />
    </>
  )
}
