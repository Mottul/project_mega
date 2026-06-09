import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  FileUp,
  FolderUp,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Progress } from '@renderer/components/ui/progress'
import { PanelSection, ToolShell } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import type {
  ImportProgress,
  ImportSummary,
  ManualMeta,
  ManualSearchHit
} from '@shared/types'
import { PdfViewer } from './PdfViewer'

interface ViewerState {
  id: number
  page: number
  title: string
}

interface HitGroup {
  manualId: number
  title: string
  manufacturer: string | null
  hits: ManualSearchHit[]
}

const PROGRESS_LABEL: Record<ImportProgress['phase'], string> = {
  hashing: 'Prüfe Datei',
  copying: 'Kopiere',
  extracting: 'Extrahiere Text',
  indexing: 'Indexiere',
  done: 'Fertig',
  skipped: 'Übersprungen (Duplikat)',
  error: 'Fehler'
}

// Basis-Kategorien (AV); der Nutzer kann beim Bearbeiten beliebige eigene ergaenzen.
const BASE_CATEGORIES = [
  'Audio',
  'Video',
  'Licht',
  'Rigging/Bühne',
  'Netzwerk',
  'Stromversorgung',
  'Sonstiges'
]

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function groupHits(hits: ManualSearchHit[]): HitGroup[] {
  const map = new Map<number, HitGroup>()
  for (const h of hits) {
    let g = map.get(h.manualId)
    if (!g) {
      g = { manualId: h.manualId, title: h.title, manufacturer: h.manufacturer, hits: [] }
      map.set(h.manualId, g)
    }
    g.hits.push(h)
  }
  return [...map.values()]
}

export function ManualsLibrary(): JSX.Element {
  const [query, setQuery] = useState('')
  const [manuals, setManuals] = useState<ManualMeta[]>([])
  const [hits, setHits] = useState<ManualSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [editing, setEditing] = useState<ManualMeta | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const categories = useMemo(() => {
    const set = new Set<string>(BASE_CATEGORIES)
    for (const m of manuals) if (m.category) set.add(m.category)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [manuals])

  const visibleManuals = useMemo(
    () => (categoryFilter ? manuals.filter((m) => m.category === categoryFilter) : manuals),
    [manuals, categoryFilter]
  )

  async function refreshList(): Promise<void> {
    setManuals(await api.manuals.list())
  }

  useEffect(() => {
    void refreshList()
    const off = api.manuals.onImportProgress((p) => setProgress(p))
    return off
  }, [])

  // Volltextsuche (debounced)
  useEffect(() => {
    const q = query.trim()
    const t = setTimeout(() => {
      if (!q) {
        setHits([])
        return
      }
      setSearching(true)
      void api.manuals
        .search(q)
        .then(setHits)
        .finally(() => setSearching(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const groups = useMemo(() => groupHits(hits), [hits])

  async function importPaths(paths: string[]): Promise<void> {
    if (!paths.length) return
    setImporting(true)
    setSummary(null)
    try {
      const result = await api.manuals.import(paths)
      setSummary(result)
      await refreshList()
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  async function importFiles(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'PDFs auswählen',
      multi: true,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    await importPaths(paths)
  }

  async function importFolder(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ordner mit PDFs', directories: true })
    await importPaths(paths)
  }

  async function openManual(id: number, page = 1): Promise<void> {
    const detail = await api.manuals.get(id)
    setViewer({ id, page, title: detail.title })
  }

  async function removeManual(m: ManualMeta): Promise<void> {
    if (!window.confirm(`„${m.title}" wirklich aus der Bibliothek löschen?`)) return
    await api.manuals.delete(m.id)
    await refreshList()
  }

  const showSearch = query.trim().length > 0

  return (
    <>
      <ToolShell
        id="manuals"
        aside={
          <>
            <PanelSection id="import" title="Import" icon={FileUp}>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={importFiles}
                disabled={importing}
              >
                <FileUp className="size-4" /> PDFs importieren
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={importFolder}
                disabled={importing}
              >
                <FolderUp className="size-4" /> Ordner importieren
              </Button>
              {(importing || progress) && (
                <div>
                  <Progress
                    value={
                      progress?.page && progress?.pageCount ? progress.page / progress.pageCount : 0
                    }
                    indeterminate={!progress?.pageCount}
                  />
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {progress
                      ? `${PROGRESS_LABEL[progress.phase]} · ${basename(progress.file)} (${progress.fileIndex}/${progress.fileCount})${
                          progress.page && progress.pageCount
                            ? ` · Seite ${progress.page}/${progress.pageCount}`
                            : ''
                        }`
                      : 'Import läuft…'}
                  </p>
                </div>
              )}
              {summary && !importing && (
                <p className="text-xs text-muted-foreground">
                  Import abgeschlossen: {summary.imported} neu, {summary.skipped} übersprungen
                  {summary.failed.length > 0 ? `, ${summary.failed.length} fehlgeschlagen` : ''}.
                </p>
              )}
              <button
                className="text-left text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void api.getLogPath().then((p) => api.showItemInFolder(p))}
                title="Öffnet die Debug-Logdatei im Explorer (zum Mitschicken bei Problemen)"
              >
                Debug-Log öffnen
              </button>
            </PanelSection>
          </>
        }
        main={
          <div className="flex h-full flex-col">
            {/* Kopf: Suche */}
            <div className="border-b border-border p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Volltextsuche über alle Handbücher…"
                  className="pl-9"
                />
              </div>
            </div>

            {/* Inhalt */}
            <div className="flex-1 overflow-auto p-4">
              {showSearch ? (
                <SearchResults
                  groups={groups}
                  searching={searching}
                  onOpen={(manualId, page) => void openManual(manualId, page)}
                />
              ) : (
                <div className="mx-auto max-w-4xl space-y-3">
                  {manuals.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <CategoryChip
                        label={`Alle (${manuals.length})`}
                        active={categoryFilter === null}
                        onClick={() => setCategoryFilter(null)}
                      />
                      {categories
                        .filter((c) => manuals.some((m) => m.category === c))
                        .map((c) => (
                          <CategoryChip
                            key={c}
                            label={`${c} (${manuals.filter((m) => m.category === c).length})`}
                            active={categoryFilter === c}
                            onClick={() => setCategoryFilter(c)}
                          />
                        ))}
                    </div>
                  )}
                  <LibraryList
                    manuals={visibleManuals}
                    onOpen={(id) => void openManual(id, 1)}
                    onEdit={setEditing}
                    onDelete={(m) => void removeManual(m)}
                  />
                </div>
              )}
            </div>
          </div>
        }
      />

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <header className="flex items-center gap-3 border-b border-border px-4 py-2">
            <FileText className="size-4 text-primary" />
            <h2 className="flex-1 truncate font-medium">{viewer.title}</h2>
            <Button variant="ghost" size="icon" onClick={() => setViewer(null)} aria-label="Schließen">
              <X className="size-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1">
            <PdfViewer manualId={viewer.id} initialPage={viewer.page} />
          </div>
        </div>
      )}

      {editing && (
        <EditDialog
          manual={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refreshList()
          }}
        />
      )}
    </>
  )
}

function SearchResults({
  groups,
  searching,
  onOpen
}: {
  groups: HitGroup[]
  searching: boolean
  onOpen: (manualId: number, page: number) => void
}): JSX.Element {
  if (searching && groups.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (groups.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Keine Treffer.</p>
  }
  const totalHits = groups.reduce((n, g) => n + g.hits.length, 0)
  return (
    <div className="mx-auto max-w-4xl space-y-2">
      <p className="px-1 text-xs text-muted-foreground">
        {totalHits} Treffer in {groups.length} Dokument{groups.length === 1 ? '' : 'en'}
      </p>
      {groups.map((g) => (
        <HitGroupCard key={g.manualId} group={g} defaultOpen={groups.length <= 2} onOpen={onOpen} />
      ))}
    </div>
  )
}

function HitGroupCard({
  group,
  defaultOpen,
  onOpen
}: {
  group: HitGroup
  defaultOpen: boolean
  onOpen: (manualId: number, page: number) => void
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className="overflow-hidden p-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <BookOpen className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {group.title}
          {group.manufacturer && (
            <span className="font-normal text-muted-foreground"> · {group.manufacturer}</span>
          )}
        </span>
        <Badge tone="neutral" className="shrink-0">
          {group.hits.length}
        </Badge>
      </button>
      {open && (
        <div className="space-y-1 border-t border-border p-2">
          {group.hits.map((h, i) => (
            <button
              key={`${h.manualId}-${h.pageNo}-${i}`}
              onClick={() => onOpen(h.manualId, h.pageNo > 0 ? h.pageNo : 1)}
              className="flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/50"
            >
              <Badge tone="info" className="mt-0.5 shrink-0">
                {h.pageNo > 0 ? `S. ${h.pageNo}` : 'Titel'}
              </Badge>
              <span
                className="text-sm text-muted-foreground"
                // Snippet stammt aus lokal importierten PDFs; enthaelt <mark>-Tags
                dangerouslySetInnerHTML={{ __html: h.snippet }}
              />
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

function LibraryList({
  manuals,
  onOpen,
  onEdit,
  onDelete
}: {
  manuals: ManualMeta[]
  onOpen: (id: number) => void
  onEdit: (m: ManualMeta) => void
  onDelete: (m: ManualMeta) => void
}): JSX.Element {
  if (manuals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <BookOpen className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Noch keine Handbücher. Oben PDFs oder einen Ordner importieren.
        </p>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-4xl space-y-2">
      {manuals.map((m) => (
        <Card key={m.id} className="flex items-center gap-3 p-3">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{m.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[m.manufacturer, m.category, m.tags].filter(Boolean).join(' · ') || m.filename}
              {m.pageCount ? ` · ${m.pageCount} Seiten` : ''}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpen(m.id)} aria-label="Öffnen">
            <Eye className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onEdit(m)} aria-label="Bearbeiten">
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(m)}
            aria-label="Löschen"
            className="text-muted-foreground hover:text-red-400"
          >
            <Trash2 className="size-4" />
          </Button>
        </Card>
      ))}
    </div>
  )
}

function EditDialog({
  manual,
  categories,
  onClose,
  onSaved
}: {
  manual: ManualMeta
  categories: string[]
  onClose: () => void
  onSaved: (m: ManualMeta) => void
}): JSX.Element {
  const [title, setTitle] = useState(manual.title)
  const [manufacturer, setManufacturer] = useState(manual.manufacturer ?? '')
  const [category, setCategory] = useState(manual.category ?? '')
  const [tags, setTags] = useState(manual.tags ?? '')
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const updated = await api.manuals.update(manual.id, {
        title: title.trim() || manual.title,
        manufacturer: manufacturer.trim() || null,
        category: category.trim() || null,
        tags: tags.trim() || null
      })
      onSaved(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-semibold">Handbuch bearbeiten</h2>
        <div className="space-y-3">
          <Field label="Titel">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Hersteller">
            <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </Field>
          <Field label="Kategorie">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="manual-categories"
              placeholder="wählen oder neu eingeben"
            />
            <datalist id="manual-categories">
              {[...new Set([...BASE_CATEGORIES, ...categories])].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Tags (kommagetrennt)">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Speichern
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function CategoryChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? 'border-primary bg-primary/15 text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {label}
    </button>
  )
}
