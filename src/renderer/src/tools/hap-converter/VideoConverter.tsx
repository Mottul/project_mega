// Video-Konverter (früher HAP-Konverter): Clips für ein Zielsystem aufbereiten – HAP für
// Medienserver, H.264 für Player-Boxen, ProRes für QLab, WAV für die Tonabteilung. Was
// je Datei passiert (Drehung, Halbbilder, Bildrate, HDR, Größe …), entscheidet der
// gemeinsame Konvertierungs-Plan; hier steht er als Vorschau, ausgeführt wird im main
// (gemeinsame Warteschlange mit dem Player-Import).

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Cpu,
  FileCheck,
  FileSearch,
  Film,
  FolderOpen,
  FolderSearch,
  Loader2,
  Play,
  SlidersHorizontal,
  Target,
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
import { updateSettings, useSettings } from '@renderer/lib/settings'
import { cn } from '@renderer/lib/utils'
import { DEFAULT_LOUDNESS, LOUDNESS_CHOICES } from '@shared/loudness'
import { PROBE_EXTENSIONS, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import {
  CONVERT_FORMATS,
  planConversion,
  rateText,
  type ConvertPlan,
  type ConvertPlanResult
} from '@shared/convertPlan'
import type {
  ConvertCapabilities,
  ConvertFit,
  ConvertFormat,
  ConvertOptions,
  ConvertQuality,
  ConverterEncoderStatus,
  ConverterJob,
  HapCompressor,
  JobStatus
} from '@shared/types'
import { errorText, fmtBitrate, fmtDurationShort, hapRateEstimate } from '../media-info/format'
import { worstLevel } from '../media-info/hints'
import { LEVEL_META } from '../media-info/levels'
import {
  FIT_CHOICES,
  FORMAT_GROUPS,
  FPS_CHOICES,
  fpsChoice,
  fpsFromChoice,
  fpsFromShowRaster,
  SIZE_CHOICES,
  sizeChoice,
  sizeFromChoice,
  TARGETS,
  type ConverterTarget
} from './presets'
import { useConverterInputs, useConverterPrefs, useInputMeta, type InputMeta } from './store'
import { ENCODER_MODE_LABELS, encoderView, type EncoderMode } from './encoder'

// Sinnvolle Parallel-Stufen bis zur Kernzahl (ein einzelner HAP-Encode lastet die CPU
// nicht voll aus -> mehrere gleichzeitig nutzen die Kerne besser; x264/x265 schon).
const CORES = Math.max(1, Math.min(8, globalThis.navigator?.hardwareConcurrency ?? 4))
const CONCURRENCY_OPTIONS = [...new Set([1, 2, 4, 6, CORES])]
  .filter((n) => n >= 1 && n <= 8)
  .sort((a, b) => a - b)

const STATUS_META: Record<JobStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: 'Warteschlange', tone: 'neutral' },
  probing: { label: 'Analyse', tone: 'info' },
  running: { label: 'Konvertiert', tone: 'info' },
  done: { label: 'Fertig', tone: 'success' },
  error: { label: 'Fehler', tone: 'danger' },
  canceled: { label: 'Abgebrochen', tone: 'warning' }
}

const QUALITY_OPTIONS: { value: ConvertQuality; label: string }[] = [
  { value: 'high', label: 'Hoch (größere Dateien)' },
  { value: 'standard', label: 'Standard' },
  { value: 'small', label: 'Klein (sichtbar weicher)' }
]

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/** Liegt `p` in Ordner `dir` (oder darunter)? Beide Trenner, da Pfade vom OS kommen. */
function isInside(p: string, dir: string): boolean {
  const d = dir.replace(/[\\/]+$/, '')
  return p.startsWith(`${d}/`) || p.startsWith(`${d}\\`)
}

function audioText(plan: ConvertPlan): string {
  const a = plan.audio
  if (!a) return 'ohne Ton'
  if (a.codec === 'copy') return 'Ton unverändert'
  return `${a.codec === 'aac' ? 'AAC' : 'PCM'}${a.channels === 2 ? ' Stereo' : ''}`
}

export function VideoConverter(): JSX.Element {
  const navigate = useNavigate()
  // Kundenansicht: keine Sprünge in andere (ungesperrte) Tools anbieten
  const locked = useKiosk()
  const inputs = useConverterInputs((s) => s.inputs)
  const meta = useInputMeta((s) => s.meta)
  const target = useConverterPrefs((s) => s.target)
  const options = useConverterPrefs((s) => s.options)
  const concurrency = useConverterPrefs((s) => s.concurrency)
  const [caps, setCaps] = useState<ConvertCapabilities | null>(null)
  const [encoders, setEncoders] = useState<ConverterEncoderStatus | null>(null)
  // Maschinen-Einstellung (settings.json), kein Teil der Zielsystem-Vorgaben
  const encoderMode: EncoderMode =
    useSettings((s) => s.converter.encoder) === 'cpu' ? 'cpu' : 'auto'
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Record<string, ConverterJob>>({})
  const [dragOver, setDragOver] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // Einreihen kann bei großen Ordnern/Netzlaufwerken dauern -> kein Doppelklick-Doppelstart
  const [starting, setStarting] = useState(false)

  const setOpt = (patch: Partial<ConvertOptions>, preset = false): void =>
    useConverterPrefs.getState().setOptions(patch, preset)

  // Eckdaten je Eingabe nachladen (Analyse der Medien-Info, Cache im main -> der
  // spätere Auftrag liest die Datei nicht erneut)
  useEffect(() => {
    for (const p of inputs) useInputMeta.getState().load(p)
  }, [inputs])

  useEffect(() => {
    // Übergabe aus der Medien-Info: Dateien + Prüfprofil (Zielsystem, Show-Raster)
    const handed = useHandoff.getState().takePaths('hap-converter')
    const profile = useHandoff.getState().takeConvertProfile()
    if (handed.length) useConverterInputs.getState().add(handed)
    void api.getSettings().then((s) => {
      setOutputDir(s.lastHapOutputDir)
      const prefs = useConverterPrefs.getState()
      // einmalig: zuletzt genutztes HAP-Format aus der Zeit vor dem Umbau übernehmen
      prefs.migrateFrom(s.lastHapFormat)
      if (profile) {
        const t = TARGETS.find((x) => x.value === profile.target)
        if (t && t.value !== 'custom') prefs.applyTarget(t.value)
        prefs.setOptions({ fps: fpsFromShowRaster(profile.raster) })
        setNote(`Vorgaben aus der Medien-Info übernommen: ${t?.label ?? 'Zielsystem'}.`)
      }
    })
    void api.converter.capabilities().then(setCaps)
    void api.converter.list().then((list) => {
      setJobs(Object.fromEntries(list.map((j) => [j.id, j])))
    })
    return api.converter.onUpdate((job) => {
      setJobs((prev) => ({ ...prev, [job.id]: job }))
    })
  }, [])

  function onDropInputs(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    if (paths.length) useConverterInputs.getState().add(paths)
  }

  async function addFiles(): Promise<void> {
    const paths = await api.selectPaths({
      title: 'Dateien auswählen',
      multi: true,
      filters: [
        { name: 'Videos', extensions: VIDEO_EXTENSIONS },
        { name: 'Medien', extensions: PROBE_EXTENSIONS },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    })
    if (paths.length) useConverterInputs.getState().add(paths)
  }

  async function addFolder(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ordner auswählen', directories: true })
    if (paths.length) useConverterInputs.getState().add(paths)
  }

  async function chooseOutput(): Promise<void> {
    const paths = await api.selectPaths({ title: 'Ausgabeordner', directories: true })
    if (paths.length) {
      setOutputDir(paths[0])
      void api.setSettings({ lastHapOutputDir: paths[0] })
    }
  }

  function showInMediaInfo(path: string): void {
    useHandoff.getState().givePaths('media-info', [path])
    navigate('/tool/media-info')
  }

  // Nach clearFinished neu syncen: der main löscht Aufträge, sendet dafür aber kein Update
  async function refreshJobs(): Promise<void> {
    const list = await api.converter.list()
    setJobs(Object.fromEntries(list.map((j) => [j.id, j])))
  }

  const fi = CONVERT_FORMATS[options.format]
  const encoderFamily =
    fi.family === 'h264' || fi.family === 'hevc' || fi.family === 'prores' ? fi.family : null
  const encoder = encoderFamily
    ? encoderView(encoders, encoderFamily, encoderMode, {
        compat: options.compat,
        keepAlpha: options.keepAlpha
      })
    : null

  // Encoder erst prüfen lassen, wenn ein Format sie braucht (der erste Aufruf macht im main
  // kurze Probeläufe je GPU-Encoder, danach kommt die Antwort aus dem Cache)
  const needsEncoders = encoderFamily !== null
  useEffect(() => {
    if (!needsEncoders) return
    let alive = true
    void api.converter.encoders().then((s) => {
      if (alive) setEncoders(s)
    })
    return () => {
      alive = false
    }
  }, [needsEncoders])

  const available = (f: ConvertFormat): boolean => !caps || caps.formats[f]
  const formatOk = available(options.format)
  const ffmpegMissing = caps !== null && !caps.ffmpegFound

  // Plan je Eingabedatei: dieselbe Funktion, die später im main die Argumente liefert
  const plans = useMemo(() => {
    const planCaps = { tonemap: caps?.tonemap ?? true, vpxAlpha: caps?.vpxAlpha ?? true }
    const m = new Map<string, ConvertPlanResult>()
    for (const p of inputs) {
      const mt = meta[p]
      if (mt?.kind === 'file' && mt.result.ok)
        m.set(p, planConversion(mt.result.info, options, planCaps))
    }
    return m
  }, [inputs, meta, options, caps])

  // Sammelzeile über dem Start: Warnungen/Probleme aller Eingaben, Probleme zuerst
  const summary = useMemo(() => {
    const counts = new Map<string, { title: string; n: number; level: 'problem' | 'warning' }>()
    const add = (key: string, title: string, level: 'problem' | 'warning'): void => {
      const c = counts.get(key) ?? { title, n: 0, level }
      c.n++
      counts.set(key, c)
    }
    for (const r of plans.values()) {
      if (!r.ok) add(`err:${r.error}`, r.error, 'problem')
      else for (const i of r.plan.issues) if (i.level !== 'info') add(i.id, i.title, i.level)
    }
    return [...counts.values()].sort(
      (a, b) => Number(b.level === 'problem') - Number(a.level === 'problem')
    )
  }, [plans])
  const summaryLevel = summary.some((c) => c.level === 'problem') ? 'problem' : 'warning'

  // Ordner (rekursiv gezählt) und darin liegende Dateien/Unterordner nur einmal zählen –
  // die Auftragsliste im main entfernt solche Dubletten ebenfalls.
  const folders = inputs.filter((p) => meta[p]?.kind === 'folder')
  const fileCount = inputs.reduce((sum, p) => {
    if (folders.some((f) => f !== p && isInside(p, f))) return sum
    const mt = meta[p]
    return sum + (mt?.kind === 'folder' ? mt.videos : 1)
  }, 0)

  const jobList = useMemo(
    () => Object.values(jobs).sort((a, b) => a.createdAt - b.createdAt),
    [jobs]
  )
  const finished = (j: ConverterJob): boolean =>
    j.status === 'done' || j.status === 'error' || j.status === 'canceled'
  const doneCount = jobList.filter((j) => j.status === 'done').length
  const settledCount = jobList.filter(finished).length
  const activeCount = jobList.length - settledCount

  async function start(): Promise<void> {
    if (!inputs.length || starting || !formatOk) return
    const expected = fileCount
    setStarting(true)
    try {
      const res = await api.converter.enqueue({ inputs, options, outputDir, concurrency })
      useConverterInputs.getState().clear()
      if (!res.jobIds.length) setNote('Keine passenden Dateien gefunden – nichts eingereiht.')
      else if (res.jobIds.length < expected) {
        setNote(
          `${res.jobIds.length} von ${expected} erwarteten Dateien eingereiht – die übrigen waren nicht mehr auffindbar (verschoben oder Laufwerk getrennt?).`
        )
      } else setNote(null)
    } catch (e) {
      // Auswahl bleibt erhalten -> nach Behebung erneut starten
      setNote(`Start fehlgeschlagen: ${errorText(e)}`)
    } finally {
      setStarting(false)
    }
  }

  const targetHint = TARGETS.find((t) => t.value === target)?.hint
  const videoFormat = fi.family !== 'audio'
  const size = options.size

  return (
    <ToolShell
      id="hap-converter"
      aside={
        <>
          <PanelSection id="target" title="Zielsystem" icon={Target}>
            <select
              // ohne Label-Flexbox hätte das Select die Breite der längsten Option
              className={cn(selectClass, 'w-full')}
              value={target}
              aria-label="Zielsystem"
              onChange={(e) =>
                useConverterPrefs.getState().applyTarget(e.target.value as ConverterTarget)
              }
            >
              {TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {targetHint && <span className="text-xs text-muted-foreground">{targetHint}</span>}
          </PanelSection>

          <PanelSection id="format" title="Format & Qualität" icon={Film}>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Format</span>
              <select
                className={selectClass}
                value={options.format}
                onChange={(e) => setOpt({ format: e.target.value as ConvertFormat }, true)}
              >
                {FORMAT_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o.value} value={o.value} disabled={!available(o.value)}>
                        {o.label}
                        {available(o.value) ? '' : ' – nicht verfügbar'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {(fi.family === 'h264' || fi.family === 'hevc') && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Qualität</span>
                <select
                  className={selectClass}
                  value={options.quality}
                  onChange={(e) => setOpt({ quality: e.target.value as ConvertQuality }, true)}
                >
                  {QUALITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {fi.family === 'h264' && (
              <Checkbox
                checked={options.compat}
                onChange={(v) => setOpt({ compat: v }, true)}
                label="Für Player-Boxen und TVs"
                hint="Festes H.264-Level (4.2 bis 1080p60) und Bitraten-Deckel – sonst lehnen manche Player die Datei ab oder ruckeln."
              />
            )}
            {(fi.family === 'hap' || fi.family === 'prores') && (
              <Checkbox
                checked={options.keepAlpha}
                onChange={(v) => setOpt({ keepAlpha: v }, true)}
                label="Transparenz erhalten"
                hint="Clips mit Alpha-Kanal werden automatisch HAP Alpha bzw. ProRes 4444."
              />
            )}
            {fi.family === 'hap' && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Kompressor</span>
                  <select
                    className={selectClass}
                    value={options.hapCompressor}
                    onChange={(e) => setOpt({ hapCompressor: e.target.value as HapCompressor })}
                  >
                    <option value="snappy">Snappy (kleinere Dateien, Standard)</option>
                    <option value="none">Keiner (schneller, größere Dateien)</option>
                  </select>
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Chunks</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={options.hapChunks.kind === 'auto'}
                        onChange={(e) =>
                          setOpt({
                            hapChunks: e.target.checked
                              ? { kind: 'auto' }
                              : { kind: 'manual', value: 4 }
                          })
                        }
                        className="size-4 accent-[hsl(var(--primary))]"
                      />
                      Automatisch
                    </label>
                    {options.hapChunks.kind === 'manual' && (
                      <NumberField
                        value={options.hapChunks.value}
                        min={1}
                        max={64}
                        className="w-24"
                        aria-label="Chunks"
                        onCommit={(v) => setOpt({ hapChunks: { kind: 'manual', value: v } })}
                      />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    HAP wird immer auf der CPU kodiert (einen GPU-Encoder gibt es nicht) – dafür
                    dekodiert beim Abspielen die Grafikkarte.
                  </span>
                </div>
              </>
            )}
          </PanelSection>

          <PanelSection
            id="picture"
            title={videoFormat ? 'Bild & Ton' : 'Ton'}
            icon={SlidersHorizontal}
          >
            {videoFormat && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Auflösung</span>
                  <select
                    className={selectClass}
                    value={sizeChoice(size)}
                    onChange={(e) => setOpt({ size: sizeFromChoice(e.target.value, size) }, true)}
                  >
                    {SIZE_CHOICES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {size.mode === 'exact' && (
                  <>
                    <div className="flex items-center gap-2">
                      <NumberField
                        value={size.width}
                        min={16}
                        max={16384}
                        className="w-24"
                        aria-label="Breite"
                        onCommit={(v) => setOpt({ size: { ...size, width: v } }, true)}
                      />
                      <span className="text-muted-foreground">×</span>
                      <NumberField
                        value={size.height}
                        min={16}
                        max={16384}
                        className="w-24"
                        aria-label="Höhe"
                        onCommit={(v) => setOpt({ size: { ...size, height: v } }, true)}
                      />
                      <span className="text-xs text-muted-foreground">px</span>
                    </div>
                    <select
                      className={cn(selectClass, 'w-full')}
                      value={size.fit}
                      aria-label="Einpassen"
                      onChange={(e) =>
                        setOpt({ size: { ...size, fit: e.target.value as ConvertFit } }, true)
                      }
                    >
                      {FIT_CHOICES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Bildrate</span>
                  <select
                    className={selectClass}
                    value={fpsChoice(options.fps)}
                    onChange={(e) => setOpt({ fps: fpsFromChoice(e.target.value) })}
                  >
                    {FPS_CHOICES.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <span className="text-xs text-muted-foreground">
                    Show-Raster: Clips mit passender Rate bleiben, andere werden angepasst – 29,97 ↔
                    30 und 23,976 ↔ 24 per minimaler Tempo-Änderung statt Bildsprung.
                  </span>
                </label>
                <Checkbox
                  checked={options.deinterlace}
                  onChange={(v) => setOpt({ deinterlace: v })}
                  label="Interlaced in Vollbilder wandeln"
                  hint="Erkannte Halbbilder werden zu doppelter Bildrate (25i → 50p) – ohne Kammeffekte auf LED-Wand und Beamer."
                />
                <Checkbox
                  checked={options.toSdr && caps?.tonemap !== false}
                  disabled={caps?.tonemap === false}
                  onChange={(v) => setOpt({ toSdr: v })}
                  label="HDR in SDR umrechnen"
                  hint={
                    caps?.tonemap === false
                      ? 'Das gebündelte ffmpeg kann kein HDR → SDR (zscale/tonemap fehlen).'
                      : 'HDR-Clips (z.B. vom iPhone) wirken auf SDR-Ausgaben sonst flau.'
                  }
                />
              </>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Ton</span>
              <select
                className={selectClass}
                value={options.audio}
                onChange={(e) => setOpt({ audio: e.target.value as ConvertOptions['audio'] }, true)}
              >
                <option value="auto">
                  {fi.family === 'h264' || fi.family === 'hevc'
                    ? 'AAC 48 kHz (Kanäle wie Quelle)'
                    : 'PCM 48 kHz (Kanäle wie Quelle)'}
                </option>
                <option value="stereo">Stereo (Downmix) 48 kHz</option>
                {videoFormat && <option value="none">Ohne Ton</option>}
              </select>
            </label>
            {options.audio !== 'none' && (
              <>
                <Checkbox
                  checked={Boolean(options.loudnorm)}
                  onChange={(v) => setOpt({ loudnorm: v ? DEFAULT_LOUDNESS : null })}
                  label="Lautheit angleichen (EBU R128)"
                  hint="Erst messen, dann gleichmäßig verstärken – die Dynamik bleibt erhalten, nur übersteuernde Spitzen werden begrenzt."
                />
                {options.loudnorm && (
                  <label className="flex items-center justify-between gap-2 pl-6">
                    <span className="text-xs text-muted-foreground">Ziel-Lautheit</span>
                    <select
                      className={cn(selectClass, 'h-8 w-auto')}
                      value={options.loudnorm.i}
                      onChange={(e) =>
                        setOpt({
                          loudnorm: {
                            ...(options.loudnorm ?? DEFAULT_LOUDNESS),
                            i: Number(e.target.value)
                          }
                        })
                      }
                    >
                      {LOUDNESS_CHOICES.map((c) => (
                        <option key={c.i} value={c.i}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {videoFormat && (
              <span className="text-xs text-muted-foreground">
                Drehung, Spiegelung und anamorphe Pixel werden immer fest eingerechnet.
              </span>
            )}
          </PanelSection>

          <PanelSection
            id="proc"
            title="Verarbeitung"
            icon={Cpu}
            right={
              encoder?.encoder?.hardware ? (
                <Badge tone="success">{encoderFamily === 'prores' ? 'Hardware' : 'GPU'}</Badge>
              ) : undefined
            }
          >
            {/* Rechner-Einstellung: in der Kundenansicht verborgen (wie beim Video-Player) */}
            {encoderFamily && encoder && !locked && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Encoder</span>
                <select
                  className={selectClass}
                  value={encoderMode}
                  onChange={(e) =>
                    updateSettings({ converter: { encoder: e.target.value as EncoderMode } })
                  }
                >
                  <option value="auto">{ENCODER_MODE_LABELS[encoderFamily].auto}</option>
                  <option value="cpu">{ENCODER_MODE_LABELS[encoderFamily].cpu}</option>
                </select>
                <span className="text-xs text-muted-foreground">{encoder.hint}</span>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Gleichzeitige Konvertierungen</span>
              <select
                className={selectClass}
                value={concurrency}
                onChange={(e) =>
                  useConverterPrefs.getState().setConcurrency(Number(e.target.value))
                }
              >
                {CONCURRENCY_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1 (nacheinander)' : `${n} parallel`}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Mehr parallel lohnt vor allem bei HAP (bis {CORES} Kerne). Player-Importe haben eine
                eigene Spur und warten nie auf diese Liste.
              </span>
            </label>
          </PanelSection>

          <PanelSection id="output" title="Ausgabeordner" icon={FolderOpen}>
            <span
              className="block truncate rounded-md border border-border bg-input/40 px-3 py-1.5 text-sm text-muted-foreground"
              title={outputDir ?? undefined}
            >
              {outputDir ?? 'Neben der Quelldatei'}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void chooseOutput()}>
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
            <span className="text-xs text-muted-foreground">
              Vorhandene Dateien werden nie überschrieben (dann „…_2").
            </span>
          </PanelSection>
        </>
      }
      main={
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {(ffmpegMissing || !formatOk) && (
            <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400 light:text-amber-700" />
              <div className="text-sm">
                <p className="font-medium text-amber-400 light:text-amber-700">
                  {ffmpegMissing ? 'ffmpeg nicht gefunden' : `${fi.label} nicht verfügbar`}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {ffmpegMissing
                    ? 'Im Dev-Modus über scripts/download-ffmpeg.mjs bereitstellen oder ein ffmpeg im PATH installieren.'
                    : fi.family === 'hap'
                      ? 'Das gebündelte ffmpeg kennt den HAP-Encoder nicht (libsnappy fehlt). Bitte ein HAP-fähiges ffmpeg über das Download-Skript bereitstellen.'
                      : 'Das gebündelte ffmpeg enthält den nötigen Encoder nicht – anderes Format wählen.'}
                  {caps?.error ? ` (${caps.error})` : ''}
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
            className={cn(
              'space-y-4 p-5 transition-colors',
              dragOver && 'border-primary bg-primary/5'
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => void addFiles()}>
                <FolderSearch className="size-4" /> Dateien hinzufügen
              </Button>
              <Button variant="secondary" onClick={() => void addFolder()}>
                <FolderOpen className="size-4" /> Ordner hinzufügen
              </Button>
              <div className="flex-1" />
              <Button
                onClick={() => void start()}
                disabled={!inputs.length || starting || !formatOk || ffmpegMissing}
              >
                {starting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Konvertieren
                {inputs.length > 0 ? ` (${fileCount})` : ''}
              </Button>
            </div>

            {inputs.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Dateien oder Ordner hierher ziehen – oder oben hinzufügen. Ziel:{' '}
                <span className="text-foreground">{fi.label}</span>
              </p>
            )}

            {inputs.length > 0 && (
              <div className="space-y-1">
                {inputs.map((p) => (
                  <InputRow
                    key={p}
                    path={p}
                    meta={meta[p]}
                    plan={plans.get(p) ?? null}
                    onInfo={locked ? null : () => showInMediaInfo(p)}
                    onRemove={() => useConverterInputs.getState().remove(p)}
                  />
                ))}
              </div>
            )}

            {summary.length > 0 && (
              <div
                className={cn(
                  'space-y-1 rounded-md border px-3 py-2 text-xs',
                  summaryLevel === 'problem'
                    ? 'border-red-500/40 bg-red-500/10'
                    : 'border-amber-500/40 bg-amber-500/10'
                )}
              >
                {summary.map((c) => {
                  const lm = LEVEL_META[c.level]
                  const Icon = lm.icon
                  return (
                    <p key={c.title} className="flex items-center gap-1.5">
                      <Icon className={cn('size-3.5 shrink-0', lm.className)} aria-hidden />
                      <span className="sr-only">{lm.label}:</span>
                      {c.n === 1 ? '1 Datei' : `${c.n} Dateien`}: {c.title}
                    </p>
                  )
                })}
              </div>
            )}
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
          </Card>

          {/* Aufträge */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-medium">Warteschlange</h2>
                <p className="text-sm text-muted-foreground">
                  {jobList.length} {jobList.length === 1 ? 'Auftrag' : 'Aufträge'} · {doneCount}{' '}
                  fertig · {activeCount} aktiv
                </p>
              </div>
              <div className="flex gap-2">
                {settledCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void api.converter.clearFinished().then(refreshJobs)}
                  >
                    <Trash2 className="size-4" /> Erledigte entfernen
                  </Button>
                )}
                {activeCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void api.converter.cancelAll()}
                  >
                    <XCircle className="size-4" /> Alle abbrechen
                  </Button>
                )}
              </div>
            </div>

            {jobList.length > 0 && (
              <Progress value={settledCount / jobList.length} className="mb-4" />
            )}

            {jobList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Noch keine Aufträge. Dateien/Ordner hinzufügen und Konvertierung starten.
              </p>
            ) : (
              <div className="space-y-2">
                {jobList.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onInfo={locked ? null : () => showInMediaInfo(job.inputPath)}
                    onCheck={
                      locked || !job.outputPath
                        ? null
                        : () => showInMediaInfo(job.outputPath as string)
                    }
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

function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <label className={cn('flex items-start gap-2 text-sm', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

function JobRow({
  job,
  onInfo,
  onCheck
}: {
  job: ConverterJob
  onInfo: (() => void) | null
  onCheck: (() => void) | null
}): JSX.Element {
  const meta = STATUS_META[job.status]
  const canCancel = job.status === 'queued' || job.status === 'running' || job.status === 'probing'
  const facts = [
    job.formatLabel,
    job.width && job.height ? `${job.width}×${job.height}` : null,
    job.fps ? `${rateText(job.fps)} fps` : null,
    job.chunks ? `${job.chunks} Chunks` : null,
    job.encoder
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={job.inputPath}>
            {basename(job.inputPath)}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={job.outputPath ?? undefined}>
            {facts} · → {job.outputPath ? basename(job.outputPath) : '…'}
          </p>
          {job.steps.length > 0 && (
            <p className="truncate text-xs text-muted-foreground" title={job.steps.join('\n')}>
              {job.steps.join(' · ')}
            </p>
          )}
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {onInfo && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onInfo}
            aria-label="Quelle in Medien-Info"
            title="Quelle in Medien-Info"
          >
            <FileSearch className="size-4" />
          </Button>
        )}
        {canCancel && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void api.converter.cancel(job.id)}
            aria-label="Abbrechen"
            title="Abbrechen"
          >
            <X className="size-4" />
          </Button>
        )}
        {job.status === 'done' && job.outputPath && (
          <>
            {onCheck && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCheck}
                aria-label="Ergebnis in Medien-Info prüfen"
                title="Ergebnis in Medien-Info prüfen"
              >
                <FileCheck className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void api.showItemInFolder(job.outputPath as string)}
              aria-label="Im Ordner zeigen"
              title="Im Ordner zeigen"
            >
              <FolderOpen className="size-4" />
            </Button>
          </>
        )}
      </div>
      {(job.status === 'running' || job.status === 'probing') && (
        // Analyse ohne Fortschritt; die Lautheitsmessung darin meldet ihren eigenen
        <Progress
          value={job.progress}
          indeterminate={job.status === 'probing' && job.progress === 0}
          className="mt-2"
        />
      )}
      {job.status === 'error' && job.error && (
        <p className="mt-2 text-xs text-destructive">{job.error}</p>
      )}
    </div>
  )
}

// Eingabezeile: Eckdaten der Quelle und – aus dem Plan – was daraus wird; Ordner zeigen
// die Anzahl gefundener Videos.
function InputRow({
  path,
  meta,
  plan,
  onInfo,
  onRemove
}: {
  path: string
  meta: InputMeta | undefined
  plan: ConvertPlanResult | null
  onInfo: (() => void) | null
  onRemove: () => void
}): JSX.Element {
  let source: JSX.Element | string
  let result: JSX.Element | string | null = null
  let steps: string[] = []
  let issues: ConvertPlan['issues'] = []
  if (!meta || meta.kind === 'loading') {
    source = (
      <span className="flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> analysiere …
      </span>
    )
  } else if (meta.kind === 'folder') {
    source = (
      <Badge tone={meta.videos ? 'neutral' : 'warning'}>
        Ordner · {meta.videos === 1 ? '1 Video' : `${meta.videos} Videos`}
      </Badge>
    )
  } else if (meta.kind === 'error') {
    source = <span className="text-red-400 light:text-red-600">{meta.message}</span>
  } else if (!meta.result.ok) {
    source = <span className="text-red-400 light:text-red-600">{meta.result.error}</span>
  } else {
    const info = meta.result.info
    const v = info.video[0]
    source = [
      v ? `${v.displayWidth}×${v.displayHeight}` : 'kein Video',
      v?.fps ? `${rateText(v.fps)} fps${v.scan === 'tff' || v.scan === 'bff' ? ' i' : ''}` : null,
      v?.codec ?? info.audio[0]?.codec ?? null,
      info.durationSec ? fmtDurationShort(info.durationSec) : null
    ]
      .filter(Boolean)
      .join(' · ')
    if (plan && !plan.ok) {
      result = <span className="text-red-400 light:text-red-600">{plan.error}</span>
    } else if (plan?.ok) {
      const p = plan.plan
      const pv = p.video
      const hapRate =
        pv && p.formatInfo.family === 'hap'
          ? hapRateEstimate(pv.width, pv.height, pv.fps, p.format as 'hap' | 'hap_alpha' | 'hap_q')
          : null
      result = [
        pv ? `${pv.width}×${pv.height}` : null,
        pv?.fps ? `${rateText(pv.fps)} fps` : null,
        p.formatInfo.label,
        audioText(p),
        // Obergrenze vor Snappy-Kompression (je nach Bildinhalt deutlich weniger)
        hapRate ? `≤ ${fmtBitrate(hapRate)}` : null
      ]
        .filter(Boolean)
        .join(' · ')
      steps = p.steps
      issues = p.issues
    }
  }
  const shown = issues.filter((i) => i.level !== 'info')
  const worst = worstLevel(shown)
  return (
    <div className="rounded-md bg-muted/40 px-3 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate" title={path}>
            {basename(path)}
          </p>
          <div className="truncate text-xs text-muted-foreground">{source}</div>
          {result && <div className="truncate text-xs">→ {result}</div>}
          {steps.length > 0 && (
            <div className="truncate text-xs text-muted-foreground" title={steps.join('\n')}>
              {steps.join(' · ')}
            </div>
          )}
        </div>
        {shown.length > 0 && (
          <span title={shown.map((h) => `${h.title}: ${h.text}`).join('\n')}>
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
          title="Entfernen"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
