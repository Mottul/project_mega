// Frequenzbänder des RTA (rein, getestet): Oktav-Bruchteile nach IEC 61260 (Basis 10), die
// Bewertungen A und C nach IEC 61672 und die Abbildung der FFT-Bins auf Bänder.
//
// Gemessen wird mit mehreren FFT-Fenstern zugleich („Multi-Time-Window“): tiefe Bänder aus einem
// langen Fenster (feine Auflösung), hohe aus kurzen (schnelle Antwort). Grundraster sind
// 1/24-Oktaven von 20 Hz bis 20 kHz; Terzen, Sechstel- und Zwölftel-Oktaven entstehen als Summe
// ihrer 1/24-Teile (die Grenzen liegen nach IEC 61260 genau aufeinander). Referenzkurven speichern
// dieses Grundraster und lassen sich so in jeder Auflösung zeigen.

/** Oktavverhältnis nach IEC 61260 (Basis 10) */
export const G = Math.pow(10, 3 / 10)
/** Feinstes Raster: 1/24-Oktave */
export const SUB = 24
/** Anzeige-Auflösungen: 1/1, 1/3, 1/6 und 1/12 Oktave */
export type Resolution = 1 | 3 | 6 | 12
export const RESOLUTIONS: Resolution[] = [1, 3, 6, 12]

/** FFT-Größen der Analysatoren, lang nach kurz (Web Audio: höchstens 32768) */
export const FFT_SIZES = [32768, 16384, 8192, 4096, 2048] as const
/** Ein Band nutzt das kürzeste Fenster, das ihm mindestens so viele Bins gibt */
const MIN_BINS = 3

/**
 * Mittelwert von w² des Blackman-Fensters der Web-Audio-Analysatoren (a = 0,16): Leistung im
 * Spektrum mal 2/m2 = Effektivwert² des Signals (Parseval, positive Frequenzen).
 */
export const BLACKMAN_M2 = 0.42 * 0.42 + (0.5 * 0.5) / 2 + (0.08 * 0.08) / 2

/** 1/24-Oktaven, deren Grenzen die Terzen 20 Hz … 20 kHz lückenlos überdecken */
export interface SubBand {
  /** Mittenfrequenz */
  fc: number
  lo: number
  hi: number
}

/** Index x so, dass 1/24-Band x die Grenzen G^(x/24) … G^((x+1)/24) · 1 kHz hat */
function subBand(x: number): SubBand {
  return {
    fc: 1000 * Math.pow(G, (2 * x + 1) / (2 * SUB)),
    lo: 1000 * Math.pow(G, x / SUB),
    hi: 1000 * Math.pow(G, (x + 1) / SUB)
  }
}

/** Terz −17 (20 Hz) bis +13 (20 kHz): untere/obere Grenze in 1/24-Schritten */
const FIRST_SUB = -17 * 8 - 4
const LAST_SUB = 13 * 8 + 3
export const SUB_BANDS: SubBand[] = Array.from({ length: LAST_SUB - FIRST_SUB + 1 }, (_, i) =>
  subBand(FIRST_SUB + i)
)

/** Normierte Bezeichnungen der Terzen und Oktaven (IEC 61260, Anhang) */
const NOMINAL = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
]

/** Frequenz kurz: 31,5 · 125 · 1k · 12,5k */
export function freqLabel(f: number): string {
  const n = NOMINAL.find((x) => Math.abs(x - f) / x < 0.03)
  const v =
    n ?? (f >= 1000 ? Math.round(f / 10) * 10 : f >= 100 ? Math.round(f) : Math.round(f * 10) / 10)
  if (v >= 1000) return `${String(Number((v / 1000).toFixed(2))).replace('.', ',')}k`
  return String(v).replace('.', ',')
}

/** Frequenz mit Einheit für Ablesungen: 63 Hz · 1.003 Hz · 12,5 kHz */
export function freqText(f: number): string {
  if (f >= 10000) return `${(f / 1000).toFixed(1).replace('.', ',')} kHz`
  return `${Math.round(f).toLocaleString('de-DE')} Hz`
}

/** Ein Anzeige-Band: Mittenfrequenz, Bezeichnung und die 1/24-Teile, aus denen es besteht */
export interface Band {
  fc: number
  lo: number
  hi: number
  label: string
  /** Indizes in SUB_BANDS */
  first: number
  count: number
}

/**
 * Bänder einer Auflösung (1/b Oktave) über 20 Hz … 20 kHz. Jedes besteht aus 24/b
 * aufeinanderfolgenden 1/24-Bändern; die Oktaven beginnen bei der 31,5-Hz-Oktave.
 */
export function bandsFor(b: Resolution): Band[] {
  const per = SUB / b
  // Oktaven: Mitte bei G^x, Grenzen G^(x ± 1/2). Die 31,5-Hz-Oktave umfasst die Terzen 25, 31,5
  // und 40 Hz, beginnt also hinter der 20-Hz-Terz (8 Teile); die 16-kHz-Oktave endet mit der
  // 20-kHz-Terz. Feinere Auflösungen beginnen mit der ersten Terz.
  const start = b === 1 ? 8 : 0
  const out: Band[] = []
  for (let first = start; first + per <= SUB_BANDS.length; first += per) {
    const lo = SUB_BANDS[first].lo
    const hi = SUB_BANDS[first + per - 1].hi
    const fc = Math.sqrt(lo * hi)
    out.push({ fc, lo, hi, label: freqLabel(fc), first, count: per })
  }
  return out
}

/* ------------------------------ Bewertung ------------------------------- */

export type Weighting = 'Z' | 'A' | 'C'

/** Bewertung in dB (IEC 61672-1, analytische Form; A und C bei 1 kHz = 0 dB) */
export function weightingDb(w: Weighting, f: number): number {
  if (w === 'Z' || f <= 0) return 0
  const f2 = f * f
  const c1 = 20.6 * 20.6
  const c4 = 12194 * 12194
  if (w === 'A') {
    const ra =
      (c4 * f2 * f2) /
      ((f2 + c1) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + c4))
    return 20 * Math.log10(ra) + 2.0
  }
  const rc = (c4 * f2) / ((f2 + c1) * (f2 + c4))
  return 20 * Math.log10(rc) + 0.06
}

/** Leistungsfaktor der Bewertung je 1/24-Band (an dessen Mitte) */
export function weightingGains(w: Weighting): Float64Array {
  return Float64Array.from(SUB_BANDS, (s) => Math.pow(10, weightingDb(w, s.fc) / 10))
}

/* ------------------------- FFT-Bins -> 1/24-Bänder ------------------------ */

/** Anteil der Bins eines Analysators an einem 1/24-Band */
export interface SubBandMap {
  /** welcher Analysator (Index in FFT_SIZES) */
  analyser: number
  bins: number[]
  weights: number[]
}

/**
 * Welcher Analysator welches 1/24-Band mit welchen Bins speist. Bin k liegt bei k·fs/N und deckt
 * ±½ Bin ab; am Bandrand zählt er anteilig. Gewählt wird das kürzeste Fenster mit mindestens
 * MIN_BINS Bins im Band (ganz unten bleibt nur das längste).
 */
export function mapSubBands(
  sampleRate: number,
  sizes: readonly number[] = FFT_SIZES
): SubBandMap[] {
  return SUB_BANDS.map((s) => {
    let a = 0
    for (let i = sizes.length - 1; i >= 0; i--) {
      const df = sampleRate / sizes[i]
      if ((s.hi - s.lo) / df >= MIN_BINS) {
        a = i
        break
      }
    }
    const n = sizes[a]
    const df = sampleRate / n
    const nyq = n / 2 - 1
    const bins: number[] = []
    const weights: number[] = []
    const k0 = Math.max(1, Math.floor(s.lo / df - 0.5))
    const k1 = Math.min(nyq, Math.ceil(s.hi / df + 0.5))
    for (let k = k0; k <= k1; k++) {
      const overlap = Math.min(s.hi, (k + 0.5) * df) - Math.max(s.lo, (k - 0.5) * df)
      if (overlap > 0) {
        bins.push(k)
        weights.push(overlap / df)
      }
    }
    return { analyser: a, bins, weights }
  })
}

/**
 * Effektivwert² je 1/24-Band (Vollaussteuerungs-Sinus = 0,5) aus den dB-Spektren der Analysatoren
 * (Web Audio `getFloatFrequencyData`: 20·log10 |X[k]|, X mit 1/N normiert, Blackman-Fenster).
 * `gains` = Korrektur des Messmikrofons je Bin und Analysator (Leistungsfaktor), optional.
 */
export function subBandPowers(
  spectraDb: readonly Float32Array[],
  map: readonly SubBandMap[],
  gains?: readonly (Float32Array | null)[],
  out: Float64Array = new Float64Array(map.length)
): Float64Array {
  const scale = 2 / BLACKMAN_M2
  for (let j = 0; j < map.length; j++) {
    const m = map[j]
    const db = spectraDb[m.analyser]
    const g = gains?.[m.analyser]
    let p = 0
    for (let i = 0; i < m.bins.length; i++) {
      const k = m.bins[i]
      const v = db[k]
      if (!(v > -400)) continue // -Infinity (Stille) und NaN
      p += m.weights[i] * Math.pow(10, v / 10) * (g ? g[k] : 1)
    }
    out[j] = p * scale
  }
  return out
}

/** Summe der 1/24-Leistungen je Anzeige-Band */
export function bandPowers(sub: ArrayLike<number>, bands: readonly Band[]): Float64Array {
  return Float64Array.from(bands, (b) => {
    let p = 0
    for (let i = b.first; i < b.first + b.count; i++) p += sub[i]
    return p
  })
}

/** Effektivwert² -> dBFS (AES17: Vollaussteuerungs-Sinus = 0 dBFS) */
export function msToDb(ms: number): number {
  return ms > 0 ? 10 * Math.log10(2 * ms) : -Infinity
}

export function dbToMs(db: number): number {
  return Math.pow(10, db / 10) / 2
}
