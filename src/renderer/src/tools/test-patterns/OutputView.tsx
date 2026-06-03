import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { PatternConfig } from '@shared/types'
import { drawPattern, isAnimated } from './patterns'

// Inhalt des rahmenlosen Vollbild-Ausgabefensters (#/output). Rendert das Testbild
// in der NATIVEN Pixelauflösung des Monitors. Animierte Muster (Farbzyklus etc.)
// laufen in einer requestAnimationFrame-Schleife -> live am Beamer/an der Wand.
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
    if (!config) return
    let raf = 0
    const draw = (t: number): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(window.innerWidth * dpr))
      const h = Math.max(1, Math.round(window.innerHeight * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) drawPattern(ctx, { ...config, width: w, height: h }, t)
    }
    const loop = (t: number): void => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    const onResize = (): void => draw(performance.now())
    if (isAnimated(config.pattern)) raf = requestAnimationFrame(loop)
    else draw(performance.now())
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [config])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100vw', height: '100vh', background: '#000' }}
    />
  )
}
