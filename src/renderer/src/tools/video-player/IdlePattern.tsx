import { useEffect, useRef } from 'react'
import { DEFAULT_PATTERN_CONFIG, type PatternId } from '@shared/types'
import { drawPattern, isAnimated } from '../test-patterns/patterns'

// Zeichnet ein Testbild als Idle-/Fallback-Anzeige (wenn nichts läuft). Nutzt den
// vorhandenen Pattern-Renderer des Testbildgenerators, in der Pixelauflösung der
// Fläche; animierte Muster laufen per requestAnimationFrame.
export function IdlePattern({ pattern }: { pattern: PatternId }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = (t: number): void => {
      const canvas = ref.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) drawPattern(ctx, { ...DEFAULT_PATTERN_CONFIG, pattern, width: w, height: h }, t)
    }
    const loop = (t: number): void => {
      draw(t)
      raf = requestAnimationFrame(loop)
    }
    if (isAnimated(pattern)) raf = requestAnimationFrame(loop)
    else draw(performance.now())
    const onResize = (): void => draw(performance.now())
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [pattern])
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block', background: '#000' }} />
}
