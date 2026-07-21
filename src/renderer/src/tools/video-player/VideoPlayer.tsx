import { useEffect, useMemo, useRef, useState, type DragEvent, type HTMLAttributes } from 'react'
import { useKiosk } from '@renderer/launcher/kiosk'
import {
  AlertTriangle,
  Clock,
  Eraser,
  Film,
  FolderInput,
  FolderOpen,
  FolderSearch,
  Gauge,
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
  Radio,
  Ratio,
  RefreshCw,
  Repeat,
  Repeat1,
  Save,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  X
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { Progress } from '@renderer/components/ui/progress'
import { PanelSection, ToolShell } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { MEDIA_EXTENSIONS } from '@shared/mediaExtensions'
import { EMPTY_PLAYER_STATE } from '@shared/player'
import {
  DEFAULT_PLAYER_NDI,
  type PlayerNdiConfig,
  type PlayerNdiStatus,
  type ConvertJob,
  type DisplayInfo,
  type FitMode,
  type LoopMode,
  type MediaItem,
  type PatternId,
  type PlayerEncoderStatus,
  type PlayerState,
  type RemoteStatus,
  type SavedPlaylist,
  type TransitionMode
} from '@shared/types'
import { PATTERN_OPTIONS } from '../test-patterns/patterns'
import { PlaybackEngine } from './PlaybackEngine'
import { QrCode } from '@renderer/components/QrCode'

const selectClass =
  'h-9 rounded-md border border-border bg-input/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'

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
  // Kundenansicht: technische Setup-Optionen ausblenden (Wand/Auflösung, Encoder,
  // Idle-Bild). Bibliothek, Import, Fit-Modus, Fernsteuerung, Ausgabe und Playlist
  // bleiben voll bedienbar.
  const locked = useKiosk()
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
  const [blurStrength, setBlurStrength] = useState(50)
  const [blurDarken, setBlurDarken] = useState(0)
  const [loudnorm, setLoudnorm] = useState(false)
  const [loudnormI, setLoudnormI] = useState(-16)
  const [displayId, setDisplayId] = useState<number | null>(null)

  // Live gezogene Position (während des Scrubbens) und die committe Zielposition,
  // die gehalten wird, bis der Tick sie erreicht -> kein Zurückspringen auf die
  // alte Position nach dem Loslassen. scrubRef = neuester Wert, damit das
  // Loslassen AUCH außerhalb des Sliders sauber committet.
  const [scrub, setScrub] = useState<number | null>(null)
  const [seekTarget, setSeekTarget] = useState<number | null>(null)
  const scrubRef = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [view, setView] = useState<ViewMode>('large')
  // Bewegte Live-Vorschau des Wandbilds AUCH bei offenem Ausgabefenster (passiver
  // Spiegel). Aus = statisches Standbild (spart Decodierung). Wahl wird gemerkt.
  const [previewLive, setPreviewLive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('player:previewLive') === '1'
    } catch {
      return false
    }
  })
  function togglePreviewLive(): void {
    setPreviewLive((v) => {
      const next = !v
      try {
        localStorage.setItem('player:previewLive', next ? '1' : '0')
      } catch {
        /* localStorage nicht verfügbar */
      }
      return next
    })
  }
  // FPS-Anzeige über der Vorschau (an/aus, gemerkt).
  const [showFps, setShowFps] = useState<boolean>(() => {
    try {
      return localStorage.getItem('player:showFps') === '1'
    } catch {
      return false
    }
  })
  function toggleFps(): void {
    setShowFps((v) => {
      const next = !v
      try {
        localStorage.setItem('player:showFps', next ? '1' : '0')
      } catch {
        /* localStorage nicht verfügbar */
      }
      return next
    })
  }
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [remotePort, setRemotePort] = useState(8088)
  const [saved, setSaved] = useState<SavedPlaylist[]>([])
  const [naming, setNaming] = useState(false)
  const [nameInput, setNameInput] = useState('')

  function loadLibrary(): void {
    void api.player.libraryList().then(setLibrary)
  }

  useEffect(() => {
    void api.player.encoders().then(setEnc)
    loadLibrary()
    void api.player
      .convertList()
      .then((list) => setJobs(Object.fromEntries(list.map((j) => [j.id, j]))))
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
      setBlurStrength(s.player.blurStrength ?? 50)
      setBlurDarken(s.player.blurDarken ?? 0)
      setLoudnorm(s.player.loudnormEnabled ?? false)
      setLoudnormI(s.player.loudnormI ?? -16)
      setRemotePort(s.player.remotePort)
      setSaved(s.player.savedPlaylists ?? [])
      if (s.player.outputDisplayId != null) setDisplayId(s.player.outputDisplayId)
    })
    void api.player.remoteStatus().then(setRemote)

    const offJob = api.player.onConvertUpdate((job) => {
      setJobs((prev) => ({ ...prev, [job.id]: job }))
      if (job.status === 'done') loadLibrary()
    })
    const offLib = api.player.onLibraryChanged(() => loadLibrary())
    const offState = api.player.onState(setPstate)
    const offTick = api.player.onTick((t) => setTick(t))
    const offRemote = api.player.onRemoteChanged(setRemote)
    return () => {
      offJob()
      offLib()
      offState()
      offTick()
      offRemote()
    }
  }, [])

  const jobList = useMemo(
    () => Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt),
    [jobs]
  )
  const activeJobs = jobList.filter(
    (j) => j.status !== 'done' && j.status !== 'error' && j.status !== 'canceled'
  )
  const finishedJobs = jobList.filter(
    (j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled'
  )

  const current = pstate.index >= 0 ? pstate.playlist[pstate.index] : null
  const duration = tick?.durationSec || pstate.durationSec || current?.durationSec || 0
  // Anzeige-Position: aktives Ziehen > committe Zielposition > Tick > Zustand.
  const position = scrub ?? seekTarget ?? tick?.positionSec ?? pstate.positionSec
  const seekable = current != null && current.kind !== 'image' && duration > 0

  const cmd = api.player.command

  // Aktuelle Wiedergabewerte für die Tastatursteuerung -> der Handler unten liest
  // sie über die Ref, statt bei jedem Tick neu zu binden.
  const kbRef = useRef({ position, duration, seekable, volume: pstate.volume, muted: pstate.muted })
  kbRef.current = { position, duration, seekable, volume: pstate.volume, muted: pstate.muted }

  // Suche committen: einmalig (idempotent über scrubRef). Hält die Zielposition,
  // bis der Tick sie erreicht -> kein Zurückspringen.
  function commitSeek(): void {
    const v = scrubRef.current
    if (v == null) return
    scrubRef.current = null
    setScrub(null)
    setSeekTarget(v)
    void cmd({ type: 'seek', positionSec: v })
    // Fallback: spätestens nach 2 s wieder dem Tick folgen.
    window.setTimeout(() => setSeekTarget((cur) => (cur === v ? null : cur)), 2000)
  }

  // Zusätzlich am window lauschen, damit das Loslassen AUCH außerhalb des Sliders
  // sicher committet (sonst bliebe der Playhead an der alten Stelle hängen).
  useEffect(() => {
    if (scrub == null) return
    const onUp = (): void => commitSeek()
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // bewusst nur am Start/Ende des Scrubbens neu binden (scrub==null als Schwelle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub == null])

  // Zielposition halten, bis der Tick sie (ungefähr) erreicht.
  useEffect(() => {
    if (seekTarget == null) return
    const p = tick?.positionSec ?? pstate.positionSec
    if (Math.abs(p - seekTarget) < 0.75) setSeekTarget(null)
  }, [tick, pstate.positionSec, seekTarget])

  // Bei Track-Wechsel Scrub/Ziel verwerfen.
  useEffect(() => {
    setScrub(null)
    setSeekTarget(null)
    scrubRef.current = null
  }, [pstate.index])

  // Tastatursteuerung: aktiv, solange der Player-Tab offen ist -- außer man tippt
  // gerade in einem Eingabefeld oder hält eine Modifiertaste (App-Kürzel). Steuert
  // die Wiedergabe über den main-Prozess (autoritativ, spiegelt in alle Fenster).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const { position, duration, seekable, volume, muted } = kbRef.current
      const seek = (v: number): void => {
        if (seekable) {
          void api.player.command({ type: 'seek', positionSec: Math.max(0, Math.min(v, duration)) })
        }
      }
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          void api.player.command({ type: 'toggle' })
          break
        case 'ArrowLeft':
          e.preventDefault()
          seek(position - 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          seek(position + 5)
          break
        case 'j':
        case 'J':
          seek(position - 10)
          break
        case 'l':
        case 'L':
          seek(position + 10)
          break
        case 'p':
        case 'P':
          void api.player.command({ type: 'prev' })
          break
        case 'n':
        case 'N':
          void api.player.command({ type: 'next' })
          break
        case 'ArrowUp':
          e.preventDefault()
          void api.player.command({ type: 'setVolume', volume: Math.min(1, volume + 0.05) })
          break
        case 'ArrowDown':
          e.preventDefault()
          void api.player.command({ type: 'setVolume', volume: Math.max(0, volume - 0.05) })
          break
        case 'm':
        case 'M':
          void api.player.command({ type: 'setMuted', muted: !muted })
          break
        case 'Home':
          e.preventDefault()
          seek(0)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function persistPlayer(
    patch: Partial<{
      wallWidth: number
      wallHeight: number
      defaultFit: FitMode
      encoder: string
      blurStrength: number
      blurDarken: number
      loudnormEnabled: boolean
      loudnormI: number
    }>
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
    if (sources.length)
      void api.player.import({ sources, fitMode: fit, wall: { width: wallW, height: wallH } })
  }

  async function importFiles(): Promise<void> {
    const sources = await api.selectPaths({
      title: 'Medien auswählen',
      multi: true,
      filters: [{ name: 'Medien', extensions: [...MEDIA_EXTENSIONS] }]
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

  async function toggleRemote(): Promise<void> {
    if (remote?.running) setRemote(await api.player.remoteStop())
    else
      try {
        setRemote(await api.player.remoteStart(remotePort))
      } catch (e) {
        void api.notify({
          message: `Fernsteuerung konnte nicht starten (Port ${remotePort} belegt?).`,
          detail: e instanceof Error ? e.message : undefined,
          kind: 'error'
        })
      }
  }

  async function persistSaved(next: SavedPlaylist[]): Promise<void> {
    setSaved(next)
    const s = await api.getSettings()
    await api.setSettings({ player: { ...s.player, savedPlaylists: next } })
  }

  function confirmSavePlaylist(): void {
    const name = nameInput.trim()
    if (!name) {
      setNaming(false)
      return
    }
    const next = [
      ...saved.filter((p) => p.name !== name),
      { name, mediaIds: pstate.playlist.map((m) => m.id) }
    ].sort((a, b) => a.name.localeCompare(b.name))
    void persistSaved(next)
    setNaming(false)
  }

  async function loadSaved(p: SavedPlaylist): Promise<void> {
    // Atomar ersetzen statt clear + add: kein Zwischenstopp über eine leere Liste
    // -> der Wechsel pausiert nicht und blendet nicht kurz aufs Idle-Bild.
    await cmd({ type: 'replace', mediaIds: p.mediaIds })
  }

  async function pickIdleMedia(): Promise<void> {
    // Das Medium wird auf Wand-Auflösung gebacken (ffmpeg) -> kann je nach Quelle
    // einen Moment dauern und auch fehlschlagen (z.B. exotischer Codec).
    try {
      const r = await api.player.pickIdleMedia()
      if (r) await cmd({ type: 'setIdleMedia', url: r.url, kind: r.kind })
    } catch (e) {
      void api.notify({
        message: 'Idle-Medium konnte nicht aufbereitet werden.',
        detail: e instanceof Error ? e.message : undefined,
        kind: 'error'
      })
    }
  }

  // Medien, die nicht in der aktuellen Wand-Auflösung vorliegen.
  const staleItems = library.filter((m) => m.width !== wallW || m.height !== wallH)
  async function reconvertStale(): Promise<void> {
    if (staleItems.length === 0) return
    const res = await api.player.reconvert(
      staleItems.map((m) => m.id),
      { width: wallW, height: wallH }
    )
    if (res.skipped > 0)
      void api.notify({
        message: `${res.skipped} Medium/Medien ohne bekannte Originalquelle übersprungen (vor diesem Update importiert).`,
        kind: 'warning'
      })
  }

  const ffmpegMissing = enc && !enc.ffmpegFound
  const loopIcon =
    pstate.loop === 'one' ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />

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
    <ToolShell
      id="video-player"
      aside={
        <>
          {!locked && (
            <PanelSection id="wall" title="Wand / Auflösung" icon={Ratio}>
              <div className="flex items-center gap-2">
                <NumberField
                  value={wallW}
                  min={2}
                  max={16384}
                  onCommit={(v) => setWall(v, wallH)}
                />
                <span className="text-muted-foreground">×</span>
                <NumberField
                  value={wallH}
                  min={2}
                  max={16384}
                  onCommit={(v) => setWall(wallW, v)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RES_PRESETS.map((r) => (
                  <Button
                    key={r.label}
                    variant="outline"
                    size="sm"
                    onClick={() => setWall(r.w, r.h)}
                  >
                    {r.label}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fromMonitor}
                  disabled={displayId == null}
                >
                  von Monitor
                </Button>
              </div>
            </PanelSection>
          )}

          <PanelSection id="prep" title="Aufbereitung" icon={SlidersHorizontal}>
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
              <span className="text-xs text-muted-foreground">
                Gilt für neu importierte Medien.
              </span>
            </label>

            {fit === 'blur' && (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
                <label className="flex flex-col gap-1">
                  <span className="flex items-center justify-between text-xs">
                    <span className="font-medium">Blur-Stärke</span>
                    <span className="text-muted-foreground">{blurStrength} %</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={blurStrength}
                    onChange={(e) => setBlurStrength(Number(e.target.value))}
                    onPointerUp={(e) =>
                      void persistPlayer({
                        blurStrength: Number((e.target as HTMLInputElement).value)
                      })
                    }
                    className="w-full accent-primary"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="flex items-center justify-between text-xs">
                    <span className="font-medium">Abdunkelung</span>
                    <span className="text-muted-foreground">{blurDarken} %</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={blurDarken}
                    onChange={(e) => setBlurDarken(Number(e.target.value))}
                    onPointerUp={(e) =>
                      void persistPlayer({
                        blurDarken: Number((e.target as HTMLInputElement).value)
                      })
                    }
                    className="w-full accent-primary"
                  />
                </label>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Wirkt beim Einbacken (neue Importe).
                  </span>
                  {library.some((m) => m.fitMode === 'blur') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void api.player.reconvert(
                          library.filter((m) => m.fitMode === 'blur').map((m) => m.id),
                          { width: wallW, height: wallH }
                        )
                      }
                      title="Aktuelle Blur-Einstellungen auf bereits importierte Blur-Medien anwenden (kann dauern)"
                    >
                      Vorhandene neu einbacken
                    </Button>
                  )}
                </div>
              </div>
            )}

            {!locked && (
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
                    Automatisch
                    {enc
                      ? ` (${enc.available.find((a) => a.id === enc.recommended)?.label ?? enc.recommended})`
                      : ''}
                  </option>
                  {enc?.available.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Konvertierung nach H.264/MP4 (GPU, falls verfügbar).
                </span>
              </label>
            )}

            {!locked && (
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={loudnorm}
                    onChange={(e) => {
                      setLoudnorm(e.target.checked)
                      void persistPlayer({ loudnormEnabled: e.target.checked })
                    }}
                    className="size-4"
                  />
                  <span className="text-sm font-medium">Lautheit angleichen (EBU R128)</span>
                </label>
                {loudnorm && (
                  <label className="flex items-center justify-between gap-2 pl-6">
                    <span className="text-xs text-muted-foreground">Ziel-Lautheit</span>
                    <select
                      className={`${selectClass} h-8 w-auto`}
                      value={loudnormI}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setLoudnormI(v)
                        void persistPlayer({ loudnormI: v })
                      }}
                    >
                      <option value={-23}>−23 LUFS (Broadcast)</option>
                      <option value={-16}>−16 LUFS (Streaming)</option>
                      <option value={-14}>−14 LUFS (laut)</option>
                    </select>
                  </label>
                )}
                <span className="text-xs text-muted-foreground">
                  Gleicht beim Einbacken unterschiedlich laute Clips an – wirkt auf neu
                  importierte/neu konvertierte Medien (mit Tonspur).
                </span>
              </div>
            )}
          </PanelSection>

          <PanelSection
            id="output"
            title="Ausgabe-Monitor"
            icon={MonitorPlay}
            right={pstate.outputOpen ? <Badge tone="success">aktiv</Badge> : undefined}
          >
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
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void openOutput()} disabled={displayId == null}>
                <MonitorPlay className="size-4" /> {pstate.outputOpen ? 'Auf Monitor' : 'Vollbild'}
              </Button>
              {pstate.outputOpen && (
                <Button size="sm" variant="outline" onClick={() => void api.player.closeOutput()}>
                  <MonitorX className="size-4" /> Schließen
                </Button>
              )}
            </div>
          </PanelSection>

          <PanelSection id="ndi" title="NDI-Ausgabe (Netzwerk)" icon={Radio} defaultOpen={false}>
            <PlayerNdiPanel wallW={wallW} wallH={wallH} />
          </PanelSection>

          {!locked && (
            <PanelSection id="idle" title="Idle-Bild" icon={ImageIcon} defaultOpen={false}>
              <select
                className={selectClass}
                value={pstate.idlePattern}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'custom') void pickIdleMedia()
                  else void cmd({ type: 'setIdlePattern', pattern: v as PatternId | 'off' })
                }}
              >
                <option value="off">Aus (schwarz)</option>
                <option value="custom">Eigenes Bild/Video…</option>
                {PATTERN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {pstate.idlePattern === 'custom' ? (
                <span className="text-xs text-muted-foreground">
                  Eigenes {pstate.idleMediaKind === 'video' ? 'Video' : 'Bild'} aktiv ·{' '}
                  <button className="underline" onClick={() => void pickIdleMedia()}>
                    ändern
                  </button>{' '}
                  ·{' '}
                  <button
                    className="underline"
                    onClick={() => void cmd({ type: 'setIdlePattern', pattern: 'off' })}
                  >
                    entfernen
                  </button>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Testbild oder eigenes Medium als Fallback auf der Ausgabe.
                </span>
              )}
            </PanelSection>
          )}

          <PanelSection
            id="remote"
            title="Fernsteuerung"
            icon={Smartphone}
            defaultOpen={false}
            right={remote?.running ? <Badge tone="success">an</Badge> : undefined}
          >
            <p className="text-xs text-muted-foreground">
              Steuerseite im lokalen Netz – Tablet/Handy muss im selben WLAN sein. Ohne Passwort.
            </p>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Port</span>
              <NumberField
                value={remotePort}
                min={1}
                max={65535}
                className="w-24"
                onCommit={setRemotePort}
              />
            </label>
            <Button
              onClick={() => void toggleRemote()}
              variant={remote?.running ? 'outline' : 'default'}
              className="w-full"
            >
              <Wifi className="size-4" /> {remote?.running ? 'Stoppen' : 'Aktivieren'}
            </Button>
            {remote?.running && (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                {remote.urls[0] && (
                  <div className="flex justify-center">
                    <QrCode text={remote.urls[0]} />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Im Browser des Tablets öffnen (QR scannen oder Adresse eintippen):
                </p>
                <div className="flex flex-wrap gap-2">
                  {remote.urls.map((u) => (
                    <button
                      key={u}
                      onClick={() => void navigator.clipboard?.writeText(u)}
                      title="Adresse kopieren"
                      className="rounded bg-background px-2 py-1 font-mono text-xs text-primary hover:bg-muted"
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PanelSection>
        </>
      }
      main={
        <div className="space-y-6 p-6">
          {ffmpegMissing && (
            <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400 light:text-amber-700" />
              <div className="text-sm">
                <p className="font-medium text-amber-400 light:text-amber-700">
                  ffmpeg nicht gefunden
                </p>
                <p className="mt-1 text-muted-foreground">
                  Zum Konvertieren der Medien wird das gebündelte ffmpeg benötigt. Im Dev-Modus über
                  <code className="mx-1 rounded bg-muted px-1">npm run ff:fetch</code>{' '}
                  bereitstellen; im fertigen Paket ist es enthalten.
                  {enc?.error ? ` (${enc.error})` : ''}
                </p>
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-6 xl:flex-row">
            {/* Bibliothek – auf breiten Screens links, beim Stapeln NACH dem Player
            (order-2): schmal soll zuerst der Player kommen, nicht die Bibliothek. */}
            <Card className="order-2 flex min-w-0 flex-col p-5 xl:order-1 xl:flex-1">
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
                    <span className="text-xs text-muted-foreground">
                      Konvertierung · {activeJobs.length} aktiv
                    </span>
                    {finishedJobs.length > 0 && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          void api.player
                            .convertClearFinished()
                            .then(() =>
                              api.player
                                .convertList()
                                .then((l) => setJobs(Object.fromEntries(l.map((j) => [j.id, j]))))
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
                          {j.status === 'converting'
                            ? `${Math.round(j.progress * 100)}%`
                            : j.status}
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
                  {finishedJobs
                    .filter((j) => j.status === 'error')
                    .map((j) => (
                      <p key={j.id} className="truncate text-xs text-destructive" title={j.error}>
                        {j.title}: {j.error}
                      </p>
                    ))}
                </div>
              )}

              {staleItems.length > 0 && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <RefreshCw className="size-4 shrink-0 text-amber-400 light:text-amber-700" />
                  <span className="flex-1 text-amber-400 light:text-amber-700">
                    {staleItems.length} Medium/Medien ≠ Wand-Auflösung ({wallW}×{wallH}).
                  </span>
                  <Button size="sm" variant="outline" onClick={() => void reconvertStale()}>
                    Neu konvertieren
                  </Button>
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
                    <span className="text-xs">
                      Konvertierung auf {wallW}×{wallH}.
                    </span>
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
                          {m.thumbUrl ? (
                            <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm" title={m.title}>
                            {m.title}
                          </p>
                          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {kindIcon(m.kind)} {m.width}×{m.height}
                            {m.durationSec ? ` · ${fmtTime(m.durationSec)}` : ''} ·{' '}
                            {fmtBytes(m.sizeBytes)}
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
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            void api.player.reconvert([m.id], { width: wallW, height: wallH }, fit)
                          }
                          title="Neu einbacken aus dem Original (aktuelle Auflösung + Aufbereitung/Blur)"
                        >
                          <RefreshCw className="size-4" />
                        </button>
                        <button
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
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
                            className="rounded bg-black/70 p-1 text-white hover:bg-primary hover:text-primary-foreground"
                            onClick={() =>
                              void api.player.reconvert(
                                [m.id],
                                { width: wallW, height: wallH },
                                fit
                              )
                            }
                            title="Neu einbacken aus dem Original (aktuelle Auflösung + Aufbereitung/Blur)"
                          >
                            <RefreshCw className="size-3.5" />
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void openMediaDir()}
                  title="Speicherort der konvertierten Medien"
                >
                  <FolderOpen className="size-4" /> Ordner
                </Button>
                {library.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive/80"
                    onClick={() => {
                      void api
                        .confirm({
                          message: 'Gesamte Bibliothek löschen?',
                          detail: 'Die konvertierten Dateien werden entfernt.',
                          confirmLabel: 'Leeren',
                          danger: true
                        })
                        .then((ok) => {
                          if (ok) void api.player.libraryClear()
                        })
                    }}
                  >
                    <Eraser className="size-4" /> Leeren
                  </Button>
                )}
              </div>
            </Card>

            {/* Wiedergabe – beim Stapeln zuerst (order-1), auf breiten Screens rechts. */}
            <Card className="order-1 flex min-w-0 flex-col p-5 xl:order-2 xl:flex-1">
              <div className="mb-3">
                <h2 className="font-medium">Wiedergabe</h2>
              </div>

              {/* Gespeicherte Playlists (Tabs) – prominent mit Akzentfarbe + Anzahl */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {saved.map((p) => (
                  <span
                    key={p.name}
                    className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-1 pl-3 pr-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/70 hover:bg-primary/20"
                  >
                    <button
                      onClick={() => void loadSaved(p)}
                      title={`Playlist „${p.name}" laden (${p.mediaIds.length} Medien)`}
                      className="flex items-center gap-1.5"
                    >
                      {p.name}
                      <span className="rounded-full bg-primary/25 px-1.5 text-xs tabular-nums text-primary">
                        {p.mediaIds.length}
                      </span>
                    </button>
                    <button
                      onClick={() => void persistSaved(saved.filter((x) => x.name !== p.name))}
                      className="text-muted-foreground hover:text-destructive"
                      title="Löschen"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                {naming ? (
                  <span className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmSavePlaylist()
                        else if (e.key === 'Escape') setNaming(false)
                      }}
                      placeholder="Name…"
                      className="h-7 w-32 rounded border border-border bg-background px-2 text-xs"
                    />
                    <Button variant="ghost" size="sm" onClick={confirmSavePlaylist}>
                      ✓
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setNaming(false)}>
                      ✕
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNameInput('')
                      setNaming(true)
                    }}
                    disabled={pstate.playlist.length === 0}
                  >
                    <Save className="size-4" /> Speichern
                  </Button>
                )}
              </div>

              {/* Vorschau / Monitorhinweis. Bei offenem Ausgabefenster schaltet ein
              Klick zwischen bewegtem Spiegel und Standbild um. */}
              <div
                onClick={() => {
                  if (pstate.outputOpen) togglePreviewLive()
                }}
                title={pstate.outputOpen ? 'Klick: Live-Vorschau ein/aus' : undefined}
                className={`relative mb-2 aspect-video w-full overflow-hidden rounded-md border border-border bg-black ${
                  pstate.outputOpen ? 'cursor-pointer' : ''
                }`}
              >
                {!pstate.outputOpen || previewLive ? (
                  // Kein Ausgabefenster -> aktive Engine (treibt die Wiedergabe);
                  // Ausgabefenster offen + Live an -> passiver Spiegel des Wandbilds.
                  // key erzwingt sauberen Remount beim Wechsel aktiv <-> Spiegel.
                  <PlaybackEngine
                    key={pstate.outputOpen ? 'mirror' : 'live'}
                    objectFit="contain"
                    passive={pstate.outputOpen}
                    showFps={showFps}
                  />
                ) : (
                  <>
                    {current?.thumbUrl ? (
                      <img
                        src={current.thumbUrl}
                        alt=""
                        className="h-full w-full object-contain opacity-60"
                      />
                    ) : null}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Badge tone="info">Wiedergabe läuft auf dem Monitor</Badge>
                    </div>
                  </>
                )}
                {pstate.outputOpen && (
                  <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90">
                    {previewLive ? 'Live · Klick = Standbild' : 'Standbild · Klick = Live'}
                  </span>
                )}
              </div>
              <div className="mb-3 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {current?.title ?? 'Nichts ausgewählt'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {current
                      ? `${current.width}×${current.height} · ${current.fitMode}`
                      : 'Medien aus der Bibliothek hinzufügen (Doppelklick oder ziehen)'}
                  </p>
                </div>
                <Button
                  variant={showFps ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={toggleFps}
                  title="FPS-Anzeige (dargestellte Videobilder/s) über der Vorschau ein-/ausblenden"
                >
                  <Gauge className="size-4" /> FPS
                </Button>
                {pstate.outputOpen ? (
                  <Button
                    variant={previewLive ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={togglePreviewLive}
                    title="Bewegte Live-Vorschau des Wandbilds (stumm) – sonst Standbild"
                  >
                    <MonitorPlay className="size-4" /> Live-Vorschau
                  </Button>
                ) : (
                  <Badge tone="neutral">Vorschau</Badge>
                )}
              </div>

              {/* Seek */}
              <div className="mb-2 flex items-center gap-2">
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                  {fmtTime(position)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration)}
                  step={0.1}
                  value={Math.min(position, duration || 1)}
                  disabled={!seekable}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    scrubRef.current = v
                    setScrub(v)
                  }}
                  onPointerUp={commitSeek}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))] disabled:opacity-50"
                />
                <span className="w-10 text-xs tabular-nums text-muted-foreground">
                  {fmtTime(duration)}
                </span>
              </div>

              {/* Transport */}
              <div className="mb-3 flex items-center justify-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void cmd({ type: 'prev' })}
                  aria-label="Zurück"
                >
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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void cmd({ type: 'next' })}
                  aria-label="Weiter"
                >
                  <SkipForward className="size-5" />
                </Button>
              </div>

              {/* Tastatur-Kürzel (aktiv, wenn kein Textfeld fokussiert ist) */}
              <p className="mb-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                Leertaste Play/Pause · ←/→ 5 s · J/L 10 s · P/N Titel · ↑/↓ Lautstärke · M Stumm
              </p>

              {/* Modi */}
              <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
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
                {/* Lautstärke: Stumm-Umschalter + Regler + Pegel. Regler zeigt den
                    hörbaren Pegel (0 bei stumm); Ziehen hebt die Stummschaltung auf. */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => void cmd({ type: 'setMuted', muted: !pstate.muted })}
                    title={pstate.muted ? 'Ton einschalten' : 'Stummschalten'}
                    aria-label={pstate.muted ? 'Ton einschalten' : 'Stummschalten'}
                  >
                    {pstate.muted || pstate.volume === 0 ? (
                      <VolumeX className="size-4" />
                    ) : pstate.volume < 0.5 ? (
                      <Volume1 className="size-4" />
                    ) : (
                      <Volume2 className="size-4" />
                    )}
                  </Button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={pstate.muted ? 0 : pstate.volume}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      void cmd({ type: 'setVolume', volume: v })
                      // Am Regler ziehen hebt Stumm auf (sonst bliebe es lautlos).
                      if (pstate.muted && v > 0) void cmd({ type: 'setMuted', muted: false })
                    }}
                    aria-label="Lautstärke"
                    className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))]"
                  />
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round((pstate.muted ? 0 : pstate.volume) * 100)} %
                  </span>
                </div>
                <select
                  className={`${selectClass} h-8`}
                  value={pstate.transition}
                  onChange={(e) =>
                    void cmd({
                      type: 'setTransition',
                      transition: e.target.value as TransitionMode
                    })
                  }
                  title="Übergang zwischen Medien"
                >
                  <option value="cut">Schnitt (Cut)</option>
                  <option value="crossfade">Überblenden (Overlap)</option>
                </select>
                {pstate.transition === 'crossfade' && (
                  <NumberField
                    value={pstate.transitionMs}
                    min={100}
                    max={5000}
                    className="w-20"
                    aria-label="Überblenddauer (ms)"
                    onCommit={(v) =>
                      void cmd({ type: 'setTransition', transition: 'crossfade', transitionMs: v })
                    }
                  />
                )}
              </div>

              <div className="mb-3 flex items-center justify-center">
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
              {pstate.playlist.length > 0 && (
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Playlist · {pstate.playlist.length}
                  </span>
                  <button
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void cmd({ type: 'clear' })}
                    title="Playlist leeren"
                  >
                    <Eraser className="size-3.5" /> Leeren
                  </button>
                </div>
              )}
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
                        i === pstate.index
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent hover:bg-muted/40'
                      }`}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => void cmd({ type: 'goto', index: i })}
                      >
                        {i === pstate.index && pstate.playing ? (
                          <Play className="size-3.5 shrink-0 text-primary" />
                        ) : (
                          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {i + 1}
                          </span>
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
      }
    />
  )
}

/* --------------------------- NDI-Ausgabe (Panel) ------------------------- */

type NdiMode = 'wall' | 'half' | 'hd1080' | 'hd720'
const NDI_LS_KEY = 'player:ndi'

// NDI mag gerade Maße; außerdem Untergrenze für sinnvolle Streams.
function evenDim(n: number): number {
  return Math.max(320, Math.round(n / 2) * 2)
}

function ndiConfigFor(
  mode: NdiMode,
  name: string,
  fps: number,
  audio: boolean,
  wallW: number,
  wallH: number
): PlayerNdiConfig {
  const base = { name: name.trim() || DEFAULT_PLAYER_NDI.name, fps, audio }
  switch (mode) {
    case 'half':
      return { ...base, width: evenDim(wallW / 2), height: evenDim(wallH / 2), fit: 'fill' }
    case 'hd1080':
      return { ...base, width: 1920, height: 1080, fit: 'contain' }
    case 'hd720':
      return { ...base, width: 1280, height: 720, fit: 'contain' }
    default:
      return { ...base, width: evenDim(wallW), height: evenDim(wallH), fit: 'fill' }
  }
}

/** NDI-Ausgabe des Players (experimentell): Wandbild (und optional Ton) als
 *  NDI-Quelle ins Netz. Ohne installiertes NDI-Modul nur ein Hinweis. */
function PlayerNdiPanel({ wallW, wallH }: { wallW: number; wallH: number }): JSX.Element {
  const [status, setStatus] = useState<PlayerNdiStatus | null>(null)
  const [prefs, setPrefs] = useState<{ name: string; mode: NdiMode; fps: number; audio: boolean }>(
    () => {
      try {
        const saved = JSON.parse(localStorage.getItem(NDI_LS_KEY) ?? 'null')
        if (saved && typeof saved.name === 'string') {
          return {
            name: saved.name,
            mode: ['wall', 'half', 'hd1080', 'hd720'].includes(saved.mode) ? saved.mode : 'wall',
            fps: [25, 30, 50].includes(saved.fps) ? saved.fps : 30,
            audio: !!saved.audio
          }
        }
      } catch {
        /* defekter Eintrag -> Defaults */
      }
      return { name: DEFAULT_PLAYER_NDI.name, mode: 'wall', fps: 30, audio: true }
    }
  )

  useEffect(() => {
    void api.player.ndiStatus().then(setStatus)
    return api.player.onNdiChanged(setStatus)
  }, [])

  // Frame-Zähler lebt im main -> während des Sendens gelegentlich nachfragen.
  useEffect(() => {
    if (!status?.running) return
    const t = setInterval(() => void api.player.ndiStatus().then(setStatus), 2000)
    return () => clearInterval(t)
  }, [status?.running])

  function patch(p: Partial<typeof prefs>): void {
    setPrefs((prev) => {
      const next = { ...prev, ...p }
      try {
        localStorage.setItem(NDI_LS_KEY, JSON.stringify(next))
      } catch {
        /* localStorage nicht verfügbar */
      }
      return next
    })
  }

  if (!status) return <p className="text-xs text-muted-foreground">Lade…</p>
  if (!status.available) {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          NDI-Modul nicht verfügbar – die App läuft normal weiter. Zum Aktivieren einmalig
          <span className="font-mono"> npm run ndi:setup</span> ausführen (siehe README).
        </p>
        {status.error && <p className="break-words font-mono text-[10px]">{status.error}</p>}
      </div>
    )
  }

  const running = status.running
  const modes: { value: NdiMode; label: string }[] = [
    { value: 'wall', label: `Wand 1:1 (${evenDim(wallW)} × ${evenDim(wallH)})` },
    { value: 'half', label: `Wand 50 % (${evenDim(wallW / 2)} × ${evenDim(wallH / 2)})` },
    { value: 'hd1080', label: '1920 × 1080 (einbetten)' },
    { value: 'hd720', label: '1280 × 720 (einbetten)' }
  ]
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Quellenname im Netz</span>
        <Input
          value={prefs.name}
          disabled={running}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Auflösung</span>
          <select
            className={`${selectClass} w-full`}
            disabled={running}
            value={prefs.mode}
            onChange={(e) => patch({ mode: e.target.value as NdiMode })}
          >
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Bildrate</span>
          <select
            className={`${selectClass} w-full`}
            disabled={running}
            value={prefs.fps}
            onChange={(e) => patch({ fps: Number(e.target.value) })}
          >
            {[25, 30, 50].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          disabled={running}
          checked={prefs.audio}
          onChange={(e) => patch({ audio: e.target.checked })}
        />
        Audio mitsenden
      </label>
      <p className="text-[11px] text-muted-foreground">
        Ton ist Pre-Fader (unabhängig von lokaler Lautstärke/Stumm). Volle Auflösung braucht
        Gigabit-LAN (~100–150 Mbit/s bei 1080p30).
      </p>
      {running ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void api.player.ndiStop().then(setStatus)}
        >
          <X className="size-4" /> NDI-Ausgabe stoppen
        </Button>
      ) : (
        <Button
          className="w-full"
          onClick={() =>
            void api.player
              .ndiStart(ndiConfigFor(prefs.mode, prefs.name, prefs.fps, prefs.audio, wallW, wallH))
              .then(setStatus)
          }
        >
          <Radio className="size-4" /> NDI-Ausgabe starten
        </Button>
      )}
      {running && (
        <p className="text-xs text-muted-foreground">
          Sendet als <span className="font-medium text-foreground">„{status.config.name}“</span> ·{' '}
          {status.config.width}×{status.config.height}@{status.config.fps}
          {status.config.audio
            ? ` · Audio: ${status.audioChunks} Blöcke, Pegel ${Math.round(status.audioLevel * 100)} %`
            : ''}{' '}
          · <span className="tabular-nums">{status.framesSent}</span> Frames
        </p>
      )}
      {status.error && <p className="text-xs text-destructive">{status.error}</p>}
    </>
  )
}
