// Vorderansicht der Wand (Reiter „Ansicht“): Module, 16:9-Nutzfläche mit Rändern, Maße und
// der Aufbau – auf Standfüßen mit einer Person (1,80 m) als Größenvergleich oder an der
// Traverse. Füllt die Fläche, die sie bekommt; gezeichnet wird in Bildschirm-Pixeln, damit
// Beschriftungen bei jeder Wandgröße gleich groß bleiben.

import { useId } from 'react'
import { useElementSize } from '@renderer/lib/useElementSize'
import type { WallMetrics } from './compute'
import { footPositions, frontAreas } from './front'
import type { BuildMode } from './store'

/** Person zum Größenvergleich (mm) und ihr Platz neben der Wand */
const PERSON_H = 1800
const PERSON_W = 450
const PERSON_GAP = 250

/** Ränder für Maßketten und Aufbau (px) */
const PAD = { left: 40, right: 8, top: 10, bottom: 46 }
const FOOT_H = 7
const TRUSS = 18

/** Zahl mit Komma und genau zwei Nachkommastellen (Maße in m) */
const m2 = (n: number): string =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Person({ x, bottom, scale }: { x: number; bottom: number; scale: number }): JSX.Element {
  // Umriss in einem 100 × 400-Raster (1,80 m hoch, 0,45 m breit)
  const k = (PERSON_H * scale) / 400
  return (
    <g
      transform={`translate(${x} ${bottom - 400 * k}) scale(${k})`}
      className="fill-muted-foreground/45"
    >
      <title>Person, 1,80 m – zum Größenvergleich</title>
      <circle cx={50} cy={27} r={22} />
      <rect x={27} y={54} width={46} height={150} rx={16} />
      <rect x={11} y={60} width={13} height={128} rx={6.5} />
      <rect x={76} y={60} width={13} height={128} rx={6.5} />
      <rect x={30} y={186} width={18} height={214} rx={9} />
      <rect x={52} y={186} width={18} height={214} rx={9} />
    </g>
  )
}

export function FrontView({ d, buildMode }: { d: WallMetrics; buildMode: BuildMode }): JSX.Element {
  const [boxRef, box] = useElementSize<HTMLDivElement>()
  const hatchId = useId()
  const stacked = buildMode === 'stacked'
  // Abgewickelt: bei gebogenen Wänden die Fläche, die das Publikum sieht
  const W = d.cols * d.mod.dimW
  const H = d.rows * d.mod.dimH
  const extraW = stacked ? PERSON_GAP + PERSON_W : 0
  const totalH = Math.max(H, stacked ? PERSON_H : 0)
  const top = PAD.top + (stacked ? 0 : TRUSS)
  const bottom = PAD.bottom + (stacked ? FOOT_H : 0)
  const availW = box.width - PAD.left - PAD.right
  const availH = box.height - top - bottom
  const scale = Math.min(availW / (W + extraW), availH / totalH)
  const ok = scale > 0 && Number.isFinite(scale)

  let svg: JSX.Element | null = null
  if (ok) {
    const ww = W * scale
    const wh = H * scale
    const drawingW = ww + extraW * scale
    const ox = PAD.left + (availW - drawingW) / 2
    // senkrecht mittig; die Unterkante der Zeichnung ist der Boden
    const baseY = top + (availH - totalH * scale) / 2 + totalH * scale
    const oy = baseY - wh
    const floorY = baseY + (stacked ? FOOT_H : 0)
    // Sehr kleine Module: nur jede n-te Linie, sonst wird die Fläche grau
    const stepC = Math.max(1, Math.ceil(5 / (d.mod.dimW * scale)))
    const stepR = Math.max(1, Math.ceil(5 / (d.mod.dimH * scale)))
    const areas = frontAreas(d.resX, d.resY, d.fit169)
    const rect = (f: { x: number; y: number; w: number; h: number }) => ({
      x: ox + f.x * ww,
      y: oy + f.y * wh,
      width: f.w * ww,
      height: f.h * wh
    })
    const content = areas.content ? rect(areas.content) : null
    const labelSize = Math.max(12, Math.min(30, (content?.height ?? wh) / 5))
    const feet = stacked ? footPositions(d.baseUnits) : []
    const footW = Math.max(5, Math.min(18, 300 * scale))
    const dimY = floorY + 16

    svg = (
      <svg
        width={box.width}
        height={box.height}
        role="img"
        aria-label={`Vorderansicht: ${d.cols} × ${d.rows} Module, ${d.resX} × ${d.resY} px`}
        className="block"
      >
        <defs>
          <pattern
            id={hatchId}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="10" strokeWidth="3" className="stroke-foreground/10" />
          </pattern>
        </defs>

        {/* Traverse bzw. Boden */}
        {!stacked && (
          <>
            <rect
              x={ox - 12}
              y={oy - TRUSS + 2}
              width={ww + 24}
              height={7}
              rx={1.5}
              className="fill-muted-foreground/50"
            />
            {[0.15, 0.5, 0.85].map((f) => (
              <line
                key={f}
                x1={ox + f * ww}
                x2={ox + f * ww}
                y1={oy - TRUSS + 9}
                y2={oy}
                strokeWidth={1.5}
                className="stroke-muted-foreground/60"
              />
            ))}
          </>
        )}
        {stacked && (
          <line
            x1={Math.max(2, ox - 16)}
            x2={Math.min(box.width - 2, ox + drawingW + 16)}
            y1={floorY + 0.5}
            y2={floorY + 0.5}
            strokeWidth={1}
            className="stroke-muted-foreground/60"
          />
        )}
        {feet.map((f) => (
          <rect
            key={f}
            x={ox + f * ww - footW / 2}
            y={baseY}
            width={footW}
            height={FOOT_H}
            rx={1}
            className="fill-muted-foreground/70"
          />
        ))}

        {/* Wand: Fläche, 16:9-Nutzfläche, Ränder */}
        <rect x={ox} y={oy} width={ww} height={wh} className="fill-muted" />
        {areas.bars.map((b, i) => {
          const r = rect(b)
          return (
            <g key={i}>
              <rect {...r} className="fill-background/70" />
              <rect {...r} fill={`url(#${hatchId})`} />
            </g>
          )
        })}
        {content && (
          <rect {...content} className="fill-primary/20 stroke-primary" strokeWidth={2} />
        )}

        {/* Modulraster */}
        <g className="stroke-foreground/15" strokeWidth={1}>
          {Array.from({ length: d.cols - 1 }, (_, i) => i + 1)
            .filter((c) => c % stepC === 0)
            .map((c) => {
              const x = Math.round(ox + (c * ww) / d.cols) + 0.5
              return <line key={`c${c}`} x1={x} x2={x} y1={oy} y2={oy + wh} />
            })}
          {Array.from({ length: d.rows - 1 }, (_, i) => i + 1)
            .filter((r) => r % stepR === 0)
            .map((r) => {
              const y = Math.round(oy + (r * wh) / d.rows) + 0.5
              return <line key={`r${r}`} x1={ox} x2={ox + ww} y1={y} y2={y} />
            })}
        </g>
        <rect
          x={ox + 0.5}
          y={oy + 0.5}
          width={ww - 1}
          height={wh - 1}
          fill="none"
          strokeWidth={1.5}
          className="stroke-foreground/60"
        />

        {/* Beschriftung der Nutzfläche */}
        {content && content.width > 60 && content.height > 30 && (
          <g textAnchor="middle" className="fill-primary font-semibold">
            <text
              x={content.x + content.width / 2}
              y={content.y + content.height / 2}
              dominantBaseline="central"
              style={{ fontSize: labelSize }}
            >
              16:9
            </text>
            {content.height > labelSize * 2.6 && (
              <text
                x={content.x + content.width / 2}
                y={content.y + content.height / 2 + labelSize * 0.95}
                dominantBaseline="hanging"
                className="fill-foreground/80 font-medium"
                style={{ fontSize: Math.max(11, labelSize * 0.42) }}
              >
                {areas.exact
                  ? 'passt exakt'
                  : `${d.fit169?.cw ?? d.resX} × ${d.fit169?.ch ?? d.resY} px`}
              </text>
            )}
          </g>
        )}
        {areas.bars.map((b, i) => {
          const r = rect(b)
          const label = `${d.fit169?.barPx ?? 0} px`
          const fits = d.fit169?.side === 'lr' ? r.width >= 44 : r.height >= 16
          return fits ? (
            <text
              key={`t${i}`}
              x={r.x + r.width / 2}
              y={r.y + r.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-[11px]"
            >
              {label}
            </text>
          ) : null
        })}

        {/* Maßketten: Breite unten, Höhe links */}
        <g className="stroke-muted-foreground" strokeWidth={1}>
          <line x1={ox} x2={ox + ww} y1={dimY} y2={dimY} />
          <line x1={ox} x2={ox} y1={dimY - 4} y2={dimY + 4} />
          <line x1={ox + ww} x2={ox + ww} y1={dimY - 4} y2={dimY + 4} />
          <line x1={ox - 16} x2={ox - 16} y1={oy} y2={oy + wh} />
          <line x1={ox - 20} x2={ox - 12} y1={oy} y2={oy} />
          <line x1={ox - 20} x2={ox - 12} y1={oy + wh} y2={oy + wh} />
        </g>
        <text
          x={ox + ww / 2}
          y={dimY + 15}
          textAnchor="middle"
          className="fill-foreground text-xs font-medium"
        >
          {m2(W / 1000)} m{d.curve ? ' abgewickelt' : ''} · {d.resX} px
        </text>
        <text
          x={ox - 22}
          y={oy + wh / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${ox - 22} ${oy + wh / 2})`}
          className="fill-foreground text-xs font-medium"
        >
          {m2(H / 1000)} m · {d.resY} px
        </text>

        {stacked && <Person x={ox + ww + PERSON_GAP * scale} bottom={floorY} scale={scale} />}
      </svg>
    )
  }

  return (
    <div ref={boxRef} className="h-full min-h-[12rem] w-full overflow-hidden">
      {svg}
    </div>
  )
}

/** Eine Zeile zur 16:9-Einpassung (Kopf der Ansicht) */
export function fitText(d: WallMetrics): string {
  const f = d.fit169
  if (!f) return ''
  if (f.match) return '16:9 passt exakt'
  return `16:9: ${f.cw} × ${f.ch} px · ${f.barPx} px Rand ${f.side === 'lr' ? 'links/rechts' : 'oben/unten'}`
}
