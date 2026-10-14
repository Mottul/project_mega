// Auswertung des RTA je Bild (rein, getestet): aus den unbewerteten 1/24-Band-Leistungen eines
// Augenblicks werden Bewertung (Z/A/C), Mittelung, gehaltene Spitzen, Pegelmesser mit Zeit-
// bewertung F/S, Leq, Lmax und die Abtastspitze. Alles im Leistungsbereich (Effektivwert²);
// dB erst für die Anzeige (msToDb). Der Kalibrier-Offset kommt erst beim Anzeigen dazu.

import {
  bandPowers,
  bandsFor,
  msToDb,
  SUB_BANDS,
  weightingGains,
  type Band,
  type Resolution,
  type Weighting
} from './bands'

export type Averaging = 'off' | 'fast' | 'slow' | 'inf'
export type PeakMode = 'off' | 'hold' | 'fall'
export type MeterSpeed = 'F' | 'S'

/** Zeitkonstanten (IEC 61672: F = 125 ms, S = 1 s) */
export const TAU: Record<MeterSpeed, number> = { F: 0.125, S: 1 }
const AVG_TAU: Record<Exclude<Averaging, 'off' | 'inf'>, number> = { fast: TAU.F, slow: TAU.S }
/** „Fallend“: gehaltene Spitzen sinken um so viele dB je Sekunde */
export const PEAK_FALL_DB_S = 15

export interface ProcessorSettings {
  weighting: Weighting
  averaging: Averaging
  peak: PeakMode
  meter: MeterSpeed
  resolution: Resolution
}

export class RtaProcessor {
  private s: ProcessorSettings
  private gains: Float64Array
  private bands: Band[]
  /** bewertet und gemittelt (Effektivwert² je 1/24-Band) */
  readonly avg = new Float64Array(SUB_BANDS.length)
  /** bewertet, Augenblick (für das Spektrogramm) */
  readonly live = new Float64Array(SUB_BANDS.length)
  /** unbewertet und gemittelt – für Referenzkurven (Bewertung erst beim Zeigen) */
  readonly avgZ = new Float64Array(SUB_BANDS.length)
  private frames = 0
  private holds: Float64Array
  private meterMs = 0
  private meterZMs = 0
  private energy = 0
  private time = 0
  private max = -Infinity
  private samplePeak = 0
  private nowPeak = 0

  constructor(settings: ProcessorSettings) {
    this.s = settings
    this.gains = weightingGains(settings.weighting)
    this.bands = bandsFor(settings.resolution)
    this.holds = new Float64Array(this.bands.length).fill(-Infinity)
  }

  get settings(): ProcessorSettings {
    return this.s
  }

  /** Einstellungen ändern; was danach nicht mehr vergleichbar wäre, beginnt neu */
  configure(next: ProcessorSettings): void {
    const prev = this.s
    this.s = next
    if (next.weighting !== prev.weighting) {
      this.gains = weightingGains(next.weighting)
      this.reset()
    }
    if (next.resolution !== prev.resolution) {
      this.bands = bandsFor(next.resolution)
      this.holds = new Float64Array(this.bands.length).fill(-Infinity)
    }
    if (next.averaging !== prev.averaging) this.frames = 0
    if (next.peak !== prev.peak) this.holds.fill(-Infinity)
  }

  /** Mittelung, Spitzen, Leq, Lmax und Abtastspitze zurücksetzen */
  reset(): void {
    this.frames = 0
    this.holds.fill(-Infinity)
    this.energy = 0
    this.time = 0
    this.max = -Infinity
    this.samplePeak = 0
    this.meterMs = 0
    this.meterZMs = 0
  }

  /**
   * Ein Bild verarbeiten: `subZ` = unbewertete Effektivwerte² je 1/24-Band, `peak` = größter
   * Abtastwert (Betrag) seit dem letzten Bild, `dt` = Sekunden seit dem letzten Bild.
   */
  push(subZ: ArrayLike<number>, peak: number, dt: number): void {
    const { averaging } = this.s
    this.frames++
    const a =
      averaging === 'off'
        ? 1
        : averaging === 'inf'
          ? 1 / this.frames
          : 1 - Math.exp(-dt / AVG_TAU[averaging])
    let totalW = 0
    let totalZ = 0
    for (let i = 0; i < this.avg.length; i++) {
      const z = subZ[i]
      const w = z * this.gains[i]
      this.live[i] = w
      totalW += w
      totalZ += z
      // erstes Bild übernimmt den Wert (sonst stiege die Kurve langsam aus der Stille)
      const k = this.frames === 1 ? 1 : a
      this.avg[i] += k * (w - this.avg[i])
      this.avgZ[i] += k * (z - this.avgZ[i])
    }

    // Pegelmesser: exponentielle Zeitbewertung, Leq als Energiemittel seit dem Zurücksetzen
    const m = 1 - Math.exp(-dt / TAU[this.s.meter])
    this.meterMs += (this.time === 0 ? 1 : m) * (totalW - this.meterMs)
    this.meterZMs += (this.time === 0 ? 1 : m) * (totalZ - this.meterZMs)
    this.energy += totalW * dt
    this.time += dt
    this.max = Math.max(this.max, msToDb(this.meterMs))
    this.nowPeak = peak
    this.samplePeak = Math.max(this.samplePeak, peak)

    if (this.s.peak !== 'off') {
      const levels = this.bandLevels()
      const fall = this.s.peak === 'fall' ? PEAK_FALL_DB_S * dt : 0
      for (let i = 0; i < levels.length; i++) {
        this.holds[i] = Math.max(levels[i], this.holds[i] - fall)
      }
    }
  }

  /** Bänder der gewählten Auflösung */
  get bandLayout(): Band[] {
    return this.bands
  }

  /** gemittelte, bewertete Bandpegel in dBFS */
  bandLevels(): number[] {
    return Array.from(bandPowers(this.avg, this.bands), msToDb)
  }

  /** gehaltene Spitzen je Band (dBFS), leer bei „Aus“ */
  peakHolds(): number[] {
    return this.s.peak === 'off' ? [] : Array.from(this.holds)
  }

  /** gemittelte, bewertete 1/24-Pegel (Kurve, dBFS) */
  curve(): number[] {
    return Array.from(this.avg, msToDb)
  }

  /** Pegelmesser (bewertet, F oder S), dBFS */
  get level(): number {
    return msToDb(this.meterMs)
  }

  /** unbewerteter Pegel (für das Kalibrieren mit einem Kalibrator), dBFS */
  get levelZ(): number {
    return msToDb(this.meterZMs)
  }

  get leq(): number {
    return this.time > 0 ? msToDb(this.energy / this.time) : -Infinity
  }

  get lmax(): number {
    return this.max
  }

  /** größte Abtastspitze seit dem Zurücksetzen (dBFS, unbewertet) */
  get peak(): number {
    return this.samplePeak > 0 ? 20 * Math.log10(this.samplePeak) : -Infinity
  }

  /** Abtastspitze des letzten Bildes (dBFS) */
  get peakNow(): number {
    return this.nowPeak > 0 ? 20 * Math.log10(this.nowPeak) : -Infinity
  }

  /** gemittelte, unbewertete 1/24-Pegel (dBFS) – so werden Referenzen gespeichert */
  curveZ(): number[] {
    return Array.from(this.avgZ, msToDb)
  }
}
