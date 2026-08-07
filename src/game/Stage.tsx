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

/** 流星：发光头 + 锥形渐隐尾焊成一体，从右上向左下斜划坠落 */
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
        p.wait -= delta // 等待用真实时间，低帧率下也按时出现
        if (p.wait <= 0) {
          // 天边：地板圆盘之外的远环带，全 360° 随机方位
          const theta = Math.random() * Math.PI * 2
          const R = 24 + Math.random() * 8
          p.pos.set(Math.cos(theta) * R, 7 + Math.random() * 6, Math.sin(theta) * R)
          // 切向 + 下坠 → 任意视角都是斜划落
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
      // 沉到地平线以下（被地板遡挡）再回收
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
          {/* 头：小光核 + 贴身光晕，尺寸与尾宽衔接成水滴状整体 */}
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
          {/* 尾：宽头细尾锥形渐隐，顶端埋进光核内部，无缝一体 */}
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

/** 小地图渲染时隐藏舞台装饰，避免第二次全场景绘制的开销 */
export const stageGroupRef: { current: THREE.Group | null } = { current: null }

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** 幻影星云底盘（改编自 Phantom Star by kaneta）：raymarch IFS 分形隧道，蓝紫体积光 */
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
    // 圆盘边缘羽化，融入霓虹网格地面
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

/** 直通采样：跳过 three 的颜色空间编码，保持离屏 raymarch 的原始观感 */
const PASS_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uMap, vUv);
  }
`

/** 幻影底盘：raymarch 渲到低分辨率离屏纹理（片元量 ~1/20），隔帧刷新后贴回地面圆盘 */
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
    // 平时慢速流动；抓中后短暂加速，随后平滑回落
    let speed = 0.35
    if (refs.successPulseAt > 0) {
      const e = (performance.now() - refs.successPulseAt) / 1000
      if (e < 5) speed += 2.1 * Math.exp(-e * 1.1)
    }
    simT.current += Math.min(delta, 0.05) * speed
    // 慢速流动隔帧刷新即可，再省一半 raymarch 开销
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
    // 底 → 顶渐变
    vec3 base = mix(vec3(0.035, 0.023, 0.086), vec3(0.24, 0.14, 0.51), smoothstep(0.0, 0.9, h));
    base = mix(base, vec3(0.05, 0.03, 0.12), smoothstep(0.75, 1.0, h) * 0.6);
    // 极光带：绕水平方向流动的 fbm
    float n = fbm(vec3(vDir.x * 1.6, vDir.y * 3.2 - uTime * 0.045, vDir.z * 1.6) + uTime * 0.012);
    float band = smoothstep(0.42, 0.62, n) * smoothstep(0.05, 0.35, h) * (1.0 - smoothstep(0.55, 0.95, h));
    vec3 auroraA = vec3(1.0, 0.36, 0.54);  // 粉
    vec3 auroraB = vec3(0.30, 0.85, 1.0);  // 青
    float m = fbm(vec3(vDir.z * 1.2, vDir.x * 1.2, uTime * 0.03));
    vec3 aurora = mix(auroraA, auroraB, m);
    vec3 col = base + aurora * band * 0.4;
    // 微弱星云亮斑
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

/** 渐变天幕 + 霓虹网格地面 + 舞台底座 + 漂浮霓虹装饰，打造街机厅氛围 */
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
      {/* 渐变天幕：高画质用极光 shader，流畅档用静态渐变 */}
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

      {/* 深色地面（遮挡地平线下的流星） */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.72, 0]}>
        <circleGeometry args={[22, 48]} />
        <meshBasicMaterial color="#0a0620" fog={false} toneMapped={false} />
      </mesh>

      <PhantomFloor />

      {/* 机箱背后辉光 */}
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

      {/* 两侧彩色补光 */}
      <pointLight position={[-4, 1.5, 2]} intensity={6} distance={12} color="#4dd8ff" />
      <pointLight position={[4, 1.2, -2]} intensity={6} distance={12} color="#ff5c8a" />

      {/* 舞台聚光 */}
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

/** 采样渲染统计供性能面板读取（每 500ms 汇总一次到 refs.perf） */
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
