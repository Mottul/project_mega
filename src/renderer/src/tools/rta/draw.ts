// Zeichnen des RTA auf Canvas: Spektrum (Balken, Kurve, Spitzen, Referenzen, Differenz,
// Feedback-Marken, Fadenkreuz) und Spektrogramm (laufender Wasserfall). Farben nur aus den
// Design-Tokens (CSS-Variablen „H S% L%“) – so folgen Hell/Dunkel und Akzentfarbe.

import { SUB_BANDS, type Band } from './bands'

export const F_MIN = 20
export const F_MAX = 20000

export interface Theme {
  fg: string
  muted: string
  border: string
  card: string
  primary: string
  success: string
  warning: string
  danger: string
}

/** Token-Werte der Seite lesen (bei Design- oder Akzentwechsel neu) */
export function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string): string =>
    css.getPropertyValue(name).trim() || fallback
  return {
    fg: v('--foreground', '0 0% 98%'),
    muted: v('--muted-foreground', '240 5% 65%'),
    border: v('--border', '240 4% 18%'),
    card: v('--card', '240 6% 10%'),
    primary: v('--primary', '46 100% 59%'),
    success: v('--success', '158 64% 52%'),
    warning: v('--warning', '43 96% 56%'),
    danger: v('--danger', '0 91% 71%')
  }
}

export const hsl = (c: string, a = 1): string => `hsl(${c} / ${a})`

/** Farben der Referenzkurven (Index = RtaReference.color) */
export const REF_TOKENS: (keyof Theme)[] = [
  'success',
  'warning',
  'danger',
  'fg',
  'muted',
  'primary'
]

/** Ränder der Zeichenfläche (CSS-Pixel): links Pegelachse, unten Frequenzachse */
export const PAD = { l: 36, r: 8, t: 8, b: 18 }

export function freqToX(f: number, w: number): number {
  const t = Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)
  return PAD.l + t * (w - PAD.l - PAD.r)
}

export function xToFreq(x: number, w: number): number {
  const t = (x - PAD.l) / (w - PAD.l - PAD.r)
  return F_MIN * Math.pow(F_MAX / F_MIN, Math.max(0, Math.min(1, t)))
}

const GRID_F = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const LABEL_F = ['31,5', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

export interface GraphData {
  bands: Band[]
  /** Anzeige-dB je Band (mit Offset) – in der Differenzansicht live minus Referenz */
  levels: number[]
  holds: number[]
  /** 1/24-Kurve (Anzeige-dB) */
  curve: number[] | null
  showBars: boolean
  refs: { color: number; levels: number[] }[]
  diff: boolean
  feedback: { f: number; db: number }[]
  /** oberer Rand und Umfang der Pegelachse (dB) */
  top: number
  range: number
  hoverX: number | null
}

function yOf(db: number, top: number, range: number, h: number): number {
  const t = (top - db) / range
  return PAD.t + Math.max(0, Math.min(1, t)) * (h - PAD.t - PAD.b)
}

/** Spektrum zeichnen (CSS-Pixel; der Kontext ist auf devicePixelRatio skaliert) */
export function drawGraph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  d: GraphData,
  th: Theme
): void {
  ctx.clearRect(0, 0, w, h)
  const bottom = d.top - d.range
  const y = (db: number): number => yOf(db, d.top, d.range, h)
  ctx.font = '10px system-ui, sans-serif'

  // Raster: alle 10 dB (in der Differenzansicht alle 5 dB), Oktaven
  const step = d.range <= 30 ? 5 : 10
  ctx.lineWidth = 1
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let db = Math.ceil(bottom / step) * step; db <= d.top + 1e-9; db += step) {
    const yy = Math.round(y(db)) + 0.5
    ctx.strokeStyle = hsl(th.border, db === 0 && d.diff ? 1 : 0.7)
    ctx.beginPath()
    ctx.moveTo(PAD.l, yy)
    ctx.lineTo(w - PAD.r, yy)
    ctx.stroke()
    ctx.fillStyle = hsl(th.muted)
    ctx.fillText(d.diff && db > 0 ? `+${db}` : String(db), PAD.l - 4, yy)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  GRID_F.forEach((f, i) => {
    const xx = Math.round(freqToX(f, w)) + 0.5
    ctx.strokeStyle = hsl(th.border, 0.45)
    ctx.beginPath()
    ctx.moveTo(xx, PAD.t)
    ctx.lineTo(xx, h - PAD.b)
    ctx.stroke()
    ctx.fillStyle = hsl(th.muted)
    ctx.fillText(LABEL_F[i], xx, h - 5)
  })

  // Balken
  if (d.showBars) {
    const base = d.diff ? y(0) : h - PAD.b
    const grad = ctx.createLinearGradient(0, PAD.t, 0, h - PAD.b)
    grad.addColorStop(0, hsl(th.primary, 0.95))
    grad.addColorStop(1, hsl(th.primary, 0.25))
    d.bands.forEach((b, i) => {
      const v = d.levels[i]
      if (!Number.isFinite(v)) return
      const x0 = freqToX(b.lo, w) + 0.75
      const x1 = freqToX(b.hi, w) - 0.75
      const yy = y(v)
      ctx.fillStyle = d.diff ? hsl(v >= 0 ? th.primary : th.muted, 0.8) : grad
      ctx.fillRect(x0, Math.min(yy, base), Math.max(1, x1 - x0), Math.abs(base - yy))
      const hold = d.holds[i]
      if (hold != null && Number.isFinite(hold) && !d.diff) {
        ctx.fillStyle = hsl(th.fg, 0.85)
        ctx.fillRect(x0, y(hold) - 1, Math.max(1, x1 - x0), 2)
      }
    })
  }

  // Referenzen als Stufenlinie je Band, gestrichelt
  ctx.setLineDash([5, 3])
  ctx.lineWidth = 1.5
  for (const r of d.refs) {
    ctx.strokeStyle = hsl(th[REF_TOKENS[r.color % REF_TOKENS.length]], 0.9)
    ctx.beginPath()
    let pen = false
    d.bands.forEach((b, i) => {
      const v = r.levels[i]
      if (!Number.isFinite(v)) {
        pen = false
        return
      }
      const yy = y(v)
      if (pen) ctx.lineTo(freqToX(b.lo, w), yy)
      else ctx.moveTo(freqToX(b.lo, w), yy)
      ctx.lineTo(freqToX(b.hi, w), yy)
      pen = true
    })
    ctx.stroke()
  }
  ctx.setLineDash([])

  // feine Kurve mit leichtem Leuchten
  if (d.curve) {
    ctx.save()
    ctx.strokeStyle = d.showBars ? hsl(th.fg, 0.9) : hsl(th.primary)
    ctx.lineWidth = 1.5
    ctx.shadowColor = hsl(th.primary, 0.8)
    ctx.shadowBlur = 6
    ctx.beginPath()
    let pen = false
    for (let i = 0; i < SUB_BANDS.length; i++) {
      const v = d.curve[i]
      if (!Number.isFinite(v)) {
        pen = false
        continue
      }
      const xx = freqToX(SUB_BANDS[i].fc, w)
      const yy = y(v)
      if (pen) ctx.lineTo(xx, yy)
      else ctx.moveTo(xx, yy)
      pen = true
    }
    ctx.stroke()
    ctx.restore()
  }

  // Feedback-Marken
  for (const fb of d.feedback) {
    const xx = freqToX(fb.f, w)
    ctx.strokeStyle = hsl(th.danger, 0.9)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(xx, PAD.t + 8)
    ctx.lineTo(xx, h - PAD.b)
    ctx.stroke()
    ctx.fillStyle = hsl(th.danger)
    ctx.beginPath()
    ctx.moveTo(xx - 5, PAD.t)
    ctx.lineTo(xx + 5, PAD.t)
    ctx.lineTo(xx, PAD.t + 8)
    ctx.closePath()
    ctx.fill()
  }

  // Fadenkreuz
  if (d.hoverX != null && d.hoverX >= PAD.l && d.hoverX <= w - PAD.r) {
    ctx.strokeStyle = hsl(th.fg, 0.5)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(Math.round(d.hoverX) + 0.5, PAD.t)
    ctx.lineTo(Math.round(d.hoverX) + 0.5, h - PAD.b)
    ctx.stroke()
  }
}

/* ------------------------------ Spektrogramm ------------------------------ */

function hslToRgb(c: string): [number, number, number] {
  const m = /([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(c)
  if (!m) return [128, 128, 128]
  const h = Number(m[1]) / 360
  const s = Number(m[2]) / 100
  const l = Number(m[3]) / 100
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const ch = (t: number): number => {
    t = (t + 1) % 1
    const v =
      t < 1 / 6
        ? p + (q - p) * 6 * t
        : t < 1 / 2
          ? q
          : t < 2 / 3
            ? p + (q - p) * (2 / 3 - t) * 6
            : p
    return Math.round(v * 255)
  }
  return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)]
}

/**
 * Farbskala leise -> laut (256 Stufen, RGBA): Kartenhintergrund, gedämpfter Akzent, Akzent,
 * Schrift. Nicht über Warnung/Gefahr: Die sind wie viele Akzentfarben gelb oder rot – das
 * Spektrogramm war dann einfarbig. Zur Schrift hin (hell bzw. dunkel) bleibt es bei jeder
 * Akzentfarbe und in Hell wie Dunkel unterscheidbar.
 */
export function heatLut(th: Theme): Uint8ClampedArray {
  const card = hslToRgb(th.card)
  const primary = hslToRgb(th.primary)
  const dim = card.map((c, k) => c + (primary[k] - c) * 0.35) as [number, number, number]
  const stops: [number, [number, number, number]][] = [
    [0, card],
    [0.35, dim],
    [0.75, primary],
    [1, hslToRgb(th.fg)]
  ]
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let s = 0
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++
    const [t0, c0] = stops[s]
    const [t1, c1] = stops[s + 1]
    const u = (t - t0) / (t1 - t0)
    for (let k = 0; k < 3; k++) lut[i * 4 + k] = c0[k] + (c1[k] - c0[k]) * u
    lut[i * 4 + 3] = 255
  }
  return lut
}

/**
 * Eine neue Spalte rechts anfügen (der Rest rückt um `px` nach links). Frequenz senkrecht
 * (tief unten, log), Farbe = Pegel zwischen `top - range` und `top`. Geräte-Pixel.
 */
export function pushSpectrogram(
  ctx: CanvasRenderingContext2D,
  wDev: number,
  hDev: number,
  curve: ArrayLike<number>,
  top: number,
  range: number,
  lut: Uint8ClampedArray,
  px: number
): void {
  ctx.drawImage(ctx.canvas, -px, 0)
  const img = ctx.createImageData(px, hDev)
  const n = SUB_BANDS.length
  for (let row = 0; row < hDev; row++) {
    // Zeile -> Position im 1/24-Raster (oben hohe Frequenzen)
    const pos = (1 - row / (hDev - 1)) * (n - 1)
    const i0 = Math.floor(pos)
    const i1 = Math.min(n - 1, i0 + 1)
    const a = curve[i0]
    const b = curve[i1]
    const v = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * (pos - i0) : -Infinity
    const t = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - (top - range)) / range)) : 0
    const c = Math.round(t * 255) * 4
    for (let x = 0; x < px; x++) {
      const o = (row * px + x) * 4
      img.data[o] = lut[c]
      img.data[o + 1] = lut[c + 1]
      img.data[o + 2] = lut[c + 2]
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, wDev - px, 0)
}
