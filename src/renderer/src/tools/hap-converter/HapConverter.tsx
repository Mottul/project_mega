import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Cpu,
  Film,
  FileSearch,
  FolderOpen,
  FolderSearch,
  Loader2,
  Play,
  Trash2,
  X,
  XCircle
} from 'lucide-react'
import { Badge, type BadgeTone } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { NumberField } from '@renderer/components/ui/number-field'
import { Progress } from '@renderer/components/ui/progress'
import { selectClass } from '@renderer/components/ui/select'
import { PanelSection, ToolShell } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { useKiosk } from '@renderer/launcher/kiosk'
import { useHandoff } from '@renderer/lib/handoff'
import { cn } from '@renderer/lib/utils'
import { VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import type {
  ChunksMode,
  HapCheckResult,
  HapCompressor,
  HapFormat,
  HapJob,
  JobStatus
} from '@shared/types'
import { fmtBitrate, fmtDurationShort, fmtFps, hapRateEstimate } from '../media-info/format'
import { hapInputHints, mainVideo, worstLevel, type MediaHint } from '../media-info/hints'
import { LEVEL_META } from '../media-info/levels'
import { useHapInputMeta, useHapInputs, type InputMeta } from './store'

// Sinnvolle Parallel-Stufen bis zur Kernzahl (ein einzelner HAP-Encode lastet die
// CPU nicht voll aus -> mehrere gleichzeitig nutzen die Kerne besser).
const CORES = Math.max(1, Math.min(8, globalThis.navigator?.hardwareConcurrency ?? 4))
const CONCURRENCY_OPTIONS = [...new Set([1, 2, 4, 6, CORES])]
  .filter((n) => n >= 1 && n <= 8)
  .sort((a, b) => a - b)

const FORMAT_OPTIONS: { value: HapFormat; label: string }[] = [
  { value: 'hap_q', label: 'HAP Q (beste Qualität)' },
  { value: 'hap', label: 'HAP (Standard)' },
  { value: 'hap_alpha', label: 'HAP Alpha (mit Transparenz)' }
]

const STATUS_META: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: 'Warteschlange', tone: 'neutral' },
  probing: { label: 'Analyse', tone: 'info' },
  running: { label: 'Konvertiert', tone: 'info' },
  done: { label: 'Fertig', tone: 'success' },
  error: { label: 'Fehler', tone: 'danger' },
  canceled: { label: 'Abgebrochen', tone: 'warning' }
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export function HapConverter(): JSX.Element {
  const navigate = useNavigate()
  const [check, setCheck] = useState<HapCheckResult | null>(null)
  // Eingabeliste im Store: übersteht den Abstecher in die Medien-Info
  const inputs = useHapInputs((s) => s.inputs)
  const meta = useHapInputMeta((s) => s.meta)
  const [format, setFormat] = useState<HapFormat>('hap_q')
  const [outputDir, setOutputDir] = useState<string | null>(null)
  // Kompressor/Parallelität/Chunks im Store: überstehen den Abstecher in die Medien-Info
  const compressor = useHapInputs((s) => s.compressor)
  const concurrency = useHapInputs((s) => s.concurrency)
  const autoChunks = useHapInputs((s) => s.autoChunks)
  const manualChunks = useHapInputs((s) => s.manualChunks)
  const setOptions = useHapInputs((s) => s.setOptions)
  // Kundenansicht: keine Sprünge in andere (ungesperrte) Tools anbieten
  const locked = useKiosk()
  const [jobs, setJobs] = useState<Record<string, HapJob>>({})
  const [dragOver, setDragOver] = useState(false)
  const [startNote, setStartNote] = useState<string | null>(null)

  // Drag&Drop: Dateien UND Ordner – webUtils liefert auch für Ordner den Pfad,
  // die Queue (collectVideos) durchsucht Ordner rekursiv.
  function onDropInputs(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    if (paths.length) useHapInputs.getState().add(paths)
  }

  // Eckdaten je Eingabe nachladen (Analyse läuft über die Medien-Info, Cache im main
  // -> der spätere Konvertier-Job liest sie nicht erneut von der Platte)
  useEffect(() => {
    for (const p of inputs) useHapInputMeta.getState().load(p)
  }, [inputs])

  function showDetails(path: string): void {
    useHandoff.getState().givePaths('media-info', [path])
    navigate('/tool/media-info')
  }

  // Initialer Zustand: Settings, HAP-Verfügbarkeit, laufende Jobs + Live-Updates
  useEffect(() => {
    // Übergabe aus der Medien-Info („An HAP-Konverter")
    const handed = useHandoff.getState().takePaths('hap-converter')
    if (handed.length) useHapInputs.getState().add(handed)
    void api.getSettings().then((s) => {
      setFormat(s.lastHapFormat)
      setOutputDir(s.lastHapOutputDir)
    })
    void api.ffmpeg.checkHap().then(setCheck)
    void api.hap.list().then((list) => {
      setJobs(Object.fromEntries(list.map((j) => [j.id, j])))
    })
    const off = api.hap.onUpdate((job) => {
      setJobs((prev) => ({ ...prev, [job.id]: job }))
    })
    return off
  }, [])

  const jobList = useMemo(
    () => Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt),
    [jobs]
  )
  const doneCount = jobList.filter((j) => j.status === 'done').length
  const settledCount = jobList.filter(
    (j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled'
  ).length
  const activeCount = jobList.filter(
    (j) => j.status === 'running' || j.status === 'queued' || j.status === 'probing'
  ).length
  const hasFinished = jobList.some(
    (j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled'
  )

  async function addFiles(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'Videos auswählen',
      multi: true,
      filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }]
    })
    if (paths.length) useHapInputs.getState().add(paths)
  }

  async function addFolder(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    if (paths.length) useHapInputs.getState().add(paths)
  }

  async function chooseOutput(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ausgabeordner', directories: true })
    if (paths.length) {
      setOutputDir(paths[0])
      void api.setSettings({ lastHapOutputDir: paths[0] })
    }
  }

  function onFormatChange(value: HapFormat): void {
    setFormat(value)
    void api.setSettings({ lastHapFormat: value })
  }

  // Nach clearFinished neu syncen: der main-Prozess loescht Jobs aus seiner Map,
  // sendet dafuer aber kein Update -> sonst blieben sie im Renderer haengen.
  async function refreshJobs(): Promise<void> {
    const list = await api.hap.list()
    setJobs(Object.fromEntries(list.map((j) => [j.id, j])))
  }

  async function start(): Promise<void> {
    if (!inputs.length) return
    const chunks: ChunksMode = autoChunks
      ? { kind: 'auto' }
      : { kind: 'manual', value: Math.max(1, Math.min(64, manualChunks)) }
    // erwartete Jobs: Einzeldateien je 1, Ordner mit ihrer Video-Anzahl
    const expected = fileCount
    const res = await api.hap.enqueue({
      inputs,
      format,
      chunks,
      outputDir,
      concurrency,
      compressor
    })
    useHapInputs.getState().clear()
    if (!res.jobIds.length) setStartNote('Keine Videodateien gefunden – nichts eingereiht.')
    else if (res.jobIds.length < expected) {
      setStartNote(
        `${res.jobIds.length} von ${expected} Dateien eingereiht – übrige nicht gefunden oder nicht lesbar.`
      )
    } else setStartNote(null)
  }

  // Hinweise je Eingabedatei für das gewählte Format + Sammelzeile über dem Start
  const inputHints = useMemo(() => {
    const m = new Map<string, MediaHint[]>()
    for (const p of inputs) {
      const mt = meta[p]
      if (mt?.kind === 'file' && mt.result.ok) m.set(p, hapInputHints(mt.result.info, format))
    }
    return m
  }, [inputs, meta, format])
  const summary = useMemo(() => {
    const counts = new Map<string, { title: string; n: number; level: MediaHint['level'] }>()
    for (const hints of inputHints.values()) {
      for (const h of hints) {
        if (h.level !== 'warning' && h.level !== 'problem') continue
        const c = counts.get(h.id) ?? { title: h.title, n: 0, level: h.level }
        c.n++
        counts.set(h.id, c)
      }
    }
    return [...counts.values()]
  }, [inputHints])
  const fileCount = inputs.reduce((sum, p) => {
    const mt = meta[p]
    return sum + (mt?.kind === 'folder' ? mt.videos : 1)
  }, 0)

  const hapUnavailable = check && !check.available

  return (
    <ToolShell
      id="hap-converter"
      aside={
        <>
          <PanelSection id="format" title="Format & Qualität" icon={Film}>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Format</span>
              <select
                className={selectClass}
                value={format}
                onChange={(e) => onFormatChange(e.target.value as HapFormat)}
              >
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Kompressor</span>
              <select
                className={selectClass}
                value={compressor}
                onChange={(e) => setOptions({ compressor: e.target.value as HapCompressor })}
              >
                <option value="snappy">Snappy (kleinere Dateien, Standard)</option>
                <option value="none">Keiner (schneller, größere Dateien)</option>
              </select>
              <span className="text-xs text-muted-foreground">
                HAP-Encoding läuft auf der CPU (keine GPU); die GPU nutzt erst der Player.
              </span>
            </label>
          </PanelSection>

          <PanelSection id="proc" title="Verarbeitung" icon={Cpu}>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Gleichzeitige Konvertierungen</span>
              <select
                className={selectClass}
                value={concurrency}
                onChange={(e) => setOptions({ concurrency: Number(e.target.value) })}
              >
                {CONCURRENCY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1 (sequentiell)' : `${n} parallel`}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Mehr parallel = mehr CPU-Auslastung (bis {CORES} Kerne sinnvoll).
              </span>
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Chunks</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoChunks}
                    onChange={(e) => setOptions({ autoChunks: e.target.checked })}
                    className="size-4 accent-[hsl(var(--primary))]"
                  />
                  Automatisch
                </label>
                {!autoChunks && (
                  <NumberField
                    value={manualChunks}
                    min={1}
                    max={64}
                    className="w-24"
                    onCommit={(v) => setOptions({ manualChunks: v })}
                  />
                )}
              </div>
            </div>
          </PanelSection>

          <PanelSection id="output" title="Ausgabeordner" icon={FolderOpen}>
            <span
              className="block truncate rounded-md border border-border bg-input/40 px-3 py-1.5 text-sm text-muted-foreground"
              title={outputDir ?? undefined}
            >
              {outputDir ?? 'Neben der Quelldatei'}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={chooseOutput}>
                <FolderOpen className="size-4" /> Wählen
              </Button>
              {outputDir && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOutputDir(null)
                    void api.setSettings({ lastHapOutputDir: null })
                  }}
                >
                  Zurücksetzen
                </Button>
              )}
            </div>
          </PanelSection>
        </>
      }
      main={
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {hapUnavailable && (
            <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400 light:text-amber-700" />
              <div className="text-sm">
                <p className="font-medium text-amber-400 light:text-amber-700">
                  HAP-Encoder nicht verfügbar
                </p>
                <p className="mt-1 text-muted-foreground">
                  {check?.ffmpegFound
                    ? 'Das gebündelte ffmpeg kennt den HAP-Encoder nicht (libsnappy fehlt). Bitte ein HAP-fähiges ffmpeg über das Download-Skript bereitstellen.'
                    : 'Es wurde kein ffmpeg gefunden. Im Dev-Modus über scripts/download-ffmpeg.mjs bereitstellen oder ein ffmpeg im PATH installieren.'}
                  {check?.error ? ` (${check.error})` : ''}
                </p>
              </div>
            </Card>
          )}

          {/* Eingang (auch Drop-Ziel für Dateien/Ordner) */}
          <Card
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDropInputs}
            className={`space-y-4 p-5 transition-colors ${dragOver ? 'border-primary bg-primary/5' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={addFiles}>
                <FolderSearch className="size-4" /> Dateien hinzufügen
              </Button>
              <Button variant="secondary" onClick={addFolder}>
                <FolderOpen className="size-4" /> Ordner hinzufügen
              </Button>
              <div className="flex-1" />
              <Button onClick={start} disabled={!inputs.length}>
                <Play className="size-4" /> Konvertierung starten
                {inputs.length > 0 ? ` (${fileCount})` : ''}
              </Button>
            </div>

            {inputs.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Dateien oder Ordner hierher ziehen – oder oben hinzufügen.
              </p>
            )}

            {inputs.length > 0 && (
              <div className="space-y-1">
                {inputs.map((p) => (
                  <InputRow
                    key={p}
                    path={p}
                    meta={meta[p]}
                    hints={inputHints.get(p) ?? []}
                    format={format}
                    onInfo={locked ? null : () => showDetails(p)}
                    onRemove={() => useHapInputs.getState().remove(p)}
                  />
                ))}
              </div>
            )}

            {summary.length > 0 && (
              <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                {summary.map((c) => (
                  <p key={c.title} className="flex items-center gap-1.5">
                    <AlertTriangle
                      className={cn('size-3.5 shrink-0', LEVEL_META[c.level].className)}
                    />
                    {c.n === 1 ? '1 Datei' : `${c.n} Dateien`}: {c.title}
                  </p>
                ))}
              </div>
            )}
            {startNote && <p className="text-xs text-muted-foreground">{startNote}</p>}
          </Card>

          {/* Queue */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-medium">Warteschlange</h2>
                <p className="text-sm text-muted-foreground">
                  {jobList.length} Job(s) · {doneCount} fertig · {activeCount} aktiv
                </p>
              </div>
              <div className="flex gap-2">
                {hasFinished && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void api.hap.clearFinished().then(refreshJobs)}
                  >
                    <Trash2 className="size-4" /> Erledigte entfernen
                  </Button>
                )}
                {activeCount > 0 && (
                  <Button variant="outline" size="sm" onClick={() => void api.hap.cancelAll()}>
                    <XCircle className="size-4" /> Alle abbrechen
                  </Button>
                )}
              </div>
            </div>

            {jobList.length > 0 && (
              <Progress
                value={jobList.length ? settledCount / jobList.length : 0}
                className="mb-4"
              />
            )}

            {jobList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Noch keine Jobs. Dateien/Ordner hinzufügen und Konvertierung starten.
              </p>
            ) : (
              <div className="space-y-2">
                {jobList.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onInfo={locked ? null : () => showDetails(job.inputPath)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      }
    />
  )
}

function JobRow({ job, onInfo }: { job: HapJob; onInfo: (() => void) | null }): JSX.Element {
  const meta = STATUS_META[job.status]
  const resolution = job.width && job.height ? `${job.width}×${job.height}` : '–'
  const canCancel = job.status === 'queued' || job.status === 'running' || job.status === 'probing'

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={job.inputPath}>
            {basename(job.inputPath)}
          </p>
          <p className="text-xs text-muted-foreground">
            {resolution}
            {job.chunks ? ` · ${job.chunks} Chunks` : ''} · → {basename(job.outputPath)}
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {onInfo && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onInfo}
            aria-label="Details in Medien-Info"
            title="Details in Medien-Info"
          >
            <FileSearch className="size-4" />
          </Button>
        )}
        {canCancel && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void api.hap.cancel(job.id)}
            aria-label="Abbrechen"
          >
            <X className="size-4" />
          </Button>
        )}
        {job.status === 'done' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void api.showItemInFolder(job.outputPath)}
            aria-label="Im Ordner zeigen"
          >
            <FolderOpen className="size-4" />
          </Button>
        )}
      </div>
      {(job.status === 'running' || job.status === 'probing') && (
        <Progress value={job.progress} indeterminate={job.status === 'probing'} className="mt-2" />
      )}
      {job.status === 'error' && job.error && (
        <p className="mt-2 text-xs text-destructive">{job.error}</p>
      )}
    </div>
  )
}

// Eingabezeile mit Eckdaten (Auflösung · fps · Codec · Dauer) und HAP-Hinweisen
// für das gewählte Format; Ordner zeigen die Anzahl gefundener Videos.
function InputRow({
  path,
  meta,
  hints,
  format,
  onInfo,
  onRemove
}: {
  path: string
  meta: InputMeta | undefined
  hints: MediaHint[]
  format: HapFormat
  onInfo: (() => void) | null
  onRemove: () => void
}): JSX.Element {
  let line: JSX.Element | string
  if (!meta || meta.kind === 'loading') {
    line = (
      <span className="flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> analysiere …
      </span>
    )
  } else if (meta.kind === 'folder') {
    line = (
      <Badge tone={meta.videos ? 'neutral' : 'warning'}>
        Ordner · {meta.videos === 1 ? '1 Video' : `${meta.videos} Videos`}
      </Badge>
    )
  } else if (meta.kind === 'error') {
    line = <span className="text-red-400 light:text-red-600">{meta.message}</span>
  } else if (!meta.result.ok) {
    line = <span className="text-red-400 light:text-red-600">{meta.result.error}</span>
  } else {
    const info = meta.result.info
    const v = mainVideo(info)
    // ffmpeg dreht beim Konvertieren automatisch -> Zielmaße sind die gedrehten
    // gespeicherten Pixel (ein anamorphes SAR bleibt dagegen erhalten)
    const turned = v && (v.rotation === 90 || v.rotation === 270)
    const ow = v ? (turned ? v.height : v.width) : 0
    const oh = v ? (turned ? v.width : v.height) : 0
    const rate = v ? hapRateEstimate(ow, oh, v.fps, format) : null
    line = [
      v ? `${ow}×${oh}` : 'kein Video',
      v?.fps ? `${fmtFps(v.fps)} fps` : null,
      v?.codec ?? null,
      info.durationSec ? fmtDurationShort(info.durationSec) : null,
      // Obergrenze vor Snappy-Kompression (je nach Bildinhalt deutlich weniger)
      rate ? `HAP ≤ ${fmtBitrate(rate)}` : null
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const worst = worstLevel(hints)
  const shown = hints.filter((h) => h.level !== 'ok')
  return (
    <div className="rounded-md bg-muted/40 px-3 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate" title={path}>
            {basename(path)}
          </p>
          <div className="truncate text-xs text-muted-foreground">{line}</div>
        </div>
        {shown.length > 0 && (
          <span title={shown.map((h) => h.title).join('\n')}>
            <Badge tone={LEVEL_META[worst].tone}>
              {shown.length === 1 ? shown[0].title : `${shown.length} Hinweise`}
            </Badge>
          </span>
        )}
        {meta?.kind === 'file' && onInfo && (
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={onInfo}
            aria-label="Details in Medien-Info"
            title="Details in Medien-Info"
          >
            <FileSearch className="size-4" />
          </button>
        )}
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={onRemove}
          aria-label="Entfernen"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
