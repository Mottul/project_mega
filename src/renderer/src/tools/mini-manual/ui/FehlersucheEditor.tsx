// Fehlersuche als Liste (Festlegung 11): links die Fälle, rechts der gewählte Fall mit einer
// Zeile je Schritt – Stufe, Frage, Ja-Ziel, Nein-Ziel. Ziele zeigen auf Kennungen, Nummern
// ergeben sich aus der Reihenfolge; die Prüfung meldet tote Ziele, Unerreichbares, Schleifen.

import { useEffect, useMemo, useState } from 'react'
import { BookPlus, Plus, Save } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { Select } from '@renderer/components/ui/select'
import { Griff, useSortable, type Sortable } from '@renderer/components/ui/sortable'
import { STATUS } from '@renderer/components/ui/status'
import { LiveInput } from '@renderer/components/ui/textarea'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { cn } from '@renderer/lib/utils'
import type { EigenerBaustein } from '@shared/types'
import {
  bibliotheksFallEinfuegen,
  ersetze,
  fallEntfernen,
  neuerFall,
  neuerSchritt,
  schrittEntfernen,
  verschiebe,
  zieheNach
} from '../aktionen'
import { FEHLERFAELLE } from '../bibliothek'
import { pruefeFall } from '../fehlersuche'
import { BEREICHE, uid, type Bereich, type Fehlerfall, type FSchritt, type Ziel } from '../model'
import { fehlerfall as pruefeFehlerfall } from '../sanitize'
import { useMiniManual } from '../store'
import { speichereBaustein } from './bausteinSpeichern'
import { FotoFeld, StufeSelect, ZeilenKnoepfe } from './teile'

/** Ziel als Wert der Auswahlliste */
function zielWert(z: Ziel | null): string {
  if (!z) return 'weiter'
  if (z.art === 'schritt' || z.art === 'fall') return `${z.art}:${z.id}`
  return z.art
}

function zielAus(v: string, alt: Ziel | null): Ziel | null {
  if (v === 'weiter') return null
  if (v.startsWith('schritt:')) return { art: 'schritt', id: v.slice(8) }
  if (v.startsWith('fall:')) return { art: 'fall', id: v.slice(5) }
  if (v === 'loesung') return { art: 'loesung', text: alt?.art === 'loesung' ? alt.text : '' }
  return v === 'geloest' ? { art: 'geloest' } : { art: 'anrufen' }
}

function ZielWahl({
  label,
  ziel,
  fall,
  faelle,
  selbst,
  mitWeiter,
  onChange
}: {
  label: string
  ziel: Ziel | null
  fall: Fehlerfall
  faelle: Fehlerfall[]
  selbst: string
  mitWeiter: boolean
  onChange: (z: Ziel | null) => void
}): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Select
        size="xs"
        aria-label={label}
        value={zielWert(ziel)}
        onChange={(e) => onChange(zielAus(e.target.value, ziel))}
      >
        {mitWeiter && <option value="weiter">— (Anweisung, nur „Weiter“)</option>}
        <optgroup label="Ergebnis">
          <option value="geloest">Gelöst</option>
          <option value="loesung">Lösung …</option>
          <option value="anrufen">Anrufen</option>
        </optgroup>
        <optgroup label="Schritt">
          {fall.schritte
            .filter((s) => s.id !== selbst)
            .map((s) => (
              <option key={s.id} value={`schritt:${s.id}`}>
                {fall.schritte.indexOf(s) + 1}. {s.text.slice(0, 40) || '(ohne Text)'}
              </option>
            ))}
        </optgroup>
        {faelle.length > 1 && (
          <optgroup label="anderer Fall">
            {faelle
              .filter((f) => f.id !== fall.id)
              .map((f) => (
                <option key={f.id} value={`fall:${f.id}`}>
                  {f.titel || '(ohne Titel)'}
                </option>
              ))}
          </optgroup>
        )}
      </Select>
      {ziel?.art === 'loesung' && (
        <LiveInput
          value={ziel.text}
          aria-label={`${label}: Lösung`}
          placeholder="Lösung, z. B. Sicherung einschalten"
          onCommit={(text) => onChange({ art: 'loesung', text })}
        />
      )}
    </div>
  )
}

function SchrittZeile({
  s,
  nr,
  fall,
  faelle,
  set,
  oben,
  unten,
  weg,
  sort
}: {
  s: FSchritt
  nr: number
  fall: Fehlerfall
  faelle: Fehlerfall[]
  set: (s: FSchritt) => void
  oben?: () => void
  unten?: () => void
  weg: () => void
  sort: Sortable
}): JSX.Element {
  const it = sort.item(s.id)
  return (
    <div
      {...it}
      className={cn('space-y-2 rounded-lg border border-border bg-background/40 p-3', it.className)}
      data-testid="fall-schritt"
    >
      {/* Frage über die ganze Breite – sie ist der längste Text des Schritts */}
      <div className="flex items-center gap-2">
        <Griff sort={sort} id={s.id} was="Schritt" />
        <span className="w-6 shrink-0 font-mono text-sm font-semibold text-primary">{nr}</span>
        <LiveInput
          value={s.text}
          aria-label={`Schritt ${nr}: Frage oder Anweisung`}
          placeholder={s.nein ? 'Frage, z. B. Leuchtet die LED?' : 'Anweisung'}
          onCommit={(text) => set({ ...s, text })}
        />
        <ZeilenKnoepfe was="Schritt" onUp={oben} onDown={unten} onDelete={weg} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        {s.stufeAus ? (
          <Badge tone="neutral">Stufe je Modul</Badge>
        ) : (
          <StufeSelect value={s.stufe} onChange={(stufe) => set({ ...s, stufe })} />
        )}
        <FotoFeld klein hash={s.foto} onChange={(foto) => set({ ...s, foto })} />
      </div>
      <div className="grid grid-cols-1 gap-2 pl-8 md:grid-cols-2">
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {s.nein ? 'Ja' : 'Dann'}
          </span>
          <ZielWahl
            label={`Schritt ${nr}: ${s.nein ? 'Ja' : 'Dann'}`}
            ziel={s.ja}
            fall={fall}
            faelle={faelle}
            selbst={s.id}
            mitWeiter={false}
            onChange={(z) => z && set({ ...s, ja: z })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Nein</span>
          <ZielWahl
            label={`Schritt ${nr}: Nein`}
            ziel={s.nein}
            fall={fall}
            faelle={faelle}
            selbst={s.id}
            mitWeiter
            onChange={(z) => set({ ...s, nein: z })}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-8">
        <LiveInput
          value={s.hinweis}
          aria-label={`Schritt ${nr}: Hinweis`}
          placeholder="Hinweis (optional), z. B. wo der Schalter sitzt"
          className="min-w-[220px] flex-1"
          onCommit={(hinweis) => set({ ...s, hinweis })}
        />
        <Checkbox
          checked={s.ruecksprache}
          onChange={(ruecksprache) => set({ ...s, ruecksprache })}
          label="vorher kurz anrufen"
          hint="Erscheint als Hinweis mit dem Kontakt. Der Schritt bleibt für seine Stufe sichtbar."
        />
        {s.nein && (
          <Checkbox
            checked={s.antwortAus === 'glasfaser'}
            onChange={(v) => set({ ...s, antwortAus: v ? 'glasfaser' : null })}
            label="Antwort aus der Planung: Glasfaser"
            hint="Für „Läuft das Signal über Glasfaser?“: Haben alle Wände der LED-Wall-Kopie Glasfaser (bzw. keine), entfällt die Frage in der Ausgabe und es geht gleich mit Ja (bzw. Nein) weiter."
          />
        )}
        <Checkbox
          checked={s.stufeAus === 'im-tausch'}
          onChange={(v) => set({ ...s, stufeAus: v ? 'im-tausch' : null })}
          label="Stufe aus dem Modul (IM-Tausch)"
          hint="496-2,0 und rX3ioBF: werkzeuglos, ab Bedienung mit Rücksprache. uS2+: 8 Schrauben je IM, nur Technik. Ohne LED-Wall-Planung: Technik."
        />
      </div>
    </div>
  )
}

function FallEditor({ fall, faelle }: { fall: Fehlerfall; faelle: Fehlerfall[] }): JSX.Element {
  const update = useMiniManual((s) => s.update)
  const set = (fn: (f: Fehlerfall) => Fehlerfall): void =>
    update((a) => ({ ...a, fehlerfaelle: ersetze(a.fehlerfaelle, fall.id, fn) }))
  const probleme = useMemo(() => pruefeFall(fall, faelle), [fall, faelle])
  // Nummern folgen der Reihenfolge, Ziele zeigen auf Kennungen – Ziehen ändert keinen Verweis
  const sort = useSortable((von, nach, hinter) =>
    set((f) => ({ ...f, schritte: zieheNach(f.schritte, von, nach, hinter) }))
  )

  async function alsBaustein(): Promise<void> {
    const { baustein: res, fehler } = await speichereBaustein({
      id: uid(),
      art: 'fall',
      titel: fall.titel || 'Fehlerfall',
      kapitel: 'fehlersuche',
      daten: fall
    })
    if (res) toast.success(`Fall „${res.titel}“ als eigener Baustein gespeichert`)
    else if (fehler) toast.error('Fall ließ sich nicht speichern')
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Titel (was man sieht)">
          <LiveInput
            value={fall.titel}
            placeholder="z. B. Ein Teil der Wand ist dunkel"
            onCommit={(titel) => set((f) => ({ ...f, titel }))}
          />
        </Field>
        <Field label="Symptom" hint="Kurz beschreiben, woran man den Fall erkennt.">
          <LiveInput value={fall.symptom} onCommit={(symptom) => set((f) => ({ ...f, symptom }))} />
        </Field>
        <Field label="Bereich">
          <Select
            size="sm"
            value={fall.bereich}
            onChange={(e) => set((f) => ({ ...f, bereich: e.target.value as Bereich }))}
          >
            {BEREICHE.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fall erscheint" hint="Darunter fehlt der ganze Fall in der Ausgabe.">
          <StufeSelect value={fall.stufe} onChange={(stufe) => set((f) => ({ ...f, stufe }))} />
        </Field>
      </div>

      {probleme.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Prüfung des Falls">
          {probleme.map((p, i) => {
            const st = STATUS[p.schwere === 'fehler' ? 'danger' : 'warning']
            return (
              <li key={i} className={cn('flex items-start gap-2', st.className)}>
                <st.icon className="mt-0.5 size-4 shrink-0" /> {p.text}
              </li>
            )
          })}
        </ul>
      )}

      <div className="space-y-2">
        {fall.schritte.map((s, i) => (
          <SchrittZeile
            key={s.id}
            s={s}
            nr={i + 1}
            fall={fall}
            faelle={faelle}
            set={(ns) => set((f) => ({ ...f, schritte: ersetze(f.schritte, s.id, () => ns) }))}
            oben={
              i > 0
                ? () => set((f) => ({ ...f, schritte: verschiebe(f.schritte, s.id, -1) }))
                : undefined
            }
            unten={
              i < fall.schritte.length - 1
                ? () => set((f) => ({ ...f, schritte: verschiebe(f.schritte, s.id, 1) }))
                : undefined
            }
            weg={() => set((f) => schrittEntfernen(f, s.id))}
            sort={sort}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            set((f) => ({
              ...f,
              schritte: [...f.schritte, neuerSchritt(f.schritte.at(-1)?.stufe ?? 1)]
            }))
          }
        >
          <Plus className="size-4" /> Schritt
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void alsBaustein()}>
          <Save className="size-4" /> Als eigenen Baustein speichern
        </Button>
      </div>
    </div>
  )
}

function FallWahl({ onClose }: { onClose: () => void }): JSX.Element {
  const faelle = useMiniManual((s) => s.anleitung.fehlerfaelle)
  const update = useMiniManual((s) => s.update)
  const [eigene, setEigene] = useState<EigenerBaustein[]>([])
  useEffect(() => {
    let alive = true
    void api.bausteine.list().then((l) => alive && setEigene(l.filter((b) => b.art === 'fall')))
    return () => {
      alive = false
    }
  }, [])
  const fehlt = FEHLERFAELLE.filter((f) => !faelle.some((x) => x.id === f.id))
  return (
    <div
      className="space-y-2 rounded-lg border border-primary/40 bg-card p-3"
      role="dialog"
      aria-label="Fehlerfälle der Bibliothek"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Fehlerfälle der Bibliothek</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Schließen
        </Button>
      </div>
      {!fehlt.length && !eigene.length && (
        <p className="text-sm text-muted-foreground">Alle Fälle der Bibliothek sind schon drin.</p>
      )}
      <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
        {fehlt.map((f) => (
          <li key={f.id}>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={() => update((a) => bibliotheksFallEinfuegen(a, f.id))}
            >
              <BookPlus className="size-4" />
              <span className="truncate">{f.titel}</span>
            </Button>
          </li>
        ))}
        {eigene.map((e) => (
          <li key={e.id}>
            <Button
              size="sm"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                const f = pruefeFehlerfall(e.daten)
                if (!f) return toast.warning('Dieser eigene Fall ist beschädigt.')
                update((a) => ({
                  ...a,
                  fehlerfaelle: [
                    ...a.fehlerfaelle,
                    { ...f, id: uid(), herkunft: { baustein: e.id, version: e.version } }
                  ]
                }))
              }}
            >
              <BookPlus className="size-4" />
              <span className="truncate">{e.titel}</span>
              <span className="text-xs text-muted-foreground">eigener</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FehlersucheEditor(): JSX.Element {
  const faelle = useMiniManual((s) => s.anleitung.fehlerfaelle)
  const update = useMiniManual((s) => s.update)
  const [aktiv, setAktiv] = useState<string | null>(faelle[0]?.id ?? null)
  const [wahl, setWahl] = useState(false)
  const fall = faelle.find((f) => f.id === aktiv) ?? faelle[0]
  const sort = useSortable((von, nach, hinter) =>
    update((a) => ({ ...a, fehlerfaelle: zieheNach(a.fehlerfaelle, von, nach, hinter) }))
  )

  async function entfernen(f: Fehlerfall): Promise<void> {
    const ok = await api.confirm({
      message: `Fall „${f.titel || 'ohne Titel'}“ entfernen?`,
      detail: 'Verweise anderer Fälle darauf werden zu „Anrufen“.',
      confirmLabel: 'Entfernen',
      danger: true
    })
    if (ok) update((a) => fallEntfernen(a, f.id))
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="space-y-2">
        <ul className="space-y-1" aria-label="Fehlerfälle">
          {faelle.map((f, i) => {
            const n = pruefeFall(f, faelle).filter((p) => p.schwere === 'fehler').length
            const it = sort.item(f.id)
            return (
              <li
                key={f.id}
                {...it}
                className={cn('flex items-center gap-1 rounded', it.className)}
              >
                <Griff sort={sort} id={f.id} was="Fall" />
                <button
                  type="button"
                  onClick={() => setAktiv(f.id)}
                  aria-current={f.id === fall?.id}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60',
                    f.id === fall?.id && 'bg-primary/10 font-semibold text-primary'
                  )}
                >
                  {i + 1}. {f.titel || '(ohne Titel)'}
                </button>
                {n > 0 && <Badge tone="danger">{n}</Badge>}
                <ZeilenKnoepfe
                  was="Fall"
                  onUp={
                    i > 0
                      ? () =>
                          update((a) => ({
                            ...a,
                            fehlerfaelle: verschiebe(a.fehlerfaelle, f.id, -1)
                          }))
                      : undefined
                  }
                  onDown={
                    i < faelle.length - 1
                      ? () =>
                          update((a) => ({
                            ...a,
                            fehlerfaelle: verschiebe(a.fehlerfaelle, f.id, 1)
                          }))
                      : undefined
                  }
                  onDelete={() => void entfernen(f)}
                />
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const f = neuerFall()
              update((a) => ({ ...a, fehlerfaelle: [...a.fehlerfaelle, f] }))
              setAktiv(f.id)
            }}
          >
            <Plus className="size-4" /> Eigener Fall
          </Button>
          <Button size="sm" onClick={() => setWahl((v) => !v)} aria-expanded={wahl}>
            <BookPlus className="size-4" /> Aus der Bibliothek …
          </Button>
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        {wahl && <FallWahl onClose={() => setWahl(false)} />}
        {fall ? (
          <FallEditor fall={fall} faelle={faelle} />
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Fehlerfälle.</p>
        )}
      </div>
    </div>
  )
}
