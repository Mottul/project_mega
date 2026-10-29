import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import { windowTitle } from '@shared/brand'
import type { PatternConfig } from '@shared/types'
import { OutputCloseButton } from '@renderer/components/OutputControl'
import { drawPattern, frameKey, isAnimated } from './patterns'

// Inhalt des Ausgabefensters (#/output). Rendert das Testbild in der NATIVEN Pixelauflösung
// des Monitors (als Fenster: in dessen Größe). Animierte Muster (Farbzyklus etc.)
// laufen in einer requestAnimationFrame-Schleife -> live am Beamer/an der Wand.
export function OutputView(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [config, setConfig] = useState<PatternConfig | null>(null)
  useEffect(() => {
    document.title = windowTitle('Testbild-Ausgabe')
  }, [])

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
    // Nur neu zeichnen, wenn sich das Bild ändert (Mapping-Testbild: sekündlich).
    let lastKey = NaN
    const loop = (): void => {
      const key = frameKey(config.pattern, Date.now())
      if (key !== lastKey) {
        lastKey = key
        draw()
      }
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

  // Esc (zweimal) behandelt der main – ein zweiter Handler hier zählte jeden Druck doppelt
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100vw', height: '100vh' }} />
      <OutputCloseButton onClose={() => void api.patterns.close()} />
    </div>
  )
}
