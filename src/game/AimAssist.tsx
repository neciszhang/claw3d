import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PHYSICS } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { toyRegistry } from './Toys'

const COLOR_IDLE = new THREE.Color('#9fd8ff')
const COLOR_LOCK = new THREE.Color('#ffd257')

/**
 * Aim assist: a translucent projection ring on the pit floor directly under the claw.
 * Opacity grows as the claw descends; the ring turns gold when a toy sits within
 * catch range (a hint, not a guarantee — slipping can still happen).
 */
export function AimAssist() {
  const ring = useRef<THREE.Mesh>(null)
  const dot = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const mesh = ring.current
    const dotMesh = dot.current
    if (!mesh || !dotMesh) return
    const st = useGameStore.getState()
    const status = st.status
    const inAimPhase =
      status === 'READY' ||
      status === 'MOVING' ||
      status === 'CAMERA_SNAP' ||
      (status === 'GRABBING' && (refs.grabPhase === 'descend' || refs.grabPhase === 'close'))
    const visible = st.settings.aimAssist && inAimPhase
    mesh.visible = visible
    dotMesh.visible = visible
    if (!visible) return

    const { x, z, y } = refs.clawPos
    mesh.position.set(x, PHYSICS.floorY + 0.015, z)
    dotMesh.position.set(x, PHYSICS.floorY + 0.016, z)

    // Fade in as the claw gets closer to the floor
    const drop = THREE.MathUtils.clamp(1 - (y - 0.0) / 0.95, 0, 1)
    const mat = mesh.material as THREE.MeshBasicMaterial
    const dotMat = dotMesh.material as THREE.MeshBasicMaterial
    mat.opacity = 0.3 + drop * 0.45

    // Catchable hint: any in-box toy close enough to the claw center
    let locked = false
    for (const toy of st.toys) {
      if (toy.status !== 'inBox') continue
      const body = toyRegistry.get(toy.id)
      if (!body) continue
      const p = body.translation()
      if (Math.hypot(p.x - x, p.z - z) < 0.12) {
        locked = true
        break
      }
    }
    mat.color.copy(locked ? COLOR_LOCK : COLOR_IDLE)
    dotMat.color.copy(locked ? COLOR_LOCK : COLOR_IDLE)
    dotMat.opacity = locked ? 0.65 : 0.3
  })

  return (
    <>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.15, 0.19, 48]} />
        <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={dot} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[0.03, 24]} />
        <meshBasicMaterial transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}
