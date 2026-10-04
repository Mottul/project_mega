// YouTube-Downloader (yt-dlp). Die Binary liegt in userData/bin und wird beim
// App-Start automatisch geprüft und bei Bedarf ersetzt (geprüfte Prüfsumme, im
// main-Prozess); der Knopf stößt dieselbe Prüfung von Hand an. Jede Adresse wird
// vor dem Laden analysiert: ein Video geht direkt in die Queue, eine Playlist zeigt
// ihre Einträge zur Auswahl (je Eintrag ein Download). Muxing über das gebündelte ffmpeg.

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
import { toast } from '@renderer/lib/toast'
import { migrateLocalStorage, updateSettings, useSettings } from '@renderer/lib/settings'
import { errorText } from '@renderer/lib/utils'
import {
  DEFAULT_YOUTUBE_SETTINGS,
  type YoutubeSettings,
  type YtEnqueueRequest,
  type YtFormatId,
  type YtJob,
  type YtToolStatus
} from '@shared/types'
import { selectClass } from '../_calc/ui'
import { toolPageClass } from '@renderer/lib/toolPage'
import { PlaylistPicker } from './PlaylistPicker'
import { initialSelection, playlistRequests, urlProblem, type YtPlaylist } from './playlist'

/** Frühere Versionen merkten sich die Vorgaben (samt Zielordner) nur im localStorage. */
function legacySettings(old: Record<string, unknown>): Partial<YoutubeSettings> {
  const out: Partial<YoutubeSettings> = {}
  if (typeof old.outputDir === 'string') out.outputDir = old.outputDir
  if (old.format === 'video' || old.format === 'audio-mp3' || old.format === 'audio-m4a') {
    out.format = old.format
  }
  if (old.maxHeight === null || (typeof old.maxHeight === 'number' && old.maxHeight > 0)) {
    out.maxHeight = old.maxHeight
  }
  if (typeof old.playlistFolder === 'boolean') out.playlistFolder = old.playlistFolder
  if (typeof old.playlistNumbers === 'boolean') out.playlistNumbers = old.playlistNumbers
  return out
}

export function YoutubeDownloader(): JSX.Element {
  const [status, setStatus] = useState<YtToolStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  // Vorgaben + Zielordner liegen in settings.json (bleiben über Fenster hinweg aktuell)
  const cfg = useSettings((s) => s.youtube) ?? DEFAULT_YOUTUBE_SETTINGS
  const setCfg = (patch: Partial<YoutubeSettings>): void => updateSettings({ youtube: patch })
  const autoUpdate = useSettings((s) => s.ytdlpAutoUpdate) ?? true
  const [jobs, setJobs] = useState<YtJob[]>([])
  const jobMap = useRef<Map<string, YtJob>>(new Map())
  // Adress-Analyse: läuft / Fehler / erkannte Playlist samt Auswahl
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [playlist, setPlaylist] = useState<YtPlaylist | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Zähler gegen veraltete Antworten (neue Analyse oder Abbruch während eine läuft)
  const probeSeq = useRef(0)

  useEffect(() => {
    void api.youtube.status().then(setStatus)
    void api.youtube.list().then((list) => {
      jobMap.current = new Map(list.map((j) => [j.id, j]))
      setJobs([...jobMap.current.values()])
    })
    const offJobs = api.youtube.onJobUpdate((job) => {
      jobMap.current.set(job.id, job)
      setJobs([...jobMap.current.values()].sort((a, b) => b.createdAt - a.createdAt))
    })
    migrateLocalStorage('youtube-dl-settings', (old) => ({ youtube: legacySettings(old) }))
    // Die Startprüfung läuft im main-Prozess und kann jederzeit fertig werden.
    const offStatus = api.youtube.onStatusUpdate(setStatus)
    return () => {
      offJobs()
      offStatus()
    }
  }, [])

  async function pickDir(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Zielordner wählen', directories: true })
    if (paths[0]) setCfg({ outputDir: paths[0] })
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

  const base = (): Pick<YtEnqueueRequest, 'format' | 'maxHeight' | 'outputDir'> => ({
    format: cfg.format,
    maxHeight: cfg.format === 'video' ? cfg.maxHeight : null,
    outputDir: cfg.outputDir
  })

  /** Nacheinander einreihen: so laufen Playlist-Einträge in ihrer Reihenfolge. */
  async function enqueueAll(reqs: YtEnqueueRequest[]): Promise<void> {
    let failed: unknown = null
    for (const r of reqs) {
      try {
        await api.youtube.enqueue(r)
      } catch (err) {
        failed ??= err
      }
    }
    if (failed) toast.error('Download nicht gestartet', errorText(failed))
  }

  /** Adresse analysieren: Video -> sofort laden, Playlist -> Auswahl zeigen. */
  async function submit(target = url): Promise<void> {
    const u = target.trim()
    const problem = urlProblem(u)
    if (!u || problem) {
      setProbeError(problem)
      return
    }
    if (!ready) return
    const seq = ++probeSeq.current
    setProbing(true)
    setProbeError(null)
    try {
      const res = await api.youtube.probe(u)
      if (seq !== probeSeq.current) return
      if (res.kind === 'video') {
        setPlaylist(null)
        await enqueueAll([{ ...base(), url: res.url, ...(res.title ? { title: res.title } : {}) }])
      } else {
        setPlaylist(res)
        setSelected(initialSelection(res))
      }
      setUrl('')
    } catch (err) {
      if (seq === probeSeq.current) setProbeError(errorText(err))
    } finally {
      if (seq === probeSeq.current) setProbing(false)
    }
  }

  function cancelProbe(): void {
    probeSeq.current++ // laufende Antwort verwerfen
    setProbing(false)
  }

  function downloadSelection(selection: Set<number>): void {
    if (!playlist) return
    const reqs = playlistRequests(playlist, selection, base(), {
      folder: cfg.playlistFolder,
      numbers: cfg.playlistNumbers
    })
    if (!reqs.length) return
    void enqueueAll(reqs)
    toast.success(
      reqs.length === 1 ? '1 Download eingereiht' : `${reqs.length} Downloads eingereiht`,
      playlist.title
    )
    setPlaylist(null)
  }

  const busy = updating || !!status?.checking
  const problem = updateError ?? status?.lastError ?? null
  const ready = status?.available && !!cfg.outputDir
  const pending = jobs.filter((j) => j.status === 'running' || j.status === 'queued')
  const active = pending.length > 0

  return (
    <div className={toolPageClass('full')}>
      {/* yt-dlp-Status */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        {status == null || busy ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {status?.available ? 'Prüfe auf neue Version…' : 'Lade yt-dlp…'}
          </span>
        ) : status.available ? (
          <span className="flex items-center gap-2 text-sm">
            {status.upToDate === false ? (
              <AlertTriangle className="size-4 text-amber-400 light:text-amber-700" />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-400 light:text-emerald-700" />
            )}
            yt-dlp <span className="font-mono text-xs text-muted-foreground">{status.version}</span>
            <span className="text-xs text-muted-foreground">
              ({status.location === 'managed' ? 'verwaltet' : 'System-PATH'})
            </span>
            {status.upToDate === true && (
              <span className="text-xs text-emerald-400 light:text-emerald-700">aktuell</span>
            )}
            {status.upToDate === false && (
              <span className="text-xs text-amber-400 light:text-amber-700">
                neuer verfügbar: {status.latest}
                {status.location === 'path' && ' (vom System verwaltet)'}
              </span>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-amber-400 light:text-amber-700" /> yt-dlp nicht
            gefunden
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant={status?.available ? 'outline' : 'default'}
          size="sm"
          disabled={busy}
          onClick={() => void updateTool()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {status?.available ? 'Prüfen' : 'yt-dlp herunterladen'}
        </Button>
      </Card>

      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="accent-primary"
          checked={autoUpdate}
          onChange={(e) => {
            const on = e.target.checked
            updateSettings({ ytdlpAutoUpdate: on })
          }}
        />
        Beim Programmstart automatisch auf eine neue yt-dlp-Version prüfen
      </label>

      {problem && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Aktualisierung fehlgeschlagen: {problem} – Internetverbindung prüfen.
          {status?.available && ' Der vorhandene Stand bleibt nutzbar.'}
        </p>
      )}
      {status && !status.ffmpeg && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 light:text-amber-700">
          ffmpeg nicht gefunden – Zusammenführen von Bild/Ton kann fehlschlagen.
        </p>
      )}

      {/* Eingabe */}
      <Card className="space-y-3 p-4">
        <div className="flex gap-2">
          <Input
            value={url}
            placeholder="Adresse eines Videos oder einer Playlist einfügen…"
            onChange={(e) => {
              setUrl(e.target.value)
              setProbeError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && !probing) void submit()
            }}
          />
          {probing ? (
            <Button variant="outline" onClick={cancelProbe} title="Analyse abbrechen">
              <Loader2 className="size-4 animate-spin" /> Prüfe…
            </Button>
          ) : (
            <Button disabled={!ready || !url.trim()} onClick={() => void submit()}>
              <Download className="size-4" /> Laden
            </Button>
          )}
        </div>
        {probeError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {probeError}
          </p>
        )}
        {!cfg.outputDir && status?.available && (
          <p className="text-xs text-muted-foreground">Zuerst einen Zielordner wählen.</p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Format</span>
            <select
              className={`${selectClass} w-auto`}
              value={cfg.format}
              onChange={(e) => setCfg({ format: e.target.value as YtFormatId })}
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
                  setCfg({ maxHeight: e.target.value === 'best' ? null : Number(e.target.value) })
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
          Playlists werden erkannt – dann lassen sich die gewünschten Einträge auswählen. Nur
          Inhalte herunterladen, für die du die Rechte/Erlaubnis hast (YouTube-Nutzungsbedingungen
          beachten). yt-dlp regelmäßig aktualisieren, wenn Downloads scheitern.
        </p>
      </Card>

      {playlist && (
        <PlaylistPicker
          playlist={playlist}
          selected={selected}
          onSelected={setSelected}
          options={{ folder: cfg.playlistFolder, numbers: cfg.playlistNumbers }}
          onOptions={(o) =>
            setCfg({
              ...(o.folder !== undefined ? { playlistFolder: o.folder } : {}),
              ...(o.numbers !== undefined ? { playlistNumbers: o.numbers } : {})
            })
          }
          ready={!!ready}
          onDownload={downloadSelection}
          onDownloadVideo={() => {
            if (!playlist.videoUrl) return
            void enqueueAll([{ ...base(), url: playlist.videoUrl }])
            setPlaylist(null)
          }}
          onClose={() => setPlaylist(null)}
          onOpenNested={(nested) => void submit(nested)}
        />
      )}

      {/* Jobs */}
      {jobs.length > 0 && (
        <Card className="divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              Downloads
            </h2>
            <div className="flex gap-1">
              {pending.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => pending.forEach((j) => void api.youtube.cancel(j.id))}
                >
                  Alle abbrechen
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={active}
                onClick={() => void api.youtube.clearFinished()}
              >
                Erledigte entfernen
              </Button>
            </div>
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
