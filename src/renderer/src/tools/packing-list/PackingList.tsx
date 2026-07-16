// Packliste: editierbare Positionen (Menge/Einheit/Notiz/Kategorie), abhakbar,
// gruppiert nach frei anlegbaren Kategorien. Befüllbar aus der LED-Wall-
// Konfiguration, Export als PDF.

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileDown,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { deriveFromLedWall } from './derive'
import { parse, serialize } from './io'
import { exportPackingPdf } from './print'
import { usePacking, type PackItem } from './store'
import { toolPageClass } from '@renderer/lib/toolPage'
import { useDraft } from '@renderer/lib/useDraft'

/** Dateiname-tauglicher Slug aus dem Projektnamen. */
const slug = (s: string): string =>
  s
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'packliste'

export function PackingList(): JSX.Element {
  const s = usePacking()
  const [jobSel, setJobSel] = useState('')

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
  function saveCurrentJob(): void {
    s.saveJob(s.projectName)
    const name = s.projectName.trim()
    if (name) {
      const j = usePacking.getState().saved.find((x) => x.name === name)
      if (j) setJobSel(j.id)
    }
  }
  async function loadSelectedJob(): Promise<void> {
    if (jobSel && (await confirmReplace())) s.loadJob(jobSel)
  }
  function deleteSelectedJob(): void {
    if (!jobSel) return
    s.deleteJob(jobSel)
    setJobSel('')
  }
  async function exportJson(): Promise<void> {
    const text = serialize({
      projectName: s.projectName,
      categories: s.categories,
      items: s.items
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

  return (
    <div className={toolPageClass('full')}>
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <Input
          className="h-9 max-w-xs flex-1"
          placeholder="Projektname"
          value={s.projectName}
          onChange={(e) => s.set({ projectName: e.target.value })}
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => s.mergeItems(deriveFromLedWall())}>
          <LayoutGrid className="size-4" /> Aus LED-Wall übernehmen
        </Button>
        <Button
          size="sm"
          disabled={s.items.length === 0}
          onClick={() => void exportPackingPdf(s.projectName, s.items)}
        >
          <FileDown className="size-4" /> PDF
        </Button>
      </Card>

      {/* Gespeicherte Jobs (wiederkehrende Packlisten) + Datei-Import/-Export. */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Jobs
        </span>
        <select
          value={jobSel}
          onChange={(e) => setJobSel(e.target.value)}
          disabled={s.saved.length === 0}
          className="h-8 w-56 max-w-full rounded-md border border-border bg-input/40 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50"
          title="Gespeicherten Job wählen"
        >
          <option value="">
            {s.saved.length === 0 ? 'noch keine gespeichert' : `Job wählen … (${s.saved.length})`}
          </option>
          {s.saved.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={!jobSel}
          onClick={() => void loadSelectedJob()}
        >
          <FolderOpen className="size-4" /> Laden
        </Button>
        <button
          type="button"
          disabled={!jobSel}
          onClick={deleteSelectedJob}
          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
          title="Gewählten Job löschen"
        >
          <Trash2 className="size-4" />
        </button>
        <div className="flex-1" />
        <Button variant="default" size="sm" onClick={saveCurrentJob}>
          <Save className="size-4" /> Aktuellen speichern
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button
          variant="outline"
          size="sm"
          disabled={s.items.length === 0}
          onClick={() => void exportJson()}
          title="Als JSON-Datei exportieren (Backup/Weitergabe)"
        >
          <Download className="size-4" /> Export
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void importJson()}
          title="Aus JSON-Datei importieren"
        >
          <Upload className="size-4" /> Import
        </Button>
      </Card>

      {/* Masonry (CSS-Spalten): Kategorien fließen und füllen die Höhe aus, statt
          dass die kürzere Spalte Platz bis zur nächsten Reihe verschenkt. */}
      <div className="gap-4 xl:columns-2 2xl:columns-3">
        {groups.map(([cat, items]) => {
          const catIndex = s.categories.indexOf(cat)
          return (
            <Card key={cat} className="mb-4 break-inside-avoid overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/30 px-3 py-2">
                <ReorderCtl
                  canUp={catIndex > 0}
                  canDown={catIndex >= 0 && catIndex < s.categories.length - 1}
                  onUp={() => s.moveCategory(cat, -1)}
                  onDown={() => s.moveCategory(cat, 1)}
                  title="Kategorie verschieben"
                />
                <CategoryName
                  value={cat}
                  onCommit={(v) => s.renameCategory(cat, v)}
                  className="h-7 max-w-[240px] flex-1 text-xs font-bold uppercase tracking-wide text-primary"
                />
                <span className="text-xs text-muted-foreground">{items.length}</span>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => s.addItem(cat)}>
                  <Plus className="size-4" /> Position
                </Button>
                {s.categories.length > 1 && (
                  <button
                    type="button"
                    onClick={() => s.removeCategory(cat)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
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
        <span className="text-xs text-muted-foreground">{openCount} offen</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={s.items.every((i) => !i.checked)}
          onClick={() => s.clearChecked()}
        >
          <Check className="size-4" /> Abgehakte entfernen
        </Button>
        <Button variant="ghost" size="sm" disabled={s.items.length === 0} onClick={() => s.reset()}>
          <RotateCcw className="size-4" /> Leeren
        </Button>
      </div>
    </div>
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
  // Eigene Select-Klassen (NICHT selectClass) – das enthielt w-full und hätte das
  // Namensfeld zerquetscht.
  const catSelect =
    'h-7 w-40 shrink-0 rounded-md border border-border bg-input/40 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'
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
          className="shrink-0 text-muted-foreground hover:text-destructive"
          title="Entfernen"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {/* Zeile 2: Kategorie (kompakt) · Notiz – Einzug unter das Namensfeld */}
      <div className="mt-1.5 flex items-center gap-2 pl-12">
        <select
          value={item.category}
          onChange={(e) => up({ category: e.target.value })}
          className={catSelect}
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
        </select>
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
