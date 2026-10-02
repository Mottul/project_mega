import { Smartphone } from 'lucide-react'
import type { RemoteStatus } from '@shared/types'
import { QrCode } from './QrCode'

// Zugang zu einer laufenden Fernsteuerung: QR-Code + Adressen (Klick kopiert).
// Bevorzugt die Adresse in der Fernsteuer-App (alle Fernsteuerungen unter einem
// festen Port, als Web-App im Vollbild nutzbar); läuft die App nicht, bleibt die
// direkte Adresse der Fernsteuerung.
export function RemoteAccess({ status }: { status: RemoteStatus }): JSX.Element | null {
  if (!status.running) return null
  const appUrls = status.app?.urls ?? []
  const urls = appUrls.length > 0 ? appUrls : status.urls
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-2">
      <div className="flex items-start gap-3">
        {urls[0] && <QrCode text={urls[0]} size={96} />}
        <div className="min-w-0 space-y-1 text-xs">
          <p className="text-muted-foreground">Im Browser öffnen (QR scannen oder eintippen):</p>
          {urls.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => void navigator.clipboard?.writeText(u)}
              title="Adresse kopieren"
              className="block max-w-full break-all text-left font-mono text-[11px] text-primary hover:underline"
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {appUrls.length > 0 ? (
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Smartphone className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Am Handy „Zum Home-Bildschirm“ hinzufügen: startet als App im Vollbild, mit allen
            eingeschalteten Fernsteuerungen.
          </span>
        </p>
      ) : (
        status.app?.error && (
          <p className="text-xs text-amber-400 light:text-amber-700">
            Fernsteuer-App nicht verfügbar ({status.app.error}) – die Adresse oben funktioniert
            trotzdem.
          </p>
        )
      )}
    </div>
  )
}
