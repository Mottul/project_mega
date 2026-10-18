// Menü „Handy“ in der Leiste des Mini-Manuals: die Handy-Fassung als Datei speichern (zum
// Verschicken) oder in die Online-Ablage stellen (App-Menü) – dann druckt die Kurzkarte die
// Adresse als QR-Code. Online nie Zugangsdaten und höchstens Stufe Betreuung (handy.ts).

import { ChevronDown, Smartphone } from 'lucide-react'
import { MenuItem, useMenu } from '@renderer/components/ProjectFileMenu'
import { Button } from '@renderer/components/ui/button'
import { useSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'
import { useMiniManual } from '../store'

export function HandyMenu({
  onDatei,
  onOnline
}: {
  onDatei: () => Promise<void>
  /** neu = unter neuer Adresse (alter Ordner bleibt in der Ablage liegen) */
  onOnline: (neu: boolean) => Promise<void>
}): JSX.Element {
  const { open, setOpen, ref } = useMenu()
  const online = useMiniManual((s) => s.anleitung.ausgabe.online)
  const ablage = useSettings((s) => s.online)
  const eingerichtet = !!ablage?.dir && !!ablage.url
  const run = (fn: () => unknown): void => {
    setOpen(false)
    void fn()
  }
  const hinweis = 'Erst im App-Menü (Mottulbox ▾) die Online-Ablage einrichten'

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Smartphone className="size-4" /> Handy
        <ChevronDown className="size-3.5" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Handy"
          className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-card p-1.5 shadow-xl"
        >
          <MenuItem onClick={() => run(onDatei)}>Als Datei speichern …</MenuItem>
          <MenuItem
            disabled={!eingerichtet}
            title={eingerichtet ? undefined : hinweis}
            onClick={() => run(() => onOnline(false))}
          >
            {online ? 'Online aktualisieren' : 'Online stellen'}
          </MenuItem>
          {online && (
            <>
              <MenuItem
                title={online.url}
                onClick={() =>
                  run(async () => {
                    await navigator.clipboard?.writeText(online.url)
                    toast.success('Adresse kopiert', online.url)
                  })
                }
              >
                Adresse kopieren
              </MenuItem>
              <MenuItem
                disabled={!eingerichtet}
                title="Neue Adresse, z. B. wenn die alte nicht mehr gelten soll – der alte Ordner bleibt in der Ablage, bis du ihn löschst"
                onClick={() => run(() => onOnline(true))}
              >
                Unter neuer Adresse online stellen
              </MenuItem>
            </>
          )}
          {!eingerichtet && <p className="px-2.5 py-1 text-xs text-muted-foreground">{hinweis}.</p>}
        </div>
      )}
    </div>
  )
}
