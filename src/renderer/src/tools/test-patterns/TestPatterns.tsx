import { useEffect, useState } from 'react'
import { Film, Image as ImageIcon, MonitorPlay, MonitorX } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { Progress } from '@renderer/components/ui/progress'
import { api } from '@renderer/lib/api'
import {
  DEFAULT_PATTERN_CONFIG,
  type DisplayInfo,
  type PatternConfig,
  type PatternVideoFormat
} from '@shared/types'
import { PATTERN_OPTIONS, SOLID_OPTIONS, renderToCanvas } from './patterns'
import { PatternPreview } from './PatternPreview'

const selectClass =
  'h-9 rounded-md border border-border bg-input/40 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70'

const RES_PRESETS = [
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '2560 × 1440', w: 2560, h: 1440 },
  { label: '3840 × 2160 (4K)', w: 3840, h: 2160 }
]

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

  const [vidFormat, setVidFormat] = useState<PatternVideoFormat>('mp4')
  const [vidSeconds, setVidSeconds] = useState(10)
  const [vidFps, setVidFps] = useState(30)
  const [busy, setBusy] = useState<null | string>(null)
  const [videoProgress, setVideoProgress] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Monitore laden; bevorzugt einen nicht-primaeren (Beamer/Wand) vorauswaehlen
  useEffect(() => {
    void api.screen.list().then((list) => {
      setDisplays(list)
      const target = list.find((d) => !d.primary) ?? list[0]
      setDisplayId(target?.id ?? null)
    })
    return api.patterns.onVideoProgress((p) => {
      if (p.done) {
        setVideoProgress(null)
        setBusy(null)
        setNote(p.error ? `Video-Export fehlgeschlagen: ${p.error}` : `Video gespeichert: ${p.outputPath}`)
      } else {
        setVideoProgress(p.progress)
      }
    })
  }, [])

  // Aenderungen live ins offene Ausgabefenster spiegeln
  useEffect(() => {
    if (outputOpen) void api.patterns.update(config)
  }, [config, outputOpen])

  function patch(p: Partial<PatternConfig>): void {
    setConfig((prev) => ({ ...prev, ...p }))
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
    setNote(null)
  }

  async function closeFullscreen(): Promise<void> {
    await api.patterns.close()
    setOutputOpen(false)
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

  async function exportVideo(): Promise<void> {
    setBusy('video')
    setNote(null)
    setVideoProgress(0)
    try {
      const png = await renderPngBytes(config)
      await api.patterns.exportVideo({
        png,
        durationSec: vidSeconds,
        fps: vidFps,
        format: vidFormat
      })
      // Abschluss/Fehler kommt ueber onVideoProgress (done)
    } catch (e) {
      setVideoProgress(null)
      setBusy(null)
      setNote(`Video-Export fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const isSolid = config.pattern === 'solid'
  const isGrid = config.pattern === 'grid' || config.pattern === 'checkerboard'

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Steuerung */}
        <Card className="space-y-5 p-5">
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

          {isGrid && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Abstand (px)</span>
                <NumberField
                  value={config.gridSpacing}
                  min={2}
                  onCommit={(v) => patch({ gridSpacing: v })}
                />
              </label>
              {config.pattern === 'grid' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Linienstärke</span>
                  <NumberField
                    value={config.lineWidth}
                    min={1}
                    onCommit={(v) => patch({ lineWidth: v })}
                  />
                </label>
              )}
            </div>
          )}

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
                <Button key={r.label} variant="outline" size="sm" onClick={() => setRes(r.w, r.h)}>
                  {r.label}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={fromMonitor} disabled={displayId == null}>
                von Monitor
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.showInfo}
              onChange={(e) => patch({ showInfo: e.target.checked })}
              className="size-4 accent-[hsl(var(--primary))]"
            />
            Auflösung/Label einblenden
          </label>
          {config.showInfo && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Label (optional)</span>
              <Input
                value={config.label}
                placeholder="z.B. Bühne links"
                onChange={(e) => patch({ label: e.target.value })}
              />
            </label>
          )}
        </Card>

        {/* Vorschau */}
        <div className="space-y-3">
          <PatternPreview config={config} />
          <p className="text-center text-xs text-muted-foreground">
            Vorschau · Ausgabe & Export erfolgen in voller Auflösung ({config.width} × {config.height})
          </p>
        </div>
      </div>

      {/* Ausgabe auf Monitor */}
      <Card className="space-y-4 p-5">
        <h2 className="font-medium">Vollbild-Ausgabe</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium">Monitor</span>
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
          </label>
          <Button onClick={() => void showFullscreen()} disabled={displayId == null}>
            <MonitorPlay className="size-4" /> {outputOpen ? 'Auf Monitor aktualisieren' : 'Vollbild anzeigen'}
          </Button>
          {outputOpen && (
            <Button variant="outline" onClick={() => void closeFullscreen()}>
              <MonitorX className="size-4" /> Schließen
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Das Testbild wird pixelgenau in der nativen Auflösung des Monitors angezeigt. Im
          Ausgabefenster beendet <kbd className="rounded bg-muted px-1">Esc</kbd> die Anzeige.
        </p>
      </Card>

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
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">fps</span>
            <NumberField value={vidFps} min={1} max={60} className="w-20" onCommit={setVidFps} />
          </label>
          <Button onClick={() => void exportVideo()} disabled={busy !== null}>
            <Film className="size-4" /> Video exportieren
          </Button>
        </div>
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
  )
}
