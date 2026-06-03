// Reine Canvas-Zeichenfunktionen fuer die Testbilder. Werden identisch von der
// Vorschau, dem Vollbild-Ausgabefenster und dem Export genutzt -> EINE Quelle.
// Annahme: das Canvas ist bereits auf config.width x config.height gesetzt.

import type { PatternConfig, PatternId, SolidColor } from '@shared/types'

type Ctx = CanvasRenderingContext2D

export const PATTERN_OPTIONS: { value: PatternId; label: string }[] = [
  { value: 'grid', label: 'Gitter / Kreuzraster' },
  { value: 'checkerboard', label: 'Schachbrett' },
  { value: 'geometry', label: 'Geometrie (Kreise/Diagonalen)' },
  { value: 'frame-info', label: 'Rahmen + Info' },
  { value: 'bars-smpte', label: 'Farbbalken SMPTE (75%)' },
  { value: 'bars-ebu', label: 'Farbbalken EBU (100%)' },
  { value: 'grayscale-steps', label: 'Graustufen-Treppe' },
  { value: 'grayscale-ramp', label: 'Graustufen-Verlauf' },
  { value: 'solid', label: 'Vollfarbe (Pixelfehler/Uniformität)' }
]

export const SOLID_OPTIONS: { value: SolidColor; label: string }[] = [
  { value: 'white', label: 'Weiß' },
  { value: 'black', label: 'Schwarz' },
  { value: 'red', label: 'Rot' },
  { value: 'green', label: 'Grün' },
  { value: 'blue', label: 'Blau' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'magenta', label: 'Magenta' },
  { value: 'yellow', label: 'Gelb' },
  { value: 'gray18', label: 'Grau 18%' },
  { value: 'gray50', label: 'Grau 50%' }
]

const SOLID_HEX: Record<SolidColor, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#00ff00',
  blue: '#0000ff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  gray18: '#2e2e2e',
  gray50: '#808080'
}

// Farbbalken (von links): Weiß, Gelb, Cyan, Grün, Magenta, Rot, Blau
const BARS_75 = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0']
const BARS_EBU = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000']

function fill(ctx: Ctx, w: number, h: number, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
}

function drawVerticalBars(ctx: Ctx, w: number, h: number, colors: string[]): void {
  const bw = w / colors.length
  colors.forEach((c, i) => {
    ctx.fillStyle = c
    // letzte Spalte bis zum Rand fuellen (Rundungsreste vermeiden)
    const x = Math.round(i * bw)
    const x2 = i === colors.length - 1 ? w : Math.round((i + 1) * bw)
    ctx.fillRect(x, 0, x2 - x, h)
  })
}

function drawGrayscaleSteps(ctx: Ctx, w: number, h: number, steps = 11): void {
  const bw = w / steps
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    const x = Math.round(i * bw)
    const x2 = i === steps - 1 ? w : Math.round((i + 1) * bw)
    ctx.fillRect(x, 0, x2 - x, h)
  }
}

function drawGrayscaleRamp(ctx: Ctx, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, 0, w, 0)
  grad.addColorStop(0, '#000000')
  grad.addColorStop(1, '#ffffff')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// Kleinste ganzzahlige Modul-Aufteilung aus dem Seitenverhaeltnis (z.B. 1920x1080
// -> 16x9). Bei "krummen" Auflösungen (grosse teilerfremde Anteile) auf ~16 Spalten
// ausweichen, Zeilen moeglichst quadratisch.
export function moduleCells(w: number, h: number): { x: number; y: number } {
  const g = gcd(Math.round(w), Math.round(h)) || 1
  let x = Math.round(w) / g
  let y = Math.round(h) / g
  if (x > 64 || y > 64) {
    x = 16
    y = Math.max(1, Math.round((16 * h) / w))
  }
  return { x, y }
}

// Aeusserste 1px-Pixelreihe als weisser Rahmen.
function drawEdgeFrame(ctx: Ctx, w: number, h: number): void {
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)
}

// Modul-Gitter: Zellanzahl aus dem Seitenverhaeltnis x Skalierungsfaktor; 2px-Linien;
// 1px-Rahmen aussen. Klare Abgrenzung von LED-Wall-Modulen.
function drawGridModules(ctx: Ctx, cfg: PatternConfig): void {
  const { width: w, height: h } = cfg
  fill(ctx, w, h, '#000000')
  const base = moduleCells(w, h)
  const mult = Math.max(1, Math.round(cfg.gridScale))
  const nx = base.x * mult
  const ny = base.y * mult
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 1; i < nx; i++) {
    const x = Math.round((i * w) / nx)
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, h)
  }
  for (let j = 1; j < ny; j++) {
    const y = Math.round((j * h) / ny)
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
  }
  ctx.stroke()
  drawEdgeFrame(ctx, w, h)
}

function drawCheckerboard(ctx: Ctx, w: number, h: number, cell: number): void {
  fill(ctx, w, h, '#000000')
  ctx.fillStyle = '#ffffff'
  const s = Math.max(1, cell)
  for (let y = 0, ry = 0; y < h; y += s, ry++) {
    for (let x = 0, rx = 0; x < w; x += s, rx++) {
      if ((rx + ry) % 2 === 0) ctx.fillRect(x, y, Math.min(s, w - x), Math.min(s, h - y))
    }
  }
}

function drawGeometry(ctx: Ctx, w: number, h: number): void {
  fill(ctx, w, h, '#000000')
  const stroke = Math.max(1, Math.round(Math.min(w, h) / 600))
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = stroke
  const cx = w / 2
  const cy = h / 2
  // Diagonalen
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, h)
  ctx.moveTo(w, 0)
  ctx.lineTo(0, h)
  ctx.stroke()
  // konzentrische Kreise
  const maxR = Math.min(w, h) / 2
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy, (maxR * i) / 4, 0, Math.PI * 2)
    ctx.stroke()
  }
  // grosse Ellipse, die die Raender beruehrt (Seitenverhältnis/Verzeichnung)
  ctx.strokeStyle = '#ffd000'
  ctx.beginPath()
  ctx.ellipse(cx, cy, w / 2 - ctx.lineWidth, h / 2 - ctx.lineWidth, 0, 0, Math.PI * 2)
  ctx.stroke()
  // Eck-Doppelkreise: grosser Kreis fuellt das Modul-Quadrat, kleiner = halber Durchmesser
  const base = moduleCells(w, h)
  const cell = Math.min(w / base.x, h / base.y)
  const c = cell / 2
  const centers: [number, number][] = [
    [c, c],
    [w - c, c],
    [c, h - c],
    [w - c, h - c]
  ]
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = stroke
  for (const [ecx, ecy] of centers) {
    ctx.beginPath()
    ctx.arc(ecx, ecy, cell / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(ecx, ecy, cell / 4, 0, Math.PI * 2)
    ctx.stroke()
  }
  // Mittelkreuz
  ctx.strokeStyle = '#ff3030'
  ctx.lineWidth = stroke
  ctx.beginPath()
  ctx.moveTo(cx, 0)
  ctx.lineTo(cx, h)
  ctx.moveTo(0, cy)
  ctx.lineTo(w, cy)
  ctx.stroke()
  // aeusserste 1px-Reihe als weisser Rahmen
  drawEdgeFrame(ctx, w, h)
}

function drawCornerMarks(ctx: Ctx, w: number, h: number, inset: number, len: number): void {
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(1, Math.round(Math.min(w, h) / 500))
  const corners: [number, number, number, number][] = [
    [inset, inset, 1, 1],
    [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1],
    [w - inset, h - inset, -1, -1]
  ]
  ctx.beginPath()
  for (const [x, y, dx, dy] of corners) {
    ctx.moveTo(x, y)
    ctx.lineTo(x + dx * len, y)
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + dy * len)
  }
  ctx.stroke()
}

function drawFrameInfo(ctx: Ctx, cfg: PatternConfig): void {
  const { width: w, height: h } = cfg
  fill(ctx, w, h, '#000000')
  // Aussenrahmen (1px-genau am Rand)
  ctx.strokeStyle = '#ffffff'
  const bw = Math.max(2, Math.round(Math.min(w, h) / 400))
  ctx.lineWidth = bw
  ctx.strokeRect(bw / 2, bw / 2, w - bw, h - bw)
  // Safe-Area ~5%
  ctx.strokeStyle = '#ffd000'
  ctx.setLineDash([12, 10])
  ctx.lineWidth = Math.max(1, Math.round(bw / 2))
  ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9)
  ctx.setLineDash([])
  // Eckmarken + Mittelkreuz
  drawCornerMarks(ctx, w, h, Math.round(Math.min(w, h) * 0.03), Math.round(Math.min(w, h) * 0.06))
  ctx.strokeStyle = '#ff3030'
  ctx.beginPath()
  ctx.moveTo(w / 2, 0)
  ctx.lineTo(w / 2, h)
  ctx.moveTo(0, h / 2)
  ctx.lineTo(w, h / 2)
  ctx.stroke()
}

function drawInfoLabel(ctx: Ctx, cfg: PatternConfig): void {
  const { width: w, height: h } = cfg
  const text = [cfg.label.trim(), `${w} × ${h}`].filter(Boolean).join('   ·   ')
  const fontPx = Math.max(14, Math.round(h * 0.035))
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const padX = fontPx * 0.6
  const padY = fontPx * 0.4
  const tw = ctx.measureText(text).width
  const boxW = tw + padX * 2
  const boxH = fontPx + padY * 2
  const x = w / 2
  const y = h - boxH / 2 - h * 0.04
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(x - boxW / 2, y - boxH / 2, boxW, boxH)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1
  ctx.strokeRect(x - boxW / 2, y - boxH / 2, boxW, boxH)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x, y)
}

/** Zeichnet das gewaehlte Testbild in den (auf width x height gesetzten) Kontext. */
export function drawPattern(ctx: Ctx, cfg: PatternConfig): void {
  const { width: w, height: h, pattern } = cfg
  ctx.clearRect(0, 0, w, h)
  switch (pattern) {
    case 'solid':
      fill(ctx, w, h, SOLID_HEX[cfg.solid])
      return // bewusst ohne Info-Label (Pixelfehler-Test)
    case 'bars-smpte':
      drawVerticalBars(ctx, w, h, BARS_75)
      break
    case 'bars-ebu':
      drawVerticalBars(ctx, w, h, BARS_EBU)
      break
    case 'grayscale-steps':
      drawGrayscaleSteps(ctx, w, h)
      break
    case 'grayscale-ramp':
      drawGrayscaleRamp(ctx, w, h)
      break
    case 'grid':
      drawGridModules(ctx, cfg)
      break
    case 'checkerboard':
      drawCheckerboard(ctx, w, h, cfg.gridSpacing)
      break
    case 'geometry':
      drawGeometry(ctx, w, h)
      break
    case 'frame-info':
      drawFrameInfo(ctx, cfg)
      break
  }
  if (cfg.showInfo) drawInfoLabel(ctx, cfg)
}

/** Rendert ein Pattern in ein neues Offscreen-Canvas in voller Zielauflösung. */
export function renderToCanvas(cfg: PatternConfig): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = cfg.width
  canvas.height = cfg.height
  const ctx = canvas.getContext('2d')
  if (ctx) drawPattern(ctx, cfg)
  return canvas
}
