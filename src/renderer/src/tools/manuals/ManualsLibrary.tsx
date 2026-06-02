import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
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
import { api } from '@renderer/lib/api'
import type {
  ImportProgress,
  ImportSummary,
  ManualMeta,
  ManualSearchHit
} from '@shared/types'
import { PdfViewer } from './PdfViewer'

interface ViewerState {
  fileUrl: string
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
    setViewer({ fileUrl: detail.fileUrl, page, title: detail.title })
  }

  async function removeManual(m: ManualMeta): Promise<void> {
    if (!window.confirm(`„${m.title}" wirklich aus der Bibliothek löschen?`)) return
    await api.manuals.delete(m.id)
    await refreshList()
  }

  const showSearch = query.trim().length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Kopf: Suche + Import */}
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Volltextsuche über alle Handbücher…"
              className="pl-9"
            />
          </div>
          <Button variant="secondary" onClick={importFiles} disabled={importing}>
            <FileUp className="size-4" /> PDFs importieren
          </Button>
          <Button variant="secondary" onClick={importFolder} disabled={importing}>
            <FolderUp className="size-4" /> Ordner importieren
          </Button>
          <Button
            variant="ghost"
            onClick={() => void api.getLogPath().then((p) => api.showItemInFolder(p))}
            title="Öffnet die Debug-Logdatei im Explorer (zum Mitschicken bei Problemen)"
          >
            Debug-Log
          </Button>
        </div>

        {(importing || progress) && (
          <div className="mt-3">
            <Progress
              value={
                progress?.page && progress?.pageCount
                  ? progress.page / progress.pageCount
                  : 0
              }
              indeterminate={!progress?.pageCount}
            />
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {progress
                ? `${PROGRESS_LABEL[progress.phase]} · ${basename(progress.file)} (${progress.fileIndex}/${progress.fileCount})${
                    progress.page && progress.pageCount ? ` · Seite ${progress.page}/${progress.pageCount}` : ''
                  }`
                : 'Import läuft…'}
            </p>
          </div>
        )}

        {summary && !importing && (
          <p className="mt-2 text-xs text-muted-foreground">
            Import abgeschlossen: {summary.imported} neu, {summary.skipped} übersprungen
            {summary.failed.length > 0 ? `, ${summary.failed.length} fehlgeschlagen` : ''}.
          </p>
        )}
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
          <LibraryList
            manuals={manuals}
            onOpen={(id) => void openManual(id, 1)}
            onEdit={setEditing}
            onDelete={(m) => void removeManual(m)}
          />
        )}
      </div>

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
            <PdfViewer fileUrl={viewer.fileUrl} initialPage={viewer.page} />
          </div>
        </div>
      )}

      {editing && (
        <EditDialog
          manual={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refreshList()
          }}
        />
      )}
    </div>
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
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {groups.map((g) => (
        <Card key={g.manualId} className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <BookOpen className="size-4 text-primary" />
            <span className="font-medium">{g.title}</span>
            {g.manufacturer && (
              <span className="text-sm text-muted-foreground">· {g.manufacturer}</span>
            )}
          </div>
          <div className="space-y-1.5">
            {g.hits.map((h, i) => (
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
        </Card>
      ))}
    </div>
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
  onClose,
  onSaved
}: {
  manual: ManualMeta
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
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
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
