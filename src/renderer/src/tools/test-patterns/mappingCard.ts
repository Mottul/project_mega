// Mapping-Testbild im Stil des MadMapper-Testbilds: Raster, Eckmarken, Farb- und
// Graufelder, Spektrum und Frequenzgitter für Projektion/Mapping/Überblendung.
// Alle Maße hängen an EINER Einheit s (= kürzere Bildkante / 12) und am
// Bildmittelpunkt -> das Bild skaliert mit jeder Auflösung, bleibt symmetrisch
// und die Kreise bleiben rund (Verzerrung der Projektion sofort sichtbar).

import {
  DEFAULT_PATTERN_CONFIG,
  MAPPING_DEFAULT_ACCENT,
  MAPPING_DEFAULT_BACKGROUND,
  type PatternConfig
} from '@shared/types'
import {
  LOGO_HEAD_STROKE,
  LOGO_MITER_LIMIT,
  LOGO_PARTS,
  LOGO_STROKE,
  LOGO_VIEWBOX
} from '@renderer/components/mottulboxLogoData'

type Ctx = CanvasRenderingContext2D

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
const STRIP_DARK = '#2a2a2a'
const STRIP_LIGHT = '#aaaaaa'
// Eckkreise abdunkeln statt fester Farbe -> passen zu jedem Hintergrund.
const SHADE = 'rgba(0,0,0,0.25)'
// Feinraster halbtransparent -> bleibt auch über Eckfeldern und Halo sichtbar.
const FINE = 'rgba(255,255,255,0.5)'
const BARS = ['#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff']
const GRAYS = ['#1f1f1f', '#3f3f3f', '#5f5f5f', '#7f7f7f', '#9f9f9f', '#bfbfbf', '#dfdfdf']

export interface MappingLayout {
  /** Grundeinheit (px): kürzere Kante / 12. */
  s: number
  cx: number
  cy: number
  /** Hauptraster (Zellen 2s): Zellen je Richtung ab der Bildmitte. */
  bigX: number
  bigY: number
}

export function mappingLayout(w: number, h: number): MappingLayout {
  const s = Math.min(w, h) / 12
  const cx = w / 2
  const cy = h / 2
  // So viele 2s-Zellen, wie zwischen die Eck-Fadenkreuze (2s vom Rand) passen,
  // symmetrisch um die Mitte -> eine Hauptlinie liegt immer auf der Mittelachse.
  const cells = (half: number): number => Math.max(0, Math.floor((half - 2 * s) / (2 * s) + 1e-9))
  return { s, cx, cy, bigX: cells(cx), bigY: cells(cy) }
}

/**
 * Randstreifen-Blöcke (Breite s, am Feinraster ausgerichtet) als Intervalle
 * zwischen `from` und `to`. Die Phase ist an der Bildmitte verankert: Block i
 * beginnt bei mid + i·s; `darkEven` legt fest, ob gerade i dunkel sind. Gegenüber-
 * liegende Kanten sind gegenphasig (punktsymmetrisch wie im Original).
 */
export function stripBlocks(
  mid: number,
  s: number,
  from: number,
  to: number,
  darkEven: boolean
): { a: number; b: number; dark: boolean }[] {
  const out: { a: number; b: number; dark: boolean }[] = []
  const first = Math.floor((from - mid) / s + 1e-9)
  for (let i = first; mid + i * s < to - 1e-6; i++) {
    const a = Math.max(from, mid + i * s)
    const b = Math.min(to, mid + (i + 1) * s)
    if (b - a <= 1e-6) continue
    const even = ((i % 2) + 2) % 2 === 0
    out.push({ a, b, dark: even === darkEven })
  }
  return out
}

/** Uhrzeit HH:MM:SS (lokal). */
export function clockText(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Linienmitte aufs Pixelraster legen -> scharfe (nicht verwaschene) Linien.
function crisp(v: number, lw: number): number {
  return Math.round(lw) % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v)
}

function ring(ctx: Ctx, x: number, y: number, r: number, lw: number): void {
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}

function font(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT_STACK}`
}

interface TextStyle {
  weight: number
  tracking: number // Sperrung in em (0 = normal)
}

// Breite inkl. Sperrung (ohne Nachlauf hinter dem letzten Zeichen).
function textWidth(ctx: Ctx, text: string, style: TextStyle, size: number): number {
  ctx.font = font(style.weight, size)
  if (!style.tracking) return ctx.measureText(text).width
  const chars = [...text]
  const glyphs = chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0)
  return glyphs + style.tracking * size * (chars.length - 1)
}

// Größte Schrift (höchstens base), bei der der Text in maxW passt.
function fitSize(ctx: Ctx, text: string, style: TextStyle, base: number, maxW: number): number {
  const w = textWidth(ctx, text, style, base)
  return w > maxW ? (base * maxW) / w : base
}

// Kürzt mit „…", bis der Text in maxW passt (Binärsuche -> wenige Messungen).
function ellipsize(ctx: Ctx, text: string, style: TextStyle, size: number, maxW: number): string {
  if (textWidth(ctx, text, style, size) <= maxW) return text
  const chars = [...text]
  const cut = (n: number): string => chars.slice(0, n).join('').trimEnd() + '…'
  let lo = 0
  let hi = chars.length
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (textWidth(ctx, cut(mid), style, size) <= maxW) lo = mid
    else hi = mid
  }
  return cut(lo)
}

// Zentriert zeichnen; mit Sperrung zeichenweise (letterSpacing ist nicht überall da).
function drawCentered(
  ctx: Ctx,
  text: string,
  x: number,
  baseline: number,
  style: TextStyle,
  size: number
): void {
  if (!text) return
  ctx.textBaseline = 'alphabetic'
  if (!style.tracking) {
    ctx.font = font(style.weight, size)
    ctx.textAlign = 'center'
    ctx.fillText(text, x, baseline)
    return
  }
  let cur = x - textWidth(ctx, text, style, size) / 2
  ctx.textAlign = 'left'
  for (const c of text) {
    ctx.fillText(c, cur, baseline)
    cur += ctx.measureText(c).width + style.tracking * size
  }
}

// Eingaben begrenzen: mehr passt ohnehin nicht ins Feld (schützt die Messschleifen).
function clampText(text: string | undefined): string {
  return [...(text ?? '').trim()].slice(0, 120).join('')
}

// Mottulbox-Logo (Linien gefüllt + Kontur, Kopffläche offen) mittig bei (x, y) – mit
// denselben Strich-Regeln wie die SVG-Komponente, damit es dem Startbildschirm gleicht.
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

/**
 * Zeichnet das Mapping-Testbild. `timeMs` = Wanduhr (Date.now()) für die live
 * laufende Uhrzeit; 0 (Export/Standbild) nimmt die aktuelle Zeit. `nominal` ist
 * die angezeigte Auflösung (Vorschau zeichnet verkleinert, zeigt aber die Zielgröße).
 */
export function drawMappingCard(
  ctx: Ctx,
  cfg: PatternConfig,
  timeMs: number,
  nominal: { width: number; height: number }
): void {
  const { width: w, height: h } = cfg
  const { s, cx, cy, bigX, bigY } = mappingLayout(w, h)
  const accent = cfg.mappingAccent || MAPPING_DEFAULT_ACCENT
  const background = cfg.mappingBackground || MAPPING_DEFAULT_BACKGROUND
  const title = clampText(cfg.mappingTitle ?? DEFAULT_PATTERN_CONFIG.mappingTitle)
  const lw = Math.max(1, Math.round(s / 40)) // Feinlinien (2 px bei 1080p)
  const strip = s / 4

  // 1) Grundfläche
  ctx.fillStyle = background
  ctx.fillRect(0, 0, w, h)

  // 2) Randstreifen: Hell/Dunkel-Blöcke im Feinraster, Ecken (2s) frei. Oben/links
  //    sind gerade Blöcke dunkel, unten/rechts gegenphasig.
  for (const [y, darkEven] of [
    [0, true],
    [h - strip, false]
  ] as const) {
    for (const b of stripBlocks(cx, s, 2 * s, w - 2 * s, darkEven)) {
      ctx.fillStyle = b.dark ? STRIP_DARK : STRIP_LIGHT
      ctx.fillRect(b.a, y, b.b - b.a, strip)
    }
  }
  for (const [x, darkEven] of [
    [0, true],
    [w - strip, false]
  ] as const) {
    for (const b of stripBlocks(cy, s, 2 * s, h - 2 * s, darkEven)) {
      ctx.fillStyle = b.dark ? STRIP_DARK : STRIP_LIGHT
      ctx.fillRect(x, b.a, strip, b.b - b.a)
    }
  }

  // 3) Eckkreise um die Fadenkreuz-Punkte (2s vom Rand)
  const marks: [number, number][] = [
    [2 * s, 2 * s],
    [w - 2 * s, 2 * s],
    [2 * s, h - 2 * s],
    [w - 2 * s, h - 2 * s]
  ]
  ctx.strokeStyle = SHADE
  for (const [x, y] of marks) {
    ring(ctx, x, y, 1.75 * s, 0.2 * s)
    ring(ctx, x, y, 2 * s, lw)
    ring(ctx, x, y, s / 3, s / 14)
  }

  // 4) Halo (halbtransparenter Akzentring um die Scheibe)
  ctx.save()
  ctx.globalAlpha = 0.25
  ctx.strokeStyle = accent
  ring(ctx, cx, cy, 5.2 * s, 0.4 * s)
  ctx.restore()

  // 5) Eckfelder (L-Form aus drei Zellen)
  ctx.fillStyle = accent
  for (const [ox, oy, dx, dy] of [
    [0, 0, 1, 1],
    [w, 0, -1, 1],
    [0, h, 1, -1],
    [w, h, -1, -1]
  ]) {
    const rect = (x0: number, y0: number, x1: number, y1: number): void =>
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
    rect(ox, oy, ox + dx * 2 * s, oy + dy * s)
    rect(ox, oy + dy * s, ox + dx * s, oy + dy * 2 * s)
  }

  // 6) Feinraster (Zelle s, mittig verankert; keine Linie direkt auf dem Bildrand).
  //    Senkrechte und waagerechte Linien getrennt -> Kreuzungen heller, wie im Original.
  ctx.fillStyle = FINE
  for (let x = cx - Math.floor((cx - 0.5) / s) * s; x < w - 0.5; x += s) {
    ctx.fillRect(crisp(x, lw) - lw / 2, 0, lw, h)
  }
  for (let y = cy - Math.floor((cy - 0.5) / s) * s; y < h - 0.5; y += s) {
    ctx.fillRect(0, crisp(y, lw) - lw / 2, w, lw)
  }

  // 7) Fadenkreuze
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = lw
  ctx.beginPath()
  for (const [x, y] of marks) {
    const px = crisp(x, lw)
    const py = crisp(y, lw)
    ctx.moveTo(px - s / 2, py)
    ctx.lineTo(px + s / 2, py)
    ctx.moveTo(px, py - s / 2)
    ctx.lineTo(px, py + s / 2)
  }
  ctx.stroke()

  // 8) Hauptraster (Zelle 2s) in Akzentfarbe
  const bw = Math.max(2, Math.round(s / 10))
  const x0 = cx - bigX * 2 * s
  const x1 = cx + bigX * 2 * s
  const y0 = cy - bigY * 2 * s
  const y1 = cy + bigY * 2 * s
  ctx.fillStyle = accent
  for (let i = -bigX; i <= bigX; i++) {
    ctx.fillRect(crisp(cx + i * 2 * s, bw) - bw / 2, y0 - bw / 2, bw, y1 - y0 + bw)
  }
  for (let j = -bigY; j <= bigY; j++) {
    ctx.fillRect(x0 - bw / 2, crisp(cy + j * 2 * s, bw) - bw / 2, x1 - x0 + bw, bw)
  }

  // 9) Zentrale Scheibe: schwarzer Ring (4s..4.8s) + Innenfläche
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.arc(cx, cy, 4.8 * s, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, 4 * s, 0, Math.PI * 2)
  ctx.clip()
  const inL = cx - 4 * s // linke Kante des Innenbereichs
  const inW = 8 * s

  // Grauverlauf oben + Hilfskreis (r 2.5s)
  const grad = ctx.createLinearGradient(0, cy - 4 * s, 0, cy - 1.5 * s)
  grad.addColorStop(0, '#d1d1d1')
  grad.addColorStop(1, '#000000')
  ctx.fillStyle = grad
  ctx.fillRect(inL, cy - 4 * s, inW, 2.5 * s)
  ctx.strokeStyle = '#ffffff'
  ring(ctx, cx, cy, 2.5 * s, lw)

  // Kamm (Schärfe/Auflösung): 7 weiße Zähne auf 13 gleichen Teilen über 3s
  ctx.fillStyle = '#ffffff'
  const tooth = (3 * s) / 13
  for (let k = 0; k < 13; k += 2) {
    ctx.fillRect(cx - 1.5 * s + k * tooth, cy - 1.5 * s - s / 3, tooth, s / 3)
  }

  // Farbbalken (100 %): links Weiß, rechts Schwarz
  const barRow = cy - 1.5 * s
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(inL, barRow, 0.5 * s, s)
  ;[...BARS, BARS[0]].forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(cx - 3.5 * s + i * s, barRow, s, s)
  })
  ctx.fillStyle = '#000000'
  ctx.fillRect(cx + 3.5 * s, barRow, 0.5 * s, s)

  // Textband (schwarz, volle Breite)
  ctx.fillRect(inL, cy - 0.5 * s, inW, s)

  // Graustufen (12,5 % .. 87,5 %): links Schwarz, rechts Weiß
  const grayRow = cy + 0.5 * s
  ctx.fillRect(inL, grayRow, 0.5 * s, s)
  GRAYS.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(cx - 3.5 * s + i * s, grayRow, s, s)
  })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(cx + 3.5 * s, grayRow, 0.5 * s, s)

  // Spektrum: Farbton über 8s, oben abgedunkelt, unten aufgehellt
  const specTop = cy + 1.5 * s
  const specH = 1.5 * s
  const hue = ctx.createLinearGradient(inL, 0, inL + inW, 0)
  for (let i = 0; i <= 6; i++) hue.addColorStop(i / 6, `hsl(${i * 60}, 100%, 50%)`)
  ctx.fillStyle = hue
  ctx.fillRect(inL, specTop, inW, specH)
  const shade = ctx.createLinearGradient(0, specTop, 0, specTop + specH)
  shade.addColorStop(0, 'rgba(0,0,0,0.82)')
  shade.addColorStop(0.463, 'rgba(0,0,0,0)')
  ctx.fillStyle = shade
  ctx.fillRect(inL, specTop, inW, specH)
  const light = ctx.createLinearGradient(0, specTop, 0, specTop + specH)
  light.addColorStop(0.463, 'rgba(255,255,255,0)')
  light.addColorStop(1, 'rgba(255,255,255,0.83)')
  ctx.fillStyle = light
  ctx.fillRect(inL, specTop, inW, specH)

  // Frequenzgitter (Tastverhältnis 1/7..7/7 je 0.2s-Zelle), rechts gespiegelt
  ctx.fillStyle = '#ffffff'
  const cell = 0.2 * s
  for (let k = 0; k < 7; k++) {
    const left = ((k + 1) / 7) * cell
    ctx.fillRect(cx - 1.8 * s + k * cell, specTop, left, s / 2)
    const right = ((7 - k) / 7) * cell
    ctx.fillRect(cx + 0.4 * s + (k + 1) * cell - right, specTop, right, s / 2)
  }

  // kleine Farbbalken unten
  BARS.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(cx - 2 * s + (i * 2 * s) / 3, cy + 3 * s - s / 3, (2 * s) / 3, s / 3)
  })
  ctx.restore()

  // Mittellinien: oben bis zum Kamm, unten ab den Farbbalken, waagerecht im Ring
  const mx = crisp(cx, lw)
  const my = crisp(cy, lw)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.moveTo(mx, cy - 4.8 * s)
  ctx.lineTo(mx, cy - 1.5 * s)
  ctx.moveTo(mx, cy + 3 * s)
  ctx.lineTo(mx, cy + 4.8 * s)
  ctx.moveTo(cx - 4.8 * s, my)
  ctx.lineTo(cx - 4 * s, my)
  ctx.moveTo(cx + 4 * s, my)
  ctx.lineTo(cx + 4.8 * s, my)
  ctx.stroke()

  // Kreise: dick innen (4s), dünn außen (4.8s)
  ring(ctx, cx, cy, 4 * s, s / 12)
  ring(ctx, cx, cy, 4.8 * s, lw)

  // Texte + Logo im Band. Links: frei wählbarer Text über Auflösung + Uhrzeit, beide
  // Zeilen in EINER Größe (schrumpft gemeinsam, wenn eine Zeile zu breit ist).
  const base = s / 3
  const minSize = 0.6 * base // kleiner wird nicht, zu lange Texte werden gekürzt
  const maxW = 3.1 * s // Abstand zum Ring bzw. zum Logo
  const plain: TextStyle = { weight: 400, tracking: 0 }
  const spaced: TextStyle = { weight: 300, tracking: 0.25 }
  const label = clampText(cfg.label)
  const now = timeMs > 0 ? new Date(timeMs) : new Date()
  const info = `${nominal.width} × ${nominal.height} – ${clockText(now)}`
  const leftX = cx - 2.25 * s
  let size = fitSize(ctx, info, plain, base, maxW)
  if (label) size = Math.min(size, Math.max(minSize, fitSize(ctx, label, plain, base, maxW)))
  const capHalf = (px: number): number => 0.35 * px // halbe Versalhöhe -> Versalien mittig
  ctx.fillStyle = '#ffffff'
  if (label) {
    const text = ellipsize(ctx, label, plain, size, maxW)
    drawCentered(ctx, text, leftX, cy - 0.25 * s + capHalf(size), plain, size)
    drawCentered(ctx, info, leftX, cy + 0.25 * s + capHalf(size), plain, size)
  } else {
    drawCentered(ctx, info, leftX, cy + capHalf(size), plain, size)
  }
  if (title) {
    const tSize = Math.max(minSize, fitSize(ctx, title, spaced, base, maxW))
    const text = ellipsize(ctx, title, spaced, tSize, maxW)
    drawCentered(ctx, text, cx + 2.15 * s, cy + capHalf(tSize), spaced, tSize)
  }
  drawLogo(ctx, cx, cy, 0.55 * s, '#ffffff')
}
