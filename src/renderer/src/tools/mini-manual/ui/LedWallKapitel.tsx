// Kapitel LED-Wall: Kopie der Planung aus derselben Projektdatei (oder aus dem Konfigurator, wenn
// die Datei noch keine hat). „Planung geändert (Stand 7 → 9)“ zeigt die Unterschiede und
// übernimmt erst auf Klick. Dazu eigene Blöcke (Status-LEDs …).

import { useState } from 'react'
import { Download, GitCompare } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { digest } from '@shared/projectFile'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { ledWallSection } from '../../led-wall/config'
import { useLedWall } from '../../led-wall/store'
import { kennzahlenAus, kopieAus, unterschiede } from '../ledWallKopie'
import { useMiniManual } from '../store'
import { BloeckeEditor } from './BloeckeEditor'
import type { LedWallQuelle } from './useLedWallQuelle'

const PROBLEM: Record<string, string> = {
  fehlt: 'Die Projektdatei ist nicht erreichbar.',
  kaputt: 'Die Projektdatei ist beschädigt.',
  neuer: 'Die Projektdatei stammt aus einer neueren Mottulbox.'
}

export function LedWallKapitel({ q }: { q: LedWallQuelle }): JSX.Element {
  const kopie = useMiniManual((s) => s.anleitung.ledWall)
  const deckblatt = useMiniManual((s) => s.anleitung.deckblatt)
  const gebunden = useMiniManual((s) => !!s.file)
  const update = useMiniManual((s) => s.update)
  const [diff, setDiff] = useState(false)

  const ausDatei = (): void => {
    if (!q.stand) return
    const s = q.stand
    update((a) => ({ ...a, ledWall: kopieAus(s.data, { rev: s.rev, sha256: s.sha256 }) }))
    setDiff(false)
  }

  async function ausKonfigurator(): Promise<void> {
    const c = useLedWall.getState()
    const data = ledWallSection(c)
    const andere =
      (deckblatt.projekt.trim() &&
        c.projectName.trim() &&
        deckblatt.projekt.trim() !== c.projectName.trim()) ||
      (deckblatt.kunde.trim() &&
        c.customerName.trim() &&
        deckblatt.kunde.trim() !== c.customerName.trim())
    if (andere) {
      const ok = await api.confirm({
        message: 'Die Planung im Konfigurator gehört zu einem anderen Projekt.',
        detail: `Konfigurator: ${[c.projectName, c.customerName].filter(Boolean).join(' · ')}\nAnleitung: ${[deckblatt.projekt, deckblatt.kunde].filter(Boolean).join(' · ')}`,
        confirmLabel: 'Trotzdem übernehmen'
      })
      if (!ok) return
      // Rückfragen sperren nur dieses Fenster: Hat ein anderes die Planung inzwischen geändert,
      // gilt die Zustimmung nicht für den neuen Stand (review-checkliste, „Zustand nach await“)
      if (digest(ledWallSection(useLedWall.getState())) !== digest(data)) {
        toast.warning(
          'Die Planung im Konfigurator hat sich inzwischen geändert – bitte noch einmal.'
        )
        return
      }
    }
    update((a) => ({ ...a, ledWall: kopieAus(data, null) }))
  }

  const neu =
    q.neuer && q.stand && kopie ? unterschiede(kopie.kennzahlen, kennzahlenAus(q.stand.data)) : []

  return (
    <div className="space-y-3">
      {q.problem && (
        <Alert tone="danger">
          {PROBLEM[q.problem] ?? 'Die Projektdatei ließ sich nicht lesen.'}
        </Alert>
      )}
      {q.konfiguratorUngespeichert && (
        <Alert tone="warning">
          Im LED-Wall-Konfigurator gibt es ungespeicherte Änderungen an dieser Datei – erst dort
          speichern, dann hier übernehmen.
        </Alert>
      )}
      {q.neuer && (
        <Alert tone="warning" title={`Planung geändert (Stand ${q.neuer.von} → ${q.neuer.bis})`}>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDiff((v) => !v)}
              aria-expanded={diff}
            >
              <GitCompare className="size-4" /> Unterschiede ansehen
            </Button>
            <Button size="sm" onClick={ausDatei}>
              <Download className="size-4" /> Übernehmen
            </Button>
          </div>
          {diff && (
            <table className="mt-2 text-sm text-foreground">
              <tbody>
                {neu.length ? (
                  neu.map((u) => (
                    <tr key={u.feld}>
                      <td className="pr-3 text-muted-foreground">{u.feld}</td>
                      <td className="pr-3 line-through opacity-70">{u.alt || '–'}</td>
                      <td className="font-semibold">{u.neu || '–'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>Kennzahlen unverändert – geändert hat sich z. B. die Verkabelung.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </Alert>
      )}

      {kopie ? (
        <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
          <div className="font-semibold">
            {kopie.kennzahlen.modul} · {kopie.kennzahlen.spalten} × {kopie.kennzahlen.reihen} ={' '}
            {kopie.kennzahlen.module} Module · {kopie.kennzahlen.aufloesungX} ×{' '}
            {kopie.kennzahlen.aufloesungY} px
          </div>
          <div className="text-muted-foreground">
            {kopie.quelle
              ? `aus der Projektdatei, Stand ${kopie.quelle.rev}`
              : 'aus dem Konfigurator'}{' '}
            · übernommen {new Date(kopie.uebernommen).toLocaleString('de-AT')}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Noch keine LED-Wall-Planung übernommen.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {q.stand && !q.neuer && (
          <Button size="sm" variant="outline" onClick={ausDatei}>
            <Download className="size-4" /> Aus dieser Projektdatei übernehmen (Stand {q.stand.rev})
          </Button>
        )}
        {(!gebunden || !q.stand) && (
          <Button size="sm" variant="outline" onClick={() => void ausKonfigurator()}>
            <Download className="size-4" /> Aus dem aktuellen Konfigurator übernehmen
          </Button>
        )}
      </div>
      {gebunden && !q.stand && !q.problem && (
        <p className="text-xs text-muted-foreground">
          Diese Projektdatei enthält noch keine LED-Wall-Planung. Speicherst du die Planung im
          Konfigurator in dieselbe Datei, meldet die Anleitung später jede Änderung.
        </p>
      )}

      <h3 className="pt-2 text-sm font-semibold">Weitere Inhalte</h3>
      <BloeckeEditor id="ledWall" />
    </div>
  )
}
