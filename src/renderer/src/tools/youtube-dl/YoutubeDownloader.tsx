// YouTube-Downloader (yt-dlp). Lädt bei Bedarf die yt-dlp-Binary nach userData/
// bin und hält sie per Knopf aktuell; Downloads laufen als Queue mit Fortschritt
// (main-Prozess). Muxing über das gebündelte ffmpeg.

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
  X
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { YtFormatId, YtJob, YtToolStatus } from '@shared/types'
import { selectClass } from '../_calc/ui'
import { toolPageClass } from '@renderer/lib/toolPage'

const LS = 'youtube-dl-settings'

interface Settings {
  format: YtFormatId
  maxHeight: number | null
  outputDir: string
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(LS) ?? '') as Settings
    if (s && typeof s.format === 'string') return s
  } catch {
    /* leer/defekt */
  }
  return { format: 'video', maxHeight: 1080, outputDir: '' }
}

export function YoutubeDownloader(): JSX.Element {
  const [status, setStatus] = useState<YtToolStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [cfg, setCfg] = useState<Settings>(loadSettings)
  const [jobs, setJobs] = useState<YtJob[]>([])
  const jobMap = useRef<Map<string, YtJob>>(new Map())

  useEffect(() => {
    void api.youtube.status().then(setStatus)
    void api.youtube.list().then((list) => {
      jobMap.current = new Map(list.map((j) => [j.id, j]))
      setJobs([...jobMap.current.values()])
    })
    return api.youtube.onJobUpdate((job) => {
      jobMap.current.set(job.id, job)
      setJobs([...jobMap.current.values()].sort((a, b) => b.createdAt - a.createdAt))
    })
  }, [])

  useEffect(() => {
    localStorage.setItem(LS, JSON.stringify(cfg))
  }, [cfg])

  async function pickDir(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Zielordner wählen', directories: true })
    if (paths[0]) setCfg((c) => ({ ...c, outputDir: paths[0] }))
  }

  async function updateTool(): Promise<void> {
    setUpdating(true)
    setUpdateError(null)
    try {
      setStatus(await api.youtube.updateTool())
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdating(false)
    }
  }

  function enqueue(): void {
    const u = url.trim()
    if (!u || !cfg.outputDir) return
    void api.youtube.enqueue({
      url: u,
      format: cfg.format,
      maxHeight: cfg.format === 'video' ? cfg.maxHeight : null,
      outputDir: cfg.outputDir
    })
    setUrl('')
  }

  const ready = status?.available && !!cfg.outputDir
  const active = jobs.some((j) => j.status === 'running' || j.status === 'queued')

  return (
    <div className={toolPageClass('full')}>
      {/* yt-dlp-Status */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        {status == null ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Prüfe yt-dlp…
          </span>
        ) : status.available ? (
          <span className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-emerald-500 light:text-emerald-700" />
            yt-dlp <span className="font-mono text-xs text-muted-foreground">{status.version}</span>
            <span className="text-xs text-muted-foreground">
              ({status.location === 'managed' ? 'verwaltet' : 'System-PATH'})
            </span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-amber-500 light:text-amber-700" /> yt-dlp nicht
            gefunden
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant={status?.available ? 'outline' : 'default'}
          size="sm"
          disabled={updating}
          onClick={() => void updateTool()}
        >
          {updating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {status?.available ? 'Aktualisieren' : 'yt-dlp herunterladen'}
        </Button>
      </Card>

      {updateError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Download fehlgeschlagen: {updateError} – Internetverbindung prüfen.
        </p>
      )}
      {status && !status.ffmpeg && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 light:text-amber-700">
          ffmpeg nicht gefunden – Zusammenführen von Bild/Ton kann fehlschlagen.
        </p>
      )}

      {/* Eingabe */}
      <Card className="space-y-3 p-4">
        <div className="flex gap-2">
          <Input
            value={url}
            placeholder="YouTube-URL einfügen…"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) enqueue()
            }}
          />
          <Button disabled={!ready || !url.trim()} onClick={enqueue}>
            <Download className="size-4" /> Laden
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Format</span>
            <select
              className={`${selectClass} w-auto`}
              value={cfg.format}
              onChange={(e) => setCfg((c) => ({ ...c, format: e.target.value as YtFormatId }))}
            >
              <option value="video">Video (MP4)</option>
              <option value="audio-mp3">Nur Audio (MP3)</option>
              <option value="audio-m4a">Nur Audio (M4A)</option>
            </select>
          </label>
          {cfg.format === 'video' && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Max. Auflösung</span>
              <select
                className={`${selectClass} w-auto`}
                value={cfg.maxHeight ?? 'best'}
                onChange={(e) =>
                  setCfg((c) => ({
                    ...c,
                    maxHeight: e.target.value === 'best' ? null : Number(e.target.value)
                  }))
                }
              >
                <option value="best">Beste</option>
                <option value="2160">2160p (4K)</option>
                <option value="1080">1080p</option>
                <option value="720">720p</option>
                <option value="480">480p</option>
              </select>
            </label>
          )}
          <label className="block min-w-[200px] flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Zielordner</span>
            <div className="flex gap-2">
              <Input
                readOnly
                value={cfg.outputDir}
                placeholder="Ordner wählen…"
                className="cursor-default"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => void pickDir()}
                title="Ordner wählen"
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Nur Inhalte herunterladen, für die du die Rechte/Erlaubnis hast
          (YouTube-Nutzungsbedingungen beachten). yt-dlp regelmäßig aktualisieren, wenn Downloads
          scheitern.
        </p>
      </Card>

      {/* Jobs */}
      {jobs.length > 0 && (
        <Card className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              Downloads
            </h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={active}
              onClick={() => void api.youtube.clearFinished()}
            >
              Erledigte entfernen
            </Button>
          </div>
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </Card>
      )}
    </div>
  )
}

function JobRow({ job }: { job: YtJob }): JSX.Element {
  const done = job.status === 'done'
  const failed = job.status === 'error'
  const canceled = job.status === 'canceled'
  const running = job.status === 'running' || job.status === 'queued'
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm" title={job.title ?? job.url}>
          {job.title ?? job.url}
        </span>
        {running && (
          <button
            type="button"
            onClick={() => void api.youtube.cancel(job.id)}
            className="text-muted-foreground hover:text-destructive"
            title="Abbrechen"
          >
            <X className="size-4" />
          </button>
        )}
        {done && job.outputFile && (
          <button
            type="button"
            onClick={() => void api.showItemInFolder(job.outputFile!)}
            className="text-muted-foreground hover:text-foreground"
            title="Im Ordner zeigen"
          >
            <FolderOpen className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-[width] ${failed ? 'bg-destructive' : done ? 'bg-emerald-500' : 'bg-primary'}`}
            style={{ width: `${done ? 100 : Math.round(job.progress * 100)}%` }}
          />
        </div>
        <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
          {done
            ? 'Fertig'
            : failed
              ? 'Fehler'
              : canceled
                ? 'Abgebrochen'
                : job.status === 'queued'
                  ? 'Wartet…'
                  : `${Math.round(job.progress * 100)}%${job.eta ? ` · ${job.eta}` : ''}`}
        </span>
      </div>
      {failed && job.error && <p className="mt-1 text-xs text-destructive">{job.error}</p>}
      {!failed && job.speed && running && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{job.speed}</p>
      )}
    </div>
  )
}
