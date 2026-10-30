import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { windowTitle } from '@shared/brand'
import { OutputCloseButton } from '@renderer/components/OutputControl'
import { PlaybackEngine } from './PlaybackEngine'

// Inhalt des Ausgabefensters (#/player-output): die Wiedergabe-Engine, formatfüllend (Medien
// sind auf die Wand eingebacken). Taste „d" blendet ein Diagnose-Overlay ein (für den
// Performance-Check). Geschlossen wird über die App, zweimal Esc (ein einzelner Druck nimmt das
// Live-Bild nicht weg) oder den Knopf, der nur bei Mausbewegung erscheint.
export function PlayerOutput(): JSX.Element {
  const [debug, setDebug] = useState(false)
  useEffect(() => {
    document.title = windowTitle('Player-Ausgabe')
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'd' || e.key === 'D') setDebug((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <PlaybackEngine objectFit="fill" debug={debug} />
      <OutputCloseButton onClose={() => void api.player.closeOutput()} />
    </div>
  )
}
