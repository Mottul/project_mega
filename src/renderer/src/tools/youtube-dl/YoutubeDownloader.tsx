// YouTube-Downloader (yt-dlp), im Werkzeug-Muster:
//   Leiste „Download“   Adresse + Laden – bernstein, solange Downloads laufen oder warten
//   Schublade           Format (Video/Audio, Auflösung), Zielordner, Anmeldung (Cookies)
//   Arbeitsfläche       Hinweise, Playlist-Auswahl, Downloads
// yt-dlp selbst (Version, Prüfung, Aktualisierung) steht im App-Menü wie ffmpeg
// (components/app/YtdlpSettings); hier nur ein Hinweis, wenn es fehlt. Jede Adresse wird vor
// dem Laden analysiert: ein Video geht direkt in die Queue, eine Playlist zeigt ihre Einträge
// zur Auswahl (je Eintrag ein Download). Muxing über das gebündelte ffmpeg.

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Download,
  FileVideo,
  FolderOpen,
  KeyRound,
  ListPlus,
  Loader2,
  X
} from 'lucide-react'
import { PanelSection, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { useYtdlp, YtdlpUpdateButton } from '@renderer/components/app/YtdlpSettings'
import { Alert } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Field } from '@renderer/components/ui/field'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Input } from '@renderer/components/ui/input'
import { Progress } from '@renderer/components/ui/progress'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { migrateLocalStorage, updateSettings, useSettings } from '@renderer/lib/settings'
import { toolPageClass } from '@renderer/lib/toolPage'
import { errorText } from '@renderer/lib/utils'
import { inDenPlayer } from '@renderer/lib/inDenPlayer'
import {
  DEFAULT_YOUTUBE_SETTINGS,
  type YoutubeSettings,
  type YtCookieSource,
  type YtEnqueueRequest,
  type YtFormatId,
  type YtJob
} from '@shared/types'
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

const FORMAT_LABEL: Record<YtFormatId, string> = {
  video: 'Video (MP4)',
  'audio-mp3': 'Nur Audio (MP3)',
  'audio-m4a': 'Nur Audio (M4A)'
}
/** Woher yt-dlp die Cookies nimmt; Safari gibt es nur auf dem Mac */
const COOKIE_SOURCES: { value: YtCookieSource; label: string; mac?: boolean }[] = [
  { value: 'none', label: 'Keine (ohne Anmeldung)' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'edge', label: 'Edge' },
  { value: 'brave', label: 'Brave' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' },
  { value: 'chromium', label: 'Chromium' },
  { value: 'safari', label: 'Safari', mac: true },
  { value: 'file', label: 'cookies.txt-Datei' }
]
const IS_MAC = /Mac/i.test(navigator.userAgent)

const HEIGHTS: { value: string; label: string }[] = [
  { value: 'best', label: 'Beste' },
  { value: '2160', label: '2160p (4K)' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' }
]

/** Nur der letzte Ordnername – die Zusammenfassung ist schmal */
const folderName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export function YoutubeDownloader(): JSX.Element {
  const yt = useYtdlp()
  const [url, setUrl] = useState('')
  // Vorgaben + Zielordner liegen in settings.json (bleiben über Fenster hinweg aktuell)
  const cfg = useSettings((s) => s.youtube) ?? DEFAULT_YOUTUBE_SETTINGS
  const setCfg = (patch: Partial<YoutubeSettings>): void => updateSettings({ youtube: patch })
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
    void api.youtube.list().then((list) => {
      jobMap.current = new Map(list.map((j) => [j.id, j]))
      setJobs([...jobMap.current.values()])
    })
    const offJobs = api.youtube.onJobUpdate((job) => {
      jobMap.current.set(job.id, job)
      setJobs([...jobMap.current.values()].sort((a, b) => b.createdAt - a.createdAt))
    })
    migrateLocalStorage('youtube-dl-settings', (old) => ({ youtube: legacySettings(old) }))
    return offJobs
  }, [])

  async function pickCookies(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'cookies.txt wählen',
      filters: [{ name: 'Cookies (Netscape-Format)', extensions: ['txt'] }]
    })
    if (paths[0]) setCfg({ cookiesFile: paths[0] })
  }

  async function pickDir(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Zielordner wählen', directories: true })
    if (paths[0]) setCfg({ outputDir: paths[0] })
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

  const status = yt.status
  const ready = status?.available && !!cfg.outputDir
  const running = jobs.filter((j) => j.status === 'running')
  const queued = jobs.filter((j) => j.status === 'queued')
  const pending = [...running, ...queued]
  const active = pending.length > 0
  const height = HEIGHTS.find((h) => h.value === String(cfg.maxHeight ?? 'best'))?.label

  return (
    <ToolShell
      id="youtube-dl"
      bar={
        <ToolBar
          label="Download"
          kind="job"
          active={active}
          status={
            active ? (
              <span>
                {running.length} läuft{running.length === 1 ? '' : 'en'}
                {queued.length > 0 && ` · ${queued.length} wartet`}
              </span>
            ) : null
          }
        >
          <Input
            value={url}
            aria-label="Adresse eines Videos oder einer Playlist"
            placeholder="Adresse eines Videos oder einer Playlist einfügen…"
            onChange={(e) => {
              setUrl(e.target.value)
              setProbeError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && !probing) void submit()
            }}
            className="h-8 w-[30rem] min-w-0 max-w-full flex-1"
          />
          {probing ? (
            <Button size="sm" variant="outline" onClick={cancelProbe} title="Analyse abbrechen">
              <Loader2 className="size-4 animate-spin" /> Prüfe…
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!ready || !url.trim()}
              title={!cfg.outputDir ? 'Zuerst einen Zielordner wählen' : undefined}
              onClick={() => void submit()}
            >
              <Download className="size-4" /> Laden
            </Button>
          )}
          <InfoTip
            label="Erklärung zum Laden"
            text="Ein Video wird sofort geladen. Bei einer Playlist erscheinen ihre Einträge zur Auswahl – je Eintrag ein Download. Format und Zielordner stehen in den Einstellungen."
          />
        </ToolBar>
      }
      aside={
        <>
          <PanelSection
            id="format"
            title="Format"
            icon={FileVideo}
            summary={
              cfg.format === 'video'
                ? `${FORMAT_LABEL.video} · ${height}`
                : FORMAT_LABEL[cfg.format]
            }
          >
            <Field label="Format">
              <Select
                className="w-full"
                value={cfg.format}
                onChange={(e) => setCfg({ format: e.target.value as YtFormatId })}
              >
                {(Object.keys(FORMAT_LABEL) as YtFormatId[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABEL[f]}
                  </option>
                ))}
              </Select>
            </Field>
            {cfg.format === 'video' && (
              <Field
                label="Max. Auflösung"
                hint="Höchstens diese Höhe; ist das Video kleiner, kommt es in seiner Größe."
              >
                <Select
                  className="w-full"
                  value={cfg.maxHeight ?? 'best'}
                  onChange={(e) =>
                    setCfg({
                      maxHeight: e.target.value === 'best' ? null : Number(e.target.value)
                    })
                  }
                >
                  {HEIGHTS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </PanelSection>
          <PanelSection
            id="target"
            title="Zielordner"
            icon={FolderOpen}
            summary={cfg.outputDir ? folderName(cfg.outputDir) : 'noch keiner gewählt'}
          >
            {cfg.outputDir && (
              <p className="break-all text-xs text-muted-foreground">{cfg.outputDir}</p>
            )}
            <Button variant="outline" size="sm" onClick={() => void pickDir()}>
              <FolderOpen className="size-4" />{' '}
              {cfg.outputDir ? 'Anderen wählen…' : 'Ordner wählen…'}
            </Button>
          </PanelSection>
          <PanelSection
            id="auth"
            title="Anmeldung"
            icon={KeyRound}
            defaultOpen={false}
            summary={
              cfg.cookies === 'none'
                ? 'ohne'
                : cfg.cookies === 'file'
                  ? cfg.cookiesFile
                    ? `Datei ${folderName(cfg.cookiesFile)}`
                    : 'cookies.txt – keine gewählt'
                  : `Cookies aus ${COOKIE_SOURCES.find((c) => c.value === cfg.cookies)?.label}`
            }
          >
            <Field
              label="Cookies aus"
              hint="Für altersbeschränkte oder nur angemeldet sichtbare Videos: yt-dlp nimmt die Anmeldung des Browsers (dort bei YouTube angemeldet sein). Die Cookies liest yt-dlp bei jedem Abruf selbst – die Mottulbox speichert sie nicht. Unter Windows sperren Chrome und Edge ihre Cookies für andere Programme: dort Firefox wählen oder eine cookies.txt nutzen. Den Browser beim Laden am besten schließen."
            >
              <Select
                className="w-full"
                value={cfg.cookies}
                onChange={(e) => setCfg({ cookies: e.target.value as YtCookieSource })}
              >
                {COOKIE_SOURCES.filter((c) => !c.mac || IS_MAC || cfg.cookies === c.value).map(
                  (c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  )
                )}
              </Select>
            </Field>
            {cfg.cookies === 'file' && (
              <Field
                label="cookies.txt"
                hint="Im Netscape-Format, z. B. mit einer Browser-Erweiterung wie „Get cookies.txt LOCALLY“ exportiert. yt-dlp hält die Datei beim Laden aktuell."
              >
                <div className="flex flex-col items-start gap-1.5">
                  {cfg.cookiesFile && (
                    <p className="break-all text-xs text-muted-foreground">{cfg.cookiesFile}</p>
                  )}
                  <Button variant="outline" size="sm" onClick={() => void pickCookies()}>
                    <KeyRound className="size-4" />{' '}
                    {cfg.cookiesFile ? 'Andere wählen…' : 'Datei wählen…'}
                  </Button>
                </div>
              </Field>
            )}
          </PanelSection>
        </>
      }
      main={
        <div className={toolPageClass('4xl')}>
          {status && !status.available && (
            <Alert
              tone="warning"
              icon={AlertTriangle}
              title={yt.busy ? 'yt-dlp wird geladen…' : 'yt-dlp fehlt'}
            >
              <p>
                Der Downloader braucht yt-dlp. Die App holt es und prüft es gegen seine Prüfsumme.
              </p>
              <div className="mt-2">
                <YtdlpUpdateButton yt={yt} />
              </div>
            </Alert>
          )}
          {yt.problem && (
            <Alert tone="danger">
              Aktualisierung von yt-dlp fehlgeschlagen: {yt.problem} – Internetverbindung prüfen.
              {status?.available && ' Der vorhandene Stand bleibt nutzbar.'}
            </Alert>
          )}
          {status && !status.ffmpeg && (
            <Alert tone="warning">
              ffmpeg nicht gefunden – Zusammenführen von Bild und Ton kann fehlschlagen.
            </Alert>
          )}
          {status?.available && !cfg.outputDir && (
            <Alert tone="warning" icon={FolderOpen} title="Zuerst einen Zielordner wählen">
              <Button variant="outline" size="sm" className="mt-1" onClick={() => void pickDir()}>
                <FolderOpen className="size-4" /> Ordner wählen…
              </Button>
            </Alert>
          )}
          {probeError && <Alert tone="danger">{probeError}</Alert>}

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

          {jobs.length > 0 ? (
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
          ) : (
            !playlist && (
              <Card className="flex h-32 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Noch keine Downloads – oben eine Adresse einfügen und „Laden“.
              </Card>
            )
          )}

          <p className="text-xs text-muted-foreground">
            Nur Inhalte herunterladen, für die du die Rechte bzw. eine Erlaubnis hast
            (YouTube-Nutzungsbedingungen beachten).
          </p>
        </div>
      }
    />
  )
}

function JobRow({ job }: { job: YtJob }): JSX.Element {
  const done = job.status === 'done'
  const failed = job.status === 'error'
  const canceled = job.status === 'canceled'
  const running = job.status === 'running' || job.status === 'queued'
  return (
    <div className="space-y-1.5 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm" title={job.title ?? job.url}>
          {job.title ?? job.url}
        </span>
        {done && !job.alreadyThere && <Badge tone="success">Fertig</Badge>}
        {done && job.alreadyThere && <Badge tone="neutral">Schon vorhanden</Badge>}
        {failed && <Badge tone="danger">Fehler</Badge>}
        {canceled && <Badge tone="neutral">Abgebrochen</Badge>}
        {job.status === 'queued' && <Badge tone="neutral">Wartet</Badge>}
        {job.status === 'running' && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(job.progress * 100)} %{job.eta ? ` · ${job.eta}` : ''}
          </span>
        )}
        {running && (
          <button
            type="button"
            onClick={() => void api.youtube.cancel(job.id)}
            className="text-muted-foreground hover:text-danger"
            title="Abbrechen"
            aria-label="Abbrechen"
          >
            <X className="size-4" />
          </button>
        )}
        {done && job.outputFile && job.format === 'video' && (
          <button
            type="button"
            onClick={() => void inDenPlayer(job.outputFile!)}
            className="text-muted-foreground hover:text-foreground"
            title="In Player-Bibliothek übernehmen"
            aria-label="In Player-Bibliothek übernehmen"
          >
            <ListPlus className="size-4" />
          </button>
        )}
        {done && job.outputFile && (
          <button
            type="button"
            onClick={() => void api.showItemInFolder(job.outputFile!)}
            className="text-muted-foreground hover:text-foreground"
            title="Im Ordner zeigen"
            aria-label="Im Ordner zeigen"
          >
            <FolderOpen className="size-4" />
          </button>
        )}
      </div>
      {job.status === 'running' && <Progress value={job.progress} />}
      {failed && job.error && <p className="text-xs text-danger">{job.error}</p>}
      {!failed && job.speed && job.status === 'running' && (
        <p className="text-[11px] text-muted-foreground">{job.speed}</p>
      )}
    </div>
  )
}
