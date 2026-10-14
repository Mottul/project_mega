// Korrekturdatei eines Messmikrofons (rein, getestet): Frequenzgang als Textdatei „Frequenz dB“
// je Zeile – so liefern miniDSP (UMIK-1/-2, Kopfzeile mit „Sens Factor“ und „SERNO“), Dayton
// (iMM-6, UMM-6) und REW sie aus. Die Messung wird um diesen Frequenzgang bereinigt (abgezogen).
// Der Sens Factor wird nur angezeigt: Den Pegel stellt der Kalibrier-Offset ein (Kalibrator oder
// Handeingabe) – die Bedeutung des Werts hängt vom Gerät und seiner Verstärkung ab.

export interface MicCorrection {
  name: string
  serial?: string
  sensDb?: number
  /** aufsteigend nach Frequenz: [Hz, dB] */
  points: [number, number][]
}

const MAX_POINTS = 4000

/** Datei lesen; bei Unbrauchbarem eine deutsche Fehlermeldung */
export function parseCorrection(text: string, name: string): MicCorrection | string {
  const points: [number, number][] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^["*#;]/.test(line)) continue
    const parts = line.split(/[\s,;]+/).map((x) => Number(x))
    if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue
    const [f, db] = parts
    if (f < 1 || f > 100000 || Math.abs(db) > 40) continue
    points.push([f, db])
    if (points.length > MAX_POINTS) return `Zu viele Zeilen (höchstens ${MAX_POINTS}).`
  }
  if (points.length < 2) return 'Keine Messpunkte gefunden (je Zeile „Frequenz dB“ erwartet).'
  points.sort((a, b) => a[0] - b[0])
  const serial = /SERNO:\s*([\w-]+)/i.exec(text)?.[1]
  const sens = /Sens\s*Factor\s*=\s*(-?\d+(?:\.\d+)?)/i.exec(text)?.[1]
  return {
    name,
    ...(serial ? { serial } : {}),
    ...(sens ? { sensDb: Number(sens) } : {}),
    points
  }
}

/** Korrektur (dB) bei f: linear über log f, außerhalb der Datei der Randwert */
export function correctionAt(points: readonly [number, number][], f: number): number {
  if (f <= points[0][0]) return points[0][1]
  const last = points[points.length - 1]
  if (f >= last[0]) return last[1]
  let lo = 0
  let hi = points.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (points[mid][0] <= f) lo = mid
    else hi = mid
  }
  const [f0, d0] = points[lo]
  const [f1, d1] = points[hi]
  const t = Math.log(f / f0) / Math.log(f1 / f0)
  return d0 + t * (d1 - d0)
}

/**
 * Leistungsfaktoren je Bin und Analysator: Die Datei sagt, um wie viel dB das Mikrofon bei f zu
 * laut ist – die Messung wird um genau so viel abgesenkt.
 */
export function correctionGains(
  points: readonly [number, number][],
  sampleRate: number,
  sizes: readonly number[]
): Float32Array[] {
  return sizes.map((n) => {
    const df = sampleRate / n
    return Float32Array.from({ length: n / 2 }, (_, k) =>
      k === 0 ? 1 : Math.pow(10, -correctionAt(points, k * df) / 10)
    )
  })
}
