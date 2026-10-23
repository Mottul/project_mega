// Kapitel Bedienfeld: Text und Bausteine wie in jedem Kapitel, darunter die Tastenfelder – Gerät
// wählen, Seiten anlegen, Taste anklicken und beschriften, Tasten per Ziehen tauschen. Gewählte
// Seite und Taste sind Bedienzustand und liegen nur hier, nicht in der Anleitung.

import { useState } from 'react'
import { fotoUrl } from '@shared/fotos'
import { ArrowLeft, ArrowRight, Eraser, Plus, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import { LiveInput, TextArea } from '@renderer/components/ui/textarea'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { entferne, ersetze, verschiebe } from '../aktionen'
import {
  BEDIEN_GERAETE,
  RASTER_MAX,
  ausserhalb,
  geraetDef,
  leereTaste,
  mitRaster,
  navTitel,
  neueSeite,
  neuesBedienfeld,
  seiteEntfernen,
  seitenName,
  setzeTaste,
  tasteAn,
  tastenNr,
  tauscheTasten,
  abgedeckt,
  hatSpannen,
  nummer
} from '../bedienfeld'
import type { BedienGeraet, BedienSeite, Bedienfeld, Taste, TastenNav } from '../model'
import { useMiniManual } from '../store'
import { BloeckeEditor } from './BloeckeEditor'
import { FotoFeld, StufeSelect, ZeilenKnoepfe } from './teile'
import { BedienfeldUebernahme } from './Uebernahme'

type Platz = { spalte: number; zeile: number }

const ZIEHEN = 'application/x-mottulbox-taste'

export function BedienfeldKapitel(): JSX.Element {
  const felder = useMiniManual((s) => s.anleitung.bedienfelder)
  const update = useMiniManual((s) => s.update)
  const set = (fn: (l: Bedienfeld[]) => Bedienfeld[]): void =>
    update((a) => ({ ...a, bedienfelder: fn(a.bedienfelder) }))

  async function entfernen(b: Bedienfeld): Promise<void> {
    const n = b.seiten.reduce((m, s) => m + s.tasten.length, 0)
    if (n) {
      const ok = await api.confirm({
        message: `Bedienfeld „${b.name.trim() || geraetDef(b.geraet).label}“ entfernen?`,
        detail: `${n === 1 ? 'Eine belegte Taste geht' : `${n} belegte Tasten gehen`} verloren.`,
        confirmLabel: 'Entfernen',
        danger: true
      })
      if (!ok) return
    }
    set((l) => entferne(l, b.id))
  }

  return (
    <div className="space-y-4">
      <BloeckeEditor id="bedienfeld" />
      {felder.map((b, i) => (
        <Tastenfeld
          key={b.id}
          b={b}
          set={(fn) => set((l) => ersetze(l, b.id, fn))}
          oben={i > 0 ? () => set((l) => verschiebe(l, b.id, -1)) : undefined}
          unten={i < felder.length - 1 ? () => set((l) => verschiebe(l, b.id, 1)) : undefined}
          weg={() => void entfernen(b)}
        />
      ))}
      <Button
        size="sm"
        variant="outline"
        aria-label="Bedienfeld hinzufügen"
        onClick={() => set((l) => [...l, neuesBedienfeld()])}
      >
        <Plus className="size-4" /> Bedienfeld
      </Button>
      <BedienfeldUebernahme />
    </div>
  )
}

function Tastenfeld({
  b,
  set,
  oben,
  unten,
  weg
}: {
  b: Bedienfeld
  set: (fn: (b: Bedienfeld) => Bedienfeld) => void
  oben?: () => void
  unten?: () => void
  weg: () => void
}): JSX.Element {
  const [seiteId, setSeiteId] = useState(b.seiten[0].id)
  const [platz, setPlatz] = useState<Platz | null>(null)
  // eine entfernte Seite (auch aus einem anderen Fenster) fällt auf die erste zurück
  const seite = b.seiten.find((s) => s.id === seiteId) ?? b.seiten[0]
  const si = b.seiten.indexOf(seite)
  const d = geraetDef(b.geraet)
  const setSeite = (fn: (s: BedienSeite) => BedienSeite): void =>
    set((x) => ({ ...x, seiten: ersetze(x.seiten, seite.id, fn) }))

  async function raster(
    geraet: BedienGeraet,
    wunsch?: { spalten?: number; zeilen?: number }
  ): Promise<void> {
    const neu = mitRaster(b, geraet, wunsch)
    const n = ausserhalb(b, neu.spalten, neu.zeilen)
    if (n) {
      const ok = await api.confirm({
        message: `${n === 1 ? 'Eine Taste liegt' : `${n} Tasten liegen`} außerhalb des neuen Rasters.`,
        detail: `${neu.spalten} × ${neu.zeilen} statt ${b.spalten} × ${b.zeilen} – diese Tasten werden entfernt.`,
        confirmLabel: 'Raster ändern',
        danger: true
      })
      if (!ok) return
    }
    // frisch aus dem Store rechnen: Während der Rückfrage kann sich das Feld geändert haben
    set((x) => mitRaster(x, geraet, wunsch))
    if (platz && (platz.spalte >= neu.spalten || platz.zeile >= neu.zeilen)) setPlatz(null)
  }

  async function seiteWeg(): Promise<void> {
    if (seite.tasten.length) {
      const ok = await api.confirm({
        message: `„${seitenName(b, seite.id)}“ entfernen?`,
        detail: `${seite.tasten.length === 1 ? 'Die belegte Taste geht' : `Die ${seite.tasten.length} belegten Tasten gehen`} verloren; Tasten, die dorthin führen, verlieren ihr Ziel.`,
        confirmLabel: 'Entfernen',
        danger: true
      })
      if (!ok) return
    }
    set((x) => seiteEntfernen(x, seite.id))
    setPlatz(null)
  }

  function neueSeiteAnlegen(): void {
    const s = neueSeite()
    set((x) => ({ ...x, seiten: [...x.seiten, s] }))
    setSeiteId(s.id)
    setPlatz(null)
  }

  const gewaehlt = platz
    ? (tasteAn(seite, platz.spalte, platz.zeile) ?? leereTaste(platz.spalte, platz.zeile))
    : null

  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-background/40 p-3"
      data-testid="bedienfeld"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-40 flex-1">
          <LiveInput
            value={b.name}
            aria-label="Name des Bedienfelds"
            placeholder="Name, z. B. Stream Deck Regie"
            onCommit={(name) => set((x) => ({ ...x, name }))}
          />
        </div>
        <Select
          size="xs"
          aria-label="Gerät"
          value={b.geraet}
          onChange={(e) => void raster(e.target.value as BedienGeraet)}
        >
          {BEDIEN_GERAETE.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label} ({g.spalten} × {g.zeilen})
            </option>
          ))}
        </Select>
        {d.waehlbar && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <NumberField
              className="h-7 w-14"
              aria-label="Spalten"
              value={b.spalten}
              min={1}
              max={RASTER_MAX.spalten}
              onCommit={(spalten) => void raster(b.geraet, { spalten })}
            />
            ×
            <NumberField
              className="h-7 w-14"
              aria-label="Zeilen"
              value={b.zeilen}
              min={1}
              max={RASTER_MAX.zeilen}
              onCommit={(zeilen) => void raster(b.geraet, { zeilen })}
            />
          </span>
        )}
        <StufeSelect
          label="Bedienfeld erscheint"
          value={b.stufe}
          onChange={(stufe) => set((x) => ({ ...x, stufe }))}
        />
        <ZeilenKnoepfe was="Bedienfeld" onUp={oben} onDown={unten} onDelete={weg} />
      </div>
      <TextArea
        rows={2}
        value={b.notiz}
        aria-label="Notiz zum Bedienfeld"
        placeholder={d.hinweis ?? 'Notiz, z. B. wo das Gerät steht oder welches Profil geladen ist'}
        onCommit={(notiz) => set((x) => ({ ...x, notiz }))}
      />

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Seiten">
        {b.seiten.map((s) => (
          <Button
            key={s.id}
            size="sm"
            role="tab"
            variant={s.id === seite.id ? 'default' : 'outline'}
            aria-selected={s.id === seite.id}
            onClick={() => {
              setSeiteId(s.id)
              setPlatz(null)
            }}
          >
            {seitenName(b, s.id)}
          </Button>
        ))}
        <Button size="sm" variant="ghost" aria-label="Seite hinzufügen" onClick={neueSeiteAnlegen}>
          <Plus className="size-4" /> Seite
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <LiveInput
            key={seite.id}
            value={seite.name}
            aria-label="Name der Seite"
            placeholder={`Seite ${si + 1}`}
            onCommit={(name) => setSeite((s) => ({ ...s, name }))}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={si === 0}
          onClick={() => set((x) => ({ ...x, seiten: verschiebe(x.seiten, seite.id, -1) }))}
          aria-label="Seite nach vorne"
          title="nach vorne"
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={si === b.seiten.length - 1}
          onClick={() => set((x) => ({ ...x, seiten: verschiebe(x.seiten, seite.id, 1) }))}
          aria-label="Seite nach hinten"
          title="nach hinten"
        >
          <ArrowRight className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-danger"
          disabled={b.seiten.length <= 1}
          onClick={() => void seiteWeg()}
          aria-label="Seite entfernen"
          title="Seite entfernen"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <Raster
        b={b}
        seite={seite}
        platz={platz}
        waehle={setPlatz}
        tausche={(von, nach) => {
          setSeite((s) => tauscheTasten(s, von, nach))
          setPlatz(nach)
        }}
      />

      {platz && gewaehlt ? (
        <TastenForm
          key={`${seite.id}:${platz.spalte}:${platz.zeile}`}
          b={b}
          seite={seite}
          t={gewaehlt}
          aendern={(p) =>
            setSeite((s) =>
              setzeTaste(s, {
                ...(tasteAn(s, platz.spalte, platz.zeile) ?? leereTaste(platz.spalte, platz.zeile)),
                ...p
              })
            )
          }
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {hatSpannen(b)
            ? 'Kachel anklicken, um sie zu beschriften – Lage und Größe kommen aus der OSC-Steuerung.'
            : 'Taste anklicken, um sie zu beschriften; zum Tauschen auf einen anderen Platz ziehen.'}
        </p>
      )}
    </div>
  )
}

function Raster({
  b,
  seite,
  platz,
  waehle,
  tausche
}: {
  b: Bedienfeld
  seite: BedienSeite
  platz: Platz | null
  waehle: (p: Platz) => void
  tausche: (von: Platz, nach: Platz) => void
}): JSX.Element {
  const [ueber, setUeber] = useState<string | null>(null)
  // Kacheln mit Spanne (OSC-Steuerung): ausdrücklich platziert, feste Zeilenhöhe, kein Tauschen;
  // leere Plätze des feinen OSC-Rasters bleiben frei
  const spannen = hatSpannen(b)
  const osc = b.geraet === 'osc'
  const zu = abgedeckt(seite)
  const zelle = spannen ? Math.min(84, Math.max(18, Math.floor(1100 / b.spalten))) : 84
  const zellen: JSX.Element[] = []
  for (let zeile = 0; zeile < b.zeilen; zeile++)
    for (let spalte = 0; spalte < b.spalten; spalte++) {
      if (zu.has(`${spalte},${zeile}`)) continue
      const t = tasteAn(seite, spalte, zeile)
      if (!t && osc) continue
      const nr = t ? nummer(b, seite, t) : tastenNr(b.spalten, { spalte, zeile })
      const an = platz?.spalte === spalte && platz.zeile === zeile
      const aufschrift = t?.titel.trim() || (t?.nav ? navTitel(b, t.nav) : '')
      const k = `${spalte},${zeile}`
      zellen.push(
        <button
          key={k}
          type="button"
          aria-label={`Taste ${nr}${aufschrift ? `: ${aufschrift}` : ''}`}
          aria-pressed={an}
          draggable={!!t && !spannen}
          onClick={() => waehle({ spalte, zeile })}
          onDragStart={(e) => {
            e.dataTransfer.setData(ZIEHEN, k)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(ZIEHEN)) return
            e.preventDefault()
            setUeber(k)
          }}
          onDragLeave={() => setUeber((u) => (u === k ? null : u))}
          onDrop={(e) => {
            e.preventDefault()
            setUeber(null)
            const [s, z] = e.dataTransfer.getData(ZIEHEN).split(',').map(Number)
            if (Number.isInteger(s) && Number.isInteger(z))
              tausche({ spalte: s, zeile: z }, { spalte, zeile })
          }}
          // Farben der Taste sind Daten des Nutzers (wie am Gerät), keine Theme-Farben
          style={{
            ...(spannen
              ? {
                  gridColumn: `${spalte + 1} / span ${t?.breite ?? 1}`,
                  gridRow: `${zeile + 1} / span ${t?.hoehe ?? 1}`
                }
              : {}),
            ...(t
              ? { background: t.hintergrund || undefined, color: t.textfarbe || undefined }
              : {})
          }}
          className={cn(
            'relative flex min-w-0 items-center justify-center overflow-hidden rounded-md p-1 pt-3 text-center text-[11px] font-semibold leading-tight',
            !spannen && 'aspect-square',
            t
              ? 'bg-card text-foreground shadow-sm'
              : 'border border-dashed border-border bg-background/40',
            t?.nav && 'ring-1 ring-inset ring-muted-foreground',
            an && 'outline outline-2 outline-primary',
            ueber === k && 'outline outline-2 outline-primary/60'
          )}
        >
          {t?.bild && (
            <img
              src={fotoUrl(t.bild)}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-80"
            />
          )}
          <span className="absolute left-1 top-0.5 text-[9px] font-normal opacity-70">{nr}</span>
          <span className="relative line-clamp-3 whitespace-pre-line break-words">
            {aufschrift}
          </span>
        </button>
      )
    }
  return (
    <div
      className="grid gap-1.5 rounded-lg bg-muted p-2"
      style={{
        gridTemplateColumns: `repeat(${b.spalten}, minmax(0, 1fr))`,
        ...(spannen
          ? { gridTemplateRows: `repeat(${b.zeilen}, ${Math.round(zelle * 0.75)}px)` }
          : {}),
        maxWidth: b.spalten * zelle
      }}
      data-testid="tastenraster"
    >
      {zellen}
    </div>
  )
}

function navWert(nav: TastenNav | null): string {
  if (!nav) return ''
  return nav.art === 'seite' ? `seite:${nav.ziel}` : nav.art
}

function navAus(v: string): TastenNav | null {
  if (v === 'weiter' || v === 'zurueck') return { art: v }
  if (v.startsWith('seite:')) return { art: 'seite', ziel: v.slice(6) }
  return null
}

function Farbe({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label={label}
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent"
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={!value}
        onClick={() => onChange('')}
        aria-label={`${label}: Vorgabe`}
      >
        Vorgabe
      </Button>
    </span>
  )
}

function TastenForm({
  b,
  seite,
  t,
  aendern
}: {
  b: Bedienfeld
  seite: BedienSeite
  t: Taste
  aendern: (p: Partial<Taste>) => void
}): JSX.Element {
  const nr = nummer(b, seite, t)
  return (
    <div className="space-y-3 rounded-md border border-primary/40 p-3" data-testid="taste-form">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Taste {nr}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => aendern(leereTaste(t.spalte, t.zeile))}
          title="Alles auf dieser Taste löschen"
        >
          <Eraser className="size-4" /> Taste leeren
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Aufschrift" hint="Wie auf der Taste – Zeilenumbruch erlaubt.">
          <TextArea
            rows={2}
            value={t.titel}
            aria-label="Aufschrift"
            onCommit={(titel) => aendern({ titel })}
          />
        </Field>
        <Field
          label="Was die Taste tut"
          hint="Für die Liste unter dem Raster, z. B. „Startet das Intro-Video“. Platzhalter wie {pc.name} gehen."
        >
          <LiveInput
            value={t.funktion}
            aria-label="Funktion"
            onCommit={(funktion) => aendern({ funktion })}
          />
        </Field>
        <Field label="Notiz" hint="Erscheint klein unter der Funktion.">
          <TextArea
            rows={2}
            value={t.notiz}
            aria-label="Notiz zur Taste"
            onCommit={(notiz) => aendern({ notiz })}
          />
        </Field>
        <div className="space-y-2">
          <Field
            label="Navigation"
            hint="Blättert am Gerät statt etwas zu starten. Ohne Aufschrift steht das Ziel auf der Taste."
          >
            <Select
              size="xs"
              aria-label="Navigation"
              value={navWert(t.nav)}
              onChange={(e) => aendern({ nav: navAus(e.target.value) })}
            >
              <option value="">keine</option>
              <option value="weiter">Nächste Seite</option>
              <option value="zurueck">Vorige Seite / zurück</option>
              {b.seiten
                .filter((s) => s.id !== seite.id)
                .map((s) => (
                  <option key={s.id} value={`seite:${s.id}`}>
                    Öffnet „{seitenName(b, s.id)}“
                  </option>
                ))}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              Schrift{' '}
              <Farbe
                label="Schriftfarbe"
                value={t.textfarbe}
                onChange={(textfarbe) => aendern({ textfarbe })}
              />
            </span>
            <span className="flex items-center gap-1">
              Taste{' '}
              <Farbe
                label="Tastenfarbe"
                value={t.hintergrund}
                onChange={(hintergrund) => aendern({ hintergrund })}
              />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StufeSelect
              label="Taste erscheint"
              value={t.stufe}
              onChange={(stufe) => aendern({ stufe })}
            />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Bild <FotoFeld klein hash={t.bild} onChange={(bild) => aendern({ bild })} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
