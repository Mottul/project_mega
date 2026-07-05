// Kompakt-Umschalter für die Kopfzeile. Klick wechselt Normal <-> Kompakt.
// Quelle der Wahrheit ist settings.json; localStorage spiegelt die Wahl nur für
// ein flackerfreies Booten (siehe lib/density).
import { useEffect, useState } from 'react'
import { Rows2, Rows4 } from 'lucide-react'
import { Button } from './ui/button'
import { api } from '@renderer/lib/api'
import { applyDensity, persistDensity, storedDensity } from '@renderer/lib/density'
import type { UiDensity } from '@shared/types'

export function DensityToggle(): JSX.Element {
  const [density, setDensity] = useState<UiDensity>(() => storedDensity())

  // Persistierte Einstellung laden (kann aus einem anderen Fenster stammen).
  useEffect(() => {
    void api.getSettings().then((s) => {
      const d = s.uiDensity ?? 'normal'
      setDensity(d)
      applyDensity(d)
      persistDensity(d)
    })
  }, [])

  function toggle(): void {
    const next: UiDensity = density === 'compact' ? 'normal' : 'compact'
    setDensity(next)
    applyDensity(next)
    persistDensity(next)
    void api.setSettings({ uiDensity: next })
  }

  const compact = density === 'compact'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={
        compact ? 'Anzeige: Kompakt – klicken für Normal' : 'Anzeige: Normal – klicken für Kompakt'
      }
      aria-label={compact ? 'Anzeige: Kompakt' : 'Anzeige: Normal'}
      aria-pressed={compact}
    >
      {compact ? <Rows4 className="size-4" /> : <Rows2 className="size-4" />}
    </Button>
  )
}
