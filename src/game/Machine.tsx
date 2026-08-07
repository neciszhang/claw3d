import { useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import * as THREE from 'three'
import { ASSETS, PHYSICS, TIMING } from '../config/gameConfig'
import { refs } from '../store/refs'
import { useGameStore } from '../store/gameStore'
import { supportsWebP } from '../utils/capabilities'

export function boxModelUrl(): string {
  return supportsWebP() ? ASSETS.box.webp : ASSETS.box.fallback
}

const W = PHYSICS
/** 投币口：对准模型操作台前立面的投币贴图（红按钮下方） */
export const COIN_SLOT = { x: -0.21, y: -0.655, z: 1.365 }

/** 机箱模型 + 静态碰撞体（四壁/底面/出口滑道/护栏），操作台摇杆/按钮联动输入 */
export function Machine() {
  const { scene } = useGLTF(boxModelUrl())
  const hand = useRef<THREE.Object3D | null>(null)
  const btn = useRef<THREE.Object3D | null>(null)
  const btnBaseY = useRef(0)
  const coin = useRef<THREE.Mesh>(null)

  const model = useMemo(() => {
    scene.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = false
        o.receiveShadow = true
      }
    })
    hand.current = scene.getObjectByName('hand') ?? null
    btn.current = scene.getObjectByName('btn') ?? null
    if (btn.current) btnBaseY.current = btn.current.position.y
    return scene
  }, [scene])

  useFrame((_, delta) => {
    const damp = 1 - Math.exp(-12 * delta)
    // 操作台摇杆随移动方向倾斜
    if (hand.current) {
      const targetX = refs.moveVec.z * 0.38
      const targetZ = -refs.moveVec.x * 0.38
      hand.current.rotation.x += (targetX - hand.current.rotation.x) * damp
      hand.current.rotation.z += (targetZ - hand.current.rotation.z) * damp
    }
    // 红色按钮在投币完成、下降开始瞬间按下
    if (btn.current) {
      const grabbing = useGameStore.getState().status === 'GRABBING'
      const sinceDescend = performance.now() - refs.phaseStart
      const pressed = grabbing && refs.grabPhase === 'descend' && sinceDescend < 350
      const targetY = btnBaseY.current - (pressed ? 0.018 : 0)
      btn.current.position.y += (targetY - btn.current.position.y) * damp
    }
    // 投币动画：进场/再来一次时金币飞向前立面投币口并水平插入
    if (coin.current) {
      if (useGameStore.getState().status === 'COIN') {
        const t = THREE.MathUtils.clamp(
          (performance.now() - refs.coinStart) / TIMING.coinDuration,
          0,
          1,
        )
        coin.current.visible = t < 0.9
        if (t < 0.6) {
          const k = t / 0.6
          coin.current.position.set(
            COIN_SLOT.x,
            THREE.MathUtils.lerp(COIN_SLOT.y + 0.5, COIN_SLOT.y, k) + Math.sin(k * Math.PI) * 0.2,
            THREE.MathUtils.lerp(COIN_SLOT.z + 0.6, COIN_SLOT.z + 0.09, k),
          )
          coin.current.rotation.x = k * Math.PI * 2.5
        } else {
          const k = (t - 0.6) / 0.3
          coin.current.position.set(
            COIN_SLOT.x,
            COIN_SLOT.y,
            THREE.MathUtils.lerp(COIN_SLOT.z + 0.09, COIN_SLOT.z - 0.05, Math.min(1, k)),
          )
          coin.current.rotation.x = 0
        }
      } else {
        coin.current.visible = false
      }
    }
  })

  const wallH = (W.wallTop - W.floorY) / 2
  const wallCY = W.floorY + wallH
  const holeCX = (W.hole.minX + W.hole.maxX) / 2
  const holeW = (W.hole.maxX - W.hole.minX) / 2
  const chuteWallH = (W.guardWallTop - W.chuteFloorY) / 2
  const chuteWallCY = (W.guardWallTop + W.chuteFloorY) / 2

  return (
    <>
      <primitive object={model} />
      {/* 投币口：贴在模型投币贴图上的金色面板 + 竖直币缝 */}
      <mesh position={[COIN_SLOT.x, COIN_SLOT.y, COIN_SLOT.z]}>
        <boxGeometry args={[0.1, 0.22, 0.014]} />
        <meshStandardMaterial color="#d8b04a" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[COIN_SLOT.x, COIN_SLOT.y, COIN_SLOT.z + 0.008]}>
        <boxGeometry args={[0.016, 0.075, 0.006]} />
        <meshStandardMaterial color="#17120a" roughness={0.9} />
      </mesh>
      <mesh ref={coin} visible={false} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.058, 0.058, 0.014, 24]} />
        <meshStandardMaterial
          color="#ffd257"
          metalness={0.85}
          roughness={0.25}
          emissive="#8a6a10"
          emissiveIntensity={0.4}
        />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        {/* 底面：绕开出口洞的三块 */}
        <CuboidCollider
          args={[W.wallX, 0.05, (W.hole.minZ - W.wallZBack) / 2]}
          position={[0, W.floorY - 0.05, (W.hole.minZ + W.wallZBack) / 2]}
        />
        <CuboidCollider
          args={[(W.hole.minX + W.wallX) / 2, 0.05, (W.wallZFront - W.hole.minZ) / 2]}
          position={[(W.hole.minX - W.wallX) / 2, W.floorY - 0.05, (W.wallZFront + W.hole.minZ) / 2]}
        />
        <CuboidCollider
          args={[(W.wallX - W.hole.maxX) / 2, 0.05, (W.wallZFront - W.hole.minZ) / 2]}
          position={[(W.wallX + W.hole.maxX) / 2, W.floorY - 0.05, (W.wallZFront + W.hole.minZ) / 2]}
        />
        {/* 四壁 */}
        <CuboidCollider args={[0.05, wallH, (W.wallZFront - W.wallZBack) / 2]} position={[-W.wallX - 0.05, wallCY, 0]} />
        <CuboidCollider args={[0.05, wallH, (W.wallZFront - W.wallZBack) / 2]} position={[W.wallX + 0.05, wallCY, 0]} />
        <CuboidCollider args={[W.wallX + 0.1, wallH, 0.05]} position={[0, wallCY, W.wallZBack - 0.05]} />
        <CuboidCollider args={[W.wallX + 0.1, wallH, 0.05]} position={[0, wallCY, W.wallZFront + 0.05]} />
        {/* 出口滑道：四壁从槽底到护栏顶（对应模型 box2/3/4/6），底板在槽底 */}
        <CuboidCollider
          args={[holeW + 0.06, 0.03, (0.93 - W.hole.minZ) / 2 + 0.06]}
          position={[holeCX, W.chuteFloorY - 0.03, (0.93 + W.hole.minZ) / 2]}
        />
        <CuboidCollider
          args={[0.03, chuteWallH, (0.93 - W.hole.minZ) / 2]}
          position={[W.hole.minX - 0.03, chuteWallCY, (0.93 + W.hole.minZ) / 2]}
        />
        <CuboidCollider
          args={[0.03, chuteWallH, (0.93 - W.hole.minZ) / 2]}
          position={[W.hole.maxX + 0.03, chuteWallCY, (0.93 + W.hole.minZ) / 2]}
        />
        <CuboidCollider args={[holeW, chuteWallH, 0.03]} position={[holeCX, chuteWallCY, W.hole.minZ - 0.03]} />
        <CuboidCollider args={[holeW, chuteWallH, 0.03]} position={[holeCX, chuteWallCY, 0.96]} />
      </RigidBody>
    </>
  )
}
