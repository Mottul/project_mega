// Draufsicht (von oben) auf gebogene uS2+-Reihen: Module als gefüllte Polygone,
// gebogene gold, gerade türkis, Winkel-Beschriftung je Modul; optional Sehne und
// Stichhöhe als Maßlinien. Reiner SVG-Renderer ohne Zustand.

import { computeModuleShapes, measureArc, type Pt } from './math'

const GOLD = '#eab308'
const TEAL = '#14b8a6'
const RED = '#ef4444'
const VIOLET = '#8b5cf6'

interface Props {
  angles: number[]
  showChord?: boolean
  chordHorizontal?: boolean
  chordLabel?: number | null
  sagLabel?: number | null
}

export function TopDownSvg({ angles, showChord, chordHorizontal, chordLabel, sagLabel }: Props): JSX.Element {
  if (!angles.length) {
    return <p className="text-xs text-muted-foreground">Keine Module definiert.</p>
  }
  const shapes = computeModuleShapes(angles)
  const measured = measureArc(shapes)

  // Bei Sehnen-Darstellung alles so drehen, dass die Sehne horizontal liegt.
  const rot = chordHorizontal ? -measured.chordAngle : 0
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
  const pad = 0.25
  minX -= pad
  minY -= pad * 1.5
  maxX += pad
  maxY += pad * 1.5
  const w = maxX - minX
  const h = maxY - minY
  const sw = Math.max(0.005, w / 400)
  const fs = Math.max(0.04, w / 180)

  const first = tShapes[0].frontPts[0]
  const lastShape = tShapes[tShapes.length - 1]
  const last = lastShape.frontPts[lastShape.frontPts.length - 1]
  // Punkt der maximalen Abweichung von der Sehne (für die Stichhöhen-Maßlinie)
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

  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      style={{ width: '100%', maxWidth: Math.min(620, Math.max(280, w * 110)), display: 'block' }}
    >
      {tShapes.map((s, i) => {
        const isCurved = Math.abs(s.angle) > 0
        const d =
          `M ${s.frontPts[0].x} ${s.frontPts[0].y}` +
          s.frontPts.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('') +
          [...s.backPts].reverse().map((p) => ` L ${p.x} ${p.y}`).join('') +
          ' Z'
        return (
          <g key={i}>
            <path
              d={d}
              fill={isCurved ? 'rgba(234,179,8,0.16)' : 'rgba(20,184,166,0.12)'}
              stroke={isCurved ? GOLD : TEAL}
              strokeWidth={sw}
              strokeLinejoin="round"
            />
            {isCurved && (
              <text
                x={s.c.x}
                y={s.c.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={GOLD}
                fontSize={fs}
                fontWeight={700}
                fontFamily="system-ui"
              >
                {Math.abs(s.angle)}°
              </text>
            )}
          </g>
        )
      })}

      {showChord && (
        <>
          <line
            x1={first.x}
            y1={first.y}
            x2={last.x}
            y2={last.y}
            stroke={RED}
            strokeWidth={Math.max(0.008, w / 300)}
            strokeDasharray={`${w / 60} ${w / 90}`}
          />
          {chordLabel != null && (
            <text
              x={(first.x + last.x) / 2}
              y={Math.max(first.y, last.y) + 0.12}
              textAnchor="middle"
              fill={RED}
              fontSize={Math.max(0.045, w / 160)}
              fontWeight={600}
              fontFamily="system-ui"
            >
              Sehne: {chordLabel.toFixed(3)} m
            </text>
          )}
          {sagLabel != null && (
            <>
              <line
                x1={sagPt.x}
                y1={first.y}
                x2={sagPt.x}
                y2={sagPt.y}
                stroke={VIOLET}
                strokeWidth={Math.max(0.006, w / 350)}
                strokeDasharray={`${w / 80} ${w / 120}`}
              />
              <text
                x={sagPt.x + 0.08}
                y={(first.y + sagPt.y) / 2}
                fill={VIOLET}
                fontSize={Math.max(0.04, w / 170)}
                fontWeight={600}
                fontFamily="system-ui"
              >
                h: {sagLabel.toFixed(3)} m
              </text>
            </>
          )}
        </>
      )}

      {!chordHorizontal && (
        <text
          x={(minX + maxX) / 2}
          y={maxY - pad / 3}
          textAnchor="middle"
          fill="#888899"
          fontSize={Math.max(0.04, w / 160)}
          fontFamily="system-ui"
        >
          ↓ Publikum
        </text>
      )}
    </svg>
  )
}
