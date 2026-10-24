// Schublade des Mini-Manuals: was noch fehlt (Fortschritt), Projekt (Deckblatt), Kapitel an/ab und
// sortieren, Ausgabe (Passwörter) und die Prüfung vor dem Export. Keine Aktionen hier (CLAUDE.md) – Exporte und
// Datei-Menü stehen in der Leiste, Inhalte bearbeitet man auf der Arbeitsfläche.

import { useMemo } from 'react'
import {
  BookOpen,
  Circle,
  CircleCheck,
  ClipboardCheck,
  FileCog,
  ListChecks,
  ListTodo
} from 'lucide-react'
import { PanelSection } from '@renderer/components/ToolShell'
import { Badge } from '@renderer/components/ui/badge'
import { Field } from '@renderer/components/ui/field'
import { Segmented } from '@renderer/components/ui/segmented'
import { STATUS } from '@renderer/components/ui/status'
import { LiveInput } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { Griff, useSortable } from '@renderer/components/ui/sortable'
import { eintraege, kapitel as patchKapitel, verschiebe, zieheNach } from '../aktionen'
import { fortschritt } from '../fortschritt'
import { kapitelDef, type Passwoerter } from '../model'
import type { PruefPunkt } from '../pruefung'
import { useMiniManual } from '../store'
import type { Auswahl } from './KapitelEditor'
import { StufeBalken, ZeilenKnoepfe } from './teile'

const PASSWOERTER: { value: Passwoerter; label: string }[] = [
  { value: 'separat', label: 'separat' },
  { value: 'schwaerzen', label: 'schwärzen' },
  { value: 'drucken', label: 'drucken' }
]

function ProjektPanel(): JSX.Element {
  const titel = useMiniManual((s) => s.anleitung.titel)
  const d = useMiniManual((s) => s.anleitung.deckblatt)
  const update = useMiniManual((s) => s.update)
  const set = (p: Partial<typeof d>): void =>
    update((a) => ({ ...a, deckblatt: { ...a.deckblatt, ...p } }))
  const summary = [d.projekt, d.zeitraum, d.ort].filter((x) => x.trim()).join(' · ')
  return (
    <PanelSection id="projekt" title="Projekt" icon={BookOpen} summary={summary || 'ohne Namen'}>
      <Field label="Titel der Anleitung">
        <LiveInput value={titel} onCommit={(t) => update((a) => ({ ...a, titel: t }))} />
      </Field>
      <Field label="Projekt">
        <LiveInput
          value={d.projekt}
          placeholder="z. B. Messe Dornbirn 2026"
          onCommit={(projekt) => set({ projekt })}
        />
      </Field>
      <Field label="Kunde">
        <LiveInput value={d.kunde} onCommit={(kunde) => set({ kunde })} />
      </Field>
      <Field label="Ort">
        <LiveInput
          value={d.ort}
          placeholder="z. B. Halle 3, Stand 12"
          onCommit={(ort) => set({ ort })}
        />
      </Field>
      <Field label="Zeitraum">
        <LiveInput
          value={d.zeitraum}
          placeholder="z. B. 14.–16.11.2026"
          onCommit={(zeitraum) => set({ zeitraum })}
        />
      </Field>
    </PanelSection>
  )
}

function KapitelPanel({
  auswahl,
  waehle
}: {
  auswahl: Auswahl
  waehle: (a: Auswahl) => void
}): JSX.Element {
  const a = useMiniManual((s) => s.anleitung)
  const update = useMiniManual((s) => s.update)
  const sort = useSortable((von, nach, hinter) =>
    update((x) => ({ ...x, kapitel: zieheNach(x.kapitel, von, nach, hinter) }))
  )
  const an = a.kapitel.filter((k) => k.an).length
  return (
    <PanelSection
      id="kapitel"
      title="Kapitel"
      icon={ListChecks}
      summary={`${an} von ${a.kapitel.length}`}
    >
      <ul className="space-y-0.5" aria-label="Kapitel">
        <li>
          <button
            type="button"
            onClick={() => waehle('deckblatt')}
            aria-current={auswahl === 'deckblatt'}
            className={cn(
              'w-full rounded px-2 py-1 text-left text-sm hover:bg-muted/60',
              auswahl === 'deckblatt' && 'bg-primary/10 font-semibold text-primary'
            )}
          >
            Deckblatt
          </button>
        </li>
        {a.kapitel.map((k, i) => {
          const n = eintraege(a, k.id)
          const it = sort.item(k.id)
          return (
            <li
              key={k.id}
              {...it}
              className={cn('flex items-center gap-1.5 rounded', it.className)}
            >
              <Griff sort={sort} id={k.id} was="Kapitel" />
              <input
                type="checkbox"
                checked={k.an}
                aria-label={`${kapitelDef(k.id).titel} in der Anleitung`}
                onChange={(e) =>
                  update((x) => patchKapitel(x, k.id, (y) => ({ ...y, an: e.target.checked })))
                }
                className="size-4 shrink-0 accent-[hsl(var(--primary))]"
              />
              <button
                type="button"
                onClick={() => waehle(k.id)}
                aria-current={auswahl === k.id}
                className={cn(
                  'min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm hover:bg-muted/60',
                  !k.an && 'text-muted-foreground line-through',
                  auswahl === k.id && 'bg-primary/10 font-semibold text-primary'
                )}
              >
                {kapitelDef(k.id).titel}
              </button>
              {n !== null && (
                <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
              )}
              <StufeBalken stufe={k.stufe} />
              <ZeilenKnoepfe
                was="Kapitel"
                onUp={
                  i > 0
                    ? () => update((x) => ({ ...x, kapitel: verschiebe(x.kapitel, k.id, -1) }))
                    : undefined
                }
                onDown={
                  i < a.kapitel.length - 1
                    ? () => update((x) => ({ ...x, kapitel: verschiebe(x.kapitel, k.id, 1) }))
                    : undefined
                }
              />
            </li>
          )
        })}
      </ul>
    </PanelSection>
  )
}

function AusgabePanel(): JSX.Element {
  const pw = useMiniManual((s) => s.anleitung.ausgabe.passwoerter)
  const online = useMiniManual((s) => s.anleitung.ausgabe.online)
  const update = useMiniManual((s) => s.update)
  return (
    <PanelSection
      id="ausgabe"
      title="Ausgabe"
      icon={FileCog}
      summary={`Passwörter: ${PASSWOERTER.find((p) => p.value === pw)?.label}${online ? ' · online' : ''}`}
      defaultOpen={false}
    >
      <Field
        label="Online-Fassung"
        hint="Über die Leiste: Handy ▾ → Online stellen. Beim Aktualisieren bleibt die Adresse gleich; die Kurzkarte druckt sie als QR-Code. Online nie Zugangsdaten, höchstens Stufe Betreuung."
      >
        {online ? (
          <a
            href={online.url}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-xs text-primary underline-offset-2 hover:underline"
            data-testid="online-adresse"
          >
            {online.url}
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">noch nicht online</p>
        )}
      </Field>
      <Field
        label="Passwörter im PDF"
        hint="separat: „wird separat übergeben“ · schwärzen: Punkte statt Passwort · drucken: im Klartext. Die Stufe Bedienung zeigt Zugangsdaten nie."
      >
        <Segmented
          label="Passwörter im PDF"
          value={pw}
          options={PASSWOERTER}
          onChange={(passwoerter) =>
            update((a) => ({ ...a, ausgabe: { ...a.ausgabe, passwoerter } }))
          }
        />
      </Field>
    </PanelSection>
  )
}

/** „Was fehlt noch“: wenige Meilensteine mit Fortschritt; ein Klick führt an die Stelle */
function FortschrittPanel({
  punkte,
  waehle
}: {
  punkte: PruefPunkt[]
  waehle: (a: Auswahl) => void
}): JSX.Element {
  const a = useMiniManual((s) => s.anleitung)
  const liste = useMemo(() => fortschritt(a, punkte), [a, punkte])
  const fertig = liste.filter((m) => m.erledigt).length
  return (
    <PanelSection
      id="fortschritt"
      title="Was fehlt noch"
      icon={ListTodo}
      summary={
        fertig === liste.length ? 'alles erledigt' : `${fertig} von ${liste.length} erledigt`
      }
    >
      <div className="flex items-center gap-2" aria-hidden="true">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${Math.round((fertig / Math.max(1, liste.length)) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {fertig} von {liste.length}
        </span>
      </div>
      <ul className="space-y-1" aria-label="Was fehlt noch">
        {liste.map((m) => (
          <li key={m.id}>
            {m.erledigt ? (
              <span className="flex items-start gap-2 px-1 py-0.5 text-sm text-muted-foreground">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                {m.text}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => waehle(m.ziel)}
                className="flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-muted/60"
              >
                <Circle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {m.text} <span className="text-primary">→</span>
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </PanelSection>
  )
}

function PruefPanel({
  punkte,
  waehle
}: {
  punkte: PruefPunkt[]
  waehle: (a: Auswahl) => void
}): JSX.Element {
  const ernst = punkte.filter((p) => p.schwere !== 'info').length
  return (
    <PanelSection
      id="pruefung"
      title="Vor dem Export"
      icon={ClipboardCheck}
      summary={ernst ? `${ernst} Hinweis(e)` : 'alles bereit'}
      right={
        ernst ? (
          <Badge tone={punkte.some((p) => p.schwere === 'fehler') ? 'danger' : 'warning'}>
            {ernst}
          </Badge>
        ) : undefined
      }
    >
      {punkte.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nichts zu beanstanden.</p>
      ) : (
        <ul className="space-y-1.5" aria-label="Prüfung vor dem Export">
          {punkte.map((p, i) => {
            const st =
              STATUS[
                p.schwere === 'fehler' ? 'danger' : p.schwere === 'warnung' ? 'warning' : 'info'
              ]
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => waehle(p.kapitel)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-muted/60',
                    st.className
                  )}
                >
                  <st.icon className="mt-0.5 size-4 shrink-0" />
                  <span>{p.text}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </PanelSection>
  )
}

export function Schublade({
  auswahl,
  waehle,
  punkte
}: {
  auswahl: Auswahl
  waehle: (a: Auswahl) => void
  punkte: PruefPunkt[]
}): JSX.Element {
  return (
    <>
      <FortschrittPanel punkte={punkte} waehle={waehle} />
      <ProjektPanel />
      <KapitelPanel auswahl={auswahl} waehle={waehle} />
      <AusgabePanel />
      <PruefPanel punkte={punkte} waehle={waehle} />
    </>
  )
}
