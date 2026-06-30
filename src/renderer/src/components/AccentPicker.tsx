// Akzentfarben-Wähler für die Kopfzeile (neben dem Hell/Dunkel-Schalter).
// Klick öffnet eine kleine Farbpalette; Auswahl wirkt sofort und wird wie das
// Theme in settings.json + localStorage gespeichert.
import { useEffect, useRef, useState } from 'react'
import { Palette } from 'lucide-react'
import { Button } from './ui/button'
import { api } from '@renderer/lib/api'
import {
  ACCENTS,
  accentSwatch,
  applyAccent,
  persistAccent,
  storedAccent
} from '@renderer/lib/accent'
import type { AccentId } from '@shared/types'

export function AccentPicker(): JSX.Element {
  const [accent, setAccent] = useState<AccentId>(() => storedAccent())
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Persistierten Akzent laden (kann von einem anderen Fenster stammen).
  useEffect(() => {
    void api.getSettings().then((s) => {
      const a = s.accent ?? 'gold'
      setAccent(a)
      applyAccent(a)
      persistAccent(a)
    })
  }, [])

  // Klick außerhalb / Escape schließt die Palette.
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

  function choose(id: AccentId): void {
    setAccent(id)
    applyAccent(id)
    persistAccent(id)
    void api.setSettings({ accent: id })
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        title="Akzentfarbe wählen"
        aria-label="Akzentfarbe wählen"
      >
        <Palette className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 flex gap-1.5 rounded-md border border-border bg-card p-2 shadow-lg">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => choose(a.id)}
              title={a.label}
              aria-label={a.label}
              className={`size-6 rounded-full ring-offset-2 ring-offset-background transition-transform ${
                accent === a.id ? 'ring-2 ring-foreground' : 'hover:scale-110'
              }`}
              style={{ background: accentSwatch(a) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
