// Geführter Einstieg für eine neue Anleitung: vier Schritte – Projekt, LED-Wall, Geräte, Kapitel.
// Jeder Schritt ändert die Anleitung sofort (wie die Formulare), „Später“ schließt, ohne dass etwas
// verloren geht. Angeboten wird er, solange die Anleitung frisch ist (einstieg.ts).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Cpu, Download, Plus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { LiveInput } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { kapitel as patchKapitel } from '../aktionen'
import { mitKapitelVorschlag } from '../einstieg'
import { KAPITEL, ROLLEN, leeresGeraet, type GeraetRolle } from '../model'
import { prozessorVorschlaege } from '../signalwege'
import { useMiniManual } from '../store'
import type { Auswahl } from './KapitelEditor'
import { ausDatei, ausKonfigurator } from './ledWallUebernahme'
import type { LedWallQuelle } from './useLedWallQuelle'

const SCHRITTE = ['Projekt', 'LED-Wall', 'Geräte', 'Kapitel'] as const

function ProjektSchritt(): JSX.Element {
  const titel = useMiniManual((s) => s.anleitung.titel)
  const d = useMiniManual((s) => s.anleitung.deckblatt)
  const update = useMiniManual((s) => s.update)
  const set = (p: Partial<typeof d>): void =>
    update((a) => ({ ...a, deckblatt: { ...a.deckblatt, ...p } }))
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Projekt">
        <LiveInput
          value={d.projekt}
          aria-label="Projekt"
          placeholder="z. B. Messe Dornbirn 2026"
          onCommit={(projekt) => set({ projekt })}
        />
      </Field>
      <Field label="Kunde">
        <LiveInput value={d.kunde} aria-label="Kunde" onCommit={(kunde) => set({ kunde })} />
      </Field>
      <Field label="Ort">
        <LiveInput
          value={d.ort}
          aria-label="Ort"
          placeholder="z. B. Halle 3, Stand 12"
          onCommit={(ort) => set({ ort })}
        />
      </Field>
      <Field label="Zeitraum">
        <LiveInput
          value={d.zeitraum}
          aria-label="Zeitraum"
          placeholder="z. B. 14.–16.11.2026"
          onCommit={(zeitraum) => set({ zeitraum })}
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Titel der Anleitung">
          <LiveInput
            value={titel}
            aria-label="Titel der Anleitung"
            onCommit={(t) => update((a) => ({ ...a, titel: t }))}
          />
        </Field>
      </div>
    </div>
  )
}

function LedWallSchritt({ q, weiter }: { q: LedWallQuelle; weiter: () => void }): JSX.Element {
  const kopie = useMiniManual((s) => s.anleitung.ledWall)
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {kopie
          ? `Übernommen: ${kopie.waende.map((w) => w.name).join(', ')}.`
          : 'Welche LED-Wand gehört zur Anleitung? Die Kennzahlen, Pläne und Kabelwege kommen als Kopie aus der Planung.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {q.stand && (
          <Button size="sm" variant="outline" onClick={() => ausDatei(q) && weiter()}>
            <Download className="size-4" /> Aus dieser Projektdatei (Stand {q.stand.rev})
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void ausKonfigurator().then((ok) => ok && weiter())}
        >
          <Download className="size-4" /> Aus dem Konfigurator
        </Button>
        {!kopie && (
          <Button size="sm" variant="ghost" onClick={weiter}>
            Ohne LED-Wand weiter
          </Button>
        )}
      </div>
    </div>
  )
}

function GeraeteSchritt(): JSX.Element {
  const a = useMiniManual((s) => s.anleitung)
  const update = useMiniManual((s) => s.update)
  const [rolle, setRolle] = useState<GeraetRolle>('zuspieler')
  const [name, setName] = useState('')
  const vorschlaege = prozessorVorschlaege(a)
  const dazu = (): void => {
    const n = name.trim()
    if (!n) return
    update((x) => ({ ...x, geraete: [...x.geraete, { ...leeresGeraet(rolle), name: n }] }))
    setName('')
  }
  return (
    <div className="space-y-3">
      {a.geraete.length ? (
        <ul className="space-y-1 text-sm" aria-label="Geräte">
          {a.geraete.map((g) => (
            <li key={g.id} className="flex items-center gap-2">
              <Check className="size-4 text-success" />
              <span className="text-muted-foreground">
                {ROLLEN.find((r) => r.value === g.rolle)?.label}
              </span>
              {g.name || '(ohne Namen)'}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Was steht vor Ort? Zuspieler (Laptop, Medienserver), Bedienfeld (Stream Deck), Verteiler …
          Details wie Modell, Standort und IP trägst du später im Kapitel „Geräte“ nach.
        </p>
      )}
      {vorschlaege.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            // frisch berechnet: zwischen Anzeige und Klick kann sich die Liste geändert haben
            update((x) => ({ ...x, geraete: [...x.geraete, ...prozessorVorschlaege(x)] }))
          }
        >
          <Cpu className="size-4" />
          {vorschlaege.length === 1
            ? 'Prozessor aus der LED-Wall-Planung anlegen'
            : `${vorschlaege.length} Prozessoren aus der LED-Wall-Planung anlegen`}
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          aria-label="Rolle des neuen Geräts"
          value={rolle}
          onChange={(e) => setRolle(e.target.value as GeraetRolle)}
        >
          {ROLLEN.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Input
          value={name}
          aria-label="Name des neuen Geräts"
          placeholder="Name, z. B. Laptop Bühne"
          className="min-w-0 flex-1"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') dazu()
          }}
        />
        <Button size="sm" variant="outline" disabled={!name.trim()} onClick={dazu}>
          <Plus className="size-4" /> Gerät
        </Button>
      </div>
    </div>
  )
}

function KapitelSchritt(): JSX.Element {
  const kapitel = useMiniManual((s) => s.anleitung.kapitel)
  const update = useMiniManual((s) => s.update)
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Vorgeschlagen nach dem, was du eingetragen hast – ohne LED-Wand fallen LED-Wall und
        Verkabelung weg, mit einem Bedienfeld kommt das Kapitel dazu. Alles bleibt in der Schublade
        änderbar.
      </p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
        {kapitel.map((k) => (
          <Checkbox
            key={k.id}
            checked={k.an}
            label={KAPITEL.find((d) => d.id === k.id)?.titel ?? k.id}
            onChange={(an) => update((a) => patchKapitel(a, k.id, (x) => ({ ...x, an })))}
          />
        ))}
      </div>
    </div>
  )
}

export function Einstieg({
  q,
  onClose,
  onFertig
}: {
  q: LedWallQuelle
  onClose: () => void
  onFertig: (ziel: Auswahl) => void
}): JSX.Element {
  const [schritt, setSchritt] = useState(0)
  const vorschlagGesetzt = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Beim ersten Mal auf „Kapitel“ den Vorschlag einsetzen – danach entscheidet der Nutzer
  useEffect(() => {
    if (schritt !== 3 || vorschlagGesetzt.current) return
    vorschlagGesetzt.current = true
    useMiniManual.getState().update(mitKapitelVorschlag)
  }, [schritt])
  const weiter = (): void => setSchritt((s) => Math.min(SCHRITTE.length - 1, s + 1))
  const letzter = schritt === SCHRITTE.length - 1

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <Card
        role="dialog"
        aria-label="Neue Anleitung einrichten"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold">Neue Anleitung einrichten</h2>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Schritte">
            {SCHRITTE.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  aria-current={i === schritt ? 'step' : undefined}
                  onClick={() => setSchritt(i)}
                  className={cn(
                    'rounded-md px-2.5 py-1',
                    i === schritt
                      ? 'bg-primary/15 font-semibold text-primary'
                      : i < schritt
                        ? 'text-foreground hover:bg-muted/60'
                        : 'text-muted-foreground hover:bg-muted/60'
                  )}
                >
                  {i + 1}. {s}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="einstieg-schritt">
          {schritt === 0 && <ProjektSchritt />}
          {schritt === 1 && <LedWallSchritt q={q} weiter={weiter} />}
          {schritt === 2 && <GeraeteSchritt />}
          {schritt === 3 && <KapitelSchritt />}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Später
          </Button>
          <div className="flex gap-2">
            {schritt > 0 && (
              <Button variant="outline" size="sm" onClick={() => setSchritt((s) => s - 1)}>
                Zurück
              </Button>
            )}
            {letzter ? (
              <Button size="sm" onClick={() => onFertig('einAus')}>
                Fertig
              </Button>
            ) : (
              <Button size="sm" onClick={weiter}>
                Weiter
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>,
    document.body
  )
}
