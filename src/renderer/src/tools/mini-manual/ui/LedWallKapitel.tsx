// Kapitel LED-Wall: Kopie der Planung aus derselben Projektdatei (oder aus dem Konfigurator, wenn
// die Datei noch keine hat). „Planung geändert (Stand 7 → 9)“ zeigt die Unterschiede und
// übernimmt erst auf Klick. Dazu eigene Blöcke (Status-LEDs …).

import { useState } from 'react'
import { Download, GitCompare } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { waendeAus, wandUnterschiede } from '../ledWallKopie'
import { useMiniManual } from '../store'
import { BloeckeEditor } from './BloeckeEditor'
import { ausDatei, ausKonfigurator } from './ledWallUebernahme'
import type { LedWallQuelle } from './useLedWallQuelle'

const PROBLEM: Record<string, string> = {
  fehlt: 'Die Projektdatei ist nicht erreichbar.',
  kaputt: 'Die Projektdatei ist beschädigt.',
  neuer: 'Die Projektdatei stammt aus einer neueren Mottulbox.'
}

export function LedWallKapitel({ q }: { q: LedWallQuelle }): JSX.Element {
  const kopie = useMiniManual((s) => s.anleitung.ledWall)
  const gebunden = useMiniManual((s) => !!s.file)
  const [diff, setDiff] = useState(false)

  const ausDateiKlick = (): void => {
    if (ausDatei(q)) setDiff(false)
  }

  const neu =
    q.neuer && q.stand && kopie ? wandUnterschiede(kopie.waende, waendeAus(q.stand.data) ?? []) : []

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
            <Button size="sm" onClick={ausDateiKlick}>
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
          <ul className="space-y-0.5" aria-label="Übernommene Wände">
            {kopie.waende.map(({ id, name, kennzahlen: k }) => (
              <li key={id} className="font-semibold">
                {kopie.waende.length > 1 && <span className="text-primary">{name}: </span>}
                {k.modul} · {k.spalten} × {k.reihen} = {k.module} Module · {k.aufloesungX} ×{' '}
                {k.aufloesungY} px
              </li>
            ))}
          </ul>
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
          <Button size="sm" variant="outline" onClick={ausDateiKlick}>
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
