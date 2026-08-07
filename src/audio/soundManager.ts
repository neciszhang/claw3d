import { useGameStore } from '../store/gameStore'

type SfxName = 'click' | 'coin' | 'descend' | 'close' | 'success' | 'fail' | 'drop'

class SoundManager {
  private ctx: AudioContext | null = null
  private musicGain: GainNode | null = null
  private musicTimer: number | null = null
  private musicStep = 0

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    } catch {
      return null
    }
    return this.ctx
  }

  /** 首次用户交互后调用，遵守自动播放限制 */
  unlock(): void {
    const ctx = this.ensureCtx()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
    this.syncMusic()
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {}): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  private noise(dur: number, gain = 0.08, delay = 0): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t0 = ctx.currentTime + delay
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = gain
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    src.connect(filter).connect(g).connect(ctx.destination)
    src.start(t0)
  }

  play(name: SfxName): void {
    if (!useGameStore.getState().settings.sfx) return
    if (!this.ensureCtx()) return
    switch (name) {
      case 'click':
        this.tone(660, 0.08, { type: 'square', gain: 0.06 })
        break
      case 'coin':
        this.tone(1245, 0.09, { type: 'square', gain: 0.07 })
        this.tone(1865, 0.22, { type: 'square', gain: 0.08, delay: 0.09 })
        this.noise(0.12, 0.05, 0.55)
        this.tone(980, 0.1, { type: 'triangle', gain: 0.06, delay: 0.6 })
        break
      case 'descend':
        this.tone(440, 0.9, { type: 'triangle', slideTo: 180, gain: 0.08 })
        break
      case 'close':
        this.noise(0.25, 0.1)
        this.tone(160, 0.2, { type: 'square', gain: 0.05, delay: 0.05 })
        break
      case 'success':
        this.tone(523, 0.16, { gain: 0.12 })
        this.tone(659, 0.16, { gain: 0.12, delay: 0.14 })
        this.tone(784, 0.3, { gain: 0.14, delay: 0.28 })
        break
      case 'fail':
        this.tone(330, 0.22, { type: 'triangle', gain: 0.1 })
        this.tone(247, 0.35, { type: 'triangle', gain: 0.1, delay: 0.18 })
        break
      case 'drop':
        this.noise(0.18, 0.14)
        this.tone(90, 0.22, { type: 'sine', gain: 0.16 })
        break
    }
  }

  vibrate(pattern: number | number[]): void {
    if (!useGameStore.getState().settings.vibration) return
    try {
      navigator.vibrate?.(pattern)
    } catch {
      // 不支持时静默降级
    }
  }

  /** 轻量循环背景音（简单琶音垫） */
  syncMusic(): void {
    const on = useGameStore.getState().settings.music
    const ctx = this.ctx
    if (!on || !ctx || ctx.state !== 'running') {
      this.stopMusic()
      return
    }
    if (this.musicTimer != null) return
    this.musicGain = ctx.createGain()
    this.musicGain.gain.value = 0.035
    this.musicGain.connect(ctx.destination)
    const seq = [262, 330, 392, 330, 294, 349, 440, 349]
    const stepFn = () => {
      const c = this.ctx
      if (!c || !this.musicGain) return
      const f = seq[this.musicStep % seq.length]
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      g.gain.setValueAtTime(0, c.currentTime)
      g.gain.linearRampToValueAtTime(1, c.currentTime + 0.05)
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.55)
      osc.connect(g).connect(this.musicGain)
      osc.start()
      osc.stop(c.currentTime + 0.6)
      this.musicStep++
    }
    stepFn()
    this.musicTimer = window.setInterval(stepFn, 600)
  }

  stopMusic(): void {
    if (this.musicTimer != null) {
      window.clearInterval(this.musicTimer)
      this.musicTimer = null
    }
    this.musicGain?.disconnect()
    this.musicGain = null
  }
}

export const sound = new SoundManager()
