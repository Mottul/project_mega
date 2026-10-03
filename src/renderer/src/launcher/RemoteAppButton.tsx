// Kopfzeilen-Knopf „Fernsteuerung“ am Homescreen: zeigt den QR-Code der
// Startseite aller Fernsteuerungen (http://<ip>:8090) zum Scannen mit dem Handy.
// Grüner Punkt = mindestens eine Fernsteuerung läuft.
import { useEffect, useRef, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { QrCode } from '@renderer/components/QrCode'
import { Button } from '@renderer/components/ui/button'
import type { RemoteAppStatus } from '@shared/types'

const NAMES: Record<keyof RemoteAppStatus['remotes'], string> = {
  player: 'Video-Player',
  jingle: 'Jingles',
  osc: 'OSC-Steuerung',
  timer: 'Stage-Timer'
}

export function RemoteAppButton({ status }: { status: RemoteAppStatus | null }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Klick außerhalb / Escape schließt das Fenster.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const url = status?.urls[0]
  const running = status?.running ?? false
  const active = status
    ? (Object.keys(status.remotes) as (keyof RemoteAppStatus['remotes'])[]).filter(
        (k) => status.remotes[k]
      )
    : []

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        title="Fernsteuerung: QR-Code fürs Handy"
        aria-label="Fernsteuerung: QR-Code fürs Handy"
        className="relative"
      >
        <Smartphone className="size-4" />
        {running && (
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-emerald-500" />
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 space-y-3 rounded-md border border-border bg-card p-4 shadow-lg">
          <div>
            <p className="text-sm font-medium">Fernsteuerung</p>
            <p className="text-xs text-muted-foreground">
              Startseite aller Fernsteuerungen – mit dem Handy im selben WLAN scannen.
            </p>
          </div>
          {url && (
            <div className="flex justify-center">
              <QrCode text={url} size={180} />
            </div>
          )}
          {url && (
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(url)}
              title="Adresse kopieren"
              className="block w-full break-all text-center font-mono text-xs text-primary hover:underline"
            >
              {url}
            </button>
          )}
          {running ? (
            <p className="text-xs text-muted-foreground">
              Aktiv: {active.map((k) => NAMES[k]).join(', ')}. Tipp: am Handy „Zum Home-Bildschirm“
              – dann startet sie als App im Vollbild.
            </p>
          ) : (
            <p className="text-xs text-amber-400 light:text-amber-700">
              {status?.error
                ? `Nicht erreichbar: ${status.error}.`
                : 'Noch keine Fernsteuerung aktiv – im Werkzeug unter „Fernsteuerung“ einschalten. Erst dann antwortet diese Adresse.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
