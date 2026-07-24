import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { windowTitle } from '@shared/brand'
import { PlaybackEngine } from './PlaybackEngine'

// Inhalt des rahmenlosen Vollbild-Ausgabefensters (#/player-output): die
// Wiedergabe-Engine, formatfüllend (Medien sind auf die Wand eingebacken).
// Taste „d" blendet ein Diagnose-Overlay ein (für den Performance-Check).
// KEIN Esc-zum-Schließen (ein Live-Bild soll nicht versehentlich verschwinden)
// – geschlossen wird über die App oder den dezenten Button unten rechts.
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
      <button
        onClick={() => void api.player.closeOutput()}
        title="Ausgabe schließen"
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          padding: '6px 10px',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
          color: '#fff',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: 6,
          cursor: 'pointer',
          opacity: 0.1,
          transition: 'opacity 0.15s',
          zIndex: 10
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.1')}
      >
        ✕ Ausgabe schließen
      </button>
    </div>
  )
}
