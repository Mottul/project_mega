// Ausgabe der Werkzeuge Testbild, Video-Player und Stage-Timer – überall gleich:
// - `useOutputTarget` + `OutputControls` in der Leiste: Ziel (Monitor oder „Als Fenster“),
//   Starten/Beenden und Wechseln (legt die laufende Ausgabe auf das gewählte Ziel).
// - `OutputCloseButton` im Ausgabefenster: unsichtbar, solange die Maus ruht – auf
//   Bühnenmonitor, LED-Wand, im Testbild und im NDI-Bild (unsichtbares Fenster, nie eine
//   Mausbewegung) steht so nichts im Bild. Eine Bewegung zeigt ihn und den Mauszeiger.
// Das Fenster selbst und „zweimal Esc“ regelt der main (services/windows/outputWindow.ts).

import { useEffect, useState } from 'react'
import { AppWindow, MonitorPlay, MonitorX } from 'lucide-react'
import type { AusgabeZiel, DisplayInfo } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'

export interface OutputTarget {
  displays: DisplayInfo[]
  ziel: AusgabeZiel | null
  setZiel: (z: AusgabeZiel) => void
  /** gewählter Monitor (null bei „Als Fenster“) – z. B. für „Auflösung vom Monitor“ */
  display: DisplayInfo | null
}

/** Monitore laden; vorgewählt ist ein nicht-primärer (Beamer/Wand), ein gemerktes Ziel gewinnt */
export function useOutputTarget(): OutputTarget {
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [ziel, setZiel] = useState<AusgabeZiel | null>(null)
  useEffect(() => {
    void api.screen.list().then((list) => {
      setDisplays(list)
      setZiel((cur) => cur ?? (list.find((d) => !d.primary) ?? list[0])?.id ?? 'fenster')
    })
  }, [])
  const display = typeof ziel === 'number' ? (displays.find((d) => d.id === ziel) ?? null) : null
  return { displays, ziel, setZiel, display }
}

export function OutputControls({
  target,
  open,
  onStart,
  onStop,
  hint
}: {
  target: OutputTarget
  /** Ausgabe offen (Wahrheit aus dem main – auch nach Esc oder Schließen von außen) */
  open: boolean
  onStart: (ziel: AusgabeZiel) => void | Promise<void>
  onStop: () => void | Promise<void>
  /** Zusatz zum Tooltip des Start-Knopfs, z. B. „Pixelgenau in der nativen Auflösung“ */
  hint?: string
}): JSX.Element {
  const { displays, ziel, setZiel } = target
  // Wie die laufende Ausgabe geöffnet wurde – die Auswahl kann inzwischen etwas anderes zeigen
  const [laeuftAls, setLaeuftAls] = useState<AusgabeZiel | null>(null)
  useEffect(() => {
    if (!open) setLaeuftAls(null)
  }, [open])
  const start = (): void => {
    if (ziel == null) return
    setLaeuftAls(ziel)
    void onStart(ziel)
  }
  const alsFenster = (laeuftAls ?? ziel) === 'fenster'
  const esc = 'Zweimal Esc im Ausgabefenster beendet die Ausgabe.'

  return (
    <>
      <Select
        size="sm"
        className="w-64 max-w-full"
        aria-label="Ausgabe-Monitor"
        value={ziel ?? ''}
        onChange={(e) => setZiel(e.target.value === 'fenster' ? 'fenster' : Number(e.target.value))}
      >
        {displays.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
        <option value="fenster">Als Fenster</option>
      </Select>
      {open ? (
        <>
          <Button size="sm" variant="destructive" onClick={() => void onStop()}>
            <MonitorX className="size-4" /> {alsFenster ? 'Fenster schließen' : 'Vollbild beenden'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={start}
            disabled={ziel == null}
            title="Laufende Ausgabe auf das gewählte Ziel legen"
          >
            {ziel === 'fenster' ? 'Ins Fenster wechseln' : 'Monitor wechseln'}
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          onClick={start}
          disabled={ziel == null}
          title={[
            ziel === 'fenster'
              ? 'Als normales Fenster auf diesem Bildschirm – zum Testen oder für die Fensteraufnahme in OBS.'
              : hint,
            esc
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {ziel === 'fenster' ? (
            <>
              <AppWindow className="size-4" /> Im Fenster starten
            </>
          ) : (
            <>
              <MonitorPlay className="size-4" /> Vollbild starten
            </>
          )}
        </Button>
      )}
    </>
  )
}

/** So lange bleiben Knopf und Mauszeiger nach der letzten Bewegung sichtbar */
const RUHE_MS = 3000

export function OutputCloseButton({ onClose }: { onClose: () => void }): JSX.Element {
  const [wach, setWach] = useState(false)
  const [darueber, setDarueber] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const bewegt = (): void => {
      setWach(true)
      clearTimeout(t)
      t = setTimeout(() => setWach(false), RUHE_MS)
    }
    window.addEventListener('mousemove', bewegt)
    return () => {
      window.removeEventListener('mousemove', bewegt)
      clearTimeout(t)
    }
  }, [])
  const sichtbar = wach || darueber
  // Mauszeiger mit dem Knopf aus- und einblenden – das ganze Fenster ist Ausgabe
  useEffect(() => {
    document.documentElement.style.cursor = sichtbar ? '' : 'none'
  }, [sichtbar])

  return (
    <button
      type="button"
      onClick={onClose}
      title="Ausgabe schließen – oder zweimal Esc"
      data-testid="ausgabe-schliessen"
      onMouseEnter={() => setDarueber(true)}
      onMouseLeave={() => setDarueber(false)}
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
        opacity: sichtbar ? 1 : 0,
        // unsichtbar auch nicht anklickbar; eine Bewegung dorthin zeigt ihn ohnehin zuerst
        pointerEvents: sichtbar ? 'auto' : 'none',
        transition: 'opacity 0.3s',
        zIndex: 10
      }}
    >
      ✕ Schließen (2× Esc)
    </button>
  )
}
