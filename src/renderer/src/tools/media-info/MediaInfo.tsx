// Medien-Info: Videodateien (und Audio/Bilder) analysieren – Eckdaten wie
// Auflösung, Format, Codec, Bitrate, Ton – plus Ampel-Hinweise für den Show-
// Einsatz und ein Playlist-Vergleich bei mehreren Dateien.

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent
} from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  FileCog,
  Images,
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
import { Checkbox } from '@renderer/components/ui/checkbox'
import { api } from '@renderer/lib/api'
import { useKiosk } from '@renderer/launcher/kiosk'
import { useHandoff } from '@renderer/lib/handoff'
import { toast } from '@renderer/lib/toast'
import { cn } from '@renderer/lib/utils'
import { PROBE_EXTENSIONS, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import type { MediaInfo as MediaInfoData } from '@shared/types'
import {
  channelLabel,
  errorText,
  fmtBitrate,
  fmtBytes,
  fmtDuration,
  fmtDurationShort,
  fmtFps,
  fpsLabel,
  nf,
  plural,
  sampleRateLabel,
  splitPath
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
  type CheckProfile,
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

// Hinweise je MediaInfo-Objekt merken: sie ändern sich nur mit dem Objekt oder dem
// Profil – sonst liefe analyzeMedia bei jedem Update erneut für ALLE Dateien.
const hintCache = new WeakMap<MediaInfoData, { key: string; hints: MediaHint[] }>()

function hintsFor(info: MediaInfoData, profile: CheckProfile): MediaHint[] {
  const key = `${profile.target}|${profile.raster}|${profile.medium}`
  const hit = hintCache.get(info)
  if (hit && hit.key === key) return hit.hints
  const hints = analyzeMedia(info, profile)
  hintCache.set(info, { key, hints })
  return hints
}

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
      return e.info?.name ?? splitPath(e.path).name
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
  // Kundenansicht: keine Sprünge in andere (ungesperrte) Tools anbieten
  const locked = useKiosk()
  const entries = useMediaInfo((s) => s.entries)
  const selected = useMediaInfo((s) => s.selected)
  const collecting = useMediaInfo((s) => s.collecting)
  const notice = useMediaInfo((s) => s.notice)
  const profile = useMediaInfoPrefs((s) => s.profile)
  const deep = useMediaInfoPrefs((s) => s.deep)
  const [dragOver, setDragOver] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'order', dir: 1 })

  // Übergabe aus anderen Tools (z.B. Video-Konverter: „Details in Medien-Info")
  useEffect(() => {
    const handed = useHandoff.getState().takePaths('media-info')
    if (handed.length) void useMediaInfo.getState().addInputs(handed, true)
  }, [])

  // Hinweise je Datei – bei Profilwechsel sofort neu bewertet, ohne neuen ffprobe-Lauf
  const hintsByPath = useMemo(() => {
    const m = new Map<string, MediaHint[]>()
    for (const e of entries) if (e.info) m.set(e.path, hintsFor(e.info, profile))
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

  // Export: analysierte UND nicht lesbare Dateien (sonst fehlen kaputte Clips still)
  const rows: ReportRow[] = entries.flatMap((e): ReportRow[] =>
    e.info
      ? [{ info: e.info, hints: hintsByPath.get(e.path) ?? [] }]
      : e.status === 'error'
        ? [{ info: null, path: e.path, error: e.error ?? 'Fehler', detail: e.detail }]
        : []
  )

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

  // An den Video-Konverter – mit Prüfprofil, damit Zielsystem und Show-Raster dort
  // gleich vorausgewählt sind
  function sendToConverter(paths: string[]): void {
    if (!paths.length) return
    useHandoff.getState().givePaths('hap-converter', paths)
    useHandoff.getState().giveConvertProfile({ target: profile.target, raster: profile.raster })
    navigate('/tool/hap-converter')
  }

  // An den Video-Generator: Bilder und Videos zu einem Video zusammenfügen
  function sendToGenerator(paths: string[]): void {
    if (!paths.length) return
    useHandoff.getState().givePaths('video-generator', paths)
    navigate('/tool/video-generator')
  }

  // Bilder und Videos (alles mit Bildspur) für den Video-Generator
  const montageCandidates = entries
    .filter((e) => (e.info ? mainVideo(e.info) : null) !== null)
    .map((e) => e.path)

  // konvertierbare Videos (keine Standbilder/reinen Tondateien)
  const convertCandidates = entries
    .filter((e) => {
      const v = e.info ? mainVideo(e.info) : null
      return v && v.fpsMode !== 'still' && v.codecName
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

  // Laufende Analysen fehlen im Export -> sagen statt still weglassen
  function warnPending(): void {
    if (!pending) return
    toast.warning(
      `${plural(pending, 'Datei wird', 'Dateien werden')} noch analysiert`,
      'Sie fehlen im Export – nach Abschluss erneut exportieren.'
    )
  }

  async function saveExport(
    kind: 'CSV' | 'JSON',
    text: string,
    filters?: { name: string; extensions: string[] }[]
  ): Promise<void> {
    if (!rows.length) return
    warnPending()
    try {
      const name = `medien-info_${dateStamp()}.${kind.toLowerCase()}`
      const path = await api.util.saveText(text, name, filters)
      if (path) toast.success(`${kind} gespeichert`, path)
    } catch (e) {
      // z.B. Datei in Excel geöffnet (Windows sperrt sie) oder Stick schreibgeschützt
      toast.error(`${kind} konnte nicht gespeichert werden`, errorText(e))
    }
  }

  const currentHints = current ? (hintsByPath.get(current.path) ?? []) : []
  const profileSummary = [
    TARGET_OPTIONS.find((o) => o.value === profile.target)?.label,
    RASTER_OPTIONS.find((o) => o.value === profile.raster)?.label,
    MEDIUM_OPTIONS.find((o) => o.value === profile.medium)?.label,
    deep && 'Tiefenanalyse'
  ]
    .filter((x) => x && !/^keine/i.test(x))
    .join(' · ')

  return (
    <ToolShell
      id="media-info"
      aside={
        <>
          <PanelSection
            id="profile"
            title="Prüfprofil"
            icon={SlidersHorizontal}
            summary={profileSummary}
          >
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
            <Checkbox
              checked={deep}
              onChange={onDeepChange}
              label="Tiefenanalyse"
              hint="Liest die ersten Bilder: Keyframe-Abstand (GOP), Nachweis variabler Bildrate, Scan-Typ und HDR10-Werte. Etwas langsamer, auf Netzlaufwerken spürbar."
            />
          </PanelSection>

          <PanelSection
            id="export"
            title="Kopieren & Export"
            icon={FileDown}
            summary="Steckbrief, Tabelle, CSV, JSON"
          >
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
                onClick={() => {
                  warnPending()
                  void copyText(toTsv(rows), 'Tabelle')
                }}
              >
                <ListChecks className="size-4" /> Tabelle kopieren (für Excel)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={!rows.length}
                onClick={() =>
                  void saveExport('CSV', toCsv(rows, true), [
                    { name: 'CSV (Excel)', extensions: ['csv'] }
                  ])
                }
              >
                <FileDown className="size-4" /> CSV speichern …
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={!rows.length}
                onClick={() => void saveExport('JSON', toJson(rows, profile))}
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
              {convertCandidates.length > 0 && !locked && (
                <Button
                  variant="outline"
                  onClick={() => sendToConverter(convertCandidates)}
                  title="Im Video-Konverter passend zum gewählten Zielsystem aufbereiten"
                >
                  <FileCog className="size-4" /> Konvertieren ({convertCandidates.length})
                </Button>
              )}
              {montageCandidates.length > 1 && !locked && (
                <Button
                  variant="outline"
                  onClick={() => sendToGenerator(montageCandidates)}
                  title="Im Video-Generator zu einer Diashow bzw. Montage zusammenfügen"
                >
                  <Images className="size-4" /> Zu einem Video zusammenfügen …
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
                  <MediaTable
                    rows={sorted}
                    hintsByPath={hintsByPath}
                    deviations={deviations}
                    currentPath={current?.path ?? null}
                    sort={sort}
                    onSort={toggleSort}
                  />
                )}

                {current && (
                  // key: Detailzustand (Rohdaten, Abschnitte) gehört zur Datei
                  <MediaDetail
                    key={current.path}
                    entry={current}
                    hints={currentHints}
                    onConvert={locked ? null : sendToConverter}
                  />
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
        <span className="font-medium">{plural(props.count, 'Datei', 'Dateien')}</span>
        <span className="text-muted-foreground">Gesamt {fmtDuration(props.duration)}</span>
        <span className="text-muted-foreground">{fmtBytes(props.size)}</span>
        {props.problems > 0 && (
          <Badge tone="danger">{plural(props.problems, 'Problem', 'Probleme')}</Badge>
        )}
        {props.warnings > 0 && (
          <Badge tone="warning">{plural(props.warnings, 'Warnung', 'Warnungen')}</Badge>
        )}
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
        {/* schmale Statusspalte: Symbol statt Text, Name für Screenreader */}
        {label || (
          <>
            <ListChecks className="size-3" aria-hidden />
            <span className="sr-only">Status</span>
          </>
        )}
        {active &&
          (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  )
}

// Feste Zeilenhöhe -> einfache Virtualisierung großer Listen (nur sichtbare Zeilen)
const ROW_H = 34
const VIRTUAL_FROM = 150
const OVERSCAN = 12

// Spaltenbreiten in rem. Feste Spalten: Status, Auflösung, fps, Codec, Dauer. Die
// optionalen weichen bei schmalem Fenster in dieser Reihenfolge (zuletzt genannte
// zuerst) – sonst fiele der Dateiname bei 1240 px mit offener Seitenleiste auf 0 px.
type OptCol = 'depth' | 'bitrate' | 'audio' | 'size'
const OPTIONAL_COLS: [OptCol, number][] = [
  ['depth', 7.75],
  ['bitrate', 5.5],
  ['audio', 7.5],
  ['size', 5]
]
const BASE_REM = 24.5
// Platz, der dem Namen bleiben soll, bevor eine optionale Spalte eingeblendet wird …
const NAME_WANT_REM = 11
// … und darunter lieber waagerecht scrollen als den Namen weiter zu stauchen.
const NAME_MIN_REM = 8

function fitColumns(widthPx: number): string {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  let free = widthPx / rem - BASE_REM - NAME_WANT_REM
  const out: OptCol[] = []
  for (const [k, w] of OPTIONAL_COLS) {
    if (w > free) continue
    out.push(k)
    free -= w
  }
  return out.join(',')
}

function MediaTable({
  rows,
  hintsByPath,
  deviations,
  currentPath,
  sort,
  onSort
}: {
  rows: MediaEntry[]
  hintsByPath: Map<string, MediaHint[]>
  deviations: ReturnType<typeof findDeviations>
  currentPath: string | null
  sort: { key: SortKey; dir: 1 | -1 }
  onSort: (k: SortKey) => void
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLTableSectionElement>(null)
  const [view, setView] = useState({ top: 0, height: 400 })
  // sichtbare optionale Spalten als String („depth,bitrate") -> stabil für React.memo
  const [cols, setCols] = useState('depth,bitrate,audio,size')
  const frame = useRef(0)
  const virtual = rows.length > VIRTUAL_FROM

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setCols(fitColumns(el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function onScroll(): void {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = scrollRef.current
      if (el) setView({ top: el.scrollTop, height: el.clientHeight })
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // gewählte Zeile sichtbar halten (Pfeiltasten); Kopfzeile ist „sticky"
  function ensureVisible(index: number): void {
    const el = scrollRef.current
    if (!el) return
    const head = headRef.current?.offsetHeight ?? 0
    const top = index * ROW_H
    const bottom = top + ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + el.clientHeight - head) {
      el.scrollTop = bottom - el.clientHeight + head
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const idx = rows.findIndex((x) => x.path === currentPath)
    const nextIdx = Math.max(0, Math.min(rows.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))
    const next = rows[nextIdx]
    if (!next) return
    useMediaInfo.getState().select(next.path)
    ensureVisible(nextIdx)
  }

  const start = virtual ? Math.max(0, Math.floor(view.top / ROW_H) - OVERSCAN) : 0
  const end = virtual
    ? Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_H) + OVERSCAN)
    : rows.length
  const select = useMediaInfo.getState().select
  const shown = OPTIONAL_COLS.filter(([k]) => cols.split(',').includes(k))
  const has = (k: OptCol): boolean => shown.some(([x]) => x === k)
  const minRem = BASE_REM + NAME_MIN_REM + shown.reduce((sum, [, w]) => sum + w, 0)

  return (
    <Card className="overflow-hidden p-0">
      <div
        ref={scrollRef}
        className="max-h-[45vh] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
        tabIndex={0}
        onKeyDown={onKey}
        onScroll={virtual ? onScroll : undefined}
        aria-label="Dateiliste (Pfeiltasten wechseln die Auswahl)"
      >
        <table className="w-full table-fixed text-[13px]" style={{ minWidth: `${minRem}rem` }}>
          <colgroup>
            <col className="w-8" />
            <col />
            <col className="w-[6rem]" />
            <col className="w-[5.25rem]" />
            <col className="w-[7rem]" />
            {has('depth') && <col className="w-[7.75rem]" />}
            <col className="w-[4.25rem]" />
            {has('bitrate') && <col className="w-[5.5rem]" />}
            {has('size') && <col className="w-[5rem]" />}
            {has('audio') && <col className="w-[7.5rem]" />}
          </colgroup>
          <thead ref={headRef} className="sticky top-0 z-[1] bg-card">
            <tr className="text-left text-[10px] uppercase tracking-wider text-primary">
              <Th label="" k="status" sort={sort} onSort={onSort} />
              <Th label="Datei" k="name" sort={sort} onSort={onSort} />
              <Th label={COMPARE_LABELS.resolution} k="resolution" sort={sort} onSort={onSort} />
              <Th label="fps" k="fps" sort={sort} onSort={onSort} />
              <Th label="Codec" k="codec" sort={sort} onSort={onSort} />
              {has('depth') && <th className="px-1.5 py-2 font-medium">Bit/Chroma</th>}
              <Th label="Dauer" k="duration" sort={sort} onSort={onSort} align="right" />
              {has('bitrate') && (
                <Th label="Bitrate" k="bitrate" sort={sort} onSort={onSort} align="right" />
              )}
              {has('size') && (
                <Th label="Größe" k="size" sort={sort} onSort={onSort} align="right" />
              )}
              {has('audio') && <th className="px-1.5 py-2 font-medium">Ton</th>}
            </tr>
          </thead>
          <tbody>
            {start > 0 && <tr style={{ height: start * ROW_H }} aria-hidden />}
            {rows.slice(start, end).map((e) => (
              <Row
                key={e.path}
                entry={e}
                hints={hintsByPath.get(e.path) ?? NO_HINTS}
                devInfo={devInfoFor(deviations, e.path)}
                cols={cols}
                active={e.path === currentPath}
                onSelect={select}
              />
            ))}
            {end < rows.length && (
              <tr style={{ height: (rows.length - end) * ROW_H }} aria-hidden />
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const NO_HINTS: MediaHint[] = []

// Abweichungen einer Zeile als stabiler String (JSON der Paare Spalte -> Mehrheitswert
// in Anzeigeform) -> React.memo erkennt unveränderte Zeilen, obwohl die
// Gesamtauswertung neu läuft.
function devInfoFor(d: ReturnType<typeof findDeviations>, path: string): string {
  const keys = d.byPath.get(path)
  if (!keys) return ''
  return JSON.stringify([...keys].sort().map((k) => [k, d.majorityLabel[k] ?? '?']))
}

const Row = memo(function Row({
  entry,
  hints,
  devInfo,
  cols,
  active,
  onSelect
}: {
  entry: MediaEntry
  hints: MediaHint[]
  devInfo: string
  cols: string
  active: boolean
  onSelect: (path: string) => void
}): JSX.Element {
  const info = entry.info
  const v = info ? mainVideo(info) : null
  const a = info?.audio[0]
  const devMap = new Map<CompareKey, string>(
    devInfo ? (JSON.parse(devInfo) as [CompareKey, string][]) : []
  )
  const dev = (k: CompareKey): string | undefined =>
    devMap.has(k) ? 'bg-amber-500/10 text-amber-400 light:text-amber-700' : undefined
  const devTitle = (k: CompareKey): string | undefined =>
    devMap.has(k) ? `Weicht ab – Mehrheit: ${devMap.get(k)}` : undefined
  const show = cols.split(',')
  const has = (k: OptCol): boolean => show.includes(k)

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
      <span
        title={[
          plural(c.problem, 'Problem', 'Probleme'),
          plural(c.warning, 'Warnung', 'Warnungen'),
          plural(c.info, 'Hinweis', 'Hinweise')
        ].join(', ')}
      >
        <Icon className={cn('size-4', meta.className)} aria-label={meta.label} />
      </span>
    )
  }

  const variable = v?.fpsMode === 'vfr' || v?.fpsMode === 'vfr-suspect'
  const fps =
    v && v.fpsMode !== 'still' && v.fps
      ? variable
        ? // Durchschnitt: drei Nachkommastellen täuschten Präzision vor (und „VFR" fiele weg)
          `${nf(v.fps, 1)} VFR`
        : `${fmtFps(v.fps)}${v.scan === 'tff' || v.scan === 'bff' ? 'i' : v.scan === 'progressive' ? 'p' : ''}`
      : v?.fpsMode === 'still'
        ? 'Bild'
        : '–'
  const depth = v
    ? `${v.bitDepth ?? '?'} · ${v.chroma ?? '?'}${v.alpha ? ' · α' : ''}${v.hdr ? ' · HDR' : ''}`
    : '–'
  const audio = a ? `${sampleRateLabel(a.sampleRate)} · ${channelLabel(a)}` : '–'
  const cell = 'truncate whitespace-nowrap px-1.5'
  // Datenspalten: Auflösung, fps, Codec, Dauer + eingeblendete optionale
  const dataCols = 4 + show.filter(Boolean).length

  return (
    <tr
      onClick={() => onSelect(entry.path)}
      style={{ height: ROW_H }}
      title={entry.status === 'error' ? `${entry.error}` : undefined}
      className={cn(
        'cursor-pointer border-t border-border hover:bg-muted/40',
        active && 'bg-primary/10 hover:bg-primary/15'
      )}
    >
      <td className="px-1.5">{status}</td>
      <td className={cn(cell, 'font-medium')} title={entry.path}>
        {info?.name ?? splitPath(entry.path).name}
      </td>
      {entry.status === 'error' ? (
        // Fehlertext einzeilig über die Datenspalten (feste Zeilenhöhe)
        <td colSpan={dataCols} className={cn(cell, 'text-red-400 light:text-red-600')}>
          {entry.error}
        </td>
      ) : (
        <>
          <td
            className={cn(cell, 'tabular-nums', dev('resolution'))}
            title={devTitle('resolution')}
          >
            {v ? `${v.displayWidth}×${v.displayHeight}` : '–'}
          </td>
          <td
            className={cn(cell, 'tabular-nums', dev('fps') ?? dev('scan'))}
            title={devTitle('fps') ?? devTitle('scan') ?? (v ? fpsLabel(v) : undefined)}
          >
            {fps}
          </td>
          <td className={cn(cell, dev('codec'))} title={devTitle('codec') ?? v?.codec}>
            {v?.codec ?? a?.codec ?? '–'}
          </td>
          {has('depth') && (
            <td
              className={cn(cell, 'tabular-nums', dev('depth'))}
              title={devTitle('depth') ?? depth}
            >
              {depth}
            </td>
          )}
          <td className={cn(cell, 'text-right tabular-nums')}>
            {info?.isStill ? '–' : fmtDurationShort(info?.durationSec)}
          </td>
          {has('bitrate') && (
            <td className={cn(cell, 'text-right tabular-nums')}>
              {info?.bitRate ? fmtBitrate(info.bitRate) : '–'}
            </td>
          )}
          {has('size') && (
            <td className={cn(cell, 'text-right tabular-nums')}>{fmtBytes(info?.sizeBytes)}</td>
          )}
          {has('audio') && (
            <td className={cn(cell, dev('audio'))} title={devTitle('audio') ?? audio}>
              {audio}
            </td>
          )}
        </>
      )}
    </tr>
  )
})
