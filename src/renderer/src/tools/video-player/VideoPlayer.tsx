import { useEffect, useMemo, useState, type DragEvent, type HTMLAttributes } from 'react'
import {
  AlertTriangle,
  Clock,
  Eraser,
  Film,
  FolderInput,
  FolderOpen,
  FolderSearch,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListPlus,
  MonitorPlay,
  MonitorX,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { NumberField } from '@renderer/components/ui/number-field'
import { Progress } from '@renderer/components/ui/progress'
import { api } from '@renderer/lib/api'
import { EMPTY_PLAYER_STATE } from '@shared/player'
import type {
  ConvertJob,
  DisplayInfo,
  FitMode,
  LoopMode,
  MediaItem,
  PlayerEncoderStatus,
  PlayerState,
  TransitionMode
} from '@shared/types'
import { PlaybackEngine } from './PlaybackEngine'

const selectClass =
  'h-9 rounded-md border border-border bg-input/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'gif']
const VIDEO_EXTENSIONS = [
  'mov', 'mp4', 'mxf', 'avi', 'mkv', 'm4v', 'mpg', 'mpeg', 'wmv', 'mts', 'm2ts', 'ts', 'webm'
]

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'blur', label: 'Blur-Fill (unscharfer Hintergrund)' },
  { value: 'bars', label: 'Schwarze Ränder (Letter-/Pillarbox)' },
  { value: 'stretch', label: 'Strecken (auf Wand-Auflösung ziehen)' }
]

const RES_PRESETS = [
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '2560 × 1440', w: 2560, h: 1440 },
  { label: '3840 × 2160', w: 3840, h: 2160 }
]

type ViewMode = 'large' | 'small' | 'list'

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`
  return `${n} B`
}

function kindIcon(kind: MediaItem['kind']): JSX.Element {
  return kind === 'image' ? <ImageIcon className="size-3.5" /> : <Film className="size-3.5" />
}

export function VideoPlayer(): JSX.Element {
  const [enc, setEnc] = useState<PlayerEncoderStatus | null>(null)
  const [library, setLibrary] = useState<MediaItem[]>([])
  const [jobs, setJobs] = useState<Record<string, ConvertJob>>({})
  const [pstate, setPstate] = useState<PlayerState>(EMPTY_PLAYER_STATE)
  const [tick, setTick] = useState<{ positionSec: number; durationSec: number } | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

  const [wallW, setWallW] = useState(1920)
  const [wallH, setWallH] = useState(1080)
  const [fit, setFit] = useState<FitMode>('blur')
  const [encoder, setEncoder] = useState('auto')
  const [displayId, setDisplayId] = useState<number | null>(null)

  const [scrub, setScrub] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [view, setView] = useState<ViewMode>('large')

  function loadLibrary(): void {
    void api.player.libraryList().then(setLibrary)
  }

  useEffect(() => {
    void api.player.encoders().then(setEnc)
    loadLibrary()
    void api.player.convertList().then((list) => setJobs(Object.fromEntries(list.map((j) => [j.id, j]))))
    void api.player.getState().then(setPstate)
    void api.screen.list().then((list) => {
      setDisplays(list)
      setDisplayId((cur) => cur ?? (list.find((d) => !d.primary) ?? list[0])?.id ?? null)
    })
    void api.getSettings().then((s) => {
      setWallW(s.player.wallWidth)
      setWallH(s.player.wallHeight)
      setFit(s.player.defaultFit)
      setEncoder(s.player.encoder)
      if (s.player.outputDisplayId != null) setDisplayId(s.player.outputDisplayId)
    })

    const offJob = api.player.onConvertUpdate((job) => {
      setJobs((prev) => ({ ...prev, [job.id]: job }))
      if (job.status === 'done') loadLibrary()
    })
    const offLib = api.player.onLibraryChanged(() => loadLibrary())
    const offState = api.player.onState(setPstate)
    const offTick = api.player.onTick((t) => setTick(t))
    return () => {
      offJob()
      offLib()
      offState()
      offTick()
    }
  }, [])

  const jobList = useMemo(() => Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt), [jobs])
  const activeJobs = jobList.filter(
    (j) => j.status !== 'done' && j.status !== 'error' && j.status !== 'canceled'
  )
  const finishedJobs = jobList.filter((j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled')

  const current = pstate.index >= 0 ? pstate.playlist[pstate.index] : null
  const duration = tick?.durationSec || pstate.durationSec || current?.durationSec || 0
  const position = scrub ?? tick?.positionSec ?? pstate.positionSec
  const seekable = current != null && current.kind !== 'image' && duration > 0

  const cmd = api.player.command

  async function persistPlayer(
    patch: Partial<{ wallWidth: number; wallHeight: number; defaultFit: FitMode; encoder: string }>
  ): Promise<void> {
    const s = await api.getSettings()
    await api.setSettings({ player: { ...s.player, ...patch } })
  }

  function setWall(w: number, h: number): void {
    const ww = Math.max(2, w)
    const hh = Math.max(2, h)
    setWallW(ww)
    setWallH(hh)
    void persistPlayer({ wallWidth: ww, wallHeight: hh })
  }

  function fromMonitor(): void {
    const d = displays.find((x) => x.id === displayId)
    if (d) setWall(Math.round(d.width * d.scaleFactor), Math.round(d.height * d.scaleFactor))
  }

  function importSources(sources: string[]): void {
    if (sources.length) void api.player.import({ sources, fitMode: fit, wall: { width: wallW, height: wallH } })
  }

  async function importFiles(): Promise<void> {
    const sources = await api.selectPaths({
      title: 'Medien auswählen',
      multi: true,
      filters: [{ name: 'Medien', extensions: [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS] }]
    })
    importSources(sources)
  }

  async function importFolder(): Promise<void> {
    const sources = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    importSources(sources)
  }

  function onDropFiles(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const sources = Array.from(e.dataTransfer.files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    importSources(sources)
  }

  async function openMediaDir(): Promise<void> {
    const dir = await api.player.mediaDir()
    await api.openPath(dir)
  }

  function toggleLoop(): void {
    const order: LoopMode[] = ['all', 'one', 'none']
    const next = order[(order.indexOf(pstate.loop) + 1) % order.length]
    void cmd({ type: 'setLoop', loop: next })
  }

  // Drop auf die Playlist: aus der Bibliothek (x-media-id) hinzufügen ODER innerhalb
  // der Liste umsortieren (x-reorder). Position = Ziel-Index (Ende, wenn -1).
  function onPlaylistDrop(e: DragEvent, to: number): void {
    e.preventDefault()
    const mediaId = e.dataTransfer.getData('text/x-media-id')
    const reorder = e.dataTransfer.getData('text/x-reorder')
    const at = to < 0 ? pstate.playlist.length : to
    if (mediaId) void cmd({ type: 'add', mediaIds: [mediaId], at })
    else if (reorder !== '') {
      const from = Number(reorder)
      if (Number.isFinite(from) && from !== to && to >= 0) void cmd({ type: 'move', from, to })
    }
  }

  async function openOutput(): Promise<void> {
    if (displayId == null) return
    await api.player.openOutput(displayId)
  }

  const ffmpegMissing = enc && !enc.ffmpegFound
  const loopIcon = pstate.loop === 'one' ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />

  const viewButtons: { id: ViewMode; icon: JSX.Element; title: string }[] = [
    { id: 'large', icon: <LayoutGrid className="size-4" />, title: 'Große Kacheln' },
    { id: 'small', icon: <Grid3x3 className="size-4" />, title: 'Kleine Kacheln' },
    { id: 'list', icon: <List className="size-4" />, title: 'Liste' }
  ]

  function libraryItemDnd(m: MediaItem): HTMLAttributes<HTMLElement> {
    return {
      draggable: true,
      onDragStart: (e) => e.dataTransfer.setData('text/x-media-id', m.id),
      onDoubleClick: () => void cmd({ type: 'add', mediaIds: [m.id] })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {ffmpegMissing && (
        <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
          <div className="text-sm">
            <p className="font-medium text-amber-300">ffmpeg nicht gefunden</p>
            <p className="mt-1 text-muted-foreground">
              Zum Konvertieren der Medien wird das gebündelte ffmpeg benötigt. Im Dev-Modus über
              <code className="mx-1 rounded bg-muted px-1">npm run ff:fetch</code> bereitstellen; im
              fertigen Paket ist es enthalten.
              {enc?.error ? ` (${enc.error})` : ''}
            </p>
          </div>
        </Card>
      )}

      {/* Aufbereitung & Ausgabe */}
      <Card className="space-y-4 p-5">
        <h2 className="font-medium">Aufbereitung & Ausgabe</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Wand-Auflösung</span>
            <div className="flex items-center gap-2">
              <NumberField value={wallW} min={2} max={16384} onCommit={(v) => setWall(v, wallH)} />
              <span className="text-muted-foreground">×</span>
              <NumberField value={wallH} min={2} max={16384} onCommit={(v) => setWall(wallW, v)} />
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {RES_PRESETS.map((r) => (
                <Button key={r.label} variant="outline" size="sm" onClick={() => setWall(r.w, r.h)}>
                  {r.label}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={fromMonitor} disabled={displayId == null}>
                von Monitor
              </Button>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Fit-Modus (Einbacken)</span>
            <select
              className={selectClass}
              value={fit}
              onChange={(e) => {
                const v = e.target.value as FitMode
                setFit(v)
                void persistPlayer({ defaultFit: v })
              }}
            >
              {FIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">Gilt für neu importierte Medien.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Encoder</span>
            <select
              className={selectClass}
              value={encoder}
              onChange={(e) => {
                setEncoder(e.target.value)
                void persistPlayer({ encoder: e.target.value })
              }}
            >
              <option value="auto">
                Automatisch{enc ? ` (${enc.available.find((a) => a.id === enc.recommended)?.label ?? enc.recommended})` : ''}
              </option>
              {enc?.available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">Konvertierung nach H.264/MP4 (GPU, falls verfügbar).</span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Ausgabe-Monitor</span>
            <select
              className={selectClass}
              value={displayId ?? ''}
              onChange={(e) => setDisplayId(Number(e.target.value))}
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <div className="mt-1 flex gap-2">
              <Button size="sm" onClick={() => void openOutput()} disabled={displayId == null}>
                <MonitorPlay className="size-4" /> {pstate.outputOpen ? 'Auf Monitor' : 'Vollbild'}
              </Button>
              {pstate.outputOpen && (
                <Button size="sm" variant="outline" onClick={() => void api.player.closeOutput()}>
                  <MonitorX className="size-4" /> Schließen
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bibliothek */}
        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-medium">Bibliothek</h2>
            <div className="flex items-center gap-1">
              <div className="mr-1 flex rounded-md border border-border">
                {viewButtons.map((b) => (
                  <button
                    key={b.id}
                    title={b.title}
                    onClick={() => setView(b.id)}
                    className={`p-1.5 ${view === b.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {b.icon}
                  </button>
                ))}
              </div>
              <Button variant="secondary" size="sm" onClick={() => void importFiles()}>
                <FolderSearch className="size-4" /> Dateien
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void importFolder()}>
                <FolderOpen className="size-4" /> Ordner
              </Button>
            </div>
          </div>

          {/* Konvertierungs-Queue */}
          {(activeJobs.length > 0 || finishedJobs.length > 0) && (
            <div className="mb-3 space-y-1.5 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Konvertierung · {activeJobs.length} aktiv</span>
                {finishedJobs.length > 0 && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      void api.player.convertClearFinished().then(() =>
                        api.player.convertList().then((l) => setJobs(Object.fromEntries(l.map((j) => [j.id, j]))))
                      )
                    }
                  >
                    Erledigte entfernen
                  </button>
                )}
              </div>
              {activeJobs.map((j) => (
                <div key={j.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate" title={j.sourcePath}>
                      {j.title}
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {j.status === 'converting' ? `${Math.round(j.progress * 100)}%` : j.status}
                      <button
                        className="hover:text-foreground"
                        onClick={() => void api.player.convertCancel(j.id)}
                        aria-label="Abbrechen"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  </div>
                  <Progress
                    value={j.progress}
                    indeterminate={j.status === 'probing' || j.status === 'thumbnail'}
                    className="mt-1"
                  />
                </div>
              ))}
              {finishedJobs.filter((j) => j.status === 'error').map((j) => (
                <p key={j.id} className="truncate text-xs text-red-400" title={j.error}>
                  {j.title}: {j.error}
                </p>
              ))}
            </div>
          )}

          {/* Drop-Zone + Bibliotheksinhalt */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!dragOver) setDragOver(true)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false)
            }}
            onDrop={onDropFiles}
            className={`min-h-[120px] rounded-md border-2 border-dashed p-2 transition-colors ${
              dragOver ? 'border-primary bg-primary/10' : 'border-border/60'
            }`}
          >
            {library.length === 0 ? (
              <p className="flex h-[120px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
                <FolderInput className="size-5" />
                Medien hierher ziehen oder über „Dateien"/„Ordner" importieren.
                <span className="text-xs">Konvertierung auf {wallW}×{wallH}.</span>
              </p>
            ) : view === 'list' ? (
              <div className="max-h-[460px] space-y-1 overflow-auto pr-1">
                {library.map((m) => (
                  <div
                    key={m.id}
                    {...libraryItemDnd(m)}
                    className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1 hover:bg-muted/40"
                  >
                    <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                      {m.thumbUrl ? <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm" title={m.title}>
                        {m.title}
                      </p>
                      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        {kindIcon(m.kind)} {m.width}×{m.height}
                        {m.durationSec ? ` · ${fmtTime(m.durationSec)}` : ''} · {fmtBytes(m.sizeBytes)}
                      </p>
                    </div>
                    <button
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                      onClick={() => void cmd({ type: 'add', mediaIds: [m.id] })}
                      title="Zur Playlist"
                    >
                      <Plus className="size-4" />
                    </button>
                    <button
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-red-400"
                      onClick={() => void api.player.libraryDelete(m.id)}
                      title="Löschen"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={`grid max-h-[460px] gap-2 overflow-auto pr-1 ${
                  view === 'small' ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3'
                }`}
              >
                {library.map((m) => (
                  <div
                    key={m.id}
                    {...libraryItemDnd(m)}
                    className="group relative cursor-grab overflow-hidden rounded-md border border-border bg-muted/30"
                  >
                    <div className="aspect-video w-full bg-black">
                      {m.thumbUrl ? (
                        <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          {kindIcon(m.kind)}
                        </div>
                      )}
                    </div>
                    {view === 'large' && (
                      <div className="p-1.5">
                        <p className="truncate text-xs font-medium" title={m.title}>
                          {m.title}
                        </p>
                        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          {kindIcon(m.kind)} {m.width}×{m.height}
                          {m.durationSec ? ` · ${fmtTime(m.durationSec)}` : ''}
                        </p>
                      </div>
                    )}
                    <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="rounded bg-black/70 p-1 text-white hover:bg-primary hover:text-primary-foreground"
                        onClick={() => void cmd({ type: 'add', mediaIds: [m.id] })}
                        title="Zur Playlist hinzufügen"
                      >
                        <Plus className="size-3.5" />
                      </button>
                      <button
                        className="rounded bg-black/70 p-1 text-white hover:bg-destructive"
                        onClick={() => void api.player.libraryDelete(m.id)}
                        title="Aus Bibliothek löschen"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {library.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void cmd({ type: 'add', mediaIds: library.map((m) => m.id) })}
              >
                <ListPlus className="size-4" /> Alle zur Playlist
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => void openMediaDir()} title="Speicherort der konvertierten Medien">
              <FolderOpen className="size-4" /> Ordner
            </Button>
            {library.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300"
                onClick={() => {
                  if (confirm('Gesamte Bibliothek löschen? Die konvertierten Dateien werden entfernt.'))
                    void api.player.libraryClear()
                }}
              >
                <Eraser className="size-4" /> Leeren
              </Button>
            )}
          </div>
        </Card>

        {/* Wiedergabe */}
        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Wiedergabe</h2>
            {pstate.playlist.length > 0 && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void cmd({ type: 'clear' })}
              >
                Playlist leeren
              </button>
            )}
          </div>

          {/* Vorschau / Monitorhinweis */}
          <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
            {pstate.outputOpen ? (
              <>
                {current?.thumbUrl ? (
                  <img src={current.thumbUrl} alt="" className="h-full w-full object-contain opacity-60" />
                ) : null}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Badge tone="info">Wiedergabe läuft auf dem Monitor</Badge>
                </div>
              </>
            ) : (
              <PlaybackEngine objectFit="contain" />
            )}
          </div>
          <div className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current?.title ?? 'Nichts ausgewählt'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {current
                  ? `${current.width}×${current.height} · ${current.fitMode}`
                  : 'Medien aus der Bibliothek hinzufügen (Doppelklick oder ziehen)'}
              </p>
            </div>
            {!pstate.outputOpen && <Badge tone="neutral">Vorschau</Badge>}
          </div>

          {/* Seek */}
          <div className="mb-2 flex items-center gap-2">
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmtTime(position)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={Math.min(position, duration || 1)}
              disabled={!seekable}
              onChange={(e) => setScrub(Number(e.target.value))}
              onMouseUp={() => {
                if (scrub != null) void cmd({ type: 'seek', positionSec: scrub })
                setScrub(null)
              }}
              onTouchEnd={() => {
                if (scrub != null) void cmd({ type: 'seek', positionSec: scrub })
                setScrub(null)
              }}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))] disabled:opacity-50"
            />
            <span className="w-10 text-xs tabular-nums text-muted-foreground">{fmtTime(duration)}</span>
          </div>

          {/* Transport */}
          <div className="mb-3 flex items-center justify-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => void cmd({ type: 'prev' })} aria-label="Zurück">
              <SkipBack className="size-5" />
            </Button>
            <Button
              size="icon"
              className="size-12 rounded-full"
              onClick={() => void cmd({ type: 'toggle' })}
              disabled={pstate.index < 0}
              aria-label={pstate.playing ? 'Pause' : 'Play'}
            >
              {pstate.playing ? <Pause className="size-6" /> : <Play className="size-6" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void cmd({ type: 'next' })} aria-label="Weiter">
              <SkipForward className="size-5" />
            </Button>
          </div>

          {/* Modi */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant={pstate.loop !== 'none' ? 'secondary' : 'ghost'} size="sm" onClick={toggleLoop} title={`Loop: ${pstate.loop}`}>
              {loopIcon}
              {pstate.loop === 'none' ? 'Kein Loop' : pstate.loop === 'one' ? 'Eines' : 'Alle'}
            </Button>
            <Button
              variant={pstate.shuffle ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => void cmd({ type: 'setShuffle', shuffle: !pstate.shuffle })}
            >
              <Shuffle className="size-4" /> Zufall
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void cmd({ type: 'setMuted', muted: !pstate.muted })}>
              {pstate.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              {pstate.muted ? 'Stumm' : 'Ton'}
            </Button>
            <select
              className={`${selectClass} h-8`}
              value={pstate.transition}
              onChange={(e) => void cmd({ type: 'setTransition', transition: e.target.value as TransitionMode })}
              title="Übergang zwischen Medien"
            >
              <option value="cut">Schnitt (Cut)</option>
              <option value="crossfade">Überblenden</option>
            </select>
            {pstate.transition === 'crossfade' && (
              <NumberField
                value={pstate.transitionMs}
                min={100}
                max={5000}
                className="w-20"
                aria-label="Überblenddauer (ms)"
                onCommit={(v) => void cmd({ type: 'setTransition', transition: 'crossfade', transitionMs: v })}
              />
            )}
          </div>

          <div className="mb-2 flex items-center justify-end">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> Bild-Standzeit
              <NumberField
                value={pstate.imageDurationSec}
                min={1}
                max={3600}
                className="w-16"
                onCommit={(v) => void cmd({ type: 'setImageDuration', seconds: v })}
              />
              s
            </label>
          </div>

          {/* Playlist */}
          <div
            className="min-h-0 flex-1 space-y-1 overflow-auto"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onPlaylistDrop(e, -1)}
          >
            {pstate.playlist.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Playlist leer. Medien aus der Bibliothek doppelklicken oder herziehen.
              </p>
            ) : (
              pstate.playlist.map((m, i) => (
                <div
                  key={`${m.id}-${i}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/x-reorder', String(i))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onPlaylistDrop(e, i)}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                    i === pstate.index ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted/40'
                  }`}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => void cmd({ type: 'goto', index: i })}
                  >
                    {i === pstate.index && pstate.playing ? (
                      <Play className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    )}
                    <span className="truncate" title={m.title}>
                      {m.title}
                    </span>
                  </button>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {m.durationSec ? fmtTime(m.durationSec) : 'Bild'}
                  </span>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => void cmd({ type: 'remove', index: i })}
                    aria-label="Entfernen"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
