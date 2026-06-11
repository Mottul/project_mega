// Draufsicht (von oben) als SVG-Markup-STRING – damit App-Vorschau und PDF-Export
// pixelgenau dieselbe Grafik zeigen. Module als Polygone (gebogen gold, gerade
// türkis, Winkel je Modul); optional Sehne + Stichhöhe als Maßlinien.
// Beschriftungen werden in Ziel-PIXELN gewählt (über das skalierte svg-Maß
// zurückgerechnet) -> auf jeder Wandgröße gut lesbar.

import { computeModuleShapes, measureArc, type Pt } from './math'

const GOLD = '#eab308'
const TEAL = '#14b8a6'
const RED = '#ef4444'
const VIOLET = '#8b5cf6'

export interface TopDownOptions {
  showChord?: boolean
  chordHorizontal?: boolean
  chordLabel?: number | null
  sagLabel?: number | null
  maxPx?: number // max. Renderbreite in px (Vorschau ~620, PDF kleiner)
  audienceLabel?: boolean
}

function esc(n: number): string {
  return (Math.round(n * 1000) / 1000).toString()
}

export function topDownMarkup(angles: number[], opts: TopDownOptions = {}): string {
  if (!angles.length) return ''
  const shapes = computeModuleShapes(angles)
  const measured = measureArc(shapes)

  const rot = opts.chordHorizontal ? -measured.chordAngle : 0
  const tx = (p: Pt): Pt => {
    const x = p.x - measured.first.x
    const y = p.y - measured.first.y
    return { x: x * Math.cos(rot) - y * Math.sin(rot), y: x * Math.sin(rot) + y * Math.cos(rot) }
  }
  const tShapes = shapes.map((s) => ({
    frontPts: s.frontPts.map(tx),
    backPts: s.backPts.map(tx),
    angle: s.angle,
    c: tx({ x: s.cx, y: s.cy })
  }))

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const s of tShapes) {
    for (const p of [...s.frontPts, ...s.backPts]) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
  }
  const pad = 0.3
  minX -= pad
  minY -= pad * 1.6
  maxX += pad
  maxY += pad * 1.8
  const w = maxX - minX
  const h = maxY - minY

  // svg-Renderbreite -> Umrechnung „SVG-Einheit (m) je Bildschirm-px".
  const maxPx = opts.maxPx ?? 620
  const svgW = Math.min(maxPx, Math.max(280, w * 110))
  const mPerPx = w / svgW
  const sw = 1.4 * mPerPx // Modulkontur ~1,4 px
  const labelFs = 13 * mPerPx // Winkel/Maße ~13 px
  const dimFs = 14 * mPerPx

  const parts: string[] = []
  for (const s of tShapes) {
    const isCurved = Math.abs(s.angle) > 0
    const d =
      `M ${esc(s.frontPts[0].x)} ${esc(s.frontPts[0].y)}` +
      s.frontPts.slice(1).map((p) => ` L ${esc(p.x)} ${esc(p.y)}`).join('') +
      [...s.backPts].reverse().map((p) => ` L ${esc(p.x)} ${esc(p.y)}`).join('') +
      ' Z'
    parts.push(
      `<path d="${d}" fill="${isCurved ? 'rgba(234,179,8,0.16)' : 'rgba(20,184,166,0.12)'}" stroke="${isCurved ? GOLD : TEAL}" stroke-width="${esc(sw)}" stroke-linejoin="round"/>`
    )
    if (isCurved) {
      parts.push(
        `<text x="${esc(s.c.x)}" y="${esc(s.c.y)}" text-anchor="middle" dominant-baseline="central" fill="${GOLD}" font-size="${esc(labelFs)}" font-weight="700" font-family="system-ui">${Math.abs(s.angle)}°</text>`
      )
    }
  }

  const first = tShapes[0].frontPts[0]
  const lastShape = tShapes[tShapes.length - 1]
  const last = lastShape.frontPts[lastShape.frontPts.length - 1]

  if (opts.showChord) {
    parts.push(
      `<line x1="${esc(first.x)}" y1="${esc(first.y)}" x2="${esc(last.x)}" y2="${esc(last.y)}" stroke="${RED}" stroke-width="${esc(2 * mPerPx)}" stroke-dasharray="${esc(w / 60)} ${esc(w / 90)}"/>`
    )
    if (opts.chordLabel != null) {
      parts.push(
        `<text x="${esc((first.x + last.x) / 2)}" y="${esc(Math.max(first.y, last.y) + dimFs * 1.3)}" text-anchor="middle" fill="${RED}" font-size="${esc(dimFs)}" font-weight="600" font-family="system-ui">Sehne: ${opts.chordLabel.toFixed(3)} m</text>`
      )
    }
    if (opts.sagLabel != null) {
      let sagPt = first
      let maxDev = 0
      for (const s of tShapes) {
        for (const p of s.frontPts) {
          const dev = Math.abs(p.y - first.y)
          if (dev > maxDev) {
            maxDev = dev
            sagPt = p
          }
        }
      }
      parts.push(
        `<line x1="${esc(sagPt.x)}" y1="${esc(first.y)}" x2="${esc(sagPt.x)}" y2="${esc(sagPt.y)}" stroke="${VIOLET}" stroke-width="${esc(1.6 * mPerPx)}" stroke-dasharray="${esc(w / 80)} ${esc(w / 120)}"/>` +
          `<text x="${esc(sagPt.x + dimFs * 0.4)}" y="${esc((first.y + sagPt.y) / 2)}" fill="${VIOLET}" font-size="${esc(dimFs)}" font-weight="600" font-family="system-ui">h: ${opts.sagLabel.toFixed(3)} m</text>`
      )
    }
  }

  if (opts.audienceLabel !== false && !opts.chordHorizontal) {
    parts.push(
      `<text x="${esc((minX + maxX) / 2)}" y="${esc(maxY - pad / 3)}" text-anchor="middle" fill="#8a8a99" font-size="${esc(dimFs)}" font-family="system-ui">↓ Publikum</text>`
    )
  }

  return `<svg viewBox="${esc(minX)} ${esc(minY)} ${esc(w)} ${esc(h)}" style="width:100%;max-width:${Math.round(svgW)}px;display:block" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
}
