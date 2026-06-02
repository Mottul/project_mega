import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  FolderOpen,
  FolderSearch,
  Play,
  Trash2,
  X,
  XCircle
} from 'lucide-react'
import { Badge, type BadgeTone } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Progress } from '@renderer/components/ui/progress'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import type {
  ChunksMode,
  HapCheckResult,
  HapCompressor,
  HapFormat,
  HapJob,
  JobStatus
} from '@shared/types'

const VIDEO_EXTENSIONS = [
  'mov', 'mp4', 'mxf', 'avi', 'mkv', 'm4v', 'mpg', 'mpeg', 'wmv', 'mts', 'm2ts', 'ts', 'webm'
]

// Sinnvolle Parallel-Stufen bis zur Kernzahl (ein einzelner HAP-Encode lastet die
// CPU nicht voll aus -> mehrere gleichzeitig nutzen die Kerne besser).
const CORES = Math.max(1, Math.min(8, (globalThis.navigator?.hardwareConcurrency ?? 4)))
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

const selectClass =
  'h-9 rounded-md border border-border bg-input/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export function HapConverter(): JSX.Element {
  const [check, setCheck] = useState<HapCheckResult | null>(null)
  const [inputs, setInputs] = useState<string[]>([])
  const [format, setFormat] = useState<HapFormat>('hap_q')
  const [autoChunks, setAutoChunks] = useState(true)
  const [manualChunks, setManualChunks] = useState(4)
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [concurrency, setConcurrency] = useState(1)
  const [compressor, setCompressor] = useState<HapCompressor>('snappy')
  const [jobs, setJobs] = useState<Record<string, HapJob>>({})

  // Initialer Zustand: Settings, HAP-Verfügbarkeit, laufende Jobs + Live-Updates
  useEffect(() => {
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
  const activeCount = jobList.filter((j) => j.status === 'running' || j.status === 'queued' || j.status === 'probing').length
  const hasFinished = jobList.some((j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled')

  async function addFiles(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'Videos auswählen',
      multi: true,
      filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }]
    })
    if (paths.length) setInputs((prev) => [...new Set([...prev, ...paths])])
  }

  async function addFolder(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    if (paths.length) setInputs((prev) => [...new Set([...prev, ...paths])])
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

  async function start(): Promise<void> {
    if (!inputs.length) return
    const chunks: ChunksMode = autoChunks
      ? { kind: 'auto' }
      : { kind: 'manual', value: Math.max(1, Math.min(64, manualChunks)) }
    await api.hap.enqueue({ inputs, format, chunks, outputDir, concurrency, compressor })
    setInputs([])
  }

  const hapUnavailable = check && !check.available

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {hapUnavailable && (
        <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-300">HAP-Encoder nicht verfügbar</p>
            <p className="mt-1 text-muted-foreground">
              {check?.ffmpegFound
                ? 'Das gebündelte ffmpeg kennt den HAP-Encoder nicht (libsnappy fehlt). Bitte ein HAP-fähiges ffmpeg über das Download-Skript bereitstellen.'
                : 'Es wurde kein ffmpeg gefunden. Im Dev-Modus über scripts/download-ffmpeg.mjs bereitstellen oder ein ffmpeg im PATH installieren.'}
              {check?.error ? ` (${check.error})` : ''}
            </p>
          </div>
        </Card>
      )}

      {/* Konfiguration */}
      <Card className="p-5">
        <div className="grid gap-5 sm:grid-cols-2">
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
            <span className="text-sm font-medium">Gleichzeitige Konvertierungen</span>
            <select
              className={selectClass}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
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

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Kompressor</span>
            <select
              className={selectClass}
              value={compressor}
              onChange={(e) => setCompressor(e.target.value as HapCompressor)}
            >
              <option value="snappy">Snappy (kleinere Dateien, Standard)</option>
              <option value="none">Keiner (schneller, größere Dateien)</option>
            </select>
            <span className="text-xs text-muted-foreground">
              HAP-Encoding läuft auf der CPU (keine GPU); die GPU nutzt erst der Player.
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Chunks</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoChunks}
                  onChange={(e) => setAutoChunks(e.target.checked)}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                Automatisch
              </label>
              {!autoChunks && (
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={manualChunks}
                  onChange={(e) => setManualChunks(Number(e.target.value))}
                  className={cn(selectClass, 'w-24')}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Ausgabeordner</span>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded-md border border-border bg-input/40 px-3 py-1.5 text-sm text-muted-foreground">
                {outputDir ?? 'Neben der Quelldatei'}
              </span>
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
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={addFiles}>
            <FolderSearch className="size-4" /> Dateien hinzufügen
          </Button>
          <Button variant="secondary" onClick={addFolder}>
            <FolderOpen className="size-4" /> Ordner hinzufügen
          </Button>
          <div className="flex-1" />
          <Button onClick={start} disabled={!inputs.length}>
            <Play className="size-4" /> Konvertierung starten
            {inputs.length > 0 ? ` (${inputs.length})` : ''}
          </Button>
        </div>

        {inputs.length > 0 && (
          <div className="mt-4 space-y-1">
            {inputs.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-1.5 text-sm"
              >
                <span className="truncate" title={p}>
                  {basename(p)}
                </span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setInputs((prev) => prev.filter((x) => x !== p))}
                  aria-label="Entfernen"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
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
              <Button variant="ghost" size="sm" onClick={() => void api.hap.clearFinished()}>
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
          <Progress value={jobList.length ? doneCount / jobList.length : 0} className="mb-4" />
        )}

        {jobList.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Noch keine Jobs. Dateien/Ordner hinzufügen und Konvertierung starten.
          </p>
        ) : (
          <div className="space-y-2">
            {jobList.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function JobRow({ job }: { job: HapJob }): JSX.Element {
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
        <Progress
          value={job.progress}
          indeterminate={job.status === 'probing'}
          className="mt-2"
        />
      )}
      {job.status === 'error' && job.error && (
        <p className="mt-2 text-xs text-red-400">{job.error}</p>
      )}
    </div>
  )
}
