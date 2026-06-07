import { useEffect, useState } from 'react'
import { PlaybackEngine } from './PlaybackEngine'

// Inhalt des rahmenlosen Vollbild-Ausgabefensters (#/player-output): die
// Wiedergabe-Engine, formatfüllend (Medien sind auf die Wand eingebacken).
// Taste „d" blendet ein Diagnose-Overlay ein (für den Performance-Check).
export function PlayerOutput(): JSX.Element {
  const [debug, setDebug] = useState(false)
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
    </div>
  )
}
