import { useEffect, useRef } from 'react'
import type { PatternConfig } from '@shared/types'
import { drawPattern } from './patterns'

const MAX_PREVIEW = 1600 // groesse Kante des Vorschau-Canvas begrenzen

// Skalierte, aber massstabsgetreue Vorschau (gridSpacing/lineWidth mitskaliert),
// damit ein 4K-Testbild nicht ein 33-MP-Canvas pro Tastendruck erzeugt.
export function PatternPreview({ config }: { config: PatternConfig }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = Math.min(1, MAX_PREVIEW / config.width, MAX_PREVIEW / config.height)
    const pw = Math.max(1, Math.round(config.width * s))
    const ph = Math.max(1, Math.round(config.height * s))
    canvas.width = pw
    canvas.height = ph
    const ctx = canvas.getContext('2d')
    if (ctx) {
      drawPattern(ctx, {
        ...config,
        width: pw,
        height: ph,
        gridSpacing: Math.max(2, config.gridSpacing * s),
        lineWidth: Math.max(1, config.lineWidth * s)
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
