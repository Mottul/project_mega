// Inhalt eines Kapitels als Liste von Blöcken: Text, nummerierte Schritte, Hinweis, Foto.
// Bausteine (mitgeliefert oder eigene) kommen als Kopie mit Herkunft dazu; eigene Bausteine
// liegen als Datei im main (api.bausteine).

import { useMemo, useState } from 'react'
import { BookPlus, ListOrdered, MessageSquareWarning, Plus, Save, Type } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Select } from '@renderer/components/ui/select'
import { LiveInput, TextArea } from '@renderer/components/ui/textarea'
import { toast } from '@renderer/lib/toast'
import { Griff, useSortable, type Sortable } from '@renderer/components/ui/sortable'
import { cn } from '@renderer/lib/utils'
import {
  bausteinEinfuegen,
  bloecke,
  entferne,
  ersetze,
  neuerBlock,
  verschiebe,
  zieheNach
} from '../aktionen'
import { alsBaustein } from '../aktualisieren'
import { BAUSTEINE, bausteinById, type Baustein } from '../bibliothek'
import { kapitelDef, uid, type Block, type KapitelId, type Schritt } from '../model'
import { useMiniManual } from '../store'
import { projektText, treffer, vorschlaege } from '../vorschlaege'
import { speichereBaustein } from './bausteinSpeichern'
import { useEigeneBausteine } from './eigeneBausteine'
import { NeuereFassungHinweis } from './NeuereFassung'
import { FotoFeld, StufeSelect, ZeilenKnoepfe } from './teile'

export const AUSZEICHNUNG_HILFE =
  'Leerzeile = neuer Absatz · „- “ Aufzählung · „1. “ nummeriert · „> “ Hinweis (bis zur Leerzeile, Listen darin erlaubt) · **fett** · Platzhalter wie {pc.name}, {prozessor.ip}, {wand.aufloesung}, {kontakt.mobil}, {projekt.ort}'

const TYP_LABEL: Record<Block['typ'], string> = {
  text: 'Text',
  schritte: 'Schritte',
  hinweis: 'Hinweis',
  foto: 'Foto'
}

function SchritteListe({
  schritte,
  onChange
}: {
  schritte: Schritt[]
  onChange: (s: Schritt[]) => void
}): JSX.Element {
  const sort = useSortable((von, nach, hinter) => onChange(zieheNach(schritte, von, nach, hinter)))
  return (
    <div className="space-y-1.5">
      {schritte.map((s, i) => {
        const it = sort.item(s.id)
        return (
          <div key={s.id} {...it} className={cn('flex items-center gap-2 rounded', it.className)}>
            <Griff sort={sort} id={s.id} was="Schritt" />
            <span className="w-5 shrink-0 text-right font-mono text-sm text-primary">{i + 1}</span>
            <LiveInput
              value={s.text}
              aria-label={`Schritt ${i + 1}`}
              placeholder="Was ist zu tun?"
              onCommit={(text) => onChange(ersetze(schritte, s.id, (x) => ({ ...x, text })))}
            />
            <StufeSelect
              value={s.stufe}
              onChange={(stufe) => onChange(ersetze(schritte, s.id, (x) => ({ ...x, stufe })))}
            />
            <FotoFeld
              klein
              hash={s.foto}
              onChange={(foto) => onChange(ersetze(schritte, s.id, (x) => ({ ...x, foto })))}
            />
            <ZeilenKnoepfe
              was="Schritt"
              onUp={i > 0 ? () => onChange(verschiebe(schritte, s.id, -1)) : undefined}
              onDown={
                i < schritte.length - 1 ? () => onChange(verschiebe(schritte, s.id, 1)) : undefined
              }
              onDelete={() => onChange(entferne(schritte, s.id))}
            />
          </div>
        )
      })}
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          onChange([
            ...schritte,
            { id: uid(), text: '', stufe: schritte.at(-1)?.stufe ?? 1, foto: null }
          ])
        }
      >
        <Plus className="size-4" /> Schritt
      </Button>
    </div>
  )
}

function BlockKarte({
  b,
  set,
  oben,
  unten,
  weg,
  sort
}: {
  b: Block
  set: (b: Block) => void
  oben?: () => void
  unten?: () => void
  weg: () => void
  sort: Sortable
}): JSX.Element {
  const herkunft = 'herkunft' in b && b.herkunft ? bausteinById(b.herkunft.baustein) : undefined
  const it = sort.item(b.id)
  return (
    <div
      {...it}
      className={cn('space-y-2 rounded-lg border border-border bg-background/40 p-3', it.className)}
      data-testid="block"
    >
      <div className="flex items-center gap-2">
        <Griff sort={sort} id={b.id} was="Block" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {TYP_LABEL[b.typ]}
        </span>
        {herkunft && (
          <Badge tone="neutral" className="truncate">
            aus „{herkunft.titel}“
          </Badge>
        )}
        <span className="ml-auto" />
        <StufeSelect value={b.stufe} onChange={(stufe) => set({ ...b, stufe })} />
        <ZeilenKnoepfe was="Block" onUp={oben} onDown={unten} onDelete={weg} />
      </div>
      {b.typ === 'text' && (
        <TextArea
          rows={4}
          value={b.text}
          aria-label="Text"
          placeholder="Text …"
          onCommit={(text) => set({ ...b, text })}
        />
      )}
      {b.typ === 'hinweis' && (
        <>
          <Select
            size="xs"
            aria-label="Art des Hinweises"
            value={b.art}
            onChange={(e) => set({ ...b, art: e.target.value === 'warnung' ? 'warnung' : 'info' })}
          >
            <option value="info">Hinweis</option>
            <option value="warnung">Warnung</option>
          </Select>
          <TextArea
            rows={2}
            value={b.text}
            aria-label="Hinweis"
            onCommit={(text) => set({ ...b, text })}
          />
        </>
      )}
      {b.typ === 'foto' && (
        <div className="flex flex-wrap items-center gap-3">
          <FotoFeld hash={b.foto} onChange={(foto) => set({ ...b, foto })} />
          <LiveInput
            value={b.text}
            aria-label="Bildunterschrift"
            placeholder="Bildunterschrift"
            className="max-w-sm"
            onCommit={(text) => set({ ...b, text })}
          />
        </div>
      )}
      {b.typ === 'schritte' && (
        <>
          <LiveInput
            value={b.titel}
            aria-label="Überschrift der Schritte"
            placeholder="Überschrift, z. B. Einschalten"
            onCommit={(titel) => set({ ...b, titel })}
          />
          <SchritteListe schritte={b.schritte} onChange={(schritte) => set({ ...b, schritte })} />
        </>
      )}
    </div>
  )
}

/** Was das Projekt über sich sagt (Geräte, LED-Wand) – für die Vorschläge nach Stichworten */
function useProjektText(): string {
  const geraete = useMiniManual((s) => s.anleitung.geraete)
  const ledWall = useMiniManual((s) => s.anleitung.ledWall)
  return useMemo(() => projektText({ geraete, ledWall }), [geraete, ledWall])
}

/** Bausteine für dieses Kapitel: mitgelieferte und eigene; dazu „als eigenen Baustein speichern“ */
function BausteinWahl({ id, onClose }: { id: KapitelId; onClose: () => void }): JSX.Element {
  const update = useMiniManual((s) => s.update)
  const alleEigenen = useEigeneBausteine()
  const eigene = alleEigenen.filter((b) => b.art === 'bloecke' && b.kapitel === id)
  const [titel, setTitel] = useState('')
  const aktuelle = useMiniManual((s) => s.anleitung.kapitel.find((k) => k.id === id)?.bloecke ?? [])

  const text = useProjektText()
  // Passende zuerst (sort ist stabil: sonst Reihenfolge der Bibliothek)
  const mitgeliefert = BAUSTEINE.filter((b) => b.kapitel === id)
    .map((b) => ({ b, passt: treffer(b, text) }))
    .sort((x, y) => Number(y.passt.length > 0) - Number(x.passt.length > 0))
  const einfuegen = (b: Baustein): void => {
    update((a) => bausteinEinfuegen(a, b, id))
    onClose()
  }

  async function speichern(): Promise<void> {
    const t = titel.trim()
    if (!t || !aktuelle.length) return
    const { baustein: res, fehler } = await speichereBaustein({
      id: uid(),
      art: 'bloecke',
      titel: t,
      kapitel: id,
      daten: aktuelle
    })
    if (res) {
      toast.success(`Baustein „${res.titel}“ gespeichert`)
      setTitel('')
    } else if (fehler) toast.error('Baustein ließ sich nicht speichern')
  }

  return (
    <div
      className="space-y-3 rounded-lg border border-primary/40 bg-card p-3"
      role="dialog"
      aria-label="Bausteine"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Bausteine für „{kapitelDef(id).titel}“</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Schließen
        </Button>
      </div>
      {!mitgeliefert.length && !eigene.length && (
        <p className="text-sm text-muted-foreground">
          Für dieses Kapitel gibt es noch keine Bausteine.
        </p>
      )}
      <ul className="space-y-1">
        {mitgeliefert.map(({ b, passt }) => (
          <li key={b.id} className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => einfuegen(b)}>
              <BookPlus className="size-4" /> {b.titel}
            </Button>
            <span className="text-xs text-muted-foreground">mitgeliefert</span>
            {passt.length > 0 && (
              <Badge tone="info" title={`Stichworte: ${passt.join(', ')}`}>
                passt zum Projekt
              </Badge>
            )}
          </li>
        ))}
        {eigene.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => einfuegen(alsBaustein(e, id))}>
              <BookPlus className="size-4" /> {e.titel}
            </Button>
            <span className="text-xs text-muted-foreground">
              eigener{e.geaendertVon ? ` · ${e.geaendertVon}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="Titel des neuen Bausteins"
          aria-label="Titel des neuen Bausteins"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-input/40 px-2 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!titel.trim() || !aktuelle.length}
          onClick={() => void speichern()}
          title="Den ganzen Inhalt dieses Kapitels als eigenen Baustein speichern"
        >
          <Save className="size-4" /> Kapitel als Baustein speichern
        </Button>
      </div>
    </div>
  )
}

/** `extra`: Knöpfe nur für dieses Kapitel (Software: „Aus dem Video-Player“) */
export function BloeckeEditor({ id, extra }: { id: KapitelId; extra?: JSX.Element }): JSX.Element {
  const k = useMiniManual((s) => s.anleitung.kapitel.find((x) => x.id === id))
  const update = useMiniManual((s) => s.update)
  const [wahl, setWahl] = useState(false)
  const text = useProjektText()
  // passende Bausteine, die im Kapitel noch fehlen – als Zahl am Knopf, nicht als Aufforderung
  const passend = useMemo(() => (k ? vorschlaege(text, k).length : 0), [text, k])
  const setBloecke = (fn: (b: Block[]) => Block[]): void => update((a) => bloecke(a, id, fn))
  const sort = useSortable((von, nach, hinter) =>
    setBloecke((bs) => zieheNach(bs, von, nach, hinter))
  )
  if (!k) return <></>
  const add = (typ: Block['typ']): void => setBloecke((bs) => [...bs, neuerBlock(typ, k.stufe)])

  return (
    <div className="space-y-3">
      <NeuereFassungHinweis kapitel={id} />
      {k.bloecke.map((b, i) => (
        <BlockKarte
          key={b.id}
          sort={sort}
          b={b}
          set={(nb) => setBloecke((bs) => ersetze(bs, b.id, () => nb))}
          oben={i > 0 ? () => setBloecke((bs) => verschiebe(bs, b.id, -1)) : undefined}
          unten={
            i < k.bloecke.length - 1 ? () => setBloecke((bs) => verschiebe(bs, b.id, 1)) : undefined
          }
          weg={() => setBloecke((bs) => entferne(bs, b.id))}
        />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => add('schritte')}>
          <ListOrdered className="size-4" /> Schritte
        </Button>
        <Button size="sm" variant="outline" onClick={() => add('text')}>
          <Type className="size-4" /> Text
        </Button>
        <Button size="sm" variant="outline" onClick={() => add('hinweis')}>
          <MessageSquareWarning className="size-4" /> Hinweis
        </Button>
        <Button size="sm" variant="outline" onClick={() => add('foto')}>
          <Plus className="size-4" /> Foto
        </Button>
        <Button size="sm" onClick={() => setWahl((v) => !v)} aria-expanded={wahl}>
          <BookPlus className="size-4" /> Baustein einfügen …
          {passend > 0 && (
            <span className="text-xs opacity-80" data-testid="baustein-passend">
              {passend === 1 ? '1 passt' : `${passend} passen`}
            </span>
          )}
        </Button>
        {extra}
        <InfoTip text={AUSZEICHNUNG_HILFE} label="Auszeichnung und Platzhalter" />
      </div>
      {wahl && <BausteinWahl id={id} onClose={() => setWahl(false)} />}
    </div>
  )
}
