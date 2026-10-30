// Inhalt des Ausgabefensters (#/timer-output, auch fürs NDI-Bild): die reine Bühnen-Anzeige,
// gespeist vom autoritativen Timer-Zustand des main-Prozesses.

import { useEffect, useState } from 'react'
import { OutputCloseButton } from '@renderer/components/OutputControl'
import { api } from '@renderer/lib/api'
import { windowTitle } from '@shared/brand'
import type { StageTimerState } from '@shared/types'
import { TimerDisplay } from './TimerDisplay'

export function TimerOutput(): JSX.Element {
  const [state, setState] = useState<StageTimerState | null>(null)
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    document.title = windowTitle('Timer-Ausgabe')
  }, [])

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

  // Esc (zweimal) behandelt der main – ein zweiter Handler hier zählte jeden Druck doppelt
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      {state && <TimerDisplay state={state} remainingSec={remaining} />}
      <OutputCloseButton onClose={() => void api.timer.closeOutput()} />
    </div>
  )
}
