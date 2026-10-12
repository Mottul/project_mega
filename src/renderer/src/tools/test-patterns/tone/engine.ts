// Testton-Engine (WebAudio). Ein Monosignal wird auf zwei Kanäle verteilt (beide, links,
// rechts, abwechselnd, Kanal-Kennung); am Ende der Kette sitzen Pegel und sanftes Ein- und
// Ausblenden. Ereignisse (Metronom-Klicks, Pulse, Sweeps, Kennungs-Pausen, AV-Sync-Piepe) plant
// ein Takt alle 100 ms bis 0,4 s voraus – so liegen sie sample-genau, auch wenn das Fenster hakt.
//
// AV-Sync: Das Testbild blitzt zu jeder vollen Sekunde der Wanduhr (Date.now(), dieselbe Uhr in
// Vorschau und Ausgabefenster). Der Piep wird über getOutputTimestamp() so gelegt, dass er zu
// genau dieser Wanduhrzeit aus dem Ausgabegerät kommt – die Ausgabelatenz des Rechners ist damit
// schon herausgerechnet, nicht aber die des Bildwegs (dafür der Versatz zum Eichen).

import type { PatternToneSettings } from '@shared/types'
import {
  POLARITY_PERIOD,
  SWEEP_FROM,
  SWEEP_TO,
  SYNC_FLASH_MS,
  alternateSide,
  dbToGain,
  identGaps,
  metronomeBeats,
  noiseSamples,
  polarityPulse,
  sweepStarts,
  syncBeeps,
  ticks
} from './plan'

const LOOKAHEAD = 0.4
const TICK_MS = 100
/** Einblenden beim Start (Schutz) und Überblenden beim Wechsel des Signals */
const FADE_IN = 0.5
const CROSSFADE = 0.05
const FADE_OUT = 0.05
/** Zeitkonstante für Kanal-Umschaltungen: knackfrei, aber hörbar sofort */
const SWITCH = 0.002

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> }

/** Ein laufendes Signal samt Kanalverteilung; beim Wechsel wird es übergeblendet. */
interface Voice {
  settings: PatternToneSettings
  bus: GainNode
  left: GainNode
  right: GainNode
  out: GainNode
  /** Dauerquellen und noch geplante Einzelereignisse (zum Stoppen) */
  sources: Set<AudioScheduledSourceNode>
  osc?: OscillatorNode
  sweepGain?: GainNode
  /** Kontextzeit, ab der der Zeitplan zählt */
  t0: number
  /** bis hierhin eingeplant (s ab t0) */
  until: number
  /** AV-Sync: bis hierhin eingeplant (Wanduhr, ms) */
  untilWall: number
}

/** Was sich ändern darf, ohne das Signal neu aufzubauen */
function sameVoice(a: PatternToneSettings, b: PatternToneSettings): boolean {
  return (
    a.signal === b.signal &&
    a.channels === b.channels &&
    a.sweepSeconds === b.sweepSeconds &&
    a.bpm === b.bpm &&
    a.beatsPerBar === b.beatsPerBar &&
    a.accent === b.accent &&
    a.syncOffsetMs === b.syncOffsetMs
  )
}

export class ToneEngine {
  private ctx: SinkContext | null = null
  private master: GainNode | null = null
  private voice: Voice | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private settings: PatternToneSettings | null = null
  private noise = new Map<string, AudioBuffer>()
  private pulse: AudioBuffer | null = null

  constructor(
    /** Ausgabegerät nicht verfügbar o. Ä. – die Wiedergabe läuft weiter */
    private readonly onWarning: (message: string) => void = () => {}
  ) {}

  get running(): boolean {
    return this.ctx != null
  }

  async start(settings: PatternToneSettings): Promise<void> {
    if (this.ctx) return this.update(settings)
    const ctx = new AudioContext({ latencyHint: 'interactive' }) as SinkContext
    this.ctx = ctx
    this.settings = settings
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.master = master
    await this.applyDevice(ctx, settings.deviceId)
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    // inzwischen gestoppt (Doppelklick)? Dann nichts mehr aufbauen
    if (this.ctx !== ctx) return
    // während des Wartens geändert (update() merkt sich nur den Stand): mit dem neuesten bauen
    const latest = this.settings ?? settings
    if (latest.deviceId !== settings.deviceId) void this.applyDevice(ctx, latest.deviceId)
    const now = ctx.currentTime
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(dbToGain(latest.levelDb), now + FADE_IN)
    this.voice = this.buildVoice(ctx, master, latest, 0.02)
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  update(next: PatternToneSettings): void {
    const ctx = this.ctx
    const prev = this.settings
    this.settings = next
    // Start läuft noch (wartet auf Gerät/Freigabe): start() baut danach mit diesem Stand. Eine
    // Stimme hier gäbe zwei, die gleichzeitig spielen – doppelter Pegel, Pausen zugedeckt.
    if (!ctx || !this.master || !prev || !this.voice) return
    const now = ctx.currentTime
    if (next.deviceId !== prev.deviceId) void this.applyDevice(ctx, next.deviceId)
    if (next.levelDb !== prev.levelDb) {
      // halten statt verwerfen: mitten im Einblenden spränge der Pegel sonst auf den alten Wert
      this.master.gain.cancelAndHoldAtTime(now)
      this.master.gain.setTargetAtTime(dbToGain(next.levelDb), now, 0.03)
    }
    const v = this.voice
    if (v && sameVoice(v.settings, next)) {
      if (v.osc && next.signal === 'sine' && next.frequency !== v.settings.frequency) {
        v.osc.frequency.setTargetAtTime(next.frequency, now, 0.02)
      }
      v.settings = next
      return
    }
    // anderes Signal: altes aus-, neues einblenden (kein Knacken, kein Pegelsprung)
    if (v) this.retire(v, now)
    this.voice = this.buildVoice(ctx, this.master, next, CROSSFADE)
    this.tick()
  }

  stop(): void {
    const ctx = this.ctx
    if (!ctx) return
    this.ctx = null
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const now = ctx.currentTime
    const g = this.master?.gain
    if (g) {
      g.cancelAndHoldAtTime(now)
      g.linearRampToValueAtTime(0, now + FADE_OUT)
    }
    this.voice = null
    this.master = null
    setTimeout(() => void ctx.close().catch(() => {}), FADE_OUT * 1000 + 80)
  }

  private async applyDevice(ctx: SinkContext, deviceId: string): Promise<void> {
    if (typeof ctx.setSinkId !== 'function') return
    try {
      await ctx.setSinkId(deviceId)
    } catch (e) {
      this.onWarning(
        `Ausgabegerät nicht verfügbar – der Testton läuft auf dem Standardgerät (${
          e instanceof Error ? e.message : String(e)
        })`
      )
      await ctx.setSinkId('').catch(() => {})
    }
  }

  private buildVoice(
    ctx: AudioContext,
    master: GainNode,
    s: PatternToneSettings,
    fade: number
  ): Voice {
    const now = ctx.currentTime
    const bus = ctx.createGain()
    const left = ctx.createGain()
    const right = ctx.createGain()
    const merger = ctx.createChannelMerger(2)
    const out = ctx.createGain()
    bus.connect(left).connect(merger, 0, 0)
    bus.connect(right).connect(merger, 0, 1)
    merger.connect(out).connect(master)
    out.gain.setValueAtTime(0, now)
    out.gain.linearRampToValueAtTime(1, now + fade)
    const both = s.signal === 'ident' || s.channels === 'both'
    left.gain.value = both || s.channels === 'left' || s.channels === 'alternate' ? 1 : 0
    right.gain.value = both || s.channels === 'right' ? 1 : 0

    const v: Voice = {
      settings: s,
      bus,
      left,
      right,
      out,
      sources: new Set(),
      t0: now + 0.01,
      until: 0,
      untilWall: Date.now()
    }
    const keep = (src: AudioScheduledSourceNode): void => {
      v.sources.add(src)
      src.start(v.t0)
    }
    if (s.signal === 'sine' || s.signal === 'ident') {
      const osc = ctx.createOscillator()
      osc.frequency.value = s.signal === 'ident' ? 1000 : s.frequency
      osc.connect(bus)
      v.osc = osc
      keep(osc)
    } else if (s.signal === 'sweep') {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      g.gain.value = 0
      osc.frequency.value = SWEEP_FROM
      osc.connect(g).connect(bus)
      v.osc = osc
      v.sweepGain = g
      keep(osc)
    } else if (s.signal === 'pink' || s.signal === 'white') {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer(ctx, s.signal)
      src.loop = true
      src.connect(bus)
      keep(src)
    }
    return v
  }

  /** Rauschen: 10 s je Art, einmal je Abtastrate erzeugt */
  private noiseBuffer(ctx: AudioContext, kind: 'pink' | 'white'): AudioBuffer {
    const key = `${kind}@${ctx.sampleRate}`
    let buf = this.noise.get(key)
    if (!buf) {
      const data = noiseSamples(kind, ctx.sampleRate * 10)
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate)
      buf.copyToChannel(data, 0)
      this.noise.set(key, buf)
    }
    return buf
  }

  private pulseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.pulse || this.pulse.sampleRate !== ctx.sampleRate) {
      const data = polarityPulse(ctx.sampleRate)
      this.pulse = ctx.createBuffer(1, data.length, ctx.sampleRate)
      this.pulse.copyToChannel(data, 0)
    }
    return this.pulse
  }

  /** Altes Signal ausblenden und danach abbauen */
  private retire(v: Voice, now: number): void {
    v.out.gain.cancelAndHoldAtTime(now)
    v.out.gain.linearRampToValueAtTime(0, now + CROSSFADE)
    for (const src of v.sources) {
      try {
        src.stop(now + CROSSFADE + 0.01)
      } catch {
        // noch nicht gestartet oder schon beendet
      }
    }
    setTimeout(() => v.out.disconnect(), (CROSSFADE + 0.1) * 1000)
  }

  /** Vorausplanen: alles, was bis LOOKAHEAD nach jetzt fällig wird */
  private tick(): void {
    const ctx = this.ctx
    const v = this.voice
    if (!ctx || !v) return
    const s = v.settings
    if (s.signal === 'avsync') {
      const toWall = Date.now() + LOOKAHEAD * 1000
      for (const w of syncBeeps(v.untilWall, toWall, s.syncOffsetMs)) {
        const at = this.wallToContext(ctx, w)
        if (at > ctx.currentTime + 0.002) this.beep(ctx, v, at, 1000, SYNC_FLASH_MS / 1000, 1)
      }
      v.untilWall = toWall
    }
    const from = v.until
    const to = ctx.currentTime - v.t0 + LOOKAHEAD
    if (to <= from) return
    v.until = to

    if (s.signal !== 'ident' && s.channels === 'alternate') {
      for (const t of ticks(1, from, to)) {
        const side = alternateSide(t)
        v.left.gain.setTargetAtTime(side === 'left' ? 1 : 0, v.t0 + t, SWITCH)
        v.right.gain.setTargetAtTime(side === 'right' ? 1 : 0, v.t0 + t, SWITCH)
      }
    }
    switch (s.signal) {
      case 'ident':
        for (const gap of identGaps(from, to)) {
          const g = gap.channel === 'left' ? v.left : v.right
          g.gain.setTargetAtTime(0, v.t0 + gap.start, SWITCH)
          g.gain.setTargetAtTime(1, v.t0 + gap.end, SWITCH)
        }
        break
      case 'sweep':
        for (const start of sweepStarts(s.sweepSeconds, from, to)) {
          const at = v.t0 + start
          v.osc?.frequency.setValueAtTime(SWEEP_FROM, at)
          v.osc?.frequency.exponentialRampToValueAtTime(SWEEP_TO, at + s.sweepSeconds)
          v.sweepGain?.gain.setTargetAtTime(1, at, 0.003)
          v.sweepGain?.gain.setTargetAtTime(0, at + s.sweepSeconds - 0.015, 0.003)
        }
        break
      case 'metronome':
        for (const b of metronomeBeats(s.bpm, s.beatsPerBar, from, to)) {
          const one = s.accent && b.beat === 0 && s.beatsPerBar > 1
          this.beep(ctx, v, v.t0 + b.at, one ? 1600 : 1000, 0.03, one ? 1 : 0.6, true)
        }
        break
      case 'polarity':
        for (const t of ticks(POLARITY_PERIOD, from, to)) {
          const src = ctx.createBufferSource()
          src.buffer = this.pulseBuffer(ctx)
          src.connect(v.bus)
          this.oneShot(v, src, v.t0 + t)
        }
        break
    }
  }

  /** Kurzer Ton: Sinus mit 1 ms Anstieg; `decay` = abklingend (Metronom) statt gehalten */
  private beep(
    ctx: AudioContext,
    v: Voice,
    at: number,
    freq: number,
    length: number,
    peak: number,
    decay = false
  ): void {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(peak, at + 0.001)
    if (decay) g.gain.exponentialRampToValueAtTime(0.001, at + length)
    else g.gain.setValueAtTime(peak, at + length - 0.001)
    g.gain.linearRampToValueAtTime(0, at + length)
    osc.connect(g).connect(v.bus)
    this.oneShot(v, osc, at, at + length + 0.005)
  }

  private oneShot(v: Voice, src: AudioScheduledSourceNode, at: number, stopAt?: number): void {
    v.sources.add(src)
    src.onended = () => v.sources.delete(src)
    src.start(at)
    if (stopAt !== undefined) src.stop(stopAt)
  }

  /** Kontextzeit, zu der ein Ton eingeplant werden muss, um zur Wanduhrzeit `wallMs` zu klingen */
  private wallToContext(ctx: AudioContext, wallMs: number): number {
    const wallNow = Date.now()
    const ts = ctx.getOutputTimestamp?.()
    if (ts?.contextTime && ts.performanceTime) {
      // Wanduhr zum Zeitpunkt, an dem ts.contextTime aus dem Gerät kam
      const wallAtTs = wallNow - (performance.now() - ts.performanceTime)
      return ts.contextTime + (wallMs - wallAtTs) / 1000
    }
    // Rückfall: Ausgabelatenz grob abziehen
    const latency =
      (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? ctx.baseLatency
    return ctx.currentTime + (wallMs - wallNow) / 1000 - (latency || 0)
  }
}
