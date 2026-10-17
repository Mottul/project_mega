// Eigene Bausteine verwalten: alle auf einen Blick (nach Kapitel), umbenennen, löschen, zum
// Weitergeben exportieren und Dateien von Kollegen importieren. Die Ablage liegt im main (eine
// Datei je Baustein, api.bausteine); ein gemeinsamer Ordner für das Team ist Phase 5 im Plan.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Trash2, Upload } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { LiveInput } from '@renderer/components/ui/textarea'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { namensgleiche } from '@shared/bausteine'
import type { BausteinImport, EigenerBaustein } from '@shared/types'
import { KAPITEL, kapitelDef, type KapitelId } from '../model'

const gruppeVon = (b: EigenerBaustein): string =>
  b.art === 'fall'
    ? 'Fehlerfälle'
    : KAPITEL.some((k) => k.id === b.kapitel)
      ? kapitelDef(b.kapitel as KapitelId).titel
      : 'ohne Kapitel'

const PROBLEM: Record<Exclude<BausteinImport, { ok: true }>['reason'], string> = {
  'keine-bausteine': 'keine Mottulbox-Bausteine-Datei',
  'zu-gross': 'zu groß',
  fehler: 'ließ sich nicht lesen'
}

/** Zusammenfassung eines Imports für die Meldung */
export function importText(r: BausteinImport[]): string {
  const ok = r.filter((x): x is Extract<BausteinImport, { ok: true }> => x.ok)
  const sum = (k: 'neu' | 'aktualisiert' | 'uebersprungen' | 'umbenannt'): number =>
    ok.reduce((n, x) => n + x[k], 0)
  const teile = [
    sum('neu') && `${sum('neu')} neu`,
    sum('aktualisiert') && `${sum('aktualisiert')} aktualisiert`,
    sum('uebersprungen') && `${sum('uebersprungen')} schon vorhanden`,
    sum('umbenannt') && `${sum('umbenannt')} mit „(2)“ (gleicher Name)`
  ].filter(Boolean)
  const fehler = r
    .filter((x): x is Extract<BausteinImport, { ok: false }> => !x.ok)
    .map((x) => `${x.name}: ${PROBLEM[x.reason]}`)
  return [teile.join(', ') || 'nichts Neues', ...fehler].join(' · ')
}

export function BausteineDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [liste, setListe] = useState<EigenerBaustein[] | null>(null)
  const [wahl, setWahl] = useState<Set<string>>(new Set())
  const neuLaden = (): void => {
    void api.bausteine.list().then(setListe)
  }
  useEffect(neuLaden, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const gruppen = useMemo(() => {
    const m = new Map<string, EigenerBaustein[]>()
    for (const b of liste ?? []) m.set(gruppeVon(b), [...(m.get(gruppeVon(b)) ?? []), b])
    return [...m]
  }, [liste])

  async function umbenennen(b: EigenerBaustein, titel: string): Promise<void> {
    const t = titel.trim()
    if (!t || t === b.titel) return
    const aktuell = await api.bausteine.list()
    if (namensgleiche(aktuell, { ...b, titel: t }).length) {
      toast.warning(`„${t}“ gibt es in dieser Gruppe schon – bitte anderen Namen wählen.`)
      neuLaden()
      return
    }
    const res = await api.bausteine.save({ ...b, titel: t })
    if (!res) toast.error('Umbenennen fehlgeschlagen')
    neuLaden()
  }

  async function loeschen(b: EigenerBaustein): Promise<void> {
    const ok = await api.confirm({
      message: `Baustein „${b.titel}“ löschen?`,
      detail: 'Anleitungen, die ihn schon eingefügt haben, behalten ihre Kopie.',
      confirmLabel: 'Löschen',
      danger: true
    })
    if (!ok) return
    await api.bausteine.remove(b.id)
    setWahl((w) => new Set([...w].filter((x) => x !== b.id)))
    neuLaden()
  }

  async function exportieren(ids: string[]): Promise<void> {
    const r = await api.bausteine.export(ids)
    if (r?.ok) toast.success(`${r.anzahl} Baustein(e) exportiert`, r.path)
    else if (r) toast.error('Export fehlgeschlagen')
  }

  async function importieren(): Promise<void> {
    const r = await api.bausteine.import()
    if (!r) return
    const text = importText(r)
    if (r.some((x) => !x.ok)) toast.warning('Import', text)
    else toast.success('Import', text)
    neuLaden()
  }

  const alle = liste ?? []
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <Card
        role="dialog"
        aria-label="Eigene Bausteine"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold">Eigene Bausteine</h2>
          <p className="text-xs text-muted-foreground">
            Liegen auf diesem Rechner (eine Datei je Baustein). Zum Weitergeben exportieren – der
            Kollege importiert die Datei; gleiche Bausteine werden aktualisiert, gleiche Namen
            bekommen „(2)“, nichts wird still überschrieben.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="bausteine-liste">
          {liste === null ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : !alle.length ? (
            <p className="text-sm text-muted-foreground">
              Noch keine eigenen Bausteine. Speichern: im Kapitel „Baustein einfügen …“ → „Kapitel
              als Baustein speichern“, in der Fehlersuche „Als eigenen Baustein speichern“.
            </p>
          ) : (
            gruppen.map(([gruppe, bs]) => (
              <section key={gruppe} aria-label={gruppe} className="mb-3">
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {gruppe}
                </h3>
                <ul className="space-y-1">
                  {bs.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        aria-label={`„${b.titel}“ auswählen`}
                        checked={wahl.has(b.id)}
                        onChange={(e) =>
                          setWahl((w) => {
                            const n = new Set(w)
                            if (e.target.checked) n.add(b.id)
                            else n.delete(b.id)
                            return n
                          })
                        }
                        className="size-4 accent-[hsl(var(--primary))]"
                      />
                      <div className="min-w-0 flex-1">
                        <LiveInput
                          key={`${b.id}-${b.version}`}
                          value={b.titel}
                          aria-label={`Name von „${b.titel}“`}
                          maxLength={200}
                          onCommit={(t) => void umbenennen(b, t)}
                        />
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Version {b.version}
                        {b.geaendertVon ? ` · ${b.geaendertVon}` : ''}
                        {b.geaendertAm
                          ? ` · ${new Date(b.geaendertAm).toLocaleDateString('de-AT')}`
                          : ''}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`„${b.titel}“ exportieren`}
                        title="Nur diesen exportieren"
                        onClick={() => void exportieren([b.id])}
                      >
                        <Upload className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`„${b.titel}“ löschen`}
                        className="hover:text-danger"
                        onClick={() => void loeschen(b)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={() => void importieren()}>
            <Download className="size-4" /> Importieren …
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!wahl.size}
            onClick={() => void exportieren([...wahl])}
          >
            <Upload className="size-4" /> Auswahl exportieren ({wahl.size}) …
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!alle.length}
            onClick={() => void exportieren(alle.map((b) => b.id))}
          >
            <Upload className="size-4" /> Alle exportieren …
          </Button>
          <Button size="sm" className="ml-auto" onClick={onClose}>
            Schließen
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  )
}
