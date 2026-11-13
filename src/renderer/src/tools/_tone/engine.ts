// Testton-Engine (WebAudio) – ein Kern für den Testbildgenerator und den Testtongenerator, in der
// App wie in der Handy-PWA. Ein Monosignal wird auf zwei Kanäle verteilt (beide, links, rechts,
// abwechselnd, gegenphasig, Kanal-Kennung); am Ende der Kette sitzen Pegel und sanftes Ein- und
// Ausblenden. Ereignisse (Metronom-Klicks, Pulse, Sweeps, Kennungs-Pausen, AV-Sync-Piepe) plant
// ein Takt alle 100 ms bis 0,4 s voraus – so liegen sie sample-genau, auch wenn das Fenster hakt.
// Was beim Planen schon vorbei ist, entfällt: Nach einem Hänger der Seite starteten verpasste
// Pulse sonst alle zugleich (gemessen: doppelte Spitze nach 1,6 s, am Pegel-Deckel vorbei).
//
// Am Handy: Ein Ton startet nur aus einer Bedienung heraus – start() weckt den Kontext deshalb
// vor dem ersten await. Das iPhone schweigt mit Web Audio beim Stummschalter, außer die Seite
// meldet Wiedergabe (navigator.audioSession, ab iOS 17). Wechselt man die App oder sperrt den
// Bildschirm, hält iOS den Kontext an – das meldet onEnded, statt still „läuft“ zu zeigen.
//
// AV-Sync: Das Testbild blitzt zu jeder vollen Sekunde der Wanduhr (Date.now(), dieselbe Uhr in
// Vorschau und Ausgabefenster). Der Piep wird über getOutputTimestamp() so gelegt, dass er zu
// genau dieser Wanduhrzeit aus dem Ausgabegerät kommt – die Ausgabelatenz des Rechners ist damit
// schon herausgerechnet, nicht aber die des Bildwegs (dafür der Versatz zum Eichen).

import type { PatternToneSettings } from '@shared/testton'
import {
  POLARITY_PERIOD,
  SWEEP_FROM,
  SWEEP_TO,
  SYNC_FLASH_MS,
  alternateSide,
  dbToGain,
  identGaps,
  isImpulse,
  noiseSamples,
  planMetronome,
  polarityPulse,
  retimeMetronome,
  startMetronome,
  sweepStarts,
  syncBeeps,
  ticks,
  type MetroState
} from './plan'

const LOOKAHEAD = 0.4
const TICK_MS = 100
/** Einblenden beim Start (Schutz) – für Dauersignale */
const FADE_IN = 0.5
/** Klicks und Pulse (isImpulse) beginnen gleich: Eingeblendet ginge der erste Schlag unter */
const FADE_IN_IMPULSE = 0.02
/** Einblenden einer Stimme beim Start und Überblenden beim Wechsel des Signals */
const VOICE_FADE_IN = 0.02
const CROSSFADE = 0.05
const FADE_OUT = 0.05
/** Zeitkonstante für Kanal-Umschaltungen: knackfrei, aber hörbar sofort */
const SWITCH = 0.002
/** So spät darf ein Ereignis noch starten (s); was älter ist, entfällt */
const LATE = 0.005
/** Schläge, die sich eine Stimme für die Anzeige merkt */
const KEEP_BEATS = 8
/** So lange wartet start() höchstens darauf, dass der Browser den Ton freigibt (ms) */
const UNLOCK_WAIT_MS = 1500

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> }
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } }

/** Warum hier kein Ton geht – null = er geht */
export function toneUnsupportedReason(): string | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
    return 'Dieser Browser kann keinen Ton erzeugen.'
  }
  return null
}

/** Kann der Browser das Ausgabegerät wählen? (Chromium: ja; Safari, Firefox, Handys: nein) */
export function canChooseOutputDevice(): boolean {
  return (
    typeof AudioContext !== 'undefined' &&
    typeof (AudioContext.prototype as SinkContext).setSinkId === 'function'
  )
}

/** Ein eingeplanter Metronom-Schlag, wie ihn die Anzeige braucht */
export interface SoundingBeat {
  /** Kontextzeit des Schlags (s) */
  at: number
  /** Schlag im Takt (0 = die Eins) */
  inBar: number
  beatsPerBar: number
}

export interface ToneEngineEvents {
  /** Ausgabegerät nicht verfügbar o. Ä. – die Wiedergabe läuft weiter */
  onWarning?: (message: string) => void
  /** Der Ton endete von außen (Handy: App gewechselt, gesperrt, Anruf; Gerät weg) */
  onEnded?: (message: string) => void
}

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
  /** Metronom: nächster Schlag und Takt (s ab t0) */
  metro: MetroState
  /** zuletzt eingeplante Schläge (Kontextzeit), für die Anzeige */
  beats: SoundingBeat[]
}

/** Was sich ändern darf, ohne das Signal neu aufzubauen – beim Metronom auch Tempo und Takt */
function sameVoice(a: PatternToneSettings, b: PatternToneSettings): boolean {
  return (
    a.signal === b.signal &&
    a.channels === b.channels &&
    a.sweepSeconds === b.sweepSeconds &&
    a.syncOffsetMs === b.syncOffsetMs
  )
}

/** So viel später, als der Kontext zählt, kommt der Ton aus dem Gerät (s) */
function outputLatency(ctx: AudioContext): number {
  return (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0
}

/** Den Wert ab `t` festhalten und alles Geplante danach verwerfen (Firefox: ohne cancelAndHold) */
function holdAt(param: AudioParam, t: number): void {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(t)
    return
  }
  const value = param.value
  param.cancelScheduledValues(t)
  param.setValueAtTime(value, t)
}

// iPhone: Ohne Wiedergabe-Sitzung schweigt Web Audio beim Stummschalter. Zurück auf „auto“ erst,
// wenn kein Ton dieser Seite mehr läuft (sonst nähme ein Stopp dem gleich folgenden Start den Ton)
// – und überhaupt zurück, weil der RTA mit „playback“ kein Mikrofon bekäme.
let sessions = 0

function setAudioSession(type: 'playback' | 'auto'): void {
  try {
    const session = (navigator as AudioSessionNavigator).audioSession
    if (session && session.type !== type) session.type = type
  } catch {
    // Browser ohne diese Schnittstelle: nichts zu tun
  }
}

function holdAudioSession(): void {
  sessions++
  setAudioSession('playback')
}

function releaseAudioSession(): void {
  sessions = Math.max(0, sessions - 1)
  if (sessions === 0) setAudioSession('auto')
}

/** Ältere iPhones geben den Ton erst frei, wenn in der Bedienung selbst etwas spielt */
function unlock(ctx: AudioContext): void {
  try {
    const src = ctx.createBufferSource()
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    // ohne geht es auch
  }
}

/** Auf einen laufenden Kontext warten, höchstens `ms` lang */
function untilRunning(ctx: AudioContext, ms: number): Promise<boolean> {
  if (ctx.state === 'running') return Promise.resolve(true)
  return new Promise((resolve) => {
    const check = (): void => {
      if (ctx.state === 'running') done()
    }
    const done = (): void => {
      clearTimeout(timer)
      ctx.removeEventListener('statechange', check)
      resolve(ctx.state === 'running')
    }
    const timer = setTimeout(done, ms)
    ctx.addEventListener('statechange', check)
  })
}

export class ToneEngine {
  private ctx: SinkContext | null = null
  private master: GainNode | null = null
  private voice: Voice | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private settings: PatternToneSettings | null = null
  private noise = new Map<string, AudioBuffer>()
  private pulse: AudioBuffer | null = null
  /** Lief der Kontext schon? Erst danach heißt „angehalten“: von außen beendet. */
  private wasRunning = false
  /** laufende Gerätewechsel – solange zählt ein kurzer Halt nicht als Abbruch */
  private switching = 0

  constructor(private readonly events: ToneEngineEvents = {}) {}

  get running(): boolean {
    return this.ctx != null
  }

  async start(settings: PatternToneSettings): Promise<void> {
    if (this.ctx) return this.update(settings)
    // vor dem Kontext: iOS legt beim Anlegen fest, ob der Stummschalter gilt
    holdAudioSession()
    let ctx: SinkContext
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' }) as SinkContext
    } catch (e) {
      releaseAudioSession()
      throw e
    }
    this.ctx = ctx
    this.settings = settings
    this.wasRunning = false
    // Am Handy gibt der Browser den Ton nur in der Bedienung selbst frei: resume() und der stille
    // Puffer deshalb sofort, vor dem ersten await (danach gälte der Tipp nicht mehr)
    const resumed = ctx.resume().catch(() => {})
    unlock(ctx)
    ctx.addEventListener('statechange', () => this.stateChanged(ctx))
    // Chromium meldet so ein Ausgabegerät, das ausfällt
    ctx.addEventListener('error', () => this.ended(ctx))
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.master = master
    await this.applyDevice(ctx, settings.deviceId)
    await resumed
    // inzwischen gestoppt (Doppelklick)? Dann nichts mehr aufbauen
    if (this.ctx !== ctx) return
    if (!(await untilRunning(ctx, UNLOCK_WAIT_MS))) {
      if (this.ctx === ctx) this.stop()
      throw new Error(
        'Der Ton startet nicht – kein Ausgabegerät, oder der Browser gibt ihn nicht frei. Noch einmal starten.'
      )
    }
    if (this.ctx !== ctx) return
    this.wasRunning = true
    // während des Wartens geändert (update() merkt sich nur den Stand): mit dem neuesten bauen
    const latest = this.settings ?? settings
    if (latest.deviceId !== settings.deviceId) void this.applyDevice(ctx, latest.deviceId)
    const now = ctx.currentTime
    master.gain.setValueAtTime(0, now)
    master.gain.linearRampToValueAtTime(
      dbToGain(latest.levelDb),
      now + (isImpulse(latest.signal) ? FADE_IN_IMPULSE : FADE_IN)
    )
    this.voice = this.buildVoice(ctx, master, latest, VOICE_FADE_IN)
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
      holdAt(this.master.gain, now)
      this.master.gain.setTargetAtTime(dbToGain(next.levelDb), now, 0.03)
    }
    const v = this.voice
    if (sameVoice(v.settings, next)) {
      if (v.osc && next.signal === 'sine' && next.frequency !== v.settings.frequency) {
        v.osc.frequency.setTargetAtTime(next.frequency, now, 0.02)
      }
      const retime = next.signal === 'metronome' && next.bpm !== v.settings.bpm
      if (retime) v.metro = retimeMetronome(v.metro, next.bpm, now - v.t0)
      v.settings = next
      // gleich einplanen: Ein Schlag „sofort“ wäre beim nächsten Takt schon verpasst
      if (retime) this.tick()
      return
    }
    // anderes Signal: altes aus-, neues einblenden (kein Knacken, kein Pegelsprung)
    this.retire(v, now)
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
      holdAt(g, now)
      g.linearRampToValueAtTime(0, now + FADE_OUT)
    }
    this.voice = null
    this.master = null
    setTimeout(
      () => {
        void ctx.close().catch(() => {})
        releaseAudioSession()
      },
      FADE_OUT * 1000 + 80
    )
  }

  /** Der Schlag, der gerade aus dem Gerät kommt – null ohne Metronom und vor dem ersten */
  currentBeat(): SoundingBeat | null {
    const ctx = this.ctx
    const v = this.voice
    if (!ctx || !v || v.settings.signal !== 'metronome') return null
    const heard = ctx.currentTime - outputLatency(ctx)
    let hit: SoundingBeat | null = null
    for (const b of v.beats) if (b.at <= heard) hit = b
    return hit
  }

  /** Hält der Browser den laufenden Ton an (Handy: App gewechselt, gesperrt, Anruf), ist er aus */
  private stateChanged(ctx: AudioContext): void {
    if (this.ctx !== ctx || !this.wasRunning || this.switching > 0) return
    if (ctx.state !== 'running') this.ended(ctx)
  }

  private ended(ctx: AudioContext): void {
    if (this.ctx !== ctx) return
    this.stop()
    this.events.onEnded?.(
      'Der Ton wurde unterbrochen – App gewechselt, Bildschirm gesperrt, Anruf oder Ausgabegerät weg. Zum Weiterspielen neu starten.'
    )
  }

  private async applyDevice(ctx: SinkContext, deviceId: string): Promise<void> {
    if (typeof ctx.setSinkId !== 'function') return
    this.switching++
    try {
      await ctx.setSinkId(deviceId)
    } catch (e) {
      if (this.ctx !== ctx) return
      this.events.onWarning?.(
        `Ausgabegerät nicht verfügbar – der Testton läuft auf dem Standardgerät (${
          e instanceof Error ? e.message : String(e)
        })`
      )
      await ctx.setSinkId('').catch(() => {})
    } finally {
      this.switching--
      // während des Wechsels angehalten und nicht wieder angelaufen? Dann jetzt melden
      if (this.switching === 0) this.stateChanged(ctx)
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
    const ident = s.signal === 'ident'
    const antiphase = !ident && s.channels === 'antiphase'
    const both = ident || antiphase || s.channels === 'both'
    left.gain.value = both || s.channels === 'left' || s.channels === 'alternate' ? 1 : 0
    // gegenphasig: rechts mit gedrehter Polarität
    right.gain.value = antiphase ? -1 : both || s.channels === 'right' ? 1 : 0

    const t0 = now + 0.01
    const v: Voice = {
      settings: s,
      bus,
      left,
      right,
      out,
      sources: new Set(),
      t0,
      until: 0,
      untilWall: Date.now(),
      // erster Schlag, wenn die Stimme eingeblendet ist – sonst klänge er gedämpft
      metro: startMetronome(Math.max(0, now + fade - t0)),
      beats: []
    }
    const keep = (src: AudioScheduledSourceNode): void => {
      v.sources.add(src)
      src.start(v.t0)
    }
    if (s.signal === 'sine' || ident) {
      const osc = ctx.createOscillator()
      osc.frequency.value = ident ? 1000 : s.frequency
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
    holdAt(v.out.gain, now)
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
    const now = ctx.currentTime
    const to = now - v.t0 + LOOKAHEAD
    // was davor liegt, ist verpasst (Seite hing) und entfällt
    const past = now - v.t0 - LATE
    if (s.signal === 'avsync') {
      const toWall = Date.now() + LOOKAHEAD * 1000
      for (const w of syncBeeps(v.untilWall, toWall, s.syncOffsetMs)) {
        const at = this.wallToContext(ctx, w)
        if (at > now + 0.002) this.beep(ctx, v, at, 1000, SYNC_FLASH_MS / 1000, 1)
      }
      v.untilWall = toWall
    }
    // Das Metronom plant von seinem nächsten Schlag aus, nicht vom bisherigen Horizont
    if (s.signal === 'metronome') this.planBeats(ctx, v, past, to)
    const from = v.until
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
      case 'polarity':
        for (const t of ticks(POLARITY_PERIOD, from, to)) {
          // verpasst: nicht nachholen – zugleich gestartet addierten sich die Pulse
          if (t < past) continue
          const src = ctx.createBufferSource()
          src.buffer = this.pulseBuffer(ctx)
          src.connect(v.bus)
          this.oneShot(v, src, v.t0 + t)
        }
        break
    }
  }

  /** Metronom: Schläge bis zum Horizont einplanen und für die Anzeige merken */
  private planBeats(ctx: AudioContext, v: Voice, past: number, to: number): void {
    const s = v.settings
    const { beats, state } = planMetronome(v.metro, s.bpm, s.beatsPerBar, past, to)
    v.metro = state
    for (const b of beats) {
      const one = s.accent && b.beat === 0 && s.beatsPerBar > 1
      const at = v.t0 + b.at
      this.beep(ctx, v, at, one ? 1600 : 1000, 0.03, one ? 1 : 0.6, true)
      v.beats.push({ at, inBar: b.beat, beatsPerBar: s.beatsPerBar })
    }
    if (v.beats.length > KEEP_BEATS) v.beats.splice(0, v.beats.length - KEEP_BEATS)
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
    if (at < ctx.currentTime - LATE) return
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
    return ctx.currentTime + (wallMs - wallNow) / 1000 - outputLatency(ctx)
  }
}
