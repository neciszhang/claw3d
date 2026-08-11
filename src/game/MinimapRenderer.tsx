import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RENDER } from '../config/gameConfig'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'
import { stageGroupRef } from './Stage'

/** Minimap layout (CSS px), shared by the UI border layer and scissor rendering */
export function minimapLayout(viewportW: number): { size: number; top: number; right: number } {
  const size = Math.min(RENDER.minimapMaxSize, Math.round(viewportW * 0.3))
  // Wide screens (PC): pull toward the center near the machine; narrow screens stay at the top-right corner
  const right = Math.max(10, Math.round(viewportW / 2 - 380 - size / 2))
  return { size, top: 56, right }
}

const BLIT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** Linear → sRGB encode: render targets hold linear values, the canvas expects sRGB */
const BLIT_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uMap, vUv).rgb;
    vec3 srgb = mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    gl_FragColor = vec4(srgb, 1.0);
  }
`

const MINIMAP_RT_SIZE = 320

/**
 * Takes over the render loop: full-screen main camera render + orthographic top-down minimap.
 * The heavy second scene pass renders into a small target every 3rd frame only;
 * each frame merely blits that texture into the scissor region (r3f scaling-performance guidance).
 */
export function MinimapRenderer() {
  const { gl, scene, camera, size } = useThree()
  const orthoCam = useMemo(() => {
    // near/far clip out the cabinet top so we only look down into the interior (y ∈ [-0.8, 1.55])
    const cam = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 3.45, 5.8)
    cam.position.set(0, 5, 0)
    return cam
  }, [])
  const rt = useMemo(
    () => new THREE.WebGLRenderTarget(MINIMAP_RT_SIZE, MINIMAP_RT_SIZE, { stencilBuffer: false }),
    [],
  )
  const blit = useMemo(() => {
    const blitScene = new THREE.Scene()
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const mat = new THREE.ShaderMaterial({
      vertexShader: BLIT_VERT,
      fragmentShader: BLIT_FRAG,
      uniforms: { uMap: { value: rt.texture } },
      depthTest: false,
      depthWrite: false,
    })
    blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
    return { scene: blitScene, cam }
  }, [rt])
  const frame = useRef(0)
  const minimapOn = useGameStore((s) => s.settings.minimap)
  useEffect(() => () => rt.dispose(), [rt])

  useFrame(() => {
    gl.autoClear = true
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.render(scene, camera)

    if (!minimapOn) return

    // Refresh the top-down capture every 3rd frame; toys move slowly enough
    frame.current++
    if (frame.current % 3 === 0 || frame.current === 1) {
      const az = refs.cameraAzimuth
      orthoCam.up.set(-Math.sin(az), 0, -Math.cos(az))
      orthoCam.lookAt(0, 0, 0)
      orthoCam.updateProjectionMatrix()

      // Only draw the cabinet interior: hide stage decorations and freeze shadow map updates
      const stage = stageGroupRef.current
      const prevStageVisible = stage?.visible ?? true
      const prevShadowAuto = gl.shadowMap.autoUpdate
      if (stage) stage.visible = false
      gl.shadowMap.autoUpdate = false
      const prevTarget = gl.getRenderTarget()
      gl.setRenderTarget(rt)
      gl.render(scene, orthoCam)
      gl.setRenderTarget(prevTarget)
      if (stage) stage.visible = prevStageVisible
      gl.shadowMap.autoUpdate = prevShadowAuto
    }

    // Cheap per-frame blit of the cached texture into the scissor region
    const { size: mmSize, top, right } = minimapLayout(size.width)
    const px = Math.round(size.width - right - mmSize)
    const py = Math.round(size.height - top - mmSize)
    gl.autoClear = false
    gl.setScissorTest(true)
    gl.setScissor(px, py, mmSize, mmSize)
    gl.setViewport(px, py, mmSize, mmSize)
    gl.render(blit.scene, blit.cam)
    gl.setScissorTest(false)
    gl.autoClear = true
  }, 1)

  return null
}
