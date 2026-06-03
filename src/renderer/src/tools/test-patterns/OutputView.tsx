import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { PatternConfig } from '@shared/types'
import { drawPattern } from './patterns'

// Inhalt des rahmenlosen Vollbild-Ausgabefensters (#/output). Rendert das
// Testbild in der NATIVEN Pixelauflösung des Monitors (Bounds x devicePixelRatio)
// -> pixelgenau (ein 1-px-Gitter ist echt 1 px auf der Wand/dem Beamer).
export function OutputView(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [config, setConfig] = useState<PatternConfig | null>(null)

  useEffect(() => {
    void api.patterns.current().then((c) => {
      if (c) setConfig(c)
    })
    return api.patterns.onRender((c) => setConfig(c))
  }, [])

  useEffect(() => {
    const draw = (): void => {
      const canvas = canvasRef.current
      if (!canvas || !config) return
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(window.innerWidth * dpr))
      const h = Math.max(1, Math.round(window.innerHeight * dpr))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) drawPattern(ctx, { ...config, width: w, height: h })
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [config])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh', background: '#000' }}
    />
  )
}
