// Inhalt des rahmenlosen Vollbild-Ausgabefensters (#/timer-output): die reine
// Bühnen-Anzeige, gespeist vom autoritativen Timer-Zustand des main-Prozesses.

import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { StageTimerState } from '@shared/types'
import { TimerDisplay } from './TimerDisplay'

export function TimerOutput(): JSX.Element {
  const [state, setState] = useState<StageTimerState | null>(null)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    void api.timer.getState().then((s) => {
      setState(s)
      setRemaining(s.remainingSec)
    })
    const offState = api.timer.onState((s) => {
      setState(s)
      setRemaining(s.remainingSec)
    })
    const offTick = api.timer.onTick((t) => setRemaining(t.remainingSec))
    return () => {
      offState()
      offTick()
    }
  }, [])

  // Esc schließt (zusätzlich zum before-input-event im main – falls Fokus im DOM liegt).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void api.timer.closeOutput()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      {state && <TimerDisplay state={state} remainingSec={remaining} />}
      <button
        onClick={() => void api.timer.closeOutput()}
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
          transition: 'opacity 0.15s',
          zIndex: 10
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.15')}
      >
        ✕ Schließen (Esc)
      </button>
    </div>
  )
}
