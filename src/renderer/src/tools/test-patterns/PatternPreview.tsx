import { useEffect, useRef } from 'react'
import type { PatternConfig } from '@shared/types'
import { drawPattern, moduleCells } from './patterns'

const MAX_PREVIEW = 1600 // groesse Kante des Vorschau-Canvas begrenzen

// Massstabsgetreue Vorschau. Die Vorschau-Maße sind ein exaktes Vielfaches des
// reduzierten Seitenverhaeltnisses -> die Modul-Zellzahl (Gitter/Geometrie) ist
// identisch zur Ausgabe. gridSpacing (Schachbrett) wird mitskaliert.
export function PatternPreview({ config }: { config: PatternConfig }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const mc = moduleCells(config.width, config.height)
    const k = Math.max(1, Math.floor(Math.min(MAX_PREVIEW / mc.x, MAX_PREVIEW / mc.y)))
    const pw = mc.x * k
    const ph = mc.y * k
    const s = pw / config.width
    canvas.width = pw
    canvas.height = ph
    const ctx = canvas.getContext('2d')
    if (ctx) {
      drawPattern(ctx, {
        ...config,
        width: pw,
        height: ph,
        gridSpacing: Math.max(2, config.gridSpacing * s)
      })
    }
  }, [config])

  return (
    <div className="flex items-center justify-center overflow-hidden rounded-md border border-border bg-black p-2">
      <canvas
        ref={canvasRef}
        className="max-h-[60vh] max-w-full object-contain"
        style={{ aspectRatio: `${config.width} / ${config.height}` }}
      />
    </div>
  )
}
