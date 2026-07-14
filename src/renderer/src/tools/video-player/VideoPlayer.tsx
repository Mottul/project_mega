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
  Wrench,
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
import { cn } from '@renderer/lib/utils'
import { useDraft } from '@renderer/lib/useDraft'
import { EMPTY_PLAYER_STATE, tickerStripPx } from '@shared/player'
import {
  type ConvertJob,
  type DisplayInfo,
  type FitMode,
  type LoopMode,
  type MediaItem,
  type PatternId,
  type PlayerEncoderStatus,
  type PlayerSettings,
  type PlayerState,
  type RemoteStatus,
  type SavedPlaylist,
  type NamedTickerStyle,
  type TrailerPreset,
  type TransitionMode
} from '@shared/types'
import { PATTERN_OPTIONS } from '../test-patterns/patterns'
import { PlaybackEngine } from './PlaybackEngine'
import { QrCode } from './QrCode'

// block + w-full: ALLE Dropdowns füllen ihren Container gleich breit aus --
// ohne das rendert jedes <select> in seiner natürlichen Breite (= breiteste
// Option) und die Felder wirken wild unterschiedlich (Monitor vs. Idle-Bild).
const selectClass =
  'block h-9 w-full min-w-0 rounded-md border border-border bg-input/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'
// Kompakte Variante für Zeilen-Layouts (neben h-8-Knöpfen): natürliche Breite.
const selectClassCompact =
  'h-8 rounded-md border border-border bg-input/40 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'

// Schriftarten der Laufschrift: kuratierte, auf Windows sicher vorhandene
// Stacks (Systemfonts -- keine Font-Dateien nötig). '' = System-Standard.
const TICKER_FONTS: { value: string; label: string }[] = [
  { value: '', label: 'Standard (System)' },
  { value: '"Arial Black", Arial, sans-serif', label: 'Arial Black (breit/fett)' },
  { value: 'Impact, "Arial Black", sans-serif', label: 'Impact (kompakt)' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: '"Segoe UI", sans-serif', label: 'Segoe UI' },
  { value: 'Georgia, serif', label: 'Georgia (Serife)' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Consolas, "Courier New", monospace', label: 'Consolas (Mono)' }
]

function styleUid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  }
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'gif']
const VIDEO_EXTENSIONS = [
  'mov',
  'mp4',
  'mxf',
  'avi',
  'mkv',
  'm4v',
  'mpg',
  'mpeg',
  'wmv',
  'mts',
  'm2ts',
  'ts',
  'webm'
]

const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'blur', label: 'Blur-Fill (unscharfer Hintergrund)' },
  { value: 'bars', label: 'Schwarze Ränder (Letter-/Pillarbox)' },
  { value: 'stretch', label: 'Strecken (auf Wand-Auflösung ziehen)' }
]

// Idle-Bild (LED-Trailer): bewusst nur die vier einfachsten, universell
// tauglichen Muster -- die übrigen (Farbbalken, Siemensstern, …) sind für
// Kalibrierung gedacht, nicht für den Trailer-Alltag.
const IDLE_PATTERN_IDS = ['geometry', 'grid', 'checkerboard', 'solid']
const IDLE_PATTERN_OPTIONS = PATTERN_OPTIONS.filter((o) => IDLE_PATTERN_IDS.includes(o.value))

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
  // Kundenansicht: technische Setup-Optionen ausblenden (Idle-Bild, Einrichtung).
  // Bibliothek, Import, Fit-Modus, Fernsteuerung, Ausgabe und Playlist bleiben
  // voll bedienbar.
  const locked = useKiosk()
  const [enc, setEnc] = useState<PlayerEncoderStatus | null>(null)
  const [library, setLibrary] = useState<MediaItem[]>([])
  const [jobs, setJobs] = useState<Record<string, ConvertJob>>({})
  const [pstate, setPstate] = useState<PlayerState>(EMPTY_PLAYER_STATE)
  const [tick, setTick] = useState<{ positionSec: number; durationSec: number } | null>(null)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])

  // LED-Trailer: fest eingerichtete Formate + Laufschrift + NovaStar-Kopplung.
  const [presets, setPresets] = useState<TrailerPreset[]>([])
  const [activePreset, setActivePreset] = useState(0)
  const [novaEnabled, setNovaEnabled] = useState(false)
  const [novaHost, setNovaHost] = useState('')
  const [novaPresets, setNovaPresets] = useState<number[]>([1, 2, 3])
  const [novaMsg, setNovaMsg] = useState<string | null>(null)
  const [speedDraft, setSpeedDraft] = useState<number | null>(null)
  // Stil-Vorlagen der Laufschrift (benannt, abrufbar) + UI-Zustand dafür.
  const [tickerStyles, setTickerStyles] = useState<NamedTickerStyle[]>([])
  const [styleSel, setStyleSel] = useState('')
  const [styleName, setStyleName] = useState('')
  const [fit, setFit] = useState<FitMode>('blur')
  const [blurStrength, setBlurStrength] = useState(50)
  const [blurDarken, setBlurDarken] = useState(0)
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
      setPresets(s.player.trailerPresets ?? [])
      setActivePreset(s.player.trailerActivePreset ?? 0)
      setNovaEnabled(s.player.trailerNovaEnabled ?? false)
      setNovaHost(s.player.trailerNovaHost ?? '')
      setNovaPresets(s.player.trailerNovaPresets ?? [1, 2, 3])
      setTickerStyles(s.player.tickerStyles ?? [])
      setFit(s.player.defaultFit)
      setBlurStrength(s.player.blurStrength ?? 50)
      setBlurDarken(s.player.blurDarken ?? 0)
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

  // Audio-Ausgabegeräte auflisten (Labels brauchen u.U. eine Audio-Berechtigung).
  useEffect(() => {
    const load = (): void => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((d) => setAudioOutputs(d.filter((x) => x.kind === 'audiooutput')))
        .catch(() => setAudioOutputs([]))
    }
    load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => navigator.mediaDevices.removeEventListener('devicechange', load)
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

  // Wand- und Inhalts-Auflösung aus dem autoritativen Zustand: bei aktiver
  // Laufschrift ist das Konvertierungs-Ziel die Wand MINUS Laufschriftzeile.
  const wallW = pstate.wall.width
  const wallH = pstate.wall.height
  const contentW = wallW
  const contentH = wallH - tickerStripPx(pstate)
  const convActive = Object.values(jobs).filter(
    (j) => j.status === 'queued' || j.status === 'probing' || j.status === 'converting'
  ).length
  const tickerDraft = useDraft(pstate.ticker.text)
  function commitTickerText(): void {
    if (tickerDraft.text !== pstate.ticker.text)
      void cmd({ type: 'setTicker', patch: { text: tickerDraft.text } })
  }

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

  async function persistPlayer(patch: Partial<PlayerSettings>): Promise<void> {
    const s = await api.getSettings()
    await api.setSettings({ player: { ...s.player, ...patch } })
  }

  function importSources(sources: string[]): void {
    if (sources.length)
      void api.player.import({
        sources,
        fitMode: fit,
        wall: { width: contentW, height: contentH }
      })
  }

  /** Trailer-Preset umschalten: Format setzen, Medien automatisch anpassen und
   *  (falls gekoppelt) das NovaStar-Preset abrufen -- EIN Knopf für alles. */
  async function activatePreset(i: number): Promise<void> {
    const p = presets[i]
    if (!p) return
    setActivePreset(i)
    await cmd({ type: 'applyPreset', index: i })
    // Ziel-Auflösung dieses Presets (Wand minus Laufschriftzeile) direkt aus dem
    // Preset rechnen -- nicht aus pstate (der Broadcast kommt asynchron).
    const strip = p.ticker ? Math.max(0, Math.min(p.tickerStyle.heightPx, p.height - 16)) : 0
    const cw = p.width
    const ch = p.height - strip
    const stale = library.filter((m) => m.width !== cw || m.height !== ch)
    if (stale.length > 0)
      void api.player.reconvert(
        stale.map((m) => m.id),
        { width: cw, height: ch }
      )
    if (novaEnabled && novaHost.trim()) {
      const nr = novaPresets[i] ?? i + 1
      setNovaMsg('NovaStar wird umgeschaltet …')
      try {
        await api.novastar.connect(novaHost.trim(), 5200)
        await api.novastar.preset(nr)
        setNovaMsg(`NovaStar-Preset ${nr} abgerufen ✓`)
      } catch (e) {
        setNovaMsg(`NovaStar nicht erreichbar (${e instanceof Error ? e.message : String(e)})`)
      }
    }
  }

  /** Preset-Einrichtung ändern (Name/Maße/Laufschrift-Flag). Betrifft es das
   *  aktive Preset, wird es sofort neu angewandt (Wand + Laufschrift live). */
  async function updatePreset(i: number, patch: Partial<TrailerPreset>): Promise<void> {
    const next = presets.map((p, j) => (j === i ? { ...p, ...patch } : p))
    setPresets(next)
    await persistPlayer({ trailerPresets: next })
    if (i === activePreset) await cmd({ type: 'applyPreset', index: i })
  }

  async function pickTickerLogo(): Promise<void> {
    const r = await api.player.pickTickerLogo()
    if (r) void cmd({ type: 'setTicker', patch: { logoUrl: r.url } })
  }

  /** Stil-Vorlage anwenden: Gestaltung in den Live-Zustand (und damit ins
   *  aktive Preset) übernehmen -- der Text bleibt unverändert. */
  function applyTickerStyle(id: string): void {
    setStyleSel(id)
    const s = tickerStyles.find((x) => x.id === id)
    if (!s) return
    void cmd({
      type: 'setTicker',
      patch: {
        heightPx: s.heightPx,
        speed: s.speed,
        color: s.color,
        bg: s.bg,
        logoUrl: s.logoUrl,
        logoMode: s.logoMode,
        fontFamily: s.fontFamily
      }
    })
  }

  /** Aktuelle Gestaltung unter Namen speichern (gleicher Name = überschreiben). */
  async function saveTickerStyle(): Promise<void> {
    const name = styleName.trim()
    if (!name) return
    const t = pstate.ticker
    const style = {
      name,
      heightPx: t.heightPx,
      speed: t.speed,
      color: t.color,
      bg: t.bg,
      logoUrl: t.logoUrl,
      logoMode: t.logoMode,
      fontFamily: t.fontFamily
    }
    const existing = tickerStyles.find((x) => x.name.toLowerCase() === name.toLowerCase())
    const next = existing
      ? tickerStyles.map((x) => (x.id === existing.id ? { ...x, ...style } : x))
      : [...tickerStyles, { id: styleUid(), ...style }]
    setTickerStyles(next)
    setStyleSel(existing?.id ?? next[next.length - 1].id)
    setStyleName('')
    await persistPlayer({ tickerStyles: next })
  }

  async function deleteTickerStyle(): Promise<void> {
    if (!styleSel) return
    const next = tickerStyles.filter((x) => x.id !== styleSel)
    setTickerStyles(next)
    setStyleSel('')
    await persistPlayer({ tickerStyles: next })
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

  // Medien, die nicht in der aktuellen Inhalts-Auflösung vorliegen (Wand minus
  // Laufschriftzeile, falls das aktive Preset eine hat).
  const staleItems = library.filter((m) => m.width !== contentW || m.height !== contentH)
  async function reconvertStale(): Promise<void> {
    if (staleItems.length === 0) return
    const res = await api.player.reconvert(
      staleItems.map((m) => m.id),
      { width: contentW, height: contentH }
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
                          { width: contentW, height: contentH }
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
            <label className="block min-w-0">
              <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Volume2 className="size-3.5" /> Ton-Ausgabe
              </span>
              {/* Lange Gerätenamen: Anzeige kürzt (w-full/min-w-0 in selectClass),
                  die aufgeklappte Liste zeigt alles; Tooltip trägt den vollen Namen. */}
              <select
                className={selectClass}
                value={pstate.outputAudioDeviceId}
                title={
                  audioOutputs.find((d) => d.deviceId === pstate.outputAudioDeviceId)?.label ||
                  'Standardgerät'
                }
                onChange={(e) =>
                  void cmd({ type: 'setOutputAudioDevice', deviceId: e.target.value })
                }
              >
                <option value="">Standardgerät</option>
                {audioOutputs.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Ausgabegerät ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
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
                {IDLE_PATTERN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {pstate.idlePattern === 'custom' ? (
                <p className="text-xs text-muted-foreground">
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
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Testbild oder eigenes Medium als Fallback auf der Ausgabe.
                </p>
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

          {/* Einrichtung (Technik): Formate + NovaStar. Für den Aufbau gedacht --
              die Laufschrift-Gestaltung liegt direkt in der Laufschrift-Karte. */}
          <PanelSection
            id="trailer-setup"
            title="Einrichtung (Technik)"
            icon={Wrench}
            defaultOpen={false}
          >
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Formate (Presets)
              </span>
              {presets.map((p, i) => (
                <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
                  <Input
                    value={p.name}
                    className="h-8"
                    onChange={(e) => void updatePreset(i, { name: e.target.value })}
                  />
                  <div className="flex items-center gap-1.5">
                    <NumberField
                      value={p.width}
                      min={2}
                      max={16384}
                      className="h-8 w-24"
                      aria-label="Breite (px)"
                      onCommit={(v) => void updatePreset(i, { width: Math.max(2, v) })}
                    />
                    <span className="text-muted-foreground">×</span>
                    <NumberField
                      value={p.height}
                      min={2}
                      max={16384}
                      className="h-8 w-24"
                      aria-label="Höhe (px)"
                      onCommit={(v) => void updatePreset(i, { height: Math.max(2, v) })}
                    />
                    <label className="ml-auto flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={p.ticker}
                        onChange={(e) => void updatePreset(i, { ticker: e.target.checked })}
                        className="size-4"
                      />
                      Laufschrift
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                NovaStar-Kopplung
              </span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={novaEnabled}
                  onChange={(e) => {
                    setNovaEnabled(e.target.checked)
                    void persistPlayer({ trailerNovaEnabled: e.target.checked })
                  }}
                  className="size-4"
                />
                Preset-Knopf ruft NovaStar-Preset ab
              </label>
              {novaEnabled && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted-foreground">
                      IP-Adresse des Prozessors
                    </span>
                    <Input
                      value={novaHost}
                      placeholder="z. B. 192.168.0.10"
                      spellCheck={false}
                      className="h-8 font-mono text-xs"
                      onChange={(e) => {
                        setNovaHost(e.target.value)
                        void persistPlayer({ trailerNovaHost: e.target.value })
                      }}
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    {presets.map((p, i) => (
                      <label key={i} className="flex flex-1 flex-col gap-1 text-xs">
                        <span className="truncate text-muted-foreground" title={p.name}>
                          {p.name}
                        </span>
                        <NumberField
                          value={novaPresets[i] ?? i + 1}
                          min={1}
                          max={26}
                          className="h-8"
                          onCommit={(v) => {
                            const next = [...novaPresets]
                            next[i] = v
                            setNovaPresets(next)
                            void persistPlayer({ trailerNovaPresets: next })
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    NovaStar-Preset-Nummer je Format (am Prozessor gespeicherte Szene).
                  </p>
                </>
              )}
            </div>
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

          {/* LED-Trailer: Format links (Presets untereinander), Laufschrift daneben. */}
          {presets.length > 0 && (
            <div
              className={cn(
                'grid gap-6',
                pstate.ticker.enabled && 'xl:grid-cols-[minmax(260px,340px)_1fr]'
              )}
            >
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">Format</h2>
                  {novaMsg && <span className="text-xs text-muted-foreground">{novaMsg}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  {presets.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => void activatePreset(i)}
                      aria-pressed={i === activePreset}
                      className={cn(
                        'rounded-lg border px-4 py-3 text-left transition-colors',
                        i === activePreset
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/40'
                      )}
                    >
                      <div className="text-base font-semibold">{p.name}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {p.width} × {p.height}
                        {p.ticker ? ' · mit Laufschrift' : ''}
                      </div>
                    </button>
                  ))}
                </div>
                {convActive > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Medien werden auf das Format angepasst … ({convActive} in Arbeit)
                  </p>
                )}
              </Card>

              {/* Laufschrift: nur sichtbar, wenn das aktive Format eine hat. Text,
                  Tempo und Gestaltung an einem Ort -- kein Wechsel in die Einrichtung. */}
              {pstate.ticker.enabled && (
                <Card className="min-w-0 p-4">
                  <h2 className="mb-3 font-medium">Laufschrift</h2>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <label className="min-w-0 flex-1">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        Text – mit Enter übernehmen
                      </span>
                      <Input
                        ref={tickerDraft.ref}
                        value={tickerDraft.text}
                        onChange={(e) => tickerDraft.setText(e.target.value)}
                        onBlur={commitTickerText}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            commitTickerText()
                            ;(e.target as HTMLInputElement).blur()
                          }
                        }}
                        placeholder="Text der Laufschrift …"
                        className="h-11 text-base"
                      />
                    </label>
                    <div className="flex w-full items-end gap-2 lg:w-72">
                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-xs text-muted-foreground">
                          Tempo (px/s)
                        </span>
                        <input
                          type="range"
                          min={20}
                          max={400}
                          step={5}
                          value={speedDraft ?? pstate.ticker.speed}
                          onChange={(e) => setSpeedDraft(Number(e.target.value))}
                          onPointerUp={() => {
                            if (speedDraft != null) {
                              void cmd({ type: 'setTicker', patch: { speed: speedDraft } })
                              setSpeedDraft(null)
                            }
                          }}
                          aria-label="Tempo der Laufschrift"
                          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))]"
                          style={{ marginBottom: 12 }}
                        />
                      </label>
                      <NumberField
                        value={speedDraft ?? pstate.ticker.speed}
                        min={10}
                        max={1000}
                        className="h-9 w-20 shrink-0"
                        aria-label="Tempo (px/s) als Zahl"
                        onCommit={(v) => void cmd({ type: 'setTicker', patch: { speed: v } })}
                      />
                    </div>
                  </div>

                  {/* Gestaltung: Höhe, Farben, Logo -- direkt beim Textfeld. */}
                  <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-border pt-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        Höhe (px, Modulreihe)
                      </span>
                      <NumberField
                        value={pstate.ticker.heightPx}
                        min={8}
                        max={1024}
                        className="h-9 w-24"
                        onCommit={(v) => void cmd({ type: 'setTicker', patch: { heightPx: v } })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-muted-foreground">Schrift</span>
                      <input
                        type="color"
                        value={pstate.ticker.color}
                        onChange={(e) =>
                          void cmd({ type: 'setTicker', patch: { color: e.target.value } })
                        }
                        className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-muted-foreground">Hintergrund</span>
                      <input
                        type="color"
                        value={pstate.ticker.bg}
                        onChange={(e) =>
                          void cmd({ type: 'setTicker', patch: { bg: e.target.value } })
                        }
                        className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                      />
                    </label>
                    <label className="block w-52">
                      <span className="mb-1 block text-xs text-muted-foreground">Schriftart</span>
                      <select
                        value={pstate.ticker.fontFamily}
                        onChange={(e) =>
                          void cmd({ type: 'setTicker', patch: { fontFamily: e.target.value } })
                        }
                        className={selectClass}
                        style={{ fontFamily: pstate.ticker.fontFamily || undefined }}
                      >
                        {TICKER_FONTS.map((f) => (
                          <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="block">
                      <span className="mb-1 block text-xs text-muted-foreground">Logo</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() => void pickTickerLogo()}
                        >
                          <ImageIcon className="size-3.5" /> wählen…
                        </Button>
                        {pstate.ticker.logoUrl && (
                          <>
                            <img
                              src={pstate.ticker.logoUrl}
                              alt=""
                              className="h-9 w-auto rounded border border-border bg-black/40 p-0.5"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              title="Logo entfernen"
                              onClick={() =>
                                void cmd({ type: 'setTicker', patch: { logoUrl: null } })
                              }
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {pstate.ticker.logoUrl && (
                      <label className="block w-56">
                        <span className="mb-1 block text-xs text-muted-foreground">
                          Logo-Verhalten
                        </span>
                        <select
                          value={pstate.ticker.logoMode}
                          onChange={(e) =>
                            void cmd({
                              type: 'setTicker',
                              patch: { logoMode: e.target.value as 'fixed' | 'scroll' }
                            })
                          }
                          className={selectClass}
                        >
                          <option value="scroll">läuft mit dem Text mit</option>
                          <option value="fixed">steht links fest</option>
                        </select>
                      </label>
                    )}
                  </div>

                  {/* Stil-Vorlagen: Gestaltung benannt ablegen und abrufen. Die
                      Gestaltung selbst hängt am aktiven Preset -- eine Vorlage
                      anzuwenden schreibt sie dorthin. */}
                  <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-border pt-3">
                    <label className="block w-64">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        Stil-Vorlage abrufen
                      </span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={styleSel}
                          onChange={(e) => applyTickerStyle(e.target.value)}
                          className={selectClass}
                          disabled={tickerStyles.length === 0}
                        >
                          <option value="">
                            {tickerStyles.length === 0 ? 'keine gespeichert' : 'Vorlage wählen…'}
                          </option>
                          {tickerStyles.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0"
                          title="Gewählte Vorlage löschen"
                          disabled={!styleSel}
                          onClick={() => void deleteTickerStyle()}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </label>
                    <label className="block w-72">
                      <span className="mb-1 block text-xs text-muted-foreground">
                        Aktuelle Gestaltung als Vorlage speichern
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={styleName}
                          placeholder="Name der Vorlage…"
                          className="h-9"
                          onChange={(e) => setStyleName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveTickerStyle()
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 shrink-0"
                          disabled={!styleName.trim()}
                          onClick={() => void saveTickerStyle()}
                        >
                          <Save className="size-3.5" /> Speichern
                        </Button>
                      </div>
                    </label>
                  </div>
                </Card>
              )}
            </div>
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
                    {staleItems.length} Medium/Medien ≠ Ziel-Auflösung ({contentW}×{contentH}).
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
                      Konvertierung auf {contentW}×{contentH}.
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
                            void api.player.reconvert(
                              [m.id],
                              { width: contentW, height: contentH },
                              fit
                            )
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
                                { width: contentW, height: contentH },
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
                  className={selectClassCompact}
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
