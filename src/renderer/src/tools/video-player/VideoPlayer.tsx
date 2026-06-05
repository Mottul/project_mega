import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Clock,
  Film,
  FolderOpen,
  FolderSearch,
  GripVertical,
  Image as ImageIcon,
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
  PlayerState
} from '@shared/types'

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

  // Aufbereitungs-/Ausgabe-Einstellungen (in Settings persistiert)
  const [wallW, setWallW] = useState(1920)
  const [wallH, setWallH] = useState(1080)
  const [fit, setFit] = useState<FitMode>('blur')
  const [encoder, setEncoder] = useState('auto')
  const [displayId, setDisplayId] = useState<number | null>(null)

  const [scrub, setScrub] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

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

  async function persistPlayer(patch: Partial<{ wallWidth: number; wallHeight: number; defaultFit: FitMode; encoder: string }>): Promise<void> {
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

  async function importFiles(): Promise<void> {
    const sources = await api.selectPaths({
      title: 'Medien auswählen',
      multi: true,
      filters: [{ name: 'Medien', extensions: [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS] }]
    })
    if (sources.length) void api.player.import({ sources, fitMode: fit, wall: { width: wallW, height: wallH } })
  }

  async function importFolder(): Promise<void> {
    const sources = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    if (sources.length) void api.player.import({ sources, fitMode: fit, wall: { width: wallW, height: wallH } })
  }

  const cmd = api.player.command

  function toggleLoop(): void {
    const order: LoopMode[] = ['all', 'one', 'none']
    const next = order[(order.indexOf(pstate.loop) + 1) % order.length]
    void cmd({ type: 'setLoop', loop: next })
  }

  function onDrop(to: number): void {
    if (dragIndex != null && dragIndex !== to) void cmd({ type: 'move', from: dragIndex, to })
    setDragIndex(null)
  }

  async function openOutput(): Promise<void> {
    if (displayId == null) return
    await api.player.openOutput(displayId)
  }

  const ffmpegMissing = enc && !enc.ffmpegFound
  const loopIcon = pstate.loop === 'one' ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />

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
            <div className="flex gap-2">
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
                <span className="text-xs text-muted-foreground">
                  Konvertierung · {activeJobs.length} aktiv
                </span>
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

          {library.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Noch keine Medien. Über „Dateien"/„Ordner" importieren – sie werden auf die
              Wand-Auflösung ({wallW}×{wallH}) konvertiert.
            </p>
          ) : (
            <div className="grid max-h-[460px] grid-cols-2 gap-2 overflow-auto pr-1 sm:grid-cols-3">
              {library.map((m) => (
                <div key={m.id} className="group relative overflow-hidden rounded-md border border-border bg-muted/30">
                  <div className="aspect-video w-full bg-black">
                    {m.thumbUrl ? (
                      <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        {kindIcon(m.kind)}
                      </div>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-xs font-medium" title={m.title}>
                      {m.title}
                    </p>
                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {kindIcon(m.kind)} {m.width}×{m.height}
                      {m.durationSec ? ` · ${fmtTime(m.durationSec)}` : ''} · {fmtBytes(m.sizeBytes)}
                    </p>
                  </div>
                  <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      className="rounded bg-black/70 p-1 text-white hover:bg-primary hover:text-primary-foreground"
                      onClick={() => void cmd({ type: 'add', mediaIds: [m.id] })}
                      aria-label="Zur Playlist"
                      title="Zur Playlist hinzufügen"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <button
                      className="rounded bg-black/70 p-1 text-white hover:bg-destructive"
                      onClick={() => void api.player.libraryDelete(m.id)}
                      aria-label="Löschen"
                      title="Aus Bibliothek löschen"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {library.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 self-start"
              onClick={() => void cmd({ type: 'add', mediaIds: library.map((m) => m.id) })}
            >
              <ListPlus className="size-4" /> Alle zur Playlist
            </Button>
          )}
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

          {/* aktuelles Medium */}
          <div className="mb-3 flex items-center gap-3 rounded-md border border-border p-2">
            <div className="aspect-video w-28 shrink-0 overflow-hidden rounded bg-black">
              {current?.thumbUrl ? (
                <img src={current.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Film className="size-4" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current?.title ?? 'Nichts ausgewählt'}</p>
              <p className="text-xs text-muted-foreground">
                {current ? `${current.width}×${current.height} · ${current.fitMode}` : 'Medien aus der Bibliothek hinzufügen'}
              </p>
            </div>
            {!pstate.outputOpen && current && (
              <Badge tone="warning">Ausgabe geschlossen</Badge>
            )}
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
            <Button
              variant={pstate.loop !== 'none' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={toggleLoop}
              title={`Loop: ${pstate.loop}`}
            >
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void cmd({ type: 'setMuted', muted: !pstate.muted })}
            >
              {pstate.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              {pstate.muted ? 'Stumm' : 'Ton'}
            </Button>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
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
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {pstate.playlist.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Playlist leer. Medien aus der Bibliothek hinzufügen.
              </p>
            ) : (
              pstate.playlist.map((m, i) => (
                <div
                  key={`${m.id}-${i}`}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                    i === pstate.index ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted/40'
                  }`}
                >
                  <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
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
