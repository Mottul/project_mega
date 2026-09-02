/**
 * Kompletter Sound ohne Asset-Dateien: alles wird per WebAudio synthetisiert.
 * Das hält die PWA winzig und offlinefähig, und der Chiptune-Charakter passt
 * zur 16-Bit-Optik.
 */

type SfxName =
  | 'menu'
  | 'confirm'
  | 'back'
  | 'countdown'
  | 'go'
  | 'boost'
  | 'itemBox'
  | 'itemRoll'
  | 'shoot'
  | 'drop'
  | 'hit'
  | 'pop'
  | 'lap'
  | 'finish'
  | 'skid'

/** Halbtöne über A2 (110 Hz) -> Frequenz. */
const note = (semi: number) => 110 * Math.pow(2, semi / 12)

interface Pattern {
  bpm: number
  /** -1 = Pause. Werte sind Halbtöne relativ zu A2. */
  lead: number[]
  bass: number[]
}

const MUSIC: Pattern[] = [
  {
    // "Startgerade" - treibend, Dur
    bpm: 152,
    lead: [24, 28, 31, 28, 24, 28, 31, 35, 33, 31, 28, 31, 26, 28, 31, -1],
    bass: [0, 0, 7, 7, 5, 5, 3, 3, 0, 0, 7, 7, 5, 3, 5, 7],
  },
  {
    // "Wüstenpiste" - phrygisch angehaucht
    bpm: 140,
    lead: [24, 25, 29, 32, 29, 25, 24, 20, 22, 24, 29, 27, 25, 24, 22, -1],
    bass: [0, 0, 0, 3, 5, 5, 3, 0, -2, -2, 0, 3, 5, 3, 0, 0],
  },
  {
    // "Battle" - nervös, chromatisch
    bpm: 168,
    lead: [24, 27, 24, 30, 24, 29, 24, 27, 22, 26, 22, 29, 22, 27, 25, 24],
    bass: [0, 0, -1, -1, -3, -3, -1, -1, 0, 0, 2, 2, 3, 3, 5, 7],
  },
]

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private engines: { osc: OscillatorNode; gain: GainNode; filter: BiquadFilterNode }[] = []
  private musicTimer: ReturnType<typeof setTimeout> | null = null
  private musicStep = 0
  private musicNextTime = 0
  private musicPattern: Pattern | null = null

  muted = false
  /** Anzahl gleichzeitig klingender Motoren - hält die Summe im Rahmen. */
  engineCount = 1

  /** Muss aus einer Nutzergeste heraus laufen (Autoplay-Policy der Browser). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.55
      this.master.connect(this.ctx.destination)
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.32
      this.musicGain.connect(this.master)
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = 0.9
      this.sfxGain.connect(this.master)
    }
    void this.ctx.resume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 0.55
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  private blip(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    at = 0,
    endFreq = freq
  ): void {
    const ctx = this.ctx
    if (!ctx || !this.sfxGain) return
    const t = this.now() + at
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(gain).connect(this.sfxGain)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  }

  private noise(duration: number, volume: number, at = 0, bandpass = 1200): void {
    const ctx = this.ctx
    if (!ctx || !this.sfxGain) return
    const t = this.now() + at
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = bandpass
    filter.Q.value = 0.8
    const gain = ctx.createGain()
    gain.gain.value = volume
    src.connect(filter).connect(gain).connect(this.sfxGain)
    src.start(t)
  }

  sfx(name: SfxName): void {
    if (!this.ctx || this.muted) return
    switch (name) {
      case 'menu':
        this.blip(note(36), 0.05, 'square', 0.18)
        break
      case 'confirm':
        this.blip(note(36), 0.06, 'square', 0.22)
        this.blip(note(43), 0.1, 'square', 0.22, 0.06)
        break
      case 'back':
        this.blip(note(31), 0.07, 'square', 0.2)
        this.blip(note(24), 0.1, 'square', 0.2, 0.06)
        break
      case 'countdown':
        this.blip(note(24), 0.14, 'square', 0.28)
        break
      case 'go':
        this.blip(note(36), 0.32, 'square', 0.32)
        this.blip(note(43), 0.32, 'triangle', 0.22, 0.02)
        break
      case 'boost':
        this.blip(note(20), 0.34, 'sawtooth', 0.24, 0, note(48))
        this.noise(0.3, 0.16, 0, 2400)
        break
      case 'itemBox':
        this.blip(note(36), 0.05, 'square', 0.2)
        this.blip(note(41), 0.05, 'square', 0.2, 0.05)
        this.blip(note(48), 0.14, 'square', 0.22, 0.1)
        break
      case 'itemRoll':
        this.blip(note(40 + Math.floor(Math.random() * 7)), 0.035, 'square', 0.1)
        break
      case 'shoot':
        this.blip(note(52), 0.16, 'sawtooth', 0.2, 0, note(28))
        break
      case 'drop':
        this.blip(note(26), 0.12, 'triangle', 0.2, 0, note(16))
        break
      case 'hit':
        this.noise(0.35, 0.4, 0, 700)
        this.blip(note(18), 0.34, 'sawtooth', 0.22, 0, note(8))
        break
      case 'pop':
        this.noise(0.16, 0.34, 0, 1800)
        this.blip(note(48), 0.1, 'square', 0.2, 0, note(30))
        break
      case 'lap':
        this.blip(note(36), 0.08, 'square', 0.24)
        this.blip(note(48), 0.16, 'square', 0.24, 0.08)
        break
      case 'finish':
        ;[36, 40, 43, 48, 55].forEach((n, i) => this.blip(note(n), 0.22, 'square', 0.26, i * 0.11))
        break
      case 'skid':
        this.noise(0.09, 0.09, 0, 3200)
        break
    }
  }

  /** Motorgeräusch je lokalem Spieler; speed01 ist 0..1. */
  engine(player: number, speed01: number, active: boolean): void {
    const ctx = this.ctx
    if (!ctx || !this.sfxGain) return
    let slot = this.engines[player]
    if (!slot) {
      const osc = ctx.createOscillator()
      const filter = ctx.createBiquadFilter()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      filter.type = 'lowpass'
      filter.frequency.value = 900
      gain.gain.value = 0
      osc.connect(filter).connect(gain).connect(this.sfxGain)
      osc.start()
      slot = { osc, gain, filter }
      this.engines[player] = slot
    }
    const t = ctx.currentTime
    const target = active ? (0.055 + speed01 * 0.05) / Math.sqrt(Math.max(1, this.engineCount)) : 0
    slot.gain.gain.setTargetAtTime(target, t, 0.08)
    slot.osc.frequency.setTargetAtTime(48 + speed01 * 150, t, 0.05)
    slot.filter.frequency.setTargetAtTime(500 + speed01 * 2200, t, 0.1)
  }

  stopEngines(): void {
    const ctx = this.ctx
    if (!ctx) return
    for (const slot of this.engines) if (slot) slot.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  }

  startMusic(index: number): void {
    if (!this.ctx) return
    this.stopMusic()
    this.musicPattern = MUSIC[index % MUSIC.length]!
    this.musicStep = 0
    this.musicNextTime = this.now() + 0.1
    this.scheduleMusic()
  }

  stopMusic(): void {
    if (this.musicTimer !== null) clearTimeout(this.musicTimer)
    this.musicTimer = null
    this.musicPattern = null
  }

  /**
   * Lookahead-Scheduling: Wir planen ~150 ms im Voraus, damit ein ausgelasteter
   * Renderthread den Takt nicht verschiebt.
   */
  private scheduleMusic = (): void => {
    const ctx = this.ctx
    const pattern = this.musicPattern
    if (!ctx || !pattern || !this.musicGain) return
    const stepDur = 60 / pattern.bpm / 4
    while (this.musicNextTime < ctx.currentTime + 0.15) {
      const i = this.musicStep % pattern.lead.length
      const lead = pattern.lead[i]!
      const bass = pattern.bass[i % pattern.bass.length]!
      const t = this.musicNextTime
      if (lead >= 0) this.tone(note(lead), t, stepDur * 0.9, 'square', 0.13)
      if (this.musicStep % 2 === 0) this.tone(note(bass), t, stepDur * 1.7, 'triangle', 0.19)
      if (this.musicStep % 4 === 2) this.hat(t)
      this.musicNextTime += stepDur
      this.musicStep++
    }
    this.musicTimer = setTimeout(this.scheduleMusic, 60)
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx
    if (!ctx || !this.musicGain) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    osc.connect(gain).connect(this.musicGain)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  private hat(at: number): void {
    const ctx = this.ctx
    if (!ctx || !this.musicGain) return
    const frames = Math.floor(ctx.sampleRate * 0.04)
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 6000
    const gain = ctx.createGain()
    gain.gain.value = 0.1
    src.connect(filter).connect(gain).connect(this.musicGain)
    src.start(at)
  }
}

export const audio = new AudioEngine()
