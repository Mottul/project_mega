// OSC-Steuerung: frei belegbares Steuerpult (Fader/Taster/Schalter/XY/Farbe),
// das OSC an MadMapper & Co. sendet. Aufbau wie die übrigen Tools (ToolShell:
// Arbeitsfläche + Inspector). In der Kopfzeile: SETS (gespeicherte Setups) links,
// Edit-/Live-Umschalter rechts (wie im Jingle-Player). Die Kacheln liegen in
// einem Raster und sind in der Größe ziehbar (Edit-Modus). Gesendet wird über
// den main-Prozess (api.osc).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject
} from 'react'
import {
  Activity,
  LayoutGrid,
  Monitor as MonitorIcon,
  Music,
  Pencil,
  Pipette,
  Play,
  Plus,
  Radio,
  RotateCcw,
  RotateCw,
  Send,
  Settings2,
  Smartphone,
  SlidersHorizontal,
  Tablet,
  Trash2,
  Zap
} from 'lucide-react'
import type { OscArg, OscFeedback, OscMessage, OscSettings, OscStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { PanelSection, ToolShell } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import {
  makeWidget,
  MAX_CH,
  MAX_COLS,
  useOscSurface,
  WIDGET_COLORS,
  WIDGET_MIN,
  WIDGET_TYPE_LABEL,
  type OscWidget,
  type OscWidgetType
} from './store'

/** Höhe einer Rasterzeile (px) und Abstand zwischen den Kacheln (px). Bewusst
 *  fein -> Fader/Buttons lassen sich klein und trotzdem bedienbar legen. */
const ROW_H = 38
const GAP = 8

/** Geräte-Vorschau: logische Auflösung (CSS-Pixel) gängiger Geräte, Hochformat. */
type DeviceKey = 'off' | 'phone' | 'tablet'
const DEVICES: Record<Exclude<DeviceKey, 'off'>, { w: number; h: number; label: string }> = {
  phone: { w: 390, h: 844, label: 'Handy' },
  tablet: { w: 834, h: 1112, label: 'Tablet' }
}

/* ------------------------------- Hilfen --------------------------------- */

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
const clamp = (n: number, a: number, b: number): number => (n < a ? a : n > b ? b : n)
const clampInt = (n: number, a: number, b: number): number =>
  Math.min(b, Math.max(a, Math.round(Number.isFinite(n) ? n : a)))

function rgb01ToHex(r: number, g: number, b: number): string {
  const h = (x: number): string => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1], 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
function rgb2hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = 0
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx }
}
function hsv2rgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: r + m, g: g + m, b: b + m }
}
function argVal(a: OscArg): number | string | boolean {
  return a.type === 'T' ? true : a.type === 'F' ? false : a.value
}
function fmsg(address: string, value: number): OscMessage {
  return { address, args: [{ type: 'f', value }] }
}
function fmtArgs(args: (number | string | boolean)[]): string {
  return args
    .map((v) =>
      typeof v === 'number'
        ? Number.isInteger(v)
          ? String(v)
          : v.toFixed(3)
        : typeof v === 'boolean'
          ? v
            ? 'T'
            : 'F'
          : JSON.stringify(v)
    )
    .join('  ')
}

const HAS_EYEDROPPER = typeof window !== 'undefined' && 'EyeDropper' in window
const HUE_GRADIENT =
  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'

interface LogEntry {
  id: number
  dir: 'out' | 'in'
  address: string
  args: (number | string | boolean)[]
  at: number
}

type Send = (msg: OscMessage) => void
type SendMany = (msgs: OscMessage[]) => void

/* ------------------------------ Hauptansicht ---------------------------- */

export function OscControl(): JSX.Element {
  const sets = useOscSurface((s) => s.sets)
  const currentSetId = useOscSurface((s) => s.currentSetId)
  const mode = useOscSurface((s) => s.mode)
  const setStore = useOscSurface((s) => s.set)
  const live = mode === 'live'

  const set = sets.find((x) => x.id === currentSetId) ?? sets[0]
  const widgets = set.widgets
  const columns = set.columns

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [device, setDevice] = useState<DeviceKey>('off')
  const [landscape, setLandscape] = useState(false)
  const [status, setStatus] = useState<OscStatus | null>(null)
  const [config, setConfig] = useState<OscSettings | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const logRef = useRef<LogEntry[]>([])
  const logSeq = useRef(0)
  const gridRef = useRef<HTMLDivElement>(null)

  // Set-Wechsel -> Auswahl zurücksetzen.
  useEffect(() => setSelectedId(null), [currentSetId])

  const pushLog = useCallback(
    (dir: 'out' | 'in', address: string, args: (number | string | boolean)[]) => {
      const now = Date.now()
      const cur = logRef.current
      const top = cur[0]
      if (top && top.dir === dir && top.address === address && now - top.at < 80) {
        logRef.current = [{ ...top, args, at: now }, ...cur.slice(1)]
      } else {
        logRef.current = [{ id: logSeq.current++, dir, address, args, at: now }, ...cur].slice(0, 60)
      }
      setLog(logRef.current)
    },
    []
  )

  const send = useCallback<Send>(
    (msg) => {
      void api.osc.send(msg)
      pushLog('out', msg.address, msg.args.map(argVal))
    },
    [pushLog]
  )
  const sendMany = useCallback<SendMany>(
    (msgs) => {
      void api.osc.sendMany(msgs)
      for (const m of msgs) pushLog('out', m.address, m.args.map(argVal))
    },
    [pushLog]
  )

  useEffect(() => {
    let alive = true
    void api.osc.config().then((c) => alive && setConfig(c))
    void api.osc.status().then((st) => alive && setStatus(st))
    const offStatus = api.osc.onStatus((st) => setStatus(st))
    const offFeedback = api.osc.onFeedback((fb) => {
      pushLog('in', fb.address, fb.args)
      reflectFeedback(fb)
    })
    return () => {
      alive = false
      offStatus()
      offFeedback()
    }
  }, [pushLog])

  const selected = widgets.find((w) => w.id === selectedId) ?? null

  // Geräte-Vorschau (Stufe 2): die Fläche in einem Handy-/Tablet-Rahmen zeigen.
  const previewing = device !== 'off'
  const dim = device === 'off' ? null : DEVICES[device]
  const frameW = dim ? (landscape ? dim.h : dim.w) : 0
  const frameH = dim ? (landscape ? dim.w : dim.h) : 0

  // Raster-Höhe: so hoch wie das unterste Widget; im Edit-Modus etwas mehr
  // (Platz zum Hineinziehen) und mindestens ein paar Zeilen.
  const maxBottom = widgets.reduce((m, w) => Math.max(m, w.gy + w.ch), 0)
  const rows = live ? Math.max(maxBottom, 1) : Math.max(maxBottom + 3, 10)

  function onAdd(type: OscWidgetType): void {
    const id = useOscSurface.getState().addWidget(type)
    setSelectedId(id)
    if (mode !== 'edit') setStore({ mode: 'edit' })
  }

  const statusDot = status ? (status.lastError ? 'bg-destructive' : 'bg-emerald-500') : 'bg-muted-foreground'

  const main = (
    <div className="flex h-full flex-col">
      {/* Kopfzeile: Sets links, Edit/Live rechts */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {sets.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => useOscSurface.getState().selectSet(b.id)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                b.id === set.id
                  ? 'border-primary/60 bg-primary/10 font-semibold text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {b.name}
            </button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            title="Set hinzufügen"
            onClick={() => useOscSurface.getState().addSet()}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={cn('size-2.5 rounded-full', statusDot)} />
          <span className="tabular-nums">{status ? `${status.host}:${status.outPort}` : '–'}</span>
          {status?.listening && (
            <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-xs">
              <Radio className="size-3" /> {status.inPort}
            </span>
          )}
        </div>

        {/* Geräte-Vorschau */}
        <div className="flex overflow-hidden rounded-md border border-border">
          <DeviceBtn active={!previewing} title="Normale Ansicht" onClick={() => setDevice('off')}>
            <MonitorIcon className="size-4" />
          </DeviceBtn>
          <DeviceBtn active={device === 'phone'} title="Handy-Vorschau" onClick={() => setDevice('phone')}>
            <Smartphone className="size-4" />
          </DeviceBtn>
          <DeviceBtn active={device === 'tablet'} title="Tablet-Vorschau" onClick={() => setDevice('tablet')}>
            <Tablet className="size-4" />
          </DeviceBtn>
        </div>
        {previewing && (
          <Button variant="ghost" size="icon" title="Hoch-/Querformat" onClick={() => setLandscape((v) => !v)}>
            <RotateCw className="size-4" />
          </Button>
        )}

        {/* Edit / Live */}
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => setStore({ mode: 'edit' })}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-sm transition-colors',
              !live ? 'bg-primary/15 font-semibold text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Pencil className="size-4" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setStore({ mode: 'live' })}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-sm transition-colors',
              live
                ? 'bg-emerald-500/20 font-semibold text-emerald-400 light:text-emerald-700'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Play className="size-4" /> Live
          </button>
        </div>
      </div>

      {/* Steuerpult */}
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {previewing ? (
          <DeviceFrame w={frameW} h={frameH}>
            {widgets.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Noch keine Bedienelemente.</p>
            ) : (
              <PreviewSurface columns={columns} widgets={widgets} onSend={send} onSendMany={sendMany} />
            )}
          </DeviceFrame>
        ) : widgets.length === 0 ? (
          <Card className="flex h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Noch keine Bedienelemente. Rechts unter „Oberfläche“ ein Widget hinzufügen.
          </Card>
        ) : (
          <div
            ref={gridRef}
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridAutoRows: `${ROW_H}px`,
              gap: `${GAP}px`
            }}
          >
            {!live && <GridBackdrop columns={columns} rows={rows} />}
            {widgets.map((w) => (
              <WidgetTile
                key={w.id}
                w={w}
                live={live}
                selected={w.id === selectedId}
                columns={columns}
                gridRef={gridRef}
                onSelect={() => setSelectedId(w.id)}
                onSend={send}
                onSendMany={sendMany}
                onRemove={() => {
                  useOscSurface.getState().removeWidget(w.id)
                  if (selectedId === w.id) setSelectedId(null)
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const aside = (
    <>
      <PanelSection id="widget" title="Widget" icon={Settings2}>
        {selected ? (
          <WidgetEditor
            key={selected.id}
            w={selected}
            columns={columns}
            onRemove={() => {
              useOscSurface.getState().removeWidget(selected.id)
              setSelectedId(null)
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Im Modus <span className="text-foreground">Edit</span> eine Kachel anklicken, um
            Beschriftung, Farbe und OSC-Adresse zu ändern. Größe per Eckgriff ziehen.
          </p>
        )}
      </PanelSection>

      <PanelSection id="surface" title="Oberfläche" icon={LayoutGrid}>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Spalten</span>
          <NumberField
            value={columns}
            min={4}
            max={MAX_COLS}
            onCommit={(v) => useOscSurface.getState().setColumns(v)}
            className="h-8 w-20"
          />
        </label>
        <div>
          <span className="mb-1.5 block text-xs text-muted-foreground">Widget hinzufügen</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(WIDGET_TYPE_LABEL) as OscWidgetType[]).map((t) => (
              <Button key={t} variant="outline" size="sm" onClick={() => onAdd(t)}>
                <Plus className="size-3.5" /> {WIDGET_TYPE_LABEL[t]}
              </Button>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => {
            if (confirm('Widgets dieses Sets auf die Beispiele zurücksetzen?')) {
              useOscSurface.getState().resetSurface()
              setSelectedId(null)
            }
          }}
        >
          <RotateCcw className="size-3.5" /> Beispiele laden
        </Button>
      </PanelSection>

      <PanelSection id="set" title="Set" icon={Music}>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Name</span>
          <Input value={set.name} onChange={(e) => useOscSurface.getState().renameSet(set.id, e.target.value)} />
        </label>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => useOscSurface.getState().deleteSet(set.id)}
        >
          <Trash2 className="size-3.5" /> Set löschen
        </Button>
      </PanelSection>

      <PanelSection
        id="connection"
        title="Verbindung"
        icon={Radio}
        right={<span className={cn('size-2.5 rounded-full', statusDot)} />}
      >
        <ConnectionPanel config={config} status={status} onApplied={(st) => setStatus(st)} onSend={send} />
      </PanelSection>

      <PanelSection id="monitor" title="OSC-Monitor" icon={Activity} defaultOpen={false}>
        <Monitor
          log={log}
          onClear={() => {
            logRef.current = []
            setLog([])
          }}
        />
      </PanelSection>
    </>
  )

  return <ToolShell id="osc-control" main={main} aside={aside} asideWidth={380} />
}

/** Eingehendes Feedback in passende Widgets spiegeln (ohne erneut zu senden). */
function reflectFeedback(fb: OscFeedback): void {
  const first = fb.args[0]
  const num = typeof first === 'number' ? first : typeof first === 'boolean' ? (first ? 1 : 0) : null
  if (num == null) return
  const st = useOscSurface.getState()
  for (const w of st.currentSet().widgets) {
    if (w.type === 'fader' && w.address === fb.address) {
      const lo = Math.min(w.min, w.max)
      const hi = Math.max(w.min, w.max)
      st.updateWidget(w.id, { value: clamp(num, lo, hi) })
    } else if (w.type === 'toggle' && w.address === fb.address) {
      st.updateWidget(w.id, { value: num >= 0.5 ? 1 : 0 })
    } else if (w.type === 'xy') {
      if (w.address === fb.address) st.updateWidget(w.id, { x: clamp01(num) })
      if (w.addressY === fb.address) st.updateWidget(w.id, { y: clamp01(num) })
    }
  }
}

/* ------------------------------- Kachel --------------------------------- */

// Schwach sichtbares Raster im Edit-Modus (Zellen als nicht-interaktive Kacheln
// hinter den Widgets) -> man sieht, wo gerastert wird.
function GridBackdrop({ columns, rows }: { columns: number; rows: number }): JSX.Element {
  const cells: JSX.Element[] = []
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      cells.push(
        <div
          key={`${x}-${y}`}
          style={{ gridColumn: `${x + 1}`, gridRow: `${y + 1}` }}
          className="pointer-events-none rounded-[3px] border border-dashed border-border/40"
        />
      )
    }
  }
  return <>{cells}</>
}

function WidgetTile({
  w,
  live,
  selected,
  columns,
  gridRef,
  onSelect,
  onSend,
  onSendMany,
  onRemove
}: {
  w: OscWidget
  live: boolean
  selected: boolean
  columns: number
  gridRef: RefObject<HTMLDivElement>
  onSelect: () => void
  onSend: Send
  onSendMany: SendMany
  onRemove: () => void
}): JSX.Element {
  const tileRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const gx = Math.min(Math.max(0, w.gx), columns - 1)
  const cw = Math.min(w.cw, columns - gx)
  // Sehr flach (1 Zeile): Beschriftung weglassen, damit der Regler nicht
  // verschwindet -> ein 1×1-Taster zeigt weiterhin einen Taster.
  const compact = w.ch <= 1

  // Kachel ziehen = im Raster verschieben. Griffe/Buttons sind data-no-drag und
  // starten kein Verschieben.
  function startDrag(e: ReactPointerEvent): void {
    if (live) return
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    onSelect()
    const grid = gridRef.current
    if (!grid) return
    const colStep = (grid.clientWidth + GAP) / columns
    const rowStep = ROW_H + GAP
    const sgx = gx
    const sgy = w.gy
    const spx = e.clientX
    const spy = e.clientY
    setDragging(true)
    const move = (ev: PointerEvent): void => {
      const ngx = clampInt(sgx + (ev.clientX - spx) / colStep, 0, columns - cw)
      const ngy = Math.max(0, Math.round(sgy + (ev.clientY - spy) / rowStep))
      useOscSurface.getState().moveWidgetTo(w.id, ngx, ngy)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragging(false)
      useOscSurface.getState().settleWidget(w.id) // Überlappung auflösen
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startResize(e: ReactPointerEvent): void {
    e.stopPropagation()
    e.preventDefault()
    const grid = gridRef.current
    const tile = tileRef.current
    if (!grid || !tile) return
    const colStep = (grid.clientWidth + GAP) / columns
    const rowStep = ROW_H + GAP
    const rect = tile.getBoundingClientRect()
    const left = rect.left
    const top = rect.top
    const move = (ev: PointerEvent): void => {
      const ncw = clampInt((ev.clientX - left + GAP) / colStep, 1, columns - gx)
      const nch = clampInt((ev.clientY - top + GAP) / rowStep, 1, MAX_CH)
      useOscSurface.getState().resizeWidget(w.id, ncw, nch)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      useOscSurface.getState().settleWidget(w.id) // Überlappung auflösen
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const showAddr = !live && w.ch >= 2

  return (
    <div
      ref={tileRef}
      onPointerDown={startDrag}
      style={{ gridColumn: `${gx + 1} / span ${cw}`, gridRow: `${w.gy + 1} / span ${w.ch}` }}
      className={cn(
        'group relative z-10 flex h-full min-h-0 flex-col rounded-lg border bg-card transition-colors',
        compact ? 'p-1' : 'p-2',
        selected && !live ? 'border-foreground/60 ring-1 ring-foreground/30' : 'border-border',
        !live && 'cursor-move hover:border-foreground/40',
        dragging && 'z-20 opacity-80 shadow-lg'
      )}
    >
      {!compact && (
        <div className="mb-1 flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full" style={{ background: w.color }} />
          <span className="truncate text-xs font-medium" title={w.label}>
            {w.label || '—'}
          </span>
        </div>
      )}

      <div className={cn('min-h-0 flex-1', !live && 'pointer-events-none')}>
        {w.type === 'fader' && <Fader w={w} onSend={onSend} />}
        {w.type === 'toggle' && <Toggle w={w} onSend={onSend} />}
        {w.type === 'button' && <Momentary w={w} onSend={onSend} />}
        {w.type === 'xy' && <XYPad w={w} onSendMany={onSendMany} />}
        {w.type === 'color' && <ColorPad w={w} onSend={onSend} />}
      </div>

      {showAddr && (
        <div className="mt-1 truncate pr-4 font-mono text-[10px] text-muted-foreground" title={w.address}>
          {w.address}
          {w.type === 'xy' && w.addressY ? `  ${w.addressY}` : ''}
        </div>
      )}

      {!live && (
        <>
          <div
            data-no-drag
            className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <TileBtn title="Entfernen" onClick={onRemove}>
              <Trash2 className="size-3.5" />
            </TileBtn>
          </div>
          <div
            data-no-drag
            onPointerDown={startResize}
            title="Größe ziehen"
            className="absolute bottom-0 right-0 flex size-4 cursor-nwse-resize items-end justify-end p-0.5 text-muted-foreground/60 hover:text-foreground"
          >
            <svg viewBox="0 0 6 6" className="size-2.5 fill-current">
              <circle cx="5" cy="5" r="0.8" />
              <circle cx="5" cy="2.5" r="0.8" />
              <circle cx="2.5" cy="5" r="0.8" />
            </svg>
          </div>
        </>
      )}
    </div>
  )
}

function TileBtn({
  title,
  disabled,
  onClick,
  children
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="rounded bg-background/80 p-1 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  )
}

/* ------------------------- Geräte-Vorschau ------------------------------ */

function DeviceBtn({
  active,
  title,
  onClick,
  children
}: {
  active: boolean
  title: string
  onClick: () => void
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'flex items-center px-2.5 py-1.5 transition-colors',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

// Geräterahmen, der seinen Inhalt (Fläche in Originalauflösung) auf die
// verfügbare Größe herunterskaliert.
function DeviceFrame({ w, h, children }: { w: number; h: number; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const availW = el.clientWidth - 24
      const availH = el.clientHeight - 24
      setScale(Math.max(0.2, Math.min(1, availW / (w + 24), availH / (h + 24))))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w, h])
  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      <div style={{ transform: `scale(${scale})` }} className="origin-center">
        <div className="rounded-[2.6rem] border-[12px] border-neutral-800 bg-neutral-800 shadow-2xl">
          <div style={{ width: w, height: h }} className="overflow-auto rounded-[1.6rem] bg-background p-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// Fläche live (interaktiv) in der Vorschau – ohne Edit-Werkzeuge.
function PreviewSurface({
  columns,
  widgets,
  onSend,
  onSendMany
}: {
  columns: number
  widgets: OscWidget[]
  onSend: Send
  onSendMany: SendMany
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_H}px`,
        gap: `${GAP}px`
      }}
    >
      {widgets.map((w) => (
        <WidgetTile
          key={w.id}
          w={w}
          live
          selected={false}
          columns={columns}
          gridRef={ref}
          onSelect={() => {}}
          onSend={onSend}
          onSendMany={onSendMany}
          onRemove={() => {}}
        />
      ))}
    </div>
  )
}

/* ------------------------- Bedienelement: Fader ------------------------- */

function Fader({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pending = useRef<number | null>(null)
  const start = useRef<{ py: number; v: number } | null>(null)
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const span = hi - lo
  const norm = span > 0 ? clamp01((w.value - lo) / span) : 0

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function flush(): void {
    raf.current = 0
    if (pending.current == null) return
    const v = pending.current
    pending.current = null
    useOscSurface.getState().updateWidget(w.id, { value: v })
    onSend(fmsg(w.address, v))
  }
  // Relativ: ab dem Anfasspunkt ziehen (kein Sprung auf den Klickwert).
  function drag(clientY: number): void {
    const el = ref.current
    const st = start.current
    if (!el || !st) return
    const r = el.getBoundingClientRect()
    const dNorm = -(clientY - st.py) / r.height
    pending.current = clamp(st.v + dNorm * span, lo, hi)
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { py: e.clientY, v: w.value }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
      className="relative h-full w-full cursor-ns-resize touch-none overflow-hidden rounded-md bg-muted/50"
    >
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: `${norm * 100}%`, background: w.color, opacity: 0.85 }}
      />
      <div className="absolute inset-x-0" style={{ bottom: `${norm * 100}%` }}>
        <div className="h-0.5 w-full bg-foreground/80" />
      </div>
      <span className="absolute inset-x-0 bottom-1 text-center text-[11px] tabular-nums text-foreground/90">
        {w.value.toFixed(2)}
      </span>
    </div>
  )
}

/* ------------------------- Bedienelement: Schalter ---------------------- */

function Toggle({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const on = w.value >= 0.5
  return (
    <button
      type="button"
      onClick={() => {
        const next = on ? 0 : 1
        useOscSurface.getState().updateWidget(w.id, { value: next })
        onSend(fmsg(w.address, next ? w.onValue : w.offValue))
      }}
      className="flex h-full w-full items-center justify-center rounded-md border text-sm font-semibold transition-colors"
      style={{ borderColor: w.color, background: on ? w.color : 'transparent', color: on ? '#fff' : undefined }}
    >
      {on ? 'AN' : 'AUS'}
    </button>
  )
}

/* ------------------------- Bedienelement: Taster ------------------------ */

function Momentary({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const [pressed, setPressed] = useState(false)
  function release(): void {
    if (!pressed) return
    setPressed(false)
    onSend(fmsg(w.address, w.offValue))
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setPressed(true)
        onSend(fmsg(w.address, w.onValue))
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="flex h-full w-full items-center justify-center rounded-md border transition-transform active:scale-[0.98]"
      style={{ borderColor: w.color, background: pressed ? w.color : 'transparent' }}
    >
      <Zap className="size-7" style={{ color: pressed ? '#fff' : w.color }} />
    </button>
  )
}

/* ------------------------- Bedienelement: XY-Pad ------------------------ */
// Relativ: der Klickpunkt verschiebt NICHT auf den Wert; gezogen wird ab der
// aktuellen Position (Delta zum Anfasspunkt).

function XYPad({ w, onSendMany }: { w: OscWidget; onSendMany: SendMany }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pend = useRef<{ x: number; y: number } | null>(null)
  const start = useRef<{ px: number; py: number; vx: number; vy: number } | null>(null)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function flush(): void {
    raf.current = 0
    if (!pend.current) return
    const { x, y } = pend.current
    pend.current = null
    useOscSurface.getState().updateWidget(w.id, { x, y })
    const msgs: OscMessage[] = [fmsg(w.address, x)]
    if (w.addressY) msgs.push(fmsg(w.addressY, y))
    onSendMany(msgs)
  }
  function drag(clientX: number, clientY: number): void {
    const el = ref.current
    const st = start.current
    if (!el || !st) return
    const r = el.getBoundingClientRect()
    const dx = (clientX - st.px) / r.width
    const dy = -(clientY - st.py) / r.height
    pend.current = { x: clamp01(st.vx + dx), y: clamp01(st.vy + dy) }
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { px: e.clientX, py: e.clientY, vx: w.x, vy: w.y }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
      className="relative h-full w-full cursor-grab touch-none overflow-hidden rounded-md bg-muted/50 active:cursor-grabbing"
    >
      <div className="absolute inset-y-0" style={{ left: `${w.x * 100}%` }}>
        <div className="h-full w-px bg-foreground/25" />
      </div>
      <div className="absolute inset-x-0" style={{ top: `${(1 - w.y) * 100}%` }}>
        <div className="h-px w-full bg-foreground/25" />
      </div>
      <div
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${w.x * 100}%`, top: `${(1 - w.y) * 100}%`, background: w.color }}
      />
    </div>
  )
}

/* ------------------------- Bedienelement: Farbe ------------------------- */
// Alle Parameter sind direkt sichtbar: Hue + R/G/B-Regler, Hex und Pipette.

function ColorPad({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const hex = rgb01ToHex(w.r, w.g, w.b)
  const hsv = rgb2hsv(w.r, w.g, w.b)
  const lum = 0.299 * w.r + 0.587 * w.g + 0.114 * w.b
  const hueAccent = (() => {
    const c = hsv2rgb(hsv.h, 1, 1)
    return rgb01ToHex(c.r, c.g, c.b)
  })()

  function emit(r: number, g: number, b: number): void {
    useOscSurface.getState().updateWidget(w.id, { r, g, b })
    onSend({
      address: w.address,
      args: [
        { type: 'f', value: r },
        { type: 'f', value: g },
        { type: 'f', value: b }
      ]
    })
  }
  function setHue(h: number): void {
    const { r, g, b } = hsv2rgb(h, hsv.s, hsv.v)
    emit(r, g, b)
  }
  async function pickColor(): Promise<void> {
    const ED = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } })
      .EyeDropper
    if (!ED) return
    try {
      const res = await new ED().open()
      const c = hexToRgb01(res.sRGBHex)
      emit(c.r, c.g, c.b)
    } catch {
      // abgebrochen
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <div
          className="flex h-7 flex-1 items-center justify-center rounded border border-white/15 font-mono text-[11px] uppercase"
          style={{ background: hex, color: lum > 0.55 ? '#000' : '#fff' }}
        >
          {hex}
        </div>
        {HAS_EYEDROPPER && (
          <button
            type="button"
            onClick={() => void pickColor()}
            title="Pipette"
            className="flex size-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <Pipette className="size-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2">
        {/* Alle Regler greifen relativ (kein Sprung auf den Klickpunkt). */}
        <ChannelRow
          letter="H"
          value={hsv.h / 360}
          accent={hueAccent}
          track={HUE_GRADIENT}
          onChange={(v) => setHue(v * 360)}
        />
        <ChannelRow letter="R" value={w.r} accent="#ef4444" onChange={(v) => emit(v, w.g, w.b)} />
        <ChannelRow letter="G" value={w.g} accent="#22c55e" onChange={(v) => emit(w.r, v, w.b)} />
        <ChannelRow letter="B" value={w.b} accent="#3b82f6" onChange={(v) => emit(w.r, w.g, v)} />
      </div>
    </div>
  )
}

function ChannelRow({
  letter,
  value,
  accent,
  track,
  onChange
}: {
  letter: string
  value: number
  accent: string
  track?: string
  onChange: (v: number) => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 shrink-0 text-[10px] font-medium text-muted-foreground">{letter}</span>
      <RelSlider value={value} accent={accent} track={track} onChange={onChange} />
    </div>
  )
}

// Horizontaler Regler mit RELATIVEM Greifen (wie Fader/XY): beim Antippen wird der
// Anfasspunkt gemerkt und ab dort gezogen, statt auf den Klickwert zu springen.
function RelSlider({
  value,
  onChange,
  accent,
  track
}: {
  value: number // 0..1
  onChange: (v: number) => void
  accent: string
  track?: string // optionaler Track-Hintergrund (z.B. Hue-Verlauf)
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pending = useRef<number | null>(null)
  const start = useRef<{ px: number; v: number } | null>(null)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function flush(): void {
    raf.current = 0
    if (pending.current == null) return
    const v = pending.current
    pending.current = null
    onChange(v)
  }
  function drag(clientX: number): void {
    const el = ref.current
    const st = start.current
    if (!el || !st) return
    const r = el.getBoundingClientRect()
    pending.current = clamp01(st.v + (clientX - st.px) / r.width)
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }
  const pct = clamp01(value) * 100

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { px: e.clientX, v: clamp01(value) }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientX)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
      className="relative h-4 w-full cursor-ew-resize touch-none overflow-hidden rounded"
      style={track ? { background: track } : undefined}
    >
      {!track && <div className="absolute inset-0 bg-muted/50" />}
      {!track && (
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${pct}%`, background: accent, opacity: 0.45 }}
        />
      )}
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `${pct}%`, background: accent }}
      />
    </div>
  )
}

/* ------------------------- Inspector: Widget ---------------------------- */

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function DecimalField({
  value,
  onCommit,
  className
}: {
  value: number
  onCommit: (n: number) => void
  className?: string
}): JSX.Element {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  function commit(): void {
    const n = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(n)) onCommit(n)
    else setText(String(value))
  }
  return (
    <Input
      className={className}
      value={text}
      inputMode="decimal"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function WidgetEditor({
  w,
  columns,
  onRemove
}: {
  w: OscWidget
  columns: number
  onRemove: () => void
}): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  const min = WIDGET_MIN[w.type]
  return (
    <div className="space-y-3">
      <Field label="Beschriftung">
        <Input value={w.label} onChange={(e) => update(w.id, { label: e.target.value })} />
      </Field>

      <Field label="Typ">
        <select
          value={w.type}
          onChange={(e) => {
            const type = e.target.value as OscWidgetType
            const patch: Partial<OscWidget> = { type }
            if (type === 'xy' && !w.addressY) patch.addressY = makeWidget('xy').addressY
            update(w.id, patch)
          }}
          className="h-9 w-full rounded-md border border-border bg-input/40 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          {(Object.keys(WIDGET_TYPE_LABEL) as OscWidgetType[]).map((t) => (
            <option key={t} value={t}>
              {WIDGET_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label={w.type === 'xy' ? 'OSC-Adresse (X)' : 'OSC-Adresse'}>
        <Input
          value={w.address}
          spellCheck={false}
          className="font-mono text-xs"
          onChange={(e) => update(w.id, { address: e.target.value })}
        />
      </Field>

      {w.type === 'xy' && (
        <Field label="OSC-Adresse (Y)">
          <Input
            value={w.addressY}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(e) => update(w.id, { addressY: e.target.value })}
          />
        </Field>
      )}

      {w.type === 'fader' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <DecimalField value={w.min} onCommit={(v) => update(w.id, { min: v })} />
          </Field>
          <Field label="Max">
            <DecimalField value={w.max} onCommit={(v) => update(w.id, { max: v })} />
          </Field>
        </div>
      )}

      {(w.type === 'button' || w.type === 'toggle') && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Wert „an“">
            <DecimalField value={w.onValue} onCommit={(v) => update(w.id, { onValue: v })} />
          </Field>
          <Field label="Wert „aus“">
            <DecimalField value={w.offValue} onCommit={(v) => update(w.id, { offValue: v })} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Breite (Spalten)">
          <NumberField value={w.cw} min={min.cw} max={columns} onCommit={(v) => update(w.id, { cw: v })} className="h-9" />
        </Field>
        <Field label="Höhe (Zeilen)">
          <NumberField value={w.ch} min={min.ch} max={MAX_CH} onCommit={(v) => update(w.id, { ch: v })} className="h-9" />
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-xs text-muted-foreground">Farbe</span>
        <div className="flex flex-wrap gap-1.5">
          {WIDGET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update(w.id, { color: c })}
              className={cn(
                'size-6 rounded-full border-2 transition-transform hover:scale-110',
                w.color === c ? 'border-foreground' : 'border-transparent'
              )}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <Button variant="ghost" size="sm" className="w-full text-destructive" onClick={onRemove}>
        <Trash2 className="size-3.5" /> Widget entfernen
      </Button>
    </div>
  )
}

/* ------------------------- Inspector: Verbindung ------------------------ */

function ConnectionPanel({
  config,
  status,
  onApplied,
  onSend
}: {
  config: OscSettings | null
  status: OscStatus | null
  onApplied: (st: OscStatus) => void
  onSend: Send
}): JSX.Element {
  const [host, setHost] = useState('')
  const [outPort, setOutPort] = useState(8000)
  const [inPort, setInPort] = useState(9000)
  const [feedback, setFeedback] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!config) return
    setHost(config.host)
    setOutPort(config.outPort)
    setInPort(config.inPort)
    setFeedback(config.feedbackEnabled)
  }, [config])

  const dirty =
    config != null &&
    (host !== config.host ||
      outPort !== config.outPort ||
      inPort !== config.inPort ||
      feedback !== config.feedbackEnabled)

  async function apply(): Promise<void> {
    setBusy(true)
    try {
      const st = await api.osc.setConfig({
        host: host.trim() || '127.0.0.1',
        outPort,
        inPort,
        feedbackEnabled: feedback
      })
      onApplied(st)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Host (MadMapper)">
        <Input value={host} spellCheck={false} placeholder="127.0.0.1" onChange={(e) => setHost(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Port aus (OSC out)">
          <NumberField value={outPort} min={1} max={65535} onCommit={setOutPort} />
        </Field>
        <Field label="Port ein (Feedback)">
          <NumberField value={inPort} min={1} max={65535} onCommit={setInPort} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={feedback}
          onChange={(e) => setFeedback(e.target.checked)}
          className="size-4 accent-primary"
        />
        Feedback empfangen (auf Port {inPort} lauschen)
      </label>

      {status?.lastError && (
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{status.lastError}</p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || busy} onClick={() => void apply()}>
          Übernehmen
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSend({ address: '/megatoolbox/test', args: [{ type: 'f', value: 1 }] })}
        >
          <Send className="size-3.5" /> Test
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Gesendet: <span className="tabular-nums text-foreground">{status?.sentCount ?? 0}</span>
        {status?.listening && (
          <>
            {' · '}Empfangen: <span className="tabular-nums text-foreground">{status?.recvCount ?? 0}</span>
          </>
        )}
      </p>
    </div>
  )
}

/* ------------------------- Inspector: Monitor --------------------------- */

function Monitor({ log, onClear }: { log: LogEntry[]; onClear: () => void }): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{log.length} Nachrichten</span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear}>
          Leeren
        </Button>
      </div>
      <div className="max-h-72 space-y-1 overflow-auto rounded-md border border-border bg-background/50 p-2">
        {log.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs text-muted-foreground">Noch keine OSC-Aktivität.</p>
        ) : (
          log.map((e) => (
            <div key={e.id} className="flex items-baseline gap-2 font-mono text-[11px]">
              <SlidersHorizontal
                className={cn('size-3 shrink-0 translate-y-0.5', e.dir === 'out' ? 'text-primary' : 'text-emerald-500')}
              />
              <span className="shrink-0 text-muted-foreground">{e.dir === 'out' ? '→' : '←'}</span>
              <span className="truncate text-foreground" title={e.address}>
                {e.address}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{fmtArgs(e.args)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
