// Arbeitsfläche für das gewählte Kapitel: je nach Art Blöcke, Geräte, Zugänge, Fehlersuche,
// LED-Wall oder ein automatisch zusammengestelltes Kapitel (mit Erklärung, woher es kommt).

import { Download } from 'lucide-react'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { LiveInput, TextArea } from '@renderer/components/ui/textarea'
import { kapitel as patchKapitel } from '../aktionen'
import { kapitelDef, type KapitelId } from '../model'
import { useMiniManual } from '../store'
import { BloeckeEditor } from './BloeckeEditor'
import { FehlersucheEditor } from './FehlersucheEditor'
import { LedWallKapitel } from './LedWallKapitel'
import { GeraeteEditor, KontaktEditor, ZugangEditor } from './ListenEditoren'
import { FotoFeld, StufeSelect } from './teile'
import type { LedWallQuelle } from './useLedWallQuelle'

export type Auswahl = KapitelId | 'deckblatt'

function Deckblatt(): JSX.Element {
  const d = useMiniManual((s) => s.anleitung.deckblatt)
  const kopie = useMiniManual((s) => s.anleitung.ledWall?.kennzahlen ?? null)
  const update = useMiniManual((s) => s.update)
  const set = (p: Partial<typeof d>): void =>
    update((a) => ({ ...a, deckblatt: { ...a.deckblatt, ...p } }))
  const vonWand =
    kopie &&
    ((kopie.projekt && kopie.projekt !== d.projekt) || (kopie.kunde && kopie.kunde !== d.kunde))
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Titel, Projekt, Kunde, Ort und Zeitraum stehen in der Schublade unter „Projekt“.
      </p>
      <Field label="Foto auf dem Deckblatt" hint="Am besten die aufgebaute Wand.">
        <FotoFeld hash={d.foto} onChange={(foto) => set({ foto })} />
      </Field>
      {vonWand && kopie && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            set({ projekt: kopie.projekt || d.projekt, kunde: kopie.kunde || d.kunde })
          }
        >
          <Download className="size-4" /> Projekt und Kunde aus der LED-Wall übernehmen (
          {[kopie.projekt, kopie.kunde].filter(Boolean).join(' · ')})
        </Button>
      )}
    </div>
  )
}

function Dokumentstand(): JSX.Element {
  const st = useMiniManual((s) => s.anleitung.stand)
  const update = useMiniManual((s) => s.update)
  const set = (p: Partial<typeof st>): void =>
    update((a) => ({ ...a, stand: { ...a.stand, ...p } }))
  return (
    <div className="grid grid-cols-1 gap-3">
      <Field label="Bearbeitet von">
        <LiveInput value={st.bearbeitet} onCommit={(bearbeitet) => set({ bearbeitet })} />
      </Field>
      <Field label="Änderungen" hint="Was sich gegenüber der letzten Ausgabe geändert hat.">
        <TextArea
          rows={4}
          value={st.aenderungen}
          onCommit={(aenderungen) => set({ aenderungen })}
        />
      </Field>
    </div>
  )
}

export function KapitelEditor({ id, q }: { id: Auswahl; q: LedWallQuelle }): JSX.Element {
  const k = useMiniManual((s) =>
    id === 'deckblatt' ? null : s.anleitung.kapitel.find((x) => x.id === id)
  )
  const update = useMiniManual((s) => s.update)
  if (id === 'deckblatt') return <Deckblatt />
  const d = kapitelDef(id)

  let inhalt: JSX.Element
  switch (d.art) {
    case 'bloecke':
      inhalt = <BloeckeEditor id={id} />
      break
    case 'geraete':
      inhalt = <GeraeteEditor />
      break
    case 'zugang':
      inhalt = <ZugangEditor />
      break
    case 'fehlersuche':
      inhalt = <FehlersucheEditor />
      break
    case 'ledWall':
      inhalt = <LedWallKapitel q={q} />
      break
    default:
      inhalt =
        id === 'kontakt' ? (
          <KontaktEditor />
        ) : id === 'dokumentstand' ? (
          <Dokumentstand />
        ) : (
          <p className="text-sm text-muted-foreground">
            Dieses Kapitel stellt die Mottulbox selbst zusammen – die Vorschau zeigt, was
            herauskommt.
          </p>
        )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{d.titel}</h2>
        {k && (
          <>
            <Checkbox
              checked={k.an}
              onChange={(an) => update((a) => patchKapitel(a, id, (x) => ({ ...x, an })))}
              label="in der Anleitung"
            />
            <StufeSelect
              label="Kapitel erscheint"
              value={k.stufe}
              onChange={(stufe) => update((a) => patchKapitel(a, id, (x) => ({ ...x, stufe })))}
            />
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{d.info}</p>
      {inhalt}
    </div>
  )
}
