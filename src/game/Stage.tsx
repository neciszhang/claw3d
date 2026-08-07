import { useEffect, useMemo, useRef } from 'react'
import { Sparkles, Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../store/gameStore'
import { refs } from '../store/refs'

const COMET_COUNT = 10
const COMET_TINTS = ['#fff3d8', '#ffd8a8', '#d8ecff', '#ffd2e2']

function makeCometTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 256
  const ctx = c.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  grad.addColorStop(0.12, 'rgba(255, 246, 220, 0.85)')
  grad.addColorStop(0.3, 'rgba(255, 226, 170, 0.42)')
  grad.addColorStop(0.62, 'rgba(215, 180, 255, 0.14)')
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 32, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Comets: glowing head + tapered fading tail welded together, streaking from upper-right to lower-left */
function Comets() {
  const groups = useRef<(THREE.Group | null)[]>([])
  const tailTex = useMemo(makeCometTexture, [])
  const glowTex = useMemo(() => makeGlowTexture('rgba(255, 244, 214, 0.9)'), [])
  const coreTex = useMemo(() => makeGlowTexture('rgba(255, 255, 255, 1)'), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const dirNorm = useMemo(() => new THREE.Vector3(), [])
  const parts = useMemo(
    () =>
      Array.from({ length: COMET_COUNT }, () => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        active: false,
        wait: Math.random() * 4,
      })),
    [],
  )

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    for (let i = 0; i < COMET_COUNT; i++) {
      const p = parts[i]
      const g = groups.current[i]
      if (!g) continue
      if (!p.active) {
        g.visible = false
        p.wait -= delta // Use real time for waiting so comets appear on schedule even at low FPS
        if (p.wait <= 0) {
          // Horizon: far ring band beyond the floor disc, random azimuth across 360°
          const theta = Math.random() * Math.PI * 2
          const R = 24 + Math.random() * 8
          p.pos.set(Math.cos(theta) * R, 7 + Math.random() * 6, Math.sin(theta) * R)
          // Tangential + downward → streaks diagonally from any viewing angle
          const sh = 4 + Math.random() * 3
          const sv = 2.6 + Math.random() * 1.6
          p.vel.set(Math.sin(theta) * sh, -sv, -Math.cos(theta) * sh)
          dirNorm.copy(p.vel).normalize()
          g.quaternion.setFromUnitVectors(up, dirNorm)
          p.active = true
        }
        continue
      }
      p.pos.addScaledVector(p.vel, dt)
      // Sink below the horizon (occluded by the floor) before recycling
      if (p.pos.y < -6) {
        p.active = false
        p.wait = 0.5 + Math.random() * 2.5
        g.visible = false
        continue
      }
      g.visible = true
      g.position.copy(p.pos)
    }
  })

  return (
    <>
      {Array.from({ length: COMET_COUNT }).map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            groups.current[i] = el
          }}
          visible={false}
        >
          {/* Head: small light core + close glow halo, sized to blend with the tail into a teardrop shape */}
          <sprite scale={[0.5, 0.5, 1]}>
            <spriteMaterial
              map={coreTex}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
              fog={false}
            />
          </sprite>
          <sprite scale={[1.0, 1.0, 1]}>
            <spriteMaterial
              map={glowTex}
              color={COMET_TINTS[i % COMET_TINTS.length]}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
              fog={false}
              opacity={0.65}
            />
          </sprite>
          {/* Tail: wide-to-narrow tapered cone fading out, top buried inside the light core for a seamless look */}
          <mesh position={[0, -3.42, 0]}>
            <cylinderGeometry args={[0.13, 0.004, 7.0, 10, 1, true]} />
            <meshBasicMaterial
              map={tailTex}
              color={COMET_TINTS[i % COMET_TINTS.length]}
              transparent
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
              fog={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** Hide stage decorations during minimap rendering to avoid the cost of a second full-scene draw */
export const stageGroupRef: { current: THREE.Group | null } = { current: null }

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** Phantom nebula floor (adapted from Phantom Star by kaneta): raymarched IFS fractal tunnel, blue-purple volumetric light */
const BASE_WAVE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;

  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
  }

  const float pi = 3.14159265358979;

  vec2 pmod(vec2 p, float r) {
    float a = atan(p.x, p.y) + pi / r;
    float n = (pi * 2.0) / r;
    a = floor(a / n) * n;
    return p * rot(-a);
  }

  float box(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
  }

  float ifsBox(vec3 p) {
    for (int i = 0; i < 5; i++) {
      p = abs(p) - 1.0;
      p.xy *= rot(uTime * 0.3);
      p.xz *= rot(uTime * 0.1);
    }
    p.xz *= rot(uTime);
    return box(p, vec3(0.4, 0.8, 0.3));
  }

  float map(vec3 p) {
    vec3 p1 = p;
    p1.x = mod(p1.x - 5.0, 10.0) - 5.0;
    p1.y = mod(p1.y - 5.0, 10.0) - 5.0;
    p1.z = mod(p1.z, 16.0) - 8.0;
    p1.xy = pmod(p1.xy, 5.0);
    return ifsBox(p1);
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float rr = length(p);

    vec3 cPos = vec3(0.0, 0.0, -3.0 * uTime);
    vec3 cDir = normalize(vec3(0.0, 0.0, -1.0));
    vec3 cUp = vec3(sin(uTime), 1.0, 0.0);
    vec3 cSide = cross(cDir, cUp);
    vec3 ray = normalize(cSide * p.x + cUp * p.y + cDir);

    // Phantom Mode https://www.shadertoy.com/view/MtScWW by aiekick
    float acc = 0.0;
    float acc2 = 0.0;
    float t = 0.0;
    for (int i = 0; i < 99; i++) {
      vec3 pos = cPos + ray * t;
      float dist = map(pos);
      dist = max(abs(dist), 0.02);
      float a = exp(-dist * 3.0);
      if (mod(length(pos) + 24.0 * uTime, 30.0) < 3.0) {
        a *= 2.0;
        acc2 += a;
      }
      acc += a;
      t += dist * 0.5;
    }

    vec3 col = vec3(acc * 0.0045, acc * 0.0065 + acc2 * 0.002, acc * 0.011 + acc2 * 0.006);
    float alpha = clamp(1.0 - t * 0.03, 0.0, 1.0) * 0.82;
    // Feather the disc edge to blend into the neon grid floor
    alpha *= smoothstep(1.0, 0.7, rr);
    gl_FragColor = vec4(col, alpha);
  }
`

const PASS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** Pass-through sampling: skip three's color space encoding to preserve the raw look of off-screen raymarching */
const PASS_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uMap, vUv);
  }
`

/** Phantom floor: raymarch to a low-res off-screen texture (~1/20 fragment count), refresh every other frame and map back to the floor disc */
function PhantomFloor() {
  const quality = useGameStore((st) => st.settings.quality)
  const size = quality === 'high' ? 512 : 320
  const rt = useMemo(() => {
    return new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, stencilBuffer: false })
  }, [size])
  const quad = useMemo(() => {
    const scene = new THREE.Scene()
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: BASE_WAVE_FRAG,
      uniforms: { uTime: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    })
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
    return { scene, cam, mat }
  }, [])
  const passUniforms = useMemo(() => ({ uMap: { value: rt.texture } }), [rt])
  const simT = useRef(0)
  const frame = useRef(0)
  useEffect(() => () => rt.dispose(), [rt])
  useFrame(({ gl }, delta) => {
    // Slow flow normally; briefly accelerate on a successful grab, then smoothly settle back
    let speed = 0.35
    if (refs.successPulseAt > 0) {
      const e = (performance.now() - refs.successPulseAt) / 1000
      if (e < 5) speed += 2.1 * Math.exp(-e * 1.1)
    }
    simT.current += Math.min(delta, 0.05) * speed
    // Slow flow only needs every-other-frame refresh, halving raymarch cost
    frame.current++
    if (frame.current % 2 === 0) {
      quad.mat.uniforms.uTime.value = simT.current
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(rt)
      gl.render(quad.scene, quad.cam)
      gl.setRenderTarget(prev)
    }
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.705, 0.2]}>
      <circleGeometry args={[22, 64]} />
      <shaderMaterial
        vertexShader={PASS_VERT}
        fragmentShader={PASS_FRAG}
        uniforms={passUniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  )
}

const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.1 + vec3(7.3);
      a *= 0.5;
    }
    return v;
  }
`

const AURORA_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const AURORA_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform float uTime;
  ${NOISE_GLSL}
  void main() {
    float h = vDir.y * 0.5 + 0.5;
    // Bottom → top gradient
    vec3 base = mix(vec3(0.035, 0.023, 0.086), vec3(0.24, 0.14, 0.51), smoothstep(0.0, 0.9, h));
    base = mix(base, vec3(0.05, 0.03, 0.12), smoothstep(0.75, 1.0, h) * 0.6);
    // Aurora band: fbm flowing around the horizontal direction
    float n = fbm(vec3(vDir.x * 1.6, vDir.y * 3.2 - uTime * 0.045, vDir.z * 1.6) + uTime * 0.012);
    float band = smoothstep(0.42, 0.62, n) * smoothstep(0.05, 0.35, h) * (1.0 - smoothstep(0.55, 0.95, h));
    vec3 auroraA = vec3(1.0, 0.36, 0.54);  // pink
    vec3 auroraB = vec3(0.30, 0.85, 1.0);  // cyan
    float m = fbm(vec3(vDir.z * 1.2, vDir.x * 1.2, uTime * 0.03));
    vec3 aurora = mix(auroraA, auroraB, m);
    vec3 col = base + aurora * band * 0.4;
    // Faint nebula glow
    float glow = pow(max(0.0, fbm(vDir * 2.4 + vec3(0.0, uTime * 0.008, 0.0)) - 0.45), 2.0);
    col += vec3(0.45, 0.35, 0.9) * glow * 0.5;
    gl_FragColor = vec4(col, 1.0);
  }
`

function makeGlowTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Gradient sky dome + neon grid floor + stage base + floating neon decorations for an arcade ambiance */
export function Stage() {
  const quality = useGameStore((s) => s.settings.quality)

  const domeTexture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 512
    const ctx = c.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0, '#3d2482')
    grad.addColorStop(0.35, '#241653')
    grad.addColorStop(0.65, '#150d33')
    grad.addColorStop(1, '#090616')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 16, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }, [])

  const glowPink = useMemo(() => makeGlowTexture('rgba(255, 92, 138, 0.55)'), [])
  const glowCyan = useMemo(() => makeGlowTexture('rgba(77, 216, 255, 0.4)'), [])
  const auroraUniforms = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame(({ clock }) => {
    auroraUniforms.uTime.value = clock.elapsedTime
  })

  return (
    <group
      ref={(g) => {
        stageGroupRef.current = g
        return () => {
          stageGroupRef.current = null
        }
      }}
    >
      {/* Sky dome: aurora shader for high quality, static gradient for smooth mode */}
      <mesh>
        <sphereGeometry args={[32, 32, 16]} />
        {quality === 'high' ? (
          <shaderMaterial
            vertexShader={AURORA_VERT}
            fragmentShader={AURORA_FRAG}
            uniforms={auroraUniforms}
            side={THREE.BackSide}
            depthWrite={false}
            fog={false}
            toneMapped={false}
          />
        ) : (
          <meshBasicMaterial
            map={domeTexture}
            side={THREE.BackSide}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        )}
      </mesh>

      {/* Dark floor (occludes comets below the horizon) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.72, 0]}>
        <circleGeometry args={[22, 48]} />
        <meshBasicMaterial color="#0a0620" fog={false} toneMapped={false} />
      </mesh>

      <PhantomFloor />

      {/* Glow behind the cabinet */}
      <sprite position={[0, 0.6, -3.2]} scale={[10, 6, 1]}>
        <spriteMaterial
          map={glowPink}
          blending={THREE.AdditiveBlending}
          opacity={0.5}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      <sprite position={[-4.5, -0.8, -1.5]} scale={[6, 4, 1]}>
        <spriteMaterial
          map={glowCyan}
          blending={THREE.AdditiveBlending}
          opacity={0.45}
          depthWrite={false}
          fog={false}
        />
      </sprite>

      {/* Colored fill lights on both sides */}
      <pointLight position={[-4, 1.5, 2]} intensity={6} distance={12} color="#4dd8ff" />
      <pointLight position={[4, 1.2, -2]} intensity={6} distance={12} color="#ff5c8a" />

      {/* Stage spotlight */}
      <spotLight
        position={[0, 6.5, 3.5]}
        angle={0.45}
        penumbra={0.9}
        intensity={65}
        distance={16}
        color="#cfd8ff"
        target-position={[0, 0, 0.2]}
      />

      <Comets />

      {quality === 'high' && (
        <>
          <Stars radius={26} depth={12} count={1800} factor={2.2} fade speed={0.5} />
          <Sparkles
            count={70}
            scale={[9, 5, 9]}
            position={[0, 1.2, 0]}
            size={2.4}
            speed={0.35}
            opacity={0.55}
            color="#9db4ff"
          />
        </>
      )}
    </group>
  )
}

/** Sample render stats for the performance panel (aggregated to refs.perf every 500ms) */
export function PerfMonitor() {
  const enabled = useGameStore((s) => s.settings.perfPanel)
  const acc = useRef({ frames: 0, last: performance.now() })

  useFrame(({ gl }) => {
    if (!enabled) return
    const a = acc.current
    a.frames++
    const now = performance.now()
    const span = now - a.last
    if (span >= 500) {
      refs.perf.fps = Math.round((a.frames * 1000) / span)
      refs.perf.ms = Math.round((span / a.frames) * 10) / 10
      refs.perf.drawCalls = gl.info.render.calls
      refs.perf.triangles = gl.info.render.triangles
      a.frames = 0
      a.last = now
    }
  })
  return null
}
