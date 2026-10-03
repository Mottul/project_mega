// Medien-Info: Videodateien (und Audio/Bilder) analysieren – Eckdaten wie
// Auflösung, Format, Codec, Bitrate, Ton – plus Ampel-Hinweise für den Show-
// Einsatz und ein Playlist-Vergleich bei mehreren Dateien.

import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  FileCog,
  FileDown,
  FileSearch,
  FolderOpen,
  FolderSearch,
  ListChecks,
  Loader2,
  SlidersHorizontal,
  Trash2,
  XCircle
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Progress } from '@renderer/components/ui/progress'
import { selectClass } from '@renderer/components/ui/select'
import { PanelSection, ToolShell } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { useHandoff } from '@renderer/lib/handoff'
import { toast } from '@renderer/lib/toast'
import { cn } from '@renderer/lib/utils'
import { PROBE_EXTENSIONS, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import {
  channelLabel,
  fmtBitrate,
  fmtBytes,
  fmtDuration,
  fmtDurationShort,
  fmtFps,
  nf,
  sampleRateLabel
} from './format'
import {
  analyzeMedia,
  COMPARE_LABELS,
  countLevels,
  findDeviations,
  mainVideo,
  MEDIUM_OPTIONS,
  playlistHints,
  RASTER_OPTIONS,
  TARGET_OPTIONS,
  worstLevel,
  type CompareKey,
  type MediaHint,
  type ShowRaster,
  type StorageMedium,
  type TargetSystem
} from './hints'
import { LEVEL_META } from './levels'
import { MediaDetail, copyText } from './MediaDetail'
import { factSheet, shortLine, toCsv, toJson, toTsv, type ReportRow } from './report'
import { useMediaInfo, useMediaInfoPrefs, type MediaEntry } from './store'

type SortKey =
  'order' | 'status' | 'name' | 'resolution' | 'fps' | 'codec' | 'duration' | 'bitrate' | 'size'

const LEVEL_RANK = { problem: 3, warning: 2, info: 1, ok: 0 } as const

function sortValue(
  e: MediaEntry,
  hints: MediaHint[],
  key: SortKey,
  index: number
): number | string {
  const v = e.info ? mainVideo(e.info) : null
  switch (key) {
    case 'status':
      return e.status === 'error' ? 4 : LEVEL_RANK[worstLevel(hints)]
    case 'name':
      return e.info?.name ?? e.path
    case 'resolution':
      return v ? v.displayWidth * v.displayHeight : -1
    case 'fps':
      return v?.fps ?? -1
    case 'codec':
      return v?.codec ?? e.info?.audio[0]?.codec ?? ''
    case 'duration':
      return e.info?.durationSec ?? -1
    case 'bitrate':
      return e.info?.bitRate ?? -1
    case 'size':
      return e.info?.sizeBytes ?? -1
    default:
      return index
  }
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

export function MediaInfo(): JSX.Element {
  const navigate = useNavigate()
  const entries = useMediaInfo((s) => s.entries)
  const selected = useMediaInfo((s) => s.selected)
  const collecting = useMediaInfo((s) => s.collecting)
  const notice = useMediaInfo((s) => s.notice)
  const profile = useMediaInfoPrefs((s) => s.profile)
  const deep = useMediaInfoPrefs((s) => s.deep)
  const [dragOver, setDragOver] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 })

  // Übergabe aus anderen Tools (z.B. HAP-Konverter: „Details in Medien-Info")
  useEffect(() => {
    const handed = useHandoff.getState().takePaths('media-info')
    if (handed.length) void useMediaInfo.getState().addInputs(handed, true)
  }, [])

  // Hinweise je Datei – bei Profilwechsel sofort neu bewertet, ohne neuen ffprobe-Lauf
  const hintsByPath = useMemo(() => {
    const m = new Map<string, MediaHint[]>()
    for (const e of entries) if (e.info) m.set(e.path, analyzeMedia(e.info, profile))
    return m
  }, [entries, profile])

  const doneInfos = useMemo(
    () => entries.filter((e) => e.info).map((e) => e.info as NonNullable<MediaEntry['info']>),
    [entries]
  )
  const deviations = useMemo(() => findDeviations(doneInfos), [doneInfos])
  const listHints = useMemo(() => playlistHints(doneInfos), [doneInfos])

  const sorted = useMemo(() => {
    if (sort.key === 'order') return entries
    const withIdx = entries.map((e, i) => ({ e, i }))
    withIdx.sort((a, b) => {
      const va = sortValue(a.e, hintsByPath.get(a.e.path) ?? [], sort.key, a.i)
      const vb = sortValue(b.e, hintsByPath.get(b.e.path) ?? [], sort.key, b.i)
      const c =
        typeof va === 'string' && typeof vb === 'string'
          ? collator.compare(va, vb)
          : (va as number) - (vb as number)
      return c * sort.dir || a.i - b.i
    })
    return withIdx.map((x) => x.e)
  }, [entries, sort, hintsByPath])

  const current = entries.find((e) => e.path === selected) ?? entries[0] ?? null
  const pending = entries.filter((e) => e.status === 'pending' || e.status === 'loading').length
  const errors = entries.filter((e) => e.status === 'error').length
  const totals = useMemo(() => {
    let duration = 0
    let size = 0
    const levels = { problem: 0, warning: 0 }
    for (const e of entries) {
      if (!e.info) continue
      duration += e.info.durationSec ?? 0
      size += e.info.sizeBytes ?? 0
      const c = countLevels(hintsByPath.get(e.path) ?? [])
      levels.problem += c.problem
      levels.warning += c.warning
    }
    return { duration, size, ...levels }
  }, [entries, hintsByPath])

  const rows: ReportRow[] = entries
    .filter((e) => e.info)
    .map((e) => ({
      info: e.info as NonNullable<MediaEntry['info']>,
      hints: hintsByPath.get(e.path) ?? []
    }))

  async function addFiles(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'Mediendateien auswählen',
      multi: true,
      filters: [
        { name: 'Medien', extensions: PROBE_EXTENSIONS },
        { name: 'Videos', extensions: VIDEO_EXTENSIONS },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    })
    if (paths.length) await useMediaInfo.getState().addInputs(paths)
  }

  async function addFolder(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    if (paths.length) await useMediaInfo.getState().addInputs(paths)
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    if (paths.length) void useMediaInfo.getState().addInputs(paths)
  }

  function sendToHap(paths: string[]): void {
    if (!paths.length) return
    useHandoff.getState().givePaths('hap-converter', paths)
    navigate('/tool/hap-converter')
  }

  // Videos, für die eine HAP-Konvertierung sinnvoll ist (nicht schon HAP)
  const hapCandidates = entries
    .filter((e) => {
      const v = e.info ? mainVideo(e.info) : null
      return v && v.fpsMode !== 'still' && v.codecName && v.codecName !== 'hap'
    })
    .map((e) => e.path)

  function onDeepChange(on: boolean): void {
    useMediaInfoPrefs.getState().setDeep(on)
    // Nachträglich einschalten: bereits analysierte Dateien ergänzen (Cache im main
    // erkennt fehlende Tiefenanalyse selbst -> kein erzwungener Neu-Lauf nötig).
    if (on) {
      const missing = entries.filter((e) => e.info && !e.info.deepAnalyzed).map((e) => e.path)
      if (missing.length) useMediaInfo.getState().reanalyze(missing, false)
    }
  }

  function toggleSort(key: SortKey): void {
    setSort((s) =>
      s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: 'order', dir: 1 }
    )
  }

  function onTableKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const idx = sorted.findIndex((x) => x.path === current?.path)
    const next =
      sorted[Math.max(0, Math.min(sorted.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) useMediaInfo.getState().select(next.path)
  }

  async function saveCsv(): Promise<void> {
    if (!rows.length) return
    const path = await api.util.saveText(toCsv(rows, true), `medien-info_${dateStamp()}.csv`, [
      { name: 'CSV (Excel)', extensions: ['csv'] }
    ])
    if (path) toast.success('CSV gespeichert', path)
  }

  async function saveJson(): Promise<void> {
    if (!rows.length) return
    const path = await api.util.saveText(toJson(rows, profile), `medien-info_${dateStamp()}.json`)
    if (path) toast.success('JSON gespeichert', path)
  }

  const currentHints = current ? (hintsByPath.get(current.path) ?? []) : []

  return (
    <ToolShell
      id="media-info"
      aside={
        <>
          <PanelSection id="profile" title="Prüfprofil" icon={SlidersHorizontal}>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Zielsystem</span>
              <select
                className={selectClass}
                value={profile.target}
                onChange={(e) =>
                  useMediaInfoPrefs
                    .getState()
                    .setProfile({ target: e.target.value as TargetSystem })
                }
              >
                {TARGET_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Show-Raster</span>
              <select
                className={selectClass}
                value={profile.raster}
                onChange={(e) =>
                  useMediaInfoPrefs.getState().setProfile({ raster: e.target.value as ShowRaster })
                }
              >
                {RASTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Datenträger</span>
              <select
                className={selectClass}
                value={profile.medium}
                onChange={(e) =>
                  useMediaInfoPrefs
                    .getState()
                    .setProfile({ medium: e.target.value as StorageMedium })
                }
              >
                {MEDIUM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-muted-foreground">
              Die Hinweise (Ampel) richten sich nach dem Profil – ein Wechsel bewertet sofort neu.
            </span>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={deep}
                onChange={(e) => onDeepChange(e.target.checked)}
                className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
              />
              <span>
                Tiefenanalyse
                <span className="block text-xs text-muted-foreground">
                  Liest die ersten Bilder: Keyframe-Abstand (GOP), Nachweis variabler Bildrate,
                  Scan-Typ und HDR10-Werte. Etwas langsamer, auf Netzlaufwerken spürbar.
                </span>
              </span>
            </label>
          </PanelSection>

          <PanelSection id="export" title="Kopieren & Export" icon={FileDown}>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={!current?.info}
                onClick={() =>
                  current?.info &&
                  void copyText(factSheet(current.info, currentHints, profile), 'Steckbrief')
                }
              >
                <ClipboardCopy className="size-4" /> Steckbrief (Auswahl)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={!current?.info}
                onClick={() => current?.info && void copyText(shortLine(current.info), 'Kurzzeile')}
              >
                <ClipboardCopy className="size-4" /> Kurzzeile (Auswahl)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={!rows.length}
                onClick={() => void copyText(toTsv(rows), 'Tabelle')}
              >
                <ListChecks className="size-4" /> Tabelle kopieren (für Excel)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={!rows.length}
                onClick={() => void saveCsv()}
              >
                <FileDown className="size-4" /> CSV speichern …
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={!rows.length}
                onClick={() => void saveJson()}
              >
                <FileDown className="size-4" /> JSON speichern …
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              CSV im Excel-Format (Semikolon, Dezimalkomma); die Tabelle lässt sich auch direkt in
              Excel/Numbers einfügen.
            </span>
          </PanelSection>
        </>
      }
      main={
        <div
          className="relative min-h-full"
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
          }}
          onDrop={onDrop}
        >
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 text-sm font-medium">
              Loslassen zum Analysieren
            </div>
          )}

          <div className="mx-auto max-w-6xl space-y-4 p-6">
            <div
              className={cn(
                'flex flex-wrap items-center gap-2',
                !entries.length && !collecting && 'hidden'
              )}
            >
              <Button variant="secondary" onClick={() => void addFiles()}>
                <FolderSearch className="size-4" /> Dateien …
              </Button>
              <Button variant="secondary" onClick={() => void addFolder()}>
                <FolderOpen className="size-4" /> Ordner …
              </Button>
              {collecting && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Durchsuche …
                </span>
              )}
              <div className="flex-1" />
              {hapCandidates.length > 0 && (
                <Button variant="outline" onClick={() => sendToHap(hapCandidates)}>
                  <FileCog className="size-4" /> An HAP-Konverter ({hapCandidates.length})
                </Button>
              )}
              {entries.length > 0 && (
                <Button variant="ghost" onClick={() => useMediaInfo.getState().clear()}>
                  <Trash2 className="size-4" /> Liste leeren
                </Button>
              )}
            </div>

            {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

            {entries.length === 0 ? (
              <EmptyState onFiles={() => void addFiles()} onFolder={() => void addFolder()} />
            ) : (
              <>
                <SummaryBar
                  count={entries.length}
                  duration={totals.duration}
                  size={totals.size}
                  problems={totals.problem}
                  warnings={totals.warning}
                  errors={errors}
                  pending={pending}
                />

                {listHints.length > 0 && (
                  <Card className="space-y-1.5 p-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Playlist-Vergleich
                    </p>
                    {listHints.map((h) => {
                      const meta = LEVEL_META[h.level]
                      const Icon = meta.icon
                      return (
                        <p key={h.id} className="flex items-start gap-2 text-sm" title={h.text}>
                          <Icon className={cn('mt-0.5 size-4 shrink-0', meta.className)} />
                          <span>
                            {h.title}
                            <span className="block text-xs text-muted-foreground">{h.text}</span>
                          </span>
                        </p>
                      )
                    })}
                  </Card>
                )}

                {entries.length > 1 && (
                  <Card className="overflow-hidden p-0">
                    <div
                      className="max-h-[45vh] overflow-auto focus:outline-none"
                      tabIndex={0}
                      onKeyDown={onTableKey}
                    >
                      <table className="w-full text-[13px]">
                        <thead className="sticky top-0 z-[1] bg-card">
                          <tr className="text-left text-[10px] uppercase tracking-wider text-primary">
                            <Th label="" k="status" sort={sort} onSort={toggleSort} />
                            <Th label="Datei" k="name" sort={sort} onSort={toggleSort} />
                            <Th
                              label={COMPARE_LABELS.resolution}
                              k="resolution"
                              sort={sort}
                              onSort={toggleSort}
                            />
                            <Th label="fps" k="fps" sort={sort} onSort={toggleSort} />
                            <Th label="Codec" k="codec" sort={sort} onSort={toggleSort} />
                            <th className="px-1.5 py-2 font-medium">Bit/Chroma</th>
                            <Th
                              label="Dauer"
                              k="duration"
                              sort={sort}
                              onSort={toggleSort}
                              align="right"
                            />
                            <Th
                              label="Bitrate"
                              k="bitrate"
                              sort={sort}
                              onSort={toggleSort}
                              align="right"
                            />
                            <Th
                              label="Größe"
                              k="size"
                              sort={sort}
                              onSort={toggleSort}
                              align="right"
                            />
                            <th className="px-1.5 py-2 font-medium">Ton</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((e) => (
                            <Row
                              key={e.path}
                              entry={e}
                              hints={hintsByPath.get(e.path) ?? []}
                              deviating={deviations.byPath.get(e.path)}
                              majority={deviations.majority}
                              active={e.path === current?.path}
                              onSelect={() => useMediaInfo.getState().select(e.path)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {current && (
                  <MediaDetail entry={current} hints={currentHints} onSendToHap={sendToHap} />
                )}
              </>
            )}
          </div>
        </div>
      }
    />
  )
}

function dateStamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function EmptyState({
  onFiles,
  onFolder
}: {
  onFiles: () => void
  onFolder: () => void
}): JSX.Element {
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <FileSearch className="size-10 text-muted-foreground" />
      <p className="font-medium">Videodateien oder Ordner hier ablegen</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Auflösung, Bildrate, Codec, Bitrate, Ton, Timecode und mehr – mit Hinweisen für den
        Show-Einsatz. Die Analyse läuft lokal mit ffprobe, die Dateien werden nicht verändert.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={onFiles}>
          <FolderSearch className="size-4" /> Dateien auswählen …
        </Button>
        <Button variant="secondary" onClick={onFolder}>
          <FolderOpen className="size-4" /> Ordner auswählen …
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Video, Audio und Bilder; Ordner werden rekursiv durchsucht (System-/._-Dateien
        übersprungen).
      </p>
    </Card>
  )
}

function SummaryBar(props: {
  count: number
  duration: number
  size: number
  problems: number
  warnings: number
  errors: number
  pending: number
}): JSX.Element {
  const done = props.count - props.pending
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">
          {nf(props.count)} {props.count === 1 ? 'Datei' : 'Dateien'}
        </span>
        <span className="text-muted-foreground">Gesamt {fmtDuration(props.duration)}</span>
        <span className="text-muted-foreground">{fmtBytes(props.size)}</span>
        {props.problems > 0 && <Badge tone="danger">{nf(props.problems)} Probleme</Badge>}
        {props.warnings > 0 && <Badge tone="warning">{nf(props.warnings)} Warnungen</Badge>}
        {props.errors > 0 && <Badge tone="danger">{nf(props.errors)} nicht lesbar</Badge>}
      </div>
      {props.pending > 0 && (
        <div className="flex items-center gap-3">
          <Progress value={props.count ? done / props.count : 0} className="flex-1" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {nf(done)} / {nf(props.count)} analysiert
          </span>
        </div>
      )}
    </div>
  )
}

function Th({
  label,
  k,
  sort,
  onSort,
  align
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
  align?: 'right'
}): JSX.Element {
  const active = sort.key === k
  return (
    <th className={cn('px-1.5 py-2 font-medium', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn('inline-flex items-center gap-0.5 uppercase', active && 'text-foreground')}
        title="Sortieren"
      >
        {label || 'Status'}
        {active &&
          (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  )
}

function Row({
  entry,
  hints,
  deviating,
  majority,
  active,
  onSelect
}: {
  entry: MediaEntry
  hints: MediaHint[]
  deviating: Set<CompareKey> | undefined
  majority: Partial<Record<CompareKey, string>>
  active: boolean
  onSelect: () => void
}): JSX.Element {
  const info = entry.info
  const v = info ? mainVideo(info) : null
  const a = info?.audio[0]
  const dev = (k: CompareKey): string | undefined =>
    deviating?.has(k) ? 'bg-amber-500/10 text-amber-400 light:text-amber-700' : undefined
  const devTitle = (k: CompareKey): string | undefined =>
    deviating?.has(k) ? `Weicht ab – Mehrheit: ${majority[k] ?? '?'}` : undefined

  let status: JSX.Element
  if (entry.status === 'pending' || entry.status === 'loading') {
    status = (
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Analysiere" />
    )
  } else if (entry.status === 'error' || !info) {
    status = <XCircle className="size-4 text-red-400 light:text-red-600" aria-label="Fehler" />
  } else {
    const meta = LEVEL_META[worstLevel(hints)]
    const Icon = meta.icon
    const c = countLevels(hints)
    status = (
      <span title={`${c.problem} Problem(e), ${c.warning} Warnung(en), ${c.info} Hinweis(e)`}>
        <Icon className={cn('size-4', meta.className)} />
      </span>
    )
  }

  const fps =
    v && v.fpsMode !== 'still' && v.fps
      ? `${fmtFps(v.fps)}${v.scan === 'tff' || v.scan === 'bff' ? 'i' : v.scan === 'progressive' ? 'p' : ''}${v.fpsMode === 'vfr' || v.fpsMode === 'vfr-suspect' ? ' VFR' : ''}`
      : v?.fpsMode === 'still'
        ? 'Bild'
        : '–'

  return (
    <tr
      onClick={onSelect}
      className={cn(
        'cursor-pointer border-t border-border hover:bg-muted/40',
        active && 'bg-primary/10 hover:bg-primary/15'
      )}
    >
      <td className="px-1.5 py-1.5">{status}</td>
      <td className="max-w-[14rem] truncate px-1.5 py-1.5 font-medium" title={entry.path}>
        {info?.name ?? entry.path.split(/[\\/]/).pop()}
        {entry.status === 'error' && (
          <span className="block truncate text-xs font-normal text-red-400 light:text-red-600">
            {entry.error}
          </span>
        )}
      </td>
      <td
        className={cn('whitespace-nowrap px-1.5 py-1.5 tabular-nums', dev('resolution'))}
        title={devTitle('resolution')}
      >
        {v ? `${v.displayWidth}×${v.displayHeight}` : '–'}
      </td>
      <td
        className={cn('whitespace-nowrap px-1.5 py-1.5 tabular-nums', dev('fps') ?? dev('scan'))}
        title={devTitle('fps') ?? devTitle('scan')}
      >
        {fps}
      </td>
      <td
        className={cn('max-w-[9rem] truncate px-1.5 py-1.5', dev('codec'))}
        title={devTitle('codec')}
      >
        {v?.codec ?? a?.codec ?? '–'}
      </td>
      <td
        className={cn('whitespace-nowrap px-1.5 py-1.5 tabular-nums', dev('depth'))}
        title={devTitle('depth')}
      >
        {v
          ? `${v.bitDepth ?? '?'} · ${v.chroma ?? '?'}${v.alpha ? ' · α' : ''}${v.hdr ? ' · HDR' : ''}`
          : '–'}
      </td>
      <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
        {info?.isStill ? '–' : fmtDurationShort(info?.durationSec)}
      </td>
      <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
        {info?.bitRate ? fmtBitrate(info.bitRate) : '–'}
      </td>
      <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
        {fmtBytes(info?.sizeBytes)}
      </td>
      <td className={cn('whitespace-nowrap px-1.5 py-1.5', dev('audio'))} title={devTitle('audio')}>
        {a ? `${sampleRateLabel(a.sampleRate)} · ${channelLabel(a)}` : '–'}
      </td>
    </tr>
  )
}
