// Hinweis „Neuere Fassung“ mit „Aktualisieren“ – im Kapitel (Blöcke aus einem Baustein) bzw. am
// Fehlerfall. Quellen: mitgelieferte Bibliothek und eigene Bausteine (aktualisieren.ts).

import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { aktualisiere, neuereFassungen, quellen, type NeuereFassung } from '../aktualisieren'
import type { KapitelId } from '../model'
import { useMiniManual } from '../store'
import { useEigeneBausteine } from './eigeneBausteine'

export function NeuereFassungHinweis({
  kapitel,
  fallId
}: {
  kapitel?: KapitelId
  fallId?: string
}): JSX.Element | null {
  const a = useMiniManual((s) => s.anleitung)
  const update = useMiniManual((s) => s.update)
  const eigene = useEigeneBausteine()
  const q = useMemo(() => quellen(eigene), [eigene])
  const liste = useMemo(
    () =>
      neuereFassungen(a, q).filter((n) =>
        kapitel
          ? n.art === 'bloecke' && n.kapitel === kapitel
          : n.art === 'fall' && n.fallId === fallId
      ),
    [a, q, kapitel, fallId]
  )
  if (!liste.length) return null

  async function los(n: NeuereFassung): Promise<void> {
    const ok = await api.confirm({
      message: `„${n.titel}“ aktualisieren?`,
      detail: `${n.art === 'fall' ? 'Der Fall' : 'Die Blöcke aus diesem Baustein'} werden durch Version ${n.auf} ersetzt (${n.eigen ? 'eigener Baustein' : 'Bibliothek'}). Eigene Änderungen daran gehen verloren.`,
      confirmLabel: 'Aktualisieren'
    })
    if (!ok) return
    // frisch aus der Ablage: Während die Rückfrage offen war, kann ein anderes Fenster den eigenen
    // Baustein geändert oder gelöscht haben. Die Anleitung selbst liest update() frisch.
    const frisch = n.eigen ? quellen(await api.bausteine.list()) : q
    update((x) => aktualisiere(x, n, frisch))
  }

  return (
    <div className="space-y-1.5" data-testid="neuere-fassung">
      {liste.map((n) => (
        <div
          key={`${n.baustein}-${n.fallId ?? n.kapitel}`}
          className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm"
        >
          <RefreshCw className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            Neuere Fassung von „{n.titel}“: Version {n.von} → {n.auf} (
            {n.eigen ? 'eigener Baustein' : 'Bibliothek'})
          </span>
          <Button size="sm" variant="outline" onClick={() => void los(n)}>
            Aktualisieren
          </Button>
        </div>
      ))}
    </div>
  )
}
