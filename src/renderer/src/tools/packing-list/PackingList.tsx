// Packliste: editierbare Positionen (Menge/Einheit/Notiz/Kategorie), abhakbar,
// gruppiert nach frei anlegbaren Kategorien. Befüllbar aus der LED-Wall-
// Konfiguration, Export als PDF. Werkzeug-Muster:
//   Leiste „Projekt“   PDF, JSON sichern/laden, aus der LED-Wall übernehmen
//   Schublade          Projektname, PDF (Blöcke zusammenhalten), gespeicherte Jobs
//   Arbeitsfläche      die Kategorien mit ihren Positionen

import { useMemo, useState } from 'react'
import {
  Bookmark,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileDown,
  FileText,
  FolderPlus,
  LayoutGrid,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { BarDivider, PanelSection, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { deriveFromLedWall } from './derive'
import { parse, serialize } from './io'
import { exportPackingPdf } from './print'
import { BLOCK_FARBEN, usePacking, type PackItem, type SavedJob } from './store'
import { toolPageClass } from '@renderer/lib/toolPage'
import { useDraft } from '@renderer/lib/useDraft'
import { flag, usePersistentState } from '@renderer/lib/usePersistentState'

/** Dateiname-tauglicher Slug aus dem Projektnamen. */
const slug = (s: string): string =>
  s
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'packliste'

export function PackingList(): JSX.Element {
  const s = usePacking()
  // Druck-Vorliebe, keine Listendaten: gilt für jede Packliste auf diesem Rechner
  const [zusammen, setZusammen] = usePersistentState('packing:bloeckeZusammen', false, flag)

  // Gruppen in Kategorie-Reihenfolge; unbekannte Kategorien (Altdaten) hinten anhängen.
  const groups = useMemo(() => {
    const byCat = new Map<string, PackItem[]>()
    for (const it of s.items) {
      const arr = byCat.get(it.category) ?? []
      arr.push(it)
      byCat.set(it.category, arr)
    }
    const order = [...s.categories]
    for (const c of byCat.keys()) if (!order.includes(c)) order.push(c)
    return order.map((cat) => [cat, byCat.get(cat) ?? []] as const)
  }, [s.items, s.categories])

  const openCount = s.items.filter((i) => !i.checked).length

  // Rückfrage, bevor die aktuelle Liste durch Laden/Import überschrieben wird.
  async function confirmReplace(): Promise<boolean> {
    if (s.items.length === 0) return true
    return api.confirm({
      message: 'Aktuelle Liste ersetzen?',
      detail:
        'Die angezeigte Packliste wird überschrieben. Nicht gespeicherte Änderungen gehen verloren.',
      confirmLabel: 'Ersetzen',
      danger: true
    })
  }
  async function loadJob(job: SavedJob): Promise<void> {
    if (await confirmReplace()) s.loadJob(job.id)
  }
  async function deleteJob(job: SavedJob): Promise<void> {
    const ok = await api.confirm({
      message: `Job „${job.name}“ löschen?`,
      confirmLabel: 'Löschen',
      danger: true
    })
    if (ok) s.deleteJob(job.id)
  }
  async function exportJson(): Promise<void> {
    const text = serialize({
      projectName: s.projectName,
      categories: s.categories,
      items: s.items,
      colors: s.colors
    })
    await api.util.saveText(text, `${slug(s.projectName)}.json`)
  }
  async function importJson(): Promise<void> {
    const text = await api.util.openText()
    if (text == null) return
    const snap = parse(text)
    if (!snap) {
      await api.notify({
        message: 'Import fehlgeschlagen',
        detail: 'Die Datei ist keine gültige Packlisten-JSON.',
        kind: 'error'
      })
      return
    }
    if (await confirmReplace()) s.replaceAll(snap)
  }

  const name = s.projectName.trim()

  return (
    <ToolShell
      id="packing-list"
      bar={
        <ToolBar
          label="Projekt"
          kind="job"
          status={
            <span className="truncate">
              {name ? (
                <span className="font-medium">{name}</span>
              ) : (
                <span className="text-muted-foreground">ohne Projektnamen</span>
              )}
              <span className="text-muted-foreground">
                {' '}
                · {openCount} von {s.items.length} offen
              </span>
            </span>
          }
        >
          <Button
            size="sm"
            disabled={s.items.length === 0}
            onClick={() =>
              void exportPackingPdf(s.projectName, s.items, {
                categories: s.categories,
                colors: s.colors,
                bloeckeZusammen: zusammen
              })
            }
          >
            <FileDown className="size-4" /> PDF exportieren
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={s.items.length === 0}
            onClick={() => void exportJson()}
            title="Als JSON-Datei sichern oder weitergeben"
          >
            <Download className="size-4" /> JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void importJson()}
            title="Packliste aus einer JSON-Datei laden (ersetzt die aktuelle)"
          >
            <Upload className="size-4" /> Import
          </Button>
          <BarDivider />
          <Button
            variant="outline"
            size="sm"
            onClick={() => s.mergeItems(deriveFromLedWall())}
            title="Module, Standfüße, Ballast und Kabel aus dem LED-Wall-Konfigurator ergänzen"
          >
            <LayoutGrid className="size-4" /> Aus LED-Wall übernehmen
          </Button>
        </ToolBar>
      }
      aside={
        <>
          <PanelSection
            id="project"
            title="Projekt"
            icon={Briefcase}
            summary={name || 'ohne Namen'}
          >
            <Field
              label="Projektname"
              hint="Steht auf der PDF und ist der Name, unter dem der Job gespeichert wird."
            >
              <Input
                placeholder="Projektname"
                value={s.projectName}
                onChange={(e) => s.set({ projectName: e.target.value })}
              />
            </Field>
          </PanelSection>
          <PanelSection
            id="pdf"
            title="PDF"
            icon={FileText}
            summary={zusammen ? 'Blöcke zusammenhalten' : 'fortlaufend'}
          >
            <Checkbox
              checked={zusammen}
              onChange={setZusammen}
              label="Blöcke nicht über Seiten teilen"
              hint="Ein Block, der nicht mehr ganz auf die Seite passt, beginnt auf der nächsten. Ein Block, der länger als eine Seite ist, bricht trotzdem um. Aus: alles fortlaufend – nur der Titel bleibt bei seiner Tabelle."
            />
          </PanelSection>
          <PanelSection
            id="jobs"
            title="Gespeicherte Jobs"
            icon={Bookmark}
            summary={s.saved.length === 0 ? 'keine gespeichert' : `${s.saved.length} gespeichert`}
          >
            {s.saved.length > 0 && (
              <ul className="space-y-1">
                {s.saved.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-center gap-1 rounded-md border border-border bg-card/60"
                  >
                    <button
                      type="button"
                      onClick={() => void loadJob(j)}
                      title="Job laden – ersetzt die aktuelle Packliste"
                      className="min-w-0 flex-1 px-2.5 py-1.5 text-left hover:text-primary"
                    >
                      <span className="block truncate text-sm font-medium">{j.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {j.items.length} Positionen ·{' '}
                        {new Date(j.savedAt).toLocaleString('de-AT', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteJob(j)}
                      aria-label={`Job „${j.name}“ löschen`}
                      className="mr-1 rounded p-1.5 text-muted-foreground hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={s.items.length === 0}
              onClick={() => s.saveJob(s.projectName)}
              title="Gespeichert wird unter dem Projektnamen – gleicher Name überschreibt den Job"
            >
              <Save className="size-4" /> Aktuelle Liste speichern
            </Button>
          </PanelSection>
        </>
      }
      main={
        <div className={toolPageClass('full')}>
          {/* Masonry (CSS-Spalten): Kategorien fließen und füllen die Höhe aus, statt
              dass die kürzere Spalte Platz bis zur nächsten Reihe verschenkt. */}
          <div className="gap-4 xl:columns-2 2xl:columns-3">
            {groups.map(([cat, items]) => {
              const catIndex = s.categories.indexOf(cat)
              const farbe = s.colors[cat]
              return (
                <Card
                  key={cat}
                  className="mb-4 break-inside-avoid overflow-hidden"
                  // Farbe des Blocks ist Nutzer-Wahl (Daten), kein Theme-Token
                  style={farbe ? { borderLeft: `4px solid ${farbe}` } : undefined}
                  data-testid="pack-block"
                >
                  <div
                    className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-2"
                    style={farbe ? { backgroundColor: `${farbe}1f` } : undefined}
                  >
                    <ReorderCtl
                      canUp={catIndex > 0}
                      canDown={catIndex >= 0 && catIndex < s.categories.length - 1}
                      onUp={() => s.moveCategory(cat, -1)}
                      onDown={() => s.moveCategory(cat, 1)}
                      title="Kategorie verschieben"
                    />
                    <FarbWahl farbe={farbe} name={cat} onChange={(f) => s.setColor(cat, f)} />
                    {/* nimmt den freien Platz – ein langer Titel wird erst knapp vor den Knöpfen gekürzt */}
                    <CategoryName
                      value={cat}
                      onCommit={(v) => s.renameCategory(cat, v)}
                      className="h-7 min-w-0 flex-1 text-xs font-bold uppercase tracking-wide text-primary"
                    />
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                    <Button variant="ghost" size="sm" onClick={() => s.addItem(cat)}>
                      <Plus className="size-4" /> Position
                    </Button>
                    {s.categories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => s.removeCategory(cat)}
                        className="shrink-0 text-muted-foreground hover:text-danger"
                        title="Kategorie löschen (Positionen wandern in die erste Kategorie)"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-border">
                    {items.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Keine Positionen.</p>
                    ) : (
                      items.map((it, idx) => (
                        <Row
                          key={it.id}
                          item={it}
                          categories={s.categories}
                          canUp={idx > 0}
                          canDown={idx < items.length - 1}
                        />
                      ))
                    )}
                  </div>
                </Card>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => s.addItem()}>
              <Plus className="size-4" /> Position
            </Button>
            <Button variant="outline" size="sm" onClick={() => s.addCategory()}>
              <FolderPlus className="size-4" /> Kategorie
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              disabled={s.items.every((i) => !i.checked)}
              onClick={() => s.clearChecked()}
            >
              <Check className="size-4" /> Abgehakte entfernen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={s.items.length === 0}
              onClick={() => s.reset()}
            >
              <RotateCcw className="size-4" /> Leeren
            </Button>
          </div>
        </div>
      }
    />
  )
}

/** Kompaktes Hoch/Runter zum Verschieben (Kategorie bzw. Position). */
function ReorderCtl({
  canUp,
  canDown,
  onUp,
  onDown,
  title
}: {
  canUp: boolean
  canDown: boolean
  onUp: () => void
  onDown: () => void
  title: string
}): JSX.Element {
  const btn =
    'flex h-3.5 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground'
  return (
    <div className="flex shrink-0 flex-col" title={title}>
      <button type="button" onClick={onUp} disabled={!canUp} className={btn} aria-label="nach oben">
        <ChevronUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        className={btn}
        aria-label="nach unten"
      >
        <ChevronDown className="size-3.5" />
      </button>
    </div>
  )
}

/** Kategoriename mit lokalem Puffer – Umbenennen erst beim Verlassen/Enter
 *  (sonst würde der Gruppen-Key bei jedem Tastendruck wechseln). */
/** Farbe eines Blocks: Tupfen zeigt die Farbe, Klick öffnet die Auswahl (oder „keine“) */
function FarbWahl({
  farbe,
  name,
  onChange
}: {
  farbe: string | undefined
  name: string
  onChange: (f: string) => void
}): JSX.Element {
  const [offen, setOffen] = useState(false)
  const waehle = (f: string): void => {
    onChange(f)
    setOffen(false)
  }
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label={`Farbe für „${name}“`}
        aria-expanded={offen}
        title="Farbe des Blocks"
        onClick={() => setOffen((v) => !v)}
        className={cn(
          'block size-4 rounded-full border',
          farbe ? 'border-transparent' : 'border-dashed border-muted-foreground'
        )}
        style={farbe ? { backgroundColor: farbe } : undefined}
      />
      {offen && (
        <>
          {/* Klick daneben schließt */}
          <button
            type="button"
            aria-label="Farbauswahl schließen"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOffen(false)}
          />
          <span
            role="listbox"
            aria-label="Farben"
            className="absolute left-0 top-6 z-20 flex gap-1 rounded-md border border-border bg-card p-1.5 shadow-lg"
          >
            {BLOCK_FARBEN.map((f) => (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={f === farbe}
                aria-label={`Farbe ${f}`}
                onClick={() => waehle(f)}
                className={cn(
                  'size-5 rounded-full',
                  f === farbe && 'ring-2 ring-foreground ring-offset-1 ring-offset-card'
                )}
                style={{ backgroundColor: f }}
              />
            ))}
            <button
              type="button"
              role="option"
              aria-selected={!farbe}
              onClick={() => waehle('')}
              className="ml-1 rounded px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              keine
            </button>
          </span>
        </>
      )}
    </span>
  )
}

function CategoryName({
  value,
  onCommit,
  className
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
}): JSX.Element {
  const { ref, text, setText } = useDraft(value)
  const commit = (): void => {
    if (text.trim() && text.trim() !== value) onCommit(text.trim())
    else setText(value)
  }
  return (
    <Input
      ref={ref}
      value={text}
      aria-label="Name des Blocks"
      title={text}
      className={className}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function Row({
  item,
  categories,
  canUp,
  canDown
}: {
  item: PackItem
  categories: string[]
  canUp: boolean
  canDown: boolean
}): JSX.Element {
  const s = usePacking()
  const up = (patch: Partial<PackItem>): void => s.updateItem(item.id, patch)
  return (
    <div className={`px-3 py-2 ${item.checked ? 'opacity-50' : ''}`}>
      {/* Zeile 1: Verschieben · Haken · Position (groß) · Menge · Einheit · Entfernen */}
      <div className="flex items-center gap-2">
        <ReorderCtl
          canUp={canUp}
          canDown={canDown}
          onUp={() => s.moveItem(item.id, -1)}
          onDown={() => s.moveItem(item.id, 1)}
          title="Position verschieben"
        />
        <input
          type="checkbox"
          checked={item.checked}
          onChange={(e) => up({ checked: e.target.checked })}
          className="size-4 shrink-0 accent-primary"
        />
        <Input
          value={item.name}
          placeholder="Position"
          onChange={(e) => up({ name: e.target.value })}
          className={`h-8 min-w-0 flex-1 ${item.checked ? 'line-through' : ''}`}
        />
        <Input
          type="number"
          value={item.qty}
          min={0}
          onChange={(e) => up({ qty: Math.max(0, Number(e.target.value) || 0) })}
          className="h-8 w-16 shrink-0 text-right"
          title="Menge"
        />
        <Input
          value={item.unit}
          onChange={(e) => up({ unit: e.target.value })}
          className="h-8 w-16 shrink-0"
          title="Einheit"
        />
        <button
          type="button"
          onClick={() => s.removeItem(item.id)}
          className="shrink-0 text-muted-foreground hover:text-danger"
          title="Entfernen"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {/* Zeile 2: Kategorie (kompakt) · Notiz – Einzug unter das Namensfeld */}
      <div className="mt-1.5 flex items-center gap-2 pl-12">
        <Select
          size="xs"
          value={item.category}
          onChange={(e) => up({ category: e.target.value })}
          className="w-40 shrink-0"
          title="Kategorie wechseln"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {!categories.includes(item.category) && (
            <option value={item.category}>{item.category}</option>
          )}
        </Select>
        <Input
          value={item.note}
          placeholder="Notiz"
          onChange={(e) => up({ note: e.target.value })}
          className="h-7 min-w-0 flex-1 text-xs"
        />
      </div>
    </div>
  )
}
