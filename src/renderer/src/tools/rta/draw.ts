// Zeichnen des RTA auf Canvas: Spektrum (Balken, Kurve, Spitzen, Referenzen, Differenz,
// Feedback-Marken, Fadenkreuz) und Spektrogramm (laufender Wasserfall). Farben nur aus den
// Design-Tokens (CSS-Variablen „H S% L%“) – so folgen Hell/Dunkel und Akzentfarbe.

import { levelAt, SUB_BANDS, subPosition, type Band } from './bands'

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

/** Neutral: Pegel, Spektrum und Wasserfall in der Schriftfarbe statt im Akzent */
export function mitFarbe(th: Theme, farbe: 'akzent' | 'neutral'): Theme {
  return farbe === 'neutral' ? { ...th, primary: th.fg } : th
}

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

/** Zeitmaßstab des Spektrogramms: eine Zeile (Wasserfall) bzw. Spalte (Zeitachse) je 100 ms und
 *  CSS-Pixel – fest, nicht an der Bildrate (die schwankt und fehlt in verdeckten Fenstern) */
export const ROW_MS = 100

export type SpectroLayout = 'waterfall' | 'timeline'

/** Datenbereich der Zeitachse: zwischen den Rändern wie das Spektrum (links stehen die Frequenzen) */
function dataX(wDev: number, dpr: number): [number, number] {
  return [Math.round(PAD.l * dpr), wDev - Math.round(PAD.r * dpr)]
}

/** Frequenz an einer Stelle (CSS-Pixel): Wasserfall waagrecht wie das Spektrum, Zeitachse senkrecht */
export function spectroFreq(
  mode: SpectroLayout,
  x: number,
  y: number,
  w: number,
  h: number
): number {
  if (mode === 'waterfall') return xToFreq(x, w)
  return F_MAX * Math.pow(F_MIN / F_MAX, Math.max(0, Math.min(1, y / h)))
}

/** Wie viele Zeilen zurück (0 = neueste) eine Stelle liegt; außerhalb der Daten −1 */
export function spectroRow(mode: SpectroLayout, x: number, y: number, w: number): number {
  if (mode === 'waterfall') return x < PAD.l || x > w - PAD.r ? -1 : Math.floor(y)
  return x < PAD.l || x > w - PAD.r ? -1 : Math.floor(w - PAD.r - x)
}

const posCache = new Map<string, Float32Array>()
/** Lage im 1/24-Raster je Geräte-Pixel quer zur Zeit (Wasserfall: je x, Zeitachse: je y) */
function positions(mode: SpectroLayout, wDev: number, hDev: number, dpr: number): Float32Array {
  const key = `${mode}|${wDev}|${hDev}|${dpr}`
  let p = posCache.get(key)
  if (p) return p
  if (mode === 'waterfall') {
    const [x0, x1] = dataX(wDev, dpr)
    p = Float32Array.from({ length: Math.max(0, x1 - x0) }, (_, i) =>
      subPosition(xToFreq((x0 + i + 0.5) / dpr, wDev / dpr))
    )
  } else {
    p = Float32Array.from({ length: hDev }, (_, y) =>
      subPosition(F_MAX * Math.pow(F_MIN / F_MAX, (y + 0.5) / hDev))
    )
  }
  if (posCache.size > 8) posCache.clear()
  posCache.set(key, p)
  return p
}

/** Eine Zeile bzw. Spalte an `at` (Geräte-Pixel) einzeichnen, `step` Pixel dick */
function drawLine(
  ctx: CanvasRenderingContext2D,
  mode: SpectroLayout,
  wDev: number,
  hDev: number,
  dpr: number,
  row: ArrayLike<number>,
  top: number,
  range: number,
  lut: Uint8ClampedArray,
  at: number,
  step: number
): void {
  const pos = positions(mode, wDev, hDev, dpr)
  const color = (p: number): number => {
    const v = levelAt(row, p)
    const t = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - (top - range)) / range)) : 0
    return Math.round(t * 255) * 4
  }
  if (mode === 'waterfall') {
    const [x0] = dataX(wDev, dpr)
    const n = pos.length
    if (n <= 0) return
    const img = ctx.createImageData(n, step)
    for (let x = 0; x < n; x++) {
      const c = color(pos[x])
      for (let y = 0; y < step; y++) {
        const o = (y * n + x) * 4
        img.data[o] = lut[c]
        img.data[o + 1] = lut[c + 1]
        img.data[o + 2] = lut[c + 2]
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, x0, at)
  } else {
    const img = ctx.createImageData(step, hDev)
    for (let y = 0; y < hDev; y++) {
      const c = color(pos[y])
      for (let x = 0; x < step; x++) {
        const o = (y * step + x) * 4
        img.data[o] = lut[c]
        img.data[o + 1] = lut[c + 1]
        img.data[o + 2] = lut[c + 2]
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, at, 0)
  }
}

export interface SpectroScale {
  top: number
  range: number
}

/**
 * Neue Zeile anfügen: Der Wasserfall rückt um eine Zeile nach unten (neu oben), die Zeitachse um
 * eine Spalte nach links (neu rechts). Geräte-Pixel, ohne Transformation.
 */
export function pushSpectro(
  ctx: CanvasRenderingContext2D,
  mode: SpectroLayout,
  dpr: number,
  row: ArrayLike<number>,
  scale: SpectroScale,
  lut: Uint8ClampedArray
): void {
  const { width: wDev, height: hDev } = ctx.canvas
  const step = Math.max(1, Math.round(dpr))
  if (mode === 'waterfall') {
    if (hDev > step) ctx.drawImage(ctx.canvas, 0, 0, wDev, hDev - step, 0, step, wDev, hDev - step)
    drawLine(ctx, mode, wDev, hDev, dpr, row, scale.top, scale.range, lut, 0, step)
  } else {
    const [x0, x1] = dataX(wDev, dpr)
    const span = x1 - x0 - step
    if (span > 0) ctx.drawImage(ctx.canvas, x0 + step, 0, span, hDev, x0, 0, span, hDev)
    drawLine(ctx, mode, wDev, hDev, dpr, row, scale.top, scale.range, lut, x1 - step, step)
  }
}

/** Alles neu aus dem Verlauf (neueste zuerst) – nach Größen-, Modus- oder Designwechsel */
export function renderSpectro(
  ctx: CanvasRenderingContext2D,
  mode: SpectroLayout,
  dpr: number,
  rows: readonly ArrayLike<number>[],
  scale: SpectroScale,
  lut: Uint8ClampedArray
): void {
  const { width: wDev, height: hDev } = ctx.canvas
  ctx.clearRect(0, 0, wDev, hDev)
  const step = Math.max(1, Math.round(dpr))
  const [x0, x1] = dataX(wDev, dpr)
  const max = mode === 'waterfall' ? Math.ceil(hDev / step) : Math.ceil((x1 - x0) / step)
  for (let i = 0; i < Math.min(rows.length, max); i++) {
    const at = mode === 'waterfall' ? i * step : x1 - (i + 1) * step
    drawLine(ctx, mode, wDev, hDev, dpr, rows[i], scale.top, scale.range, lut, at, step)
  }
}

/** Gitter und Beschriftung über dem Spektrogramm (CSS-Pixel, eigene Ebene) */
export function drawSpectroAxes(
  ctx: CanvasRenderingContext2D,
  mode: SpectroLayout,
  w: number,
  h: number,
  th: Theme
): void {
  ctx.clearRect(0, 0, w, h)
  ctx.font = '10px system-ui, sans-serif'
  ctx.lineWidth = 1
  const chip = (text: string, x: number, y: number, align: CanvasTextAlign): void => {
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(text).width
    const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x
    ctx.fillStyle = hsl(th.card, 0.75)
    ctx.fillRect(left - 2, y - 6, tw + 4, 12)
    ctx.fillStyle = hsl(th.fg, 0.85)
    ctx.fillText(text, x, y)
  }
  const seconds = (s: number): string => (s === 0 ? 'jetzt' : `−${s} s`)
  // Sekunden zwischen den Zeitmarken: breite Zeitachsen (über eine Minute) alle 10 s
  const every = mode === 'timeline' && w > 500 ? 10 : 5
  const pxPerS = 1000 / ROW_MS
  if (mode === 'waterfall') {
    GRID_F.forEach((f, i) => {
      const x = Math.round(freqToX(f, w)) + 0.5
      ctx.strokeStyle = hsl(th.fg, 0.18)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
      chip(LABEL_F[i], x, h - 8, 'center')
    })
    for (let s = 0; s * pxPerS < h - 20; s += every) {
      const y = Math.max(6, s * pxPerS)
      ctx.fillStyle = hsl(th.muted)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(seconds(s), PAD.l - 4, y)
    }
  } else {
    const right = w - PAD.r
    GRID_F.forEach((f, i) => {
      const y = Math.round((Math.log(F_MAX / f) / Math.log(F_MAX / F_MIN)) * h) + 0.5
      ctx.strokeStyle = hsl(th.fg, 0.18)
      ctx.beginPath()
      ctx.moveTo(PAD.l, y)
      ctx.lineTo(right, y)
      ctx.stroke()
      ctx.fillStyle = hsl(th.muted)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(LABEL_F[i], PAD.l - 4, y)
    })
    for (let s = 0; right - s * pxPerS > PAD.l + 12; s += every) {
      chip(seconds(s), right - s * pxPerS, h - 8, s === 0 ? 'right' : 'center')
    }
  }
}
