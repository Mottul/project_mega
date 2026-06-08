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
    // Zeitbasis: gemeinsame Wanduhr (Date.now()) statt fensterlokalem performance.now()
    // -> Timecode/Scroll/Farbzyklus sind in Vorschau UND Ausgabe identisch.
    const draw = (): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(window.innerWidth * dpr))
      const h = Math.max(1, Math.round(window.innerHeight * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) drawPattern(ctx, { ...config, width: w, height: h }, Date.now())
    }
    const loop = (): void => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    if (isAnimated(config.pattern)) raf = requestAnimationFrame(loop)
    else draw()
    window.addEventListener('resize', draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', draw)
    }
  }, [config])

  // Vollbild per Escape schließen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void api.patterns.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100vw', height: '100vh' }} />
      <button
        onClick={() => void api.patterns.close()}
        title="Vollbild schließen (Esc)"
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          padding: '6px 10px',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
          color: '#fff',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: 6,
          cursor: 'pointer',
          opacity: 0.15,
          transition: 'opacity 0.15s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.15')}
      >
        ✕ Schließen (Esc)
      </button>
    </div>
  )
}
