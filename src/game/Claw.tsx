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
 * 抓手：GLB 骨骼动画驱动三爪开合，拉杆随下降拉伸，
 * 三个传感器刚体跟随爪尖用于抓取判定（FR-404）。
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
      // 隐藏模型内置的碰撞辅助盒
      if (/^cube\d/.test(o.name)) o.visible = false
    })
    rod.current = scene.getObjectByName('long') ?? null
    topBox.current = scene.getObjectByName('top-box') ?? null
    if (topBox.current) {
      // 收窄天车，防止在 X 边界处超出侧轨
      topBox.current.scale.set(0.7, 1, 0.85)
    }
    // 模型内置爪尖辅助盒：cube1~3 为张开位，cube1-1~3-1 为闭合位（爪组本地坐标）
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

    // 骨骼开合动画按进度采样
    const action = Object.values(actions)[0]
    if (action) {
      const clip = action.getClip()
      action.time = THREE.MathUtils.clamp(closeProgress, 0, 1) * (clip.duration - 0.001)
      mixer.update(0)
    }

    // 拉杆从机箱顶延伸到爪头；天车（top-box）固定在顶部不随下降
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
    // 轨道滚轮：跟随横杆并按位移滚动
    const dz = clawPos.z - lastZ.current
    lastZ.current = clawPos.z
    wheelRoll.current += dz / WHEEL_R
    for (const w of [wheelL.current, wheelR.current]) {
      if (!w) continue
      w.position.z = clawPos.z
      w.rotation.x = wheelRoll.current
    }

    // 传感器在模型自带的开/闭爪尖辅助盒位置间按闭合进度插值
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
      {/* 天车轨道：贴合机箱顶框的两侧导轨 + 随抓手 Z 移动的横杆 */}
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
      {/* 横杆两端的行走滚轮，骑在侧轨上并随移动滚转 */}
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
          {/* 实体小碰撞体：闭爪时真实推挤玩偶 */}
          <BallCollider args={[0.035]} />
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
