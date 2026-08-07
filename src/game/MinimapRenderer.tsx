import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RENDER } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { stageGroupRef } from './Stage'

/** 小地图布局（CSS px），UI 边框层与 scissor 渲染共用 */
export function minimapLayout(viewportW: number): { size: number; top: number; right: number } {
  const size = Math.min(RENDER.minimapMaxSize, Math.round(viewportW * 0.3))
  return { size, top: 56, right: 10 }
}

/**
 * 接管渲染循环：主相机全屏渲染 + 右上角正交俯视小地图（FR-304~306）。
 * 小地图 up 方向跟随主相机方位角旋转。
 */
export function MinimapRenderer() {
  const { gl, scene, camera, size } = useThree()
  const orthoCam = useMemo(() => {
    // near/far 裁剪掉机箱顶盖，只俯视内部（y ∈ [-0.8, 1.55]）
    const cam = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 3.45, 5.8)
    cam.position.set(0, 5, 0)
    return cam
  }, [])
  const minimapOn = useGameStore((s) => s.settings.minimap)

  useFrame(() => {
    gl.autoClear = true
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(scene, camera)

    if (!minimapOn) return
    // setViewport/setScissor 接收 CSS 像素，three 内部会乘 pixelRatio
    const { size: mmSize, top, right } = minimapLayout(size.width)
    const px = Math.round(size.width - right - mmSize)
    const py = Math.round(size.height - top - mmSize)
    const s = mmSize

    const az = refs.cameraAzimuth
    orthoCam.up.set(-Math.sin(az), 0, -Math.cos(az))
    orthoCam.lookAt(0, 0, 0)
    orthoCam.updateProjectionMatrix()

    // 第二次渲染只画机箱内部：隐藏舞台装饰并冻结阴影贴图重算
    const stage = stageGroupRef.current
    const prevStageVisible = stage?.visible ?? true
    const prevShadowAuto = gl.shadowMap.autoUpdate
    if (stage) stage.visible = false
    gl.shadowMap.autoUpdate = false

    gl.autoClear = false
    gl.clearDepth()
    gl.setScissorTest(true)
    gl.setScissor(px, py, s, s)
    gl.setViewport(px, py, s, s)
    gl.render(scene, orthoCam)
    gl.setScissorTest(false)
    gl.autoClear = true

    if (stage) stage.visible = prevStageVisible
    gl.shadowMap.autoUpdate = prevShadowAuto
  }, 1)

  return null
}
