import { useEffect, useState } from 'react'
import {
  Bookmark,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  MonitorPlay,
  MonitorX,
  Ratio
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { Progress } from '@renderer/components/ui/progress'
import { selectClass } from '@renderer/components/ui/select'
import { PanelSection, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { cn } from '@renderer/lib/utils'
import { api } from '@renderer/lib/api'
import {
  DEFAULT_PATTERN_CONFIG,
  type DisplayInfo,
  type PatternConfig,
  type PatternPreset,
  type PatternVideoFormat
} from '@shared/types'
import { PATTERN_OPTIONS, SOLID_OPTIONS, moduleCells, renderToCanvas } from './patterns'
import { PatternPreview } from './PatternPreview'
import { MappingSettings } from './MappingSettings'

const RES_PRESETS = [
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '2560 × 1440', w: 2560, h: 1440 },
  { label: '3840 × 2160 (4K)', w: 3840, h: 2160 }
]

const LOOP_COLOR_OPTIONS = [
  { hex: '#ffffff', label: 'Weiß' },
  { hex: '#ff0000', label: 'Rot' },
  { hex: '#00ff00', label: 'Grün' },
  { hex: '#0000ff', label: 'Blau' },
  { hex: '#000000', label: 'Schwarz' },
  { hex: '#808080', label: 'Grau' }
]

// Modulanzahl hübsch: ganze Zahl als solche, sonst mit deutschem Dezimalkomma
// (z. B. 4,5 bei ×0.5 von 16:9) – passend zu den Teilzellen am Rand.
function fmtCells(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}

async function renderPngBytes(cfg: PatternConfig): Promise<Uint8Array> {
  const canvas = renderToCanvas(cfg)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('PNG-Erzeugung fehlgeschlagen')
  return new Uint8Array(await blob.arrayBuffer())
}

export function TestPatterns(): JSX.Element {
  const [config, setConfig] = useState<PatternConfig>(DEFAULT_PATTERN_CONFIG)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [displayId, setDisplayId] = useState<number | null>(null)
  const [outputOpen, setOutputOpen] = useState(false)
  // Nur das Fenster, das die Ausgabe geöffnet hat, spiegelt seine Änderungen hinein – sonst
  // schöbe ein zweites Testbild-Fenster beim „Ausgabe offen“-Broadcast seine eigene Einstellung
  // auf die Wand.
  const [ownsOutput, setOwnsOutput] = useState(false)

  const [vidFormat, setVidFormat] = useState<PatternVideoFormat>('mp4')
  const [vidSeconds, setVidSeconds] = useState(10)
  const [vidFps, setVidFps] = useState(30)
  const [busy, setBusy] = useState<null | string>(null)
  const [videoProgress, setVideoProgress] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [presets, setPresets] = useState<PatternPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')

  // Monitore + Presets laden; bevorzugt einen nicht-primaeren (Beamer/Wand) vorauswaehlen
  useEffect(() => {
    void api.screen.list().then((list) => {
      setDisplays(list)
      const target = list.find((d) => !d.primary) ?? list[0]
      setDisplayId(target?.id ?? null)
    })
    void api.getSettings().then((s) => setPresets(s.patternPresets ?? []))
    // Presets aus einem anderen Testbild-Fenster übernehmen (sonst überschriebe dieses sie)
    const offSettings = api.onSettingsChanged((s) => setPresets(s.patternPresets ?? []))
    // nur Fortschritt; Endzustand (Erfolg/Abbruch/Fehler) regelt der Export ueber
    // das Promise-Ergebnis (sonst bleibt der Button nach Dialog-Abbruch haengen).
    const offProgress = api.patterns.onVideoProgress((p) => {
      if (!p.done) setVideoProgress(p.progress)
    })
    return () => {
      offSettings()
      offProgress()
    }
  }, [])

  // Ausgabefenster offen/zu: der main meldet es (auch nach Esc im Ausgabefenster oder wenn ein
  // anderes Fenster es öffnet) -> die Ausgabe-Leiste zeigt „Live“ verlässlich.
  useEffect(() => {
    void api.patterns.isOpen().then(setOutputOpen)
    return api.patterns.onOutputChanged((open) => {
      setOutputOpen(open)
      if (!open) setOwnsOutput(false)
    })
  }, [])

  // Aenderungen live ins offene Ausgabefenster spiegeln
  useEffect(() => {
    if (outputOpen && ownsOutput) void api.patterns.update(config)
  }, [config, outputOpen, ownsOutput])

  function patch(p: Partial<PatternConfig>): void {
    setConfig((prev) => ({ ...prev, ...p }))
  }

  async function persistPresets(next: PatternPreset[]): Promise<void> {
    setPresets(next)
    await api.setSettings({ patternPresets: next })
  }

  function savePreset(): void {
    const name = presetName.trim()
    if (!name) return
    const next = [...presets.filter((p) => p.name !== name), { name, config }].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    void persistPresets(next)
    setSelectedPreset(name)
    setPresetName('')
  }

  function applyPreset(name: string): void {
    setSelectedPreset(name)
    const p = presets.find((x) => x.name === name)
    // Mit Standardwerten auffüllen: ältere Presets kennen neuere Felder noch nicht.
    if (p) setConfig({ ...DEFAULT_PATTERN_CONFIG, ...p.config })
  }

  function deletePreset(): void {
    if (!selectedPreset) return
    void persistPresets(presets.filter((p) => p.name !== selectedPreset))
    setSelectedPreset('')
  }

  function setRes(w: number, h: number): void {
    patch({ width: Math.max(16, w), height: Math.max(16, h) })
  }

  function fromMonitor(): void {
    const d = displays.find((x) => x.id === displayId)
    if (d) setRes(Math.round(d.width * d.scaleFactor), Math.round(d.height * d.scaleFactor))
  }

  async function showFullscreen(): Promise<void> {
    if (displayId == null) return
    await api.patterns.open(config, displayId)
    setOutputOpen(true)
    setOwnsOutput(true)
    setNote(null)
  }

  async function closeFullscreen(): Promise<void> {
    await api.patterns.close()
    setOutputOpen(false)
    setOwnsOutput(false)
  }

  async function savePng(): Promise<void> {
    setBusy('png')
    setNote(null)
    try {
      const bytes = await renderPngBytes(config)
      const name = `testbild_${config.pattern}_${config.width}x${config.height}.png`
      const path = await api.patterns.savePng(bytes, name)
      setNote(path ? `PNG gespeichert: ${path}` : null)
    } catch (e) {
      setNote(`PNG-Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  // Video exportieren: Farbzyklus -> Loop-Export, sonst Standbild-Loop. Endzustand
  // ueber das Promise-Ergebnis (Abbruch -> Button wird wieder frei).
  async function exportVideo(): Promise<void> {
    setBusy('video')
    setNote(null)
    setVideoProgress(0)
    try {
      let path: string | null
      if (config.pattern === 'colorcycle') {
        path = await api.patterns.exportColorLoop({
          width: config.width,
          height: config.height,
          colors: config.cycleColors,
          secondsPerColor: config.cycleSeconds,
          fps: vidFps,
          format: vidFormat
        })
      } else {
        const png = await renderPngBytes(config)
        path = await api.patterns.exportVideo({
          png,
          durationSec: vidSeconds,
          fps: vidFps,
          format: vidFormat
        })
      }
      setNote(path ? `Video gespeichert: ${path}` : 'Export abgebrochen')
    } catch (e) {
      setNote(`Video-Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
      setVideoProgress(null)
    }
  }

  function toggleCycleColor(hex: string): void {
    const has = config.cycleColors.includes(hex)
    const next = has
      ? config.cycleColors.filter((c) => c !== hex)
      : LOOP_COLOR_OPTIONS.filter((o) => o.hex === hex || config.cycleColors.includes(o.hex)).map(
          (o) => o.hex
        )
    patch({ cycleColors: next })
  }

  const isSolid = config.pattern === 'solid'
  const isCycle = config.pattern === 'colorcycle'
  const isScroll = config.pattern === 'scroll'
  const isMapping = config.pattern === 'mapping'
  const showScale = config.pattern === 'grid' || config.pattern === 'geometry'
  const mc = moduleCells(config.width, config.height)
  const gridCells = {
    x: mc.x * config.gridScale,
    y: mc.y * config.gridScale
  }

  return (
    <ToolShell
      id="test-patterns"
      bar={
        <ToolBar
          label="Ausgabe"
          active={outputOpen}
          status={
            <>
              <span className="max-w-[16rem] truncate font-medium">
                {PATTERN_OPTIONS.find((o) => o.value === config.pattern)?.label ?? config.pattern}
              </span>
              <span className="text-muted-foreground">
                {config.width} × {config.height}
              </span>
            </>
          }
        >
          <select
            className={cn(selectClass, 'h-8 w-64 max-w-full')}
            aria-label="Ausgabe-Monitor"
            value={displayId ?? ''}
            onChange={(e) => setDisplayId(Number(e.target.value))}
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          {outputOpen ? (
            <>
              <Button size="sm" variant="destructive" onClick={() => void closeFullscreen()}>
                <MonitorX className="size-4" /> Vollbild beenden
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void showFullscreen()}
                disabled={displayId == null}
                title="Testbild auf den gewählten Monitor legen"
              >
                Monitor wechseln
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => void showFullscreen()}
              disabled={displayId == null}
              title="Pixelgenau in der nativen Auflösung des Monitors; Esc im Ausgabefenster beendet die Anzeige"
            >
              <MonitorPlay className="size-4" /> Vollbild starten
            </Button>
          )}
        </ToolBar>
      }
      aside={
        <>
          <PanelSection
            id="presets"
            title="Presets"
            icon={Bookmark}
            defaultOpen={false}
            summary={
              presets.length === 0
                ? 'keine gespeichert'
                : `${presets.length} gespeichert${selectedPreset ? ` · „${selectedPreset}“` : ''}`
            }
          >
            <div className="flex items-center gap-2">
              <select
                className={`${selectClass} flex-1`}
                value={selectedPreset}
                onChange={(e) => applyPreset(e.target.value)}
              >
                <option value="">Preset laden…</option>
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button variant="ghost" size="sm" onClick={deletePreset} disabled={!selectedPreset}>
                Löschen
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Aktuelle Einstellung als Preset…"
                className="h-8 flex-1"
              />
              <Button size="sm" onClick={savePreset} disabled={!presetName.trim()}>
                Speichern
              </Button>
            </div>
          </PanelSection>

          <PanelSection
            id="pattern"
            title="Testbild"
            icon={LayoutGrid}
            summary={`${PATTERN_OPTIONS.find((o) => o.value === config.pattern)?.label ?? ''}${showScale ? ` · ${fmtCells(gridCells.x)} × ${fmtCells(gridCells.y)} Module` : ''}`}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Testbild</span>
              <select
                className={selectClass}
                value={config.pattern}
                onChange={(e) => patch({ pattern: e.target.value as PatternConfig['pattern'] })}
              >
                {PATTERN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {isMapping && <MappingSettings config={config} patch={patch} />}

            {isSolid && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Farbe</span>
                <select
                  className={selectClass}
                  value={config.solid}
                  onChange={(e) => patch({ solid: e.target.value as PatternConfig['solid'] })}
                >
                  {SOLID_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {config.pattern === 'checkerboard' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Zellgröße (px)</span>
                <NumberField
                  value={config.gridSpacing}
                  min={2}
                  onCommit={(v) => patch({ gridSpacing: v })}
                />
              </label>
            )}
            {showScale && (
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  Modul-Unterteilung
                  <InfoTip
                    label="Erklärung zur Modul-Unterteilung"
                    text={`Zellanzahl aus dem Seitenverhältnis (${mc.x}:${mc.y}); der ×-Faktor verdoppelt sie.`}
                  />
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => patch({ gridScale: Math.max(0.25, config.gridScale / 2) })}
                    disabled={config.gridScale <= 0.25}
                  >
                    −
                  </Button>
                  <span className="min-w-8 text-center text-sm tabular-nums">
                    ×{config.gridScale}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => patch({ gridScale: Math.min(16, config.gridScale * 2) })}
                    disabled={config.gridScale >= 16}
                  >
                    +
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {fmtCells(gridCells.x)} × {fmtCells(gridCells.y)} Module
                  </span>
                </div>
              </div>
            )}

            {isCycle && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Farben (Reihenfolge)</span>
                <div className="flex flex-wrap gap-1.5">
                  {LOOP_COLOR_OPTIONS.map((o) => {
                    const on = config.cycleColors.includes(o.hex)
                    return (
                      <button
                        key={o.hex}
                        type="button"
                        onClick={() => toggleCycleColor(o.hex)}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                          on
                            ? 'border-primary text-foreground'
                            : 'border-border text-muted-foreground'
                        }`}
                      >
                        <span
                          className="size-3 rounded-sm border border-white/25"
                          style={{ background: o.hex }}
                        />
                        {o.label}
                      </button>
                    )
                  })}
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Sek./Farbe</span>
                  <NumberField
                    value={config.cycleSeconds}
                    min={1}
                    max={600}
                    className="w-24"
                    onCommit={(v) => patch({ cycleSeconds: v })}
                  />
                </label>
              </div>
            )}

            {isScroll && (
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  Scroll-Geschwindigkeit
                  <InfoTip
                    label="Erklärung zur Scroll-Geschwindigkeit"
                    text="Höher = schnellere Balken – Tearing und Judder werden deutlicher."
                  />
                </span>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0.1}
                    max={6}
                    step={0.1}
                    value={config.scrollSpeed}
                    onChange={(e) => patch({ scrollSpeed: Number(e.target.value) })}
                    className="w-48"
                  />
                  <span className="min-w-12 text-sm tabular-nums">
                    ×{config.scrollSpeed.toFixed(1)}
                  </span>
                </div>
              </label>
            )}
          </PanelSection>

          <PanelSection
            id="res"
            title="Auflösung & Anzeige"
            icon={Ratio}
            summary={`${config.width} × ${config.height}${!isMapping && config.showInfo ? (config.label ? ` · „${config.label}“` : ' · Auflösung eingeblendet') : ''}`}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Auflösung</span>
              <div className="flex items-center gap-2">
                <NumberField
                  value={config.width}
                  min={16}
                  max={16384}
                  onCommit={(v) => setRes(v, config.height)}
                />
                <span className="text-muted-foreground">×</span>
                <NumberField
                  value={config.height}
                  min={16}
                  max={16384}
                  onCommit={(v) => setRes(config.width, v)}
                />
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {RES_PRESETS.map((r) => (
                  <Button
                    key={r.label}
                    variant="outline"
                    size="sm"
                    onClick={() => setRes(r.w, r.h)}
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
                  Vom Monitor
                </Button>
              </div>
            </div>

            {/* Mapping-Testbild zeigt Auflösung + Text selbst (Einstellung oben). */}
            {!isMapping && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.showInfo}
                  onChange={(e) => patch({ showInfo: e.target.checked })}
                  className="size-4 accent-[hsl(var(--primary))]"
                />
                Auflösung/Label einblenden
              </label>
            )}
            {!isMapping && config.showInfo && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Label (optional)</span>
                <Input
                  value={config.label}
                  placeholder="z.B. Bühne links"
                  onChange={(e) => patch({ label: e.target.value })}
                />
              </label>
            )}
          </PanelSection>
        </>
      }
      main={
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <div>
            <PatternPreview config={config} />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Vorschau · Ausgabe & Export erfolgen in voller Auflösung ({config.width} ×{' '}
              {config.height})
            </p>
          </div>

          {/* Export */}
          <Card className="space-y-4 p-5">
            <h2 className="font-medium">Export</h2>
            <div className="flex flex-wrap items-end gap-3">
              <Button variant="secondary" onClick={() => void savePng()} disabled={busy !== null}>
                <ImageIcon className="size-4" /> PNG speichern
              </Button>
              <div className="mx-2 h-9 w-px bg-border" />
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Video</span>
                <select
                  className={selectClass}
                  value={vidFormat}
                  onChange={(e) => setVidFormat(e.target.value as PatternVideoFormat)}
                >
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="hap_q">HAP Q (.mov)</option>
                </select>
              </label>
              {!isCycle && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Sekunden</span>
                  <NumberField
                    value={vidSeconds}
                    min={1}
                    max={3600}
                    className="w-24"
                    onCommit={setVidSeconds}
                  />
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">fps</span>
                <NumberField
                  value={vidFps}
                  min={1}
                  max={60}
                  className="w-20"
                  onCommit={setVidFps}
                />
              </label>
              <Button onClick={() => void exportVideo()} disabled={busy !== null}>
                <Film className="size-4" /> {isCycle ? 'Loop exportieren' : 'Video exportieren'}
              </Button>
            </div>

            {isCycle && (
              <p className="text-xs text-muted-foreground">
                Pixelcheck-Loop: {config.cycleColors.length} Farben · Gesamtdauer{' '}
                {config.cycleColors.length * config.cycleSeconds}s. Auch als „Vollbild anzeigen"
                live am Monitor.
              </p>
            )}

            {videoProgress !== null && (
              <div>
                <Progress value={videoProgress} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Video wird erzeugt … {Math.round(videoProgress * 100)}%
                </p>
              </div>
            )}
            {note && <p className="break-all text-xs text-muted-foreground">{note}</p>}
          </Card>
        </div>
      }
    />
  )
}
