// Audio-Anbindung des RTA (Browser): Mikrofon ohne Sprachfilter, fünf Analysatoren für die
// Multi-Time-Window-Messung (bands.ts) und die Abtastspitze. Nichts geht an den Ausgang – sonst
// spielte der Rechner das Mikrofon ab (Rückkopplung). Läuft in der App und in der Handy-PWA
// (nur Web-APIs; das Mikrofon gibt es im Browser nur über HTTPS).

import { FFT_SIZES, mapSubBands, subBandPowers, type SubBandMap } from './bands'
import { correctionGains } from './calibration'

export type Channel = 'mix' | 'left' | 'right'

/** Index des Analysators, dessen Spektrum der Feedback-Finder nutzt (16384: 2,9 Hz, 340 ms) */
export const FEEDBACK_ANALYSER = 1

export interface EngineInfo {
  label: string
  sampleRate: number
  channels: number
  /** Filter, die das Gerät trotz Abschalten anlässt (verfälschen die Messung) */
  filters: string[]
}

/** Warum der RTA hier nicht messen kann – null = es geht */
export function unsupportedReason(): string | null {
  if (typeof window === 'undefined') return 'Kein Browser.'
  if (!window.isSecureContext)
    return 'Das Mikrofon gibt der Browser nur über HTTPS frei – diese Seite ist unverschlüsselt.'
  if (!navigator.mediaDevices?.getUserMedia) return 'Dieser Browser bietet kein Mikrofon an.'
  if (typeof AudioContext === 'undefined') return 'Dieser Browser kann kein Audio verarbeiten.'
  return null
}

/** Start wurde von einem Stopp oder neueren Start überholt – kein Fehler für den Bediener */
export function isOvertaken(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** Fehler beim Starten als verständlicher Satz */
export function startErrorText(e: unknown): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Mikrofon-Zugriff verweigert. In den Einstellungen des Browsers bzw. des Systems erlauben und erneut starten.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Kein passendes Mikrofon gefunden – ist das gewählte Gerät angeschlossen?'
    case 'NotReadableError':
      return 'Das Mikrofon ist belegt oder lässt sich nicht öffnen (anderes Programm?).'
    default:
      return `Mikrofon ließ sich nicht starten${e instanceof Error && e.message ? `: ${e.message}` : '.'}`
  }
}

/** Eingänge (Bezeichnungen erst nach der ersten Freigabe) */
export async function listInputs(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'audioinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Eingang ${i + 1}` }))
}

export class RtaEngine {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private analysers: AnalyserNode[] = []
  private spectra: Float32Array<ArrayBuffer>[] = []
  private time = new Float32Array(FFT_SIZES[FFT_SIZES.length - 1])
  private map: SubBandMap[] = []
  private gains: (Float32Array | null)[] = []
  private correction: [number, number][] | null = null
  /**
   * Start und Stopp zählen hoch. Ein Start, der nach einem await nicht mehr der neueste ist (in
   * der Zwischenzeit gestoppt, Werkzeug verlassen oder ein anderes Gerät gewählt), gibt Mikrofon
   * und Kontext sofort wieder frei – sonst bliebe das Mikrofon unbemerkt offen (wie beim
   * NDI-Sender, review-checkliste).
   */
  private gen = 0

  get running(): boolean {
    return this.ctx != null
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000
  }

  async start(deviceId: string | null, channel: Channel): Promise<EngineInfo> {
    this.stop()
    const my = this.gen
    // Sprachfilter aus: Echo-/Rauschunterdrückung und automatischer Pegel verbiegen das
    // Spektrum. voiceIsolation kennen nicht alle Browser (dann ignoriert).
    const audio: MediaTrackConstraints & { voiceIsolation?: boolean } = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      voiceIsolation: false,
      channelCount: { ideal: 2 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    if (my !== this.gen) throw this.overtaken(stream)
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    // iOS: Der Kontext beginnt angehalten, bis eine Bedienung ihn startet (Start-Knopf)
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    if (my !== this.gen) throw this.overtaken(stream, ctx)
    const src = ctx.createMediaStreamSource(stream)
    const track = stream.getAudioTracks()[0]
    const settings = track?.getSettings() ?? {}
    const channels = settings.channelCount ?? 1

    let input: AudioNode = src
    let output = 0
    if (channel !== 'mix' && channels >= 2) {
      const split = ctx.createChannelSplitter(2)
      src.connect(split)
      input = split
      output = channel === 'left' ? 0 : 1
    }
    this.analysers = FFT_SIZES.map((n) => {
      const a = ctx.createAnalyser()
      a.fftSize = n
      a.smoothingTimeConstant = 0
      a.minDecibels = -160
      a.maxDecibels = 0
      input.connect(a, output)
      return a
    })
    this.spectra = FFT_SIZES.map((n) => new Float32Array(n / 2))
    this.ctx = ctx
    this.stream = stream
    this.map = mapSubBands(ctx.sampleRate)
    this.applyCorrection()

    const s = settings as MediaTrackSettings & { voiceIsolation?: boolean }
    const filters = [
      s.echoCancellation && 'Echounterdrückung',
      s.noiseSuppression && 'Rauschunterdrückung',
      s.autoGainControl && 'automatischer Pegel',
      s.voiceIsolation && 'Sprachisolierung'
    ].filter((x): x is string => Boolean(x))
    return { label: track?.label || 'Mikrofon', sampleRate: ctx.sampleRate, channels, filters }
  }

  /** Frequenzgang des Messmikrofons abziehen (null = keiner) */
  setCorrection(points: [number, number][] | null): void {
    this.correction = points
    this.applyCorrection()
  }

  private applyCorrection(): void {
    this.gains = this.correction
      ? correctionGains(this.correction, this.sampleRate, FFT_SIZES)
      : FFT_SIZES.map(() => null)
  }

  /**
   * Augenblick lesen: unbewertete Effektivwerte² je 1/24-Band in `out`, Rückgabe = größter
   * Abtastwert (Betrag) der letzten Samples.
   */
  read(out: Float64Array): number {
    if (!this.ctx) return 0
    for (let i = 0; i < this.analysers.length; i++) {
      this.analysers[i].getFloatFrequencyData(this.spectra[i])
    }
    subBandPowers(this.spectra, this.map, this.gains, out)
    const short = this.analysers[this.analysers.length - 1]
    short.getFloatTimeDomainData(this.time)
    let peak = 0
    for (let i = 0; i < this.time.length; i++) {
      const v = Math.abs(this.time[i])
      if (v > peak) peak = v
    }
    return peak
  }

  /** Feines Spektrum (dB je Bin, mit Korrektur) für den Feedback-Finder; nach read() aufrufen */
  feedbackSpectrum(): { db: Float32Array; df: number } {
    const db = this.spectra[FEEDBACK_ANALYSER]
    const g = this.gains[FEEDBACK_ANALYSER]
    const out = g ? Float32Array.from(db, (v, k) => v + 10 * Math.log10(g[k])) : db
    return { db: out, df: this.sampleRate / FFT_SIZES[FEEDBACK_ANALYSER] }
  }

  /** Überholter Start: alles Geöffnete schließen, AbortError für den Aufrufer */
  private overtaken(stream: MediaStream, ctx?: AudioContext): DOMException {
    stream.getTracks().forEach((t) => t.stop())
    void ctx?.close().catch(() => {})
    return new DOMException('Start überholt', 'AbortError')
  }

  stop(): void {
    this.gen++
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.analysers = []
  }
}
