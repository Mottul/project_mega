// Mapping-Testbild zum Einrichten von Beamern, Mappings und LED-Wänden. Jedes Element
// dient einer Messung und lässt sich ausblenden:
//   Raster ab Pixel 0,0 (automatisch oder in Cabinet-Größe) mit Zellnamen – Verzerrung
//     erkennen, Warp-Punkte ansagen („C4 nach links“), Cabinet-Grenzen prüfen
//   Rahmen auf dem äußersten Pixel und Lineal (10/50/100 px) – Beschnitt und Versatz ablesen
//   Ecken 1–4 mit Pixelkoordinate und OBEN-Pfeil – Ecken zuordnen, gedrehte oder
//     gespiegelte Ausgänge sofort erkennen
//   großer und halber Kreis, Diagonalen, Mittelachsen – Seitenverhältnis, Skalierung, Mitte
//   Messfelder Farbe, Grau, Schärfe, Verlauf – Farbe/Gamma, Schwarz- und Weißgrenze,
//     Fokus und Skalierung (1-px-Linien), Abstufungen
//   Logo/Titel und Kennung (Bezeichnung, Auflösung, Uhrzeit – steht die Uhr, hängt es)
// Gezeichnet wird in Zielkoordinaten: Ausgabe und Export sind pixelgenau, die kleinere
// Vorschau zeigt dieselbe Zeichnung verkleinert (auch feste Rastergrößen in px stimmen).

import {
  DEFAULT_PATTERN_CONFIG,
  MAPPING_DEFAULT_ACCENT,
  MAPPING_DEFAULT_BACKGROUND,
  type MappingElement,
  type PatternConfig
} from '@shared/types'
import {
  LOGO_ASPECT,
  LOGO_HEAD_STROKE,
  LOGO_MITER_LIMIT,
  LOGO_PARTS,
  LOGO_STROKE,
  LOGO_VIEWBOX
} from '@renderer/components/mottulboxLogoData'

type Ctx = CanvasRenderingContext2D

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/** Runde Rastermaße: automatisch wird die kürzere Kante ÷ 9 auf den nächsten Wert gelegt. */
const NICE_CELLS = [
  16, 20, 24, 30, 32, 40, 48, 50, 60, 64, 72, 75, 80, 90, 96, 100, 120, 128, 144, 150, 160, 180,
  192, 200, 240, 256, 288, 300, 320, 360, 384, 400, 480, 512, 576, 640, 720, 768, 960, 1024
]

/** Automatische Zellgröße (px) – zugleich die Einheit für Schrift, Striche und Felder. */
export function autoCell(w: number, h: number): number {
  const target = Math.min(w, h) / 9
  return NICE_CELLS.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best))
}

/** Zellname wie in der Tabellenkalkulation: Spalte A…Z, AA…, Zeile ab 1. */
export function cellName(col: number, row: number): string {
  let letters = ''
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return `${letters}${row + 1}`
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}

// Gekürzte Verhältnisse, die im Handel anders heißen
const NAMED_RATIOS: Record<string, string> = {
  '8:5': '16:10',
  '5:8': '10:16',
  '64:27': '21:9',
  '43:18': '21:9',
  '12:5': '21:9'
}

/** Seitenverhältnis „16:9“; krumme Verhältnisse als Dezimalzahl („1,78:1“). */
export function ratioText(w: number, h: number): string {
  const g = gcd(Math.round(w), Math.round(h)) || 1
  const key = `${Math.round(w) / g}:${Math.round(h) / g}`
  if (NAMED_RATIOS[key]) return NAMED_RATIOS[key]
  if (Math.round(w) / g <= 32 && Math.round(h) / g <= 32) return key
  return `${(w / h).toFixed(2).replace('.', ',')}:1`
}

/** Uhrzeit HH:MM:SS (lokal). */
export function clockText(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Mittelachse: bei gerader Kantenlänge die beiden Mittelpixel, sonst das eine. */
export function axisBand(n: number): { start: number; size: number } {
  return n % 2 === 0 ? { start: n / 2 - 1, size: 2 } : { start: (n - 1) / 2, size: 1 }
}

export interface CardLayout {
  w: number
  h: number
  /** Einheit (= automatische Zellgröße): Schrift, Striche, Ecken, Felder */
  u: number
  /** Rasterzelle (automatisch = u, sonst z. B. ein LED-Cabinet) */
  cw: number
  ch: number
  cx: number
  cy: number
  /** Radius des großen Kreises */
  R: number
  /** Schenkel der Eck-Dreiecke */
  tri: number
}

function validCell(v: number | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0
    ? Math.min(4096, Math.max(4, Math.round(v)))
    : null
}

export function cardLayout(
  w: number,
  h: number,
  cell?: { w: number; h: number } | null
): CardLayout {
  const u = autoCell(w, h)
  return {
    w,
    h,
    u,
    cw: validCell(cell?.w) ?? u,
    ch: validCell(cell?.h) ?? u,
    cx: w / 2,
    cy: h / 2,
    R: Math.min(w, h) / 2 - u / 2,
    tri: Math.round(u * 0.55)
  }
}

function clearOfCircle(r: Rect, cx: number, cy: number, radius: number): boolean {
  const nx = Math.min(Math.max(cx, r.x), r.x + r.w)
  const ny = Math.min(Math.max(cy, r.y), r.y + r.h)
  return Math.hypot(cx - nx, cy - ny) >= radius
}

const FIELD_ASPECT = 3 / 2

/**
 * Plätze der vier Messfelder (Reihenfolge Farbe, Grau, Schärfe, Verlauf), immer außerhalb
 * des großen Kreises und frei von Lineal und Ecken. Bevorzugt in ganzen Rasterzellen
 * (snapped: die Rasterlinien rahmen die Felder ein); passt das nur deutlich kleiner als
 * frei platziert (4:3, große Cabinets), werden sie frei gesetzt. Kein Platz: keine Felder.
 */
export function fieldSlots(lay: CardLayout): { rects: Rect[]; snapped: boolean } {
  const { w, h, u, cw, ch, cx, cy, R } = lay
  const landscape = w >= h
  const m = Math.ceil(u * 0.5)
  const clear = R + Math.max(4, u * 0.15)
  const fits = (r: Rect): boolean =>
    r.x >= m &&
    r.y >= m &&
    r.x + r.w <= w - m &&
    r.y + r.h <= h - m &&
    clearOfCircle(r, cx, cy, clear)
  // Quer: links oben/unten, rechts oben/unten – hoch: oben links/rechts, unten links/rechts
  const order = (tl: Rect, tr: Rect, bl: Rect, br: Rect): Rect[] =>
    landscape ? [tl, bl, tr, br] : [tl, tr, bl, br]
  // Ideale Lage oben links: mittig in der freien Zone neben (quer) bzw. über (hoch) dem Kreis
  const ideal = (pw: number, ph: number): { x: number; y: number } =>
    landscape
      ? { x: (cx - R) / 2 - pw / 2, y: h * 0.27 - ph / 2 }
      : { x: w * 0.27 - pw / 2, y: (cy - R) / 2 - ph / 2 }

  // 1) In ganzen Zellen, möglichst nahe 3 × 2 Einheiten
  let snapped: Rect[] | null = null
  const nw0 = Math.max(1, Math.round((3 * u) / cw))
  const nh0 = Math.max(1, Math.round((2 * u) / ch))
  const sizes: [number, number][] = []
  for (let a = nw0; a >= 1; a--) for (let b = nh0; b >= 1; b--) sizes.push([a, b])
  sizes.sort((p, q) => q[0] * q[1] * cw * ch - p[0] * p[1] * cw * ch)
  search: for (const [a, b] of sizes) {
    const pw = a * cw
    const ph = b * ch
    // Inhalte liegen nebeneinander (Balken, Stufen) -> nie höher als breit; riesige Zellen
    // lieber frei platzieren
    if (pw < ph || pw > 4 * u || ph > 3 * u) continue
    const minX = Math.ceil(m / cw) * cw
    const minY = Math.ceil(m / ch) * ch
    const id = ideal(pw, ph)
    const xs = [...new Set([Math.max(minX, Math.round(id.x / cw) * cw), minX])]
    const ys = [...new Set([Math.max(minY, Math.round(id.y / ch) * ch), minY])]
    for (const x of xs) {
      for (const y of ys) {
        const tl = { x, y, w: pw, h: ph }
        if (!fits(tl)) continue
        // Gegenüber gespiegelt, aufs Raster gelegt und notfalls um ganze Zellen nach innen
        let xr = Math.round((w - x - pw) / cw) * cw
        while (xr + pw > w - m && xr > x) xr -= cw
        let yb = Math.round((h - y - ph) / ch) * ch
        while (yb + ph > h - m && yb > y) yb -= ch
        const tr = { x: xr, y, w: pw, h: ph }
        const bl = { x, y: yb, w: pw, h: ph }
        const br = { x: xr, y: yb, w: pw, h: ph }
        if (xr > x + pw && yb > y + ph && [tr, bl, br].every(fits)) {
          snapped = order(tl, tr, bl, br)
          break search
        }
      }
    }
  }

  // 2) Frei: erst mittig in der Zone, sonst so groß wie möglich in die Ecken
  let free: Rect[] = []
  const mirror = (r: Rect): Rect[] =>
    order(
      r,
      { ...r, x: w - r.x - r.w },
      { ...r, y: h - r.y - r.h },
      { ...r, x: w - r.x - r.w, y: h - r.y - r.h }
    )
  // Frei gesetzte Felder liegen nicht im Raster -> mehr Luft zu Ecken und Lineal
  const mf = Math.ceil(u * 0.75)
  const maxW = 3 * u
  const zone = { ...ideal(maxW, maxW / FIELD_ASPECT), w: maxW, h: maxW / FIELD_ASPECT }
  zone.x = Math.max(mf, zone.x)
  zone.y = Math.max(mf, zone.y)
  if (fits(zone)) {
    free = mirror(zone)
  } else {
    let lo = 0
    let hi = maxW
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2
      if (fits({ x: mf, y: mf, w: mid, h: mid / FIELD_ASPECT })) lo = mid
      else hi = mid
    }
    if (lo >= Math.max(64, u)) free = mirror({ x: mf, y: mf, w: lo, h: lo / FIELD_ASPECT })
  }
  free = free.map((r) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.floor(r.w),
    h: Math.floor(r.h)
  }))

  const area = (rs: Rect[] | null): number => (rs?.length ? rs[0].w * rs[0].h : 0)
  if (snapped && area(snapped) >= 0.5 * area(free)) return { rects: snapped, snapped: true }
  return { rects: free, snapped: false }
}

/* ------------------------------- Zeichnen -------------------------------- */

function font(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT_STACK}`
}

function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  px: number,
  o: { align?: CanvasTextAlign; base?: CanvasTextBaseline; weight?: number; color: string }
): void {
  ctx.font = font(o.weight ?? 500, px)
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = o.base ?? 'alphabetic'
  ctx.fillStyle = o.color
  ctx.fillText(s, x, y)
}

// Eingaben begrenzen: mehr passt ohnehin nicht ins Bild (schützt die Messschleifen)
function clampText(s: string | undefined): string {
  return [...(s ?? '').trim()].slice(0, 120).join('')
}

// Kürzt mit „…", bis der Text in maxW passt (Binärsuche -> wenige Messungen)
function ellipsize(ctx: Ctx, s: string, maxW: number): string {
  if (ctx.measureText(s).width <= maxW) return s
  const chars = [...s]
  const cut = (n: number): string => chars.slice(0, n).join('').trimEnd() + '…'
  let lo = 0
  let hi = chars.length
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (ctx.measureText(cut(mid)).width <= maxW) lo = mid
    else hi = mid
  }
  return cut(lo)
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Relative Leuchtdichte (WCAG) einer Hex-Farbe, 0 = Schwarz … 1 = Weiß. */
function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Heller Grund? -> Linien und Schrift dunkel statt hell. */
export function isLight(hex: string): boolean {
  return luminance(hex) > 0.35
}

/** Kontrastverhältnis zweier Farben (WCAG, 1 … 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

function plate(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

// Mottulbox-Logo mittig bei (x, y) – mit denselben Strich-Regeln wie die SVG-Komponente
let logoPaths: { path: Path2D; head: boolean }[] | null = null
function drawLogo(ctx: Ctx, x: number, y: number, height: number, color: string): void {
  logoPaths ??= LOGO_PARTS.map((p) => ({ path: new Path2D(p.d), head: !!p.head }))
  const k = height / LOGO_VIEWBOX.height
  ctx.save()
  ctx.translate(x - (LOGO_VIEWBOX.width * k) / 2, y - height / 2)
  ctx.scale(k, k)
  ctx.translate(-LOGO_VIEWBOX.x, -LOGO_VIEWBOX.y)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'miter'
  ctx.miterLimit = LOGO_MITER_LIMIT
  for (const { path, head } of logoPaths) {
    ctx.lineWidth = head ? LOGO_HEAD_STROKE : LOGO_STROKE
    if (!head) ctx.fill(path)
    ctx.stroke(path)
  }
  ctx.restore()
}

const pct = (p: number): number => Math.round((p / 100) * 255)
const gray = (p: number): string => `rgb(${pct(p)},${pct(p)},${pct(p)})`
const BARS = [
  '#ffffff',
  '#ffff00',
  '#00ffff',
  '#00ff00',
  '#ff00ff',
  '#ff0000',
  '#0000ff',
  '#000000'
]
const BARS_75 = BARS.map((c) => c.replace(/ff/g, 'bf')) // 75 % = 191 (EBU)

// Felder nebeneinander auf ganzen Pixeln (Schärfe/Grau brauchen exakte Kanten)
function strip(
  ctx: Ctx,
  colors: string[],
  r: Rect,
  labels?: { text: string[]; color: (i: number) => string }
): void {
  colors.forEach((c, i) => {
    const a = r.x + Math.round((i * r.w) / colors.length)
    const b = r.x + Math.round(((i + 1) * r.w) / colors.length)
    ctx.fillStyle = c
    ctx.fillRect(a, r.y, b - a, r.h)
    const px = Math.min(r.h * 0.42, (b - a) * 0.36)
    if (labels && px >= 7) {
      text(ctx, labels.text[i], (a + b) / 2, r.y + r.h / 2, px, {
        align: 'center',
        base: 'middle',
        weight: 600,
        color: labels.color(i)
      })
    }
  })
}

const rows = (r: Rect, parts: number[]): Rect[] => {
  const total = parts.reduce((s, p) => s + p, 0)
  let acc = 0
  return parts.map((p) => {
    const y0 = r.y + Math.round((acc * r.h) / total)
    acc += p
    const y1 = r.y + Math.round((acc * r.h) / total)
    return { x: r.x, y: y0, w: r.w, h: y1 - y0 }
  })
}

type FieldDraw = (ctx: Ctx, r: Rect, labels: boolean) => void

const FIELDS: FieldDraw[] = [
  // Farbe: 100 % und 75 % in Normreihenfolge (Weiß, Gelb, Cyan, Grün, Magenta, Rot, Blau, Schwarz)
  (ctx, r) => {
    const [top, bottom] = rows(r, [1, 1])
    strip(ctx, BARS, top)
    strip(ctx, BARS_75, bottom)
  },
  // Grau: 0–100 % in Zehnerschritten; darunter Schwarzgrenze 0–5 % und Weißgrenze 95–100 %
  (ctx, r, labels) => {
    const [top, bottom] = rows(r, [11, 9])
    const steps = Array.from({ length: 11 }, (_, i) => i * 10)
    strip(
      ctx,
      steps.map(gray),
      top,
      labels
        ? { text: steps.map(String), color: (i) => (steps[i] < 50 ? '#bbb' : '#333') }
        : undefined
    )
    const low = [0, 1, 2, 3, 4, 5]
    const high = [95, 96, 97, 98, 99, 100]
    const half = Math.floor(bottom.w / 2)
    const sep = Math.max(2, Math.round(r.w / 90)) // neutrale Trennung: keine Kante 5 % ↔ 95 %
    strip(
      ctx,
      low.map(gray),
      { ...bottom, w: half - sep },
      labels ? { text: low.map(String), color: () => '#777' } : undefined
    )
    ctx.fillStyle = gray(50)
    ctx.fillRect(bottom.x + half - sep, bottom.y, 2 * sep, bottom.h)
    strip(
      ctx,
      high.map(gray),
      { ...bottom, x: bottom.x + half + sep, w: bottom.w - half - sep },
      labels ? { text: high.map(String), color: () => '#888' } : undefined
    )
  },
  // Schärfe: Linienpaare 1–4 px senkrecht (oben) und waagerecht (unten), pixelgenau
  (ctx, r) => {
    ctx.fillStyle = '#000000'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    const [top, bottom] = rows(r, [1, 1])
    const gap = Math.max(1, Math.round(r.w / 120))
    ctx.fillStyle = '#ffffff'
    for (let k = 0; k < 4; k++) {
      const a = r.x + Math.round((k * r.w) / 4)
      const b = r.x + Math.round(((k + 1) * r.w) / 4) - (k < 3 ? gap : 0)
      const p = k + 1
      for (let x = a; x + p <= b; x += 2 * p) ctx.fillRect(x, top.y, p, top.h - gap)
      for (let y = bottom.y; y + p <= bottom.y + bottom.h; y += 2 * p) ctx.fillRect(a, y, b - a, p)
    }
  },
  // Verlauf: Grau, Rot, Grün, Blau von 0 auf 100 % (Abstufungen, Bittiefe)
  (ctx, r) => {
    const ends = ['#ffffff', '#ff0000', '#00ff00', '#0000ff']
    rows(r, [1, 1, 1, 1]).forEach((row, i) => {
      const g = ctx.createLinearGradient(row.x, 0, row.x + row.w, 0)
      g.addColorStop(0, '#000000')
      g.addColorStop(1, ends[i])
      ctx.fillStyle = g
      ctx.fillRect(row.x, row.y, row.w, row.h)
    })
  }
]

/**
 * Zeichnet das Mapping-Testbild. `timeMs` = Wanduhr (Date.now()) für die laufende Uhrzeit;
 * 0 (Export/Standbild) nimmt die aktuelle Zeit. `nominal` ist die Zielauflösung: gezeichnet
 * wird in ihren Koordinaten und auf die Canvasgröße (Vorschau) skaliert.
 */
export function drawMappingCard(
  ctx: Ctx,
  cfg: PatternConfig,
  timeMs: number,
  nominal: { width: number; height: number }
): void {
  const w = Math.max(1, Math.round(nominal.width))
  const h = Math.max(1, Math.round(nominal.height))
  const hidden = new Set<MappingElement>(cfg.mappingHidden ?? [])
  const on = (e: MappingElement): boolean => !hidden.has(e)
  const accent = cfg.mappingAccent || MAPPING_DEFAULT_ACCENT
  const background = cfg.mappingBackground || MAPPING_DEFAULT_BACKGROUND
  // Linien und kleine Schrift kontrastieren zum Grund (hell auf dunkel, dunkel auf hell)
  const ink = isLight(background) ? '#000000' : '#ffffff'
  const onAccent = isLight(accent) ? '#000000' : '#ffffff'
  // Schrift in Akzentfarbe nur, wenn sie sich vom Grund abhebt (Gold auf Weiß nicht)
  const accentText = contrast(accent, background) >= 2 ? accent : ink
  const lay = cardLayout(w, h, cfg.mappingCell)
  const { u, cw, ch, cx, cy, R, tri } = lay
  const labels = on('labels')

  ctx.save()
  ctx.scale(cfg.width / w, cfg.height / h)

  // Grundfläche
  ctx.fillStyle = background
  ctx.fillRect(0, 0, w, h)

  // Raster: 1-px-Linien auf der ersten Spalte/Zeile jeder Zelle, ab Pixel 0,0 (wie
  // LED-Prozessoren zählen). Wahlweise in Akzentfarbe: beim Überblenden mehrerer Beamer
  // sind die Raster dann je Beamer zu unterscheiden.
  if (on('grid')) {
    ctx.fillStyle = cfg.mappingGridAccent ? rgba(accent, 0.7) : rgba(ink, 0.32)
    for (let x = cw; x < w; x += cw) ctx.fillRect(x, 0, 1, h)
    for (let y = ch; y < h; y += ch) ctx.fillRect(0, y, w, 1)
  }

  if (on('diagonals')) {
    ctx.strokeStyle = rgba(ink, 0.28)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, h)
    ctx.moveTo(w, 0)
    ctx.lineTo(0, h)
    ctx.stroke()
  }

  if (on('circles')) {
    ctx.strokeStyle = rgba(ink, 0.6)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(cx, cy, R / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = accent
    ctx.lineWidth = Math.max(2, Math.round(u / 60))
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (on('axes')) {
    const ax = axisBand(w)
    const ay = axisBand(h)
    ctx.fillStyle = accent
    ctx.fillRect(ax.start, 0, ax.size, h)
    ctx.fillRect(0, ay.start, w, ay.size)
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(4, u / 6), 0, Math.PI * 2)
    ctx.stroke()
  }

  // Messfelder: in ganzen Zellen um 1 px eingerückt, damit die Rasterlinien sie rahmen;
  // frei gesetzte Felder bekommen einen eigenen 1-px-Rahmen in der Linienfarbe
  const slots = on('fields') ? fieldSlots(lay) : { rects: [], snapped: false }
  slots.rects.forEach((r, i) => {
    const inner = slots.snapped ? { x: r.x + 1, y: r.y + 1, w: r.w - 1, h: r.h - 1 } : r
    if (!slots.snapped) {
      ctx.fillStyle = rgba(ink, 0.45)
      ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2)
    }
    FIELDS[i](ctx, inner, labels)
  })

  // Zellnamen rechts unten in der Zelle (nicht in Eckzellen, Feldern und dem Linealband)
  if (labels && on('grid') && Math.min(cw, ch) >= 40 && u >= 40) {
    const px = Math.round(Math.min(u, cw, ch) * 0.12)
    const band = Math.round(Math.max(4, u * 0.2)) + 2
    const cols = Math.ceil(w / cw)
    const rowsN = Math.ceil(h / ch)
    ctx.font = font(500, px)
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rowsN; j++) {
        if ((i === 0 || i === cols - 1) && (j === 0 || j === rowsN - 1)) continue
        const x1 = Math.min(w, (i + 1) * cw)
        const y1 = Math.min(h, (j + 1) * ch)
        if (x1 - i * cw < cw * 0.5 || y1 - j * ch < ch * 0.5) continue // angeschnittene Randzellen
        const lx = Math.min(x1, w - band) - Math.round(u * 0.08)
        const ly = Math.min(y1, h - band) - Math.round(u * 0.08)
        if (
          slots.rects.some(
            (r) =>
              lx > r.x - 2 && lx - px * 2 < r.x + r.w + 2 && ly > r.y - 2 && ly - px < r.y + r.h + 2
          )
        )
          continue
        text(ctx, cellName(i, j), lx, ly, px, { align: 'right', color: rgba(ink, 0.45) })
      }
    }
  }

  // Lineal: Teilstriche nach innen alle 10/50/100 px, Zahlen oben und links
  if (on('ruler')) {
    ctx.fillStyle = rgba(ink, 0.75)
    const tick = (p: number): number =>
      Math.round(
        p % 100 === 0
          ? Math.max(4, u * 0.2)
          : p % 50 === 0
            ? Math.max(3, u * 0.12)
            : Math.max(2, u * 0.06)
      )
    const skip = on('corners') ? tri : 0
    for (let x = 10; x < w; x += 10) {
      if (x < skip || x > w - 1 - skip) continue
      const l = tick(x)
      ctx.fillRect(x, 0, 1, l)
      ctx.fillRect(x, h - l, 1, l)
    }
    for (let y = 10; y < h; y += 10) {
      if (y < skip || y > h - 1 - skip) continue
      const l = tick(y)
      ctx.fillRect(0, y, l, 1)
      ctx.fillRect(w - l, y, l, 1)
    }
    if (labels && u >= 48) {
      const px = Math.round(u * 0.11)
      // Zahlenabstand so, dass vierstellige Werte nicht ineinanderlaufen (8K)
      const step = [100, 200, 500, 1000].find((s) => s >= px * 3) ?? 1000
      const color = rgba(ink, 0.8)
      for (let x = step; x < w - skip; x += step) {
        if (x > skip + px * 2) text(ctx, String(x), x + 3, Math.round(u * 0.2) + px, px, { color })
      }
      for (let y = step; y < h - skip; y += step) {
        if (y > skip + px) text(ctx, String(y), Math.round(u * 0.2) + 3, y + px + 2, px, { color })
      }
    }
  }

  // Rahmen: 1 px genau auf den äußersten Pixeln – fehlt eine Kante, wird beschnitten
  if (on('frame')) {
    ctx.fillStyle = accent
    ctx.fillRect(0, 0, w, 1)
    ctx.fillRect(0, h - 1, w, 1)
    ctx.fillRect(0, 0, 1, h)
    ctx.fillRect(w - 1, 0, 1, h)
  }

  // Ecken 1–4 im Uhrzeigersinn ab oben links, dazu die Pixelkoordinate der Ecke
  if (on('corners')) {
    const corners = [
      { n: 1, x: 0, y: 0, dx: 1, dy: 1, at: '0, 0' },
      { n: 2, x: w, y: 0, dx: -1, dy: 1, at: `${w - 1}, 0` },
      { n: 3, x: w, y: h, dx: -1, dy: -1, at: `${w - 1}, ${h - 1}` },
      { n: 4, x: 0, y: h, dx: 1, dy: -1, at: `0, ${h - 1}` }
    ]
    for (const k of corners) {
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.moveTo(k.x, k.y)
      ctx.lineTo(k.x + k.dx * tri, k.y)
      ctx.lineTo(k.x, k.y + k.dy * tri)
      ctx.closePath()
      ctx.fill()
      if (tri >= 10) {
        text(
          ctx,
          String(k.n),
          k.x + k.dx * tri * 0.3,
          k.y + k.dy * tri * 0.3,
          Math.round(tri * 0.38),
          {
            align: 'center',
            base: 'middle',
            weight: 800,
            color: onAccent
          }
        )
      }
      if (labels && u >= 40) {
        const px = Math.round(u * 0.12)
        text(
          ctx,
          k.at,
          k.x + k.dx * tri * 0.62,
          k.y + k.dy * tri * 0.62 + (k.dy > 0 ? px : 0),
          px,
          {
            align: k.dx > 0 ? 'left' : 'right',
            weight: 600,
            color: accentText
          }
        )
      }
    }
  }

  // OBEN: Pfeil an der Oberkante – steht er unten oder ist die Schrift gespiegelt, ist der
  // Ausgang gedreht bzw. gespiegelt (Deckenmontage, Rückprojektion)
  if (on('up')) {
    const aw = Math.max(8, u * 0.32)
    const top = Math.max(4, u * 0.34)
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.moveTo(cx, top)
    ctx.lineTo(cx + aw / 2, top + aw * 0.75)
    ctx.lineTo(cx - aw / 2, top + aw * 0.75)
    ctx.closePath()
    ctx.fill()
    if (labels && u >= 32) {
      plate(ctx, cx - u * 0.42, top + aw * 0.85, u * 0.84, u * 0.24, 3)
      text(ctx, 'OBEN', cx, top + aw * 0.85 + u * 0.18, Math.round(u * 0.16), {
        align: 'center',
        weight: 800,
        color: accent
      })
    }
  }

  // Über der Mitte: Logo + Titel
  const maxTextW = Math.min(2 * R * 0.9, w - 2 * u)
  const title = on('logo') ? clampText(cfg.mappingTitle ?? DEFAULT_PATTERN_CONFIG.mappingTitle) : ''
  if (on('logo')) {
    const tpx = Math.max(8, Math.round(u * 0.3))
    const lh = u * 0.5
    const lw = lh * LOGO_ASPECT
    const gap = title ? u * 0.2 : 0
    ctx.font = font(600, tpx)
    // Sperrung über schmale Leerzeichen (letterSpacing kennt nicht jede Umgebung)
    const shown = title ? ellipsize(ctx, [...title].join(' '), maxTextW - lw - gap) : ''
    const tw = shown ? ctx.measureText(shown).width : 0
    const total = lw + gap + tw
    const y = cy - R * 0.5
    plate(ctx, cx - total / 2 - u * 0.18, y - lh / 2 - u * 0.14, total + u * 0.36, lh + u * 0.28, 6)
    drawLogo(ctx, cx - total / 2 + lw / 2, y, lh, '#ffffff')
    if (shown)
      text(ctx, shown, cx - total / 2 + lw + gap, y + tpx * 0.36, tpx, {
        weight: 600,
        color: '#ffffff'
      })
  }

  // Unter der Mitte: Bezeichnung + Auflösung · Seitenverhältnis · Uhrzeit
  if (on('info')) {
    const label = clampText(cfg.label)
    const now = timeMs > 0 ? new Date(timeMs) : new Date()
    const info = `${w} × ${h} px · ${ratioText(w, h)} · ${clockText(now)}`
    const ipx = Math.max(8, Math.round(u * 0.2))
    const lpx = Math.max(9, Math.round(u * 0.3))
    ctx.font = font(500, ipx)
    const infoShown = ellipsize(ctx, info, maxTextW)
    let bw = ctx.measureText(infoShown).width
    ctx.font = font(600, lpx)
    const labelShown = label ? ellipsize(ctx, label, maxTextW) : ''
    if (labelShown) bw = Math.max(bw, ctx.measureText(labelShown).width)
    const bh = (labelShown ? lpx * 1.25 : 0) + ipx * 1.3 + u * 0.2
    const by = cy + R * 0.5 - bh / 2
    plate(ctx, cx - bw / 2 - u * 0.18, by, bw + u * 0.36, bh, 6)
    if (labelShown) {
      text(ctx, labelShown, cx, by + u * 0.1 + lpx, lpx, {
        align: 'center',
        weight: 600,
        color: '#ffffff'
      })
    }
    text(ctx, infoShown, cx, by + bh - u * 0.12, ipx, {
      align: 'center',
      color: 'rgba(255,255,255,0.85)'
    })
  }

  ctx.restore()
}
