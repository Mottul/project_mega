// OSC-Steuerung: ein frei belegbares Steuerpult (Fader/Taster/Schalter/XY/Farbe),
// das OSC an MadMapper & Co. sendet. Aufbau wie die übrigen Tools: großer
// Arbeitsbereich (Mitte) + Inspector rechts (ToolShell). Zwei Modi wie der
// Jingle-Player: „Bearbeiten“ (Kachel anklicken = auswählen) und „Live“
// (Kachel bedienen = senden). Das Senden läuft über den main-Prozess (api.osc).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  SlidersHorizontal,
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
  useOscSurface,
  WIDGET_COLORS,
  WIDGET_TYPE_LABEL,
  type OscWidget,
  type OscWidgetType
} from './store'

/* ------------------------------- Hilfen --------------------------------- */

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
const clamp = (n: number, a: number, b: number): number => (n < a ? a : n > b ? b : n)

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
  const widgets = useOscSurface((s) => s.widgets)
  const columns = useOscSurface((s) => s.columns)
  const mode = useOscSurface((s) => s.mode)
  const setStore = useOscSurface((s) => s.set)
  const addWidget = useOscSurface((s) => s.addWidget)
  const removeWidget = useOscSurface((s) => s.removeWidget)
  const moveWidget = useOscSurface((s) => s.moveWidget)
  const live = mode === 'live'

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<OscStatus | null>(null)
  const [config, setConfig] = useState<OscSettings | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const logRef = useRef<LogEntry[]>([])
  const logSeq = useRef(0)

  const pushLog = useCallback(
    (dir: 'out' | 'in', address: string, args: (number | string | boolean)[]) => {
      const now = Date.now()
      const cur = logRef.current
      const top = cur[0]
      // schnelle Wiederholungen derselben Adresse (Fader) zu EINER Zeile bündeln
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

  // Konfiguration/Status laden + Feedback-/Statusabos.
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

  function onAdd(type: OscWidgetType): void {
    const id = addWidget(type)
    setSelectedId(id)
    if (mode !== 'edit') setStore({ mode: 'edit' })
  }
  function onTileClick(w: OscWidget): void {
    if (!live) setSelectedId(w.id)
  }

  const statusDot = status ? (status.lastError ? 'bg-destructive' : 'bg-emerald-500') : 'bg-muted-foreground'

  const main = (
    <div className="flex h-full flex-col">
      {/* Kopfzeile: Modusumschalter + Verbindungsstatus */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => setStore({ mode: 'edit' })}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
              !live ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/60'
            )}
          >
            <Pencil className="size-4" /> Bearbeiten
          </button>
          <button
            type="button"
            onClick={() => setStore({ mode: 'live' })}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
              live ? 'bg-emerald-600 text-white' : 'hover:bg-muted/60'
            )}
          >
            <Play className="size-4" /> Live
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={cn('size-2.5 rounded-full', statusDot)} />
          <span className="tabular-nums">
            {status ? `${status.host}:${status.outPort}` : '–'}
          </span>
          {status?.listening && (
            <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-xs">
              <Radio className="size-3" /> {status.inPort}
            </span>
          )}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">
          {live ? 'Live – Kacheln senden OSC' : 'Bearbeiten – Kachel wählen, rechts einstellen'}
        </span>
      </div>

      {/* Steuerpult */}
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {widgets.length === 0 ? (
          <Card className="flex h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Noch keine Bedienelemente. Rechts unter „Oberfläche“ ein Widget hinzufügen.
          </Card>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {widgets.map((w, i) => (
              <WidgetTile
                key={w.id}
                w={w}
                live={live}
                selected={w.id === selectedId}
                first={i === 0}
                last={i === widgets.length - 1}
                onClick={() => onTileClick(w)}
                onSend={send}
                onSendMany={sendMany}
                onMove={(dir) => moveWidget(w.id, dir)}
                onRemove={() => {
                  removeWidget(w.id)
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
            onRemove={() => {
              removeWidget(selected.id)
              setSelectedId(null)
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Im Modus <span className="text-foreground">Bearbeiten</span> eine Kachel anklicken, um
            Beschriftung, Farbe und OSC-Adresse zu ändern.
          </p>
        )}
      </PanelSection>

      <PanelSection id="surface" title="Oberfläche" icon={LayoutGrid}>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Spalten</span>
          <NumberField
            value={columns}
            min={2}
            max={8}
            onCommit={(v) => setStore({ columns: v })}
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
            if (confirm('Oberfläche auf die Beispiel-Widgets zurücksetzen?')) {
              useOscSurface.getState().resetSurface()
              setSelectedId(null)
            }
          }}
        >
          <RotateCcw className="size-3.5" /> Beispiele laden
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
  for (const w of st.widgets) {
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

function WidgetTile({
  w,
  live,
  selected,
  first,
  last,
  onClick,
  onSend,
  onSendMany,
  onMove,
  onRemove
}: {
  w: OscWidget
  live: boolean
  selected: boolean
  first: boolean
  last: boolean
  onClick: () => void
  onSend: Send
  onSendMany: SendMany
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}): JSX.Element {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex h-44 flex-col rounded-lg border bg-card p-3 transition-colors',
        selected && !live ? 'border-foreground/60 ring-1 ring-foreground/30' : 'border-border',
        !live && 'cursor-pointer hover:border-foreground/40'
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: w.color }} />
        <span className="truncate text-sm font-medium" title={w.label}>
          {w.label || '—'}
        </span>
      </div>

      <div className={cn('min-h-0 flex-1', !live && 'pointer-events-none')}>
        {w.type === 'fader' && <Fader w={w} onSend={onSend} />}
        {w.type === 'toggle' && <Toggle w={w} onSend={onSend} />}
        {w.type === 'button' && <Momentary w={w} onSend={onSend} />}
        {w.type === 'xy' && <XYPad w={w} onSendMany={onSendMany} />}
        {w.type === 'color' && <ColorPad w={w} onSend={onSend} />}
      </div>

      <div className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground" title={w.address}>
        {w.address}
        {w.type === 'xy' && w.addressY ? `  ${w.addressY}` : ''}
      </div>

      {/* Bearbeiten-Overlay: verschieben / löschen */}
      {!live && (
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <TileBtn title="Nach links" disabled={first} onClick={() => onMove(-1)}>
            <ChevronLeft className="size-3.5" />
          </TileBtn>
          <TileBtn title="Nach rechts" disabled={last} onClick={() => onMove(1)}>
            <ChevronRight className="size-3.5" />
          </TileBtn>
          <TileBtn title="Entfernen" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </TileBtn>
        </div>
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

/* ------------------------- Bedienelement: Fader ------------------------- */

function Fader({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pending = useRef<number | null>(null)
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const norm = hi > lo ? clamp01((w.value - lo) / (hi - lo)) : 0

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  function flush(): void {
    raf.current = 0
    if (pending.current == null) return
    const v = pending.current
    pending.current = null
    useOscSurface.getState().updateWidget(w.id, { value: v })
    onSend(fmsg(w.address, v))
  }
  function setFromY(clientY: number): void {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const t = clamp01(1 - (clientY - r.top) / r.height)
    pending.current = lo + t * (hi - lo)
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setFromY(e.clientY)
      }}
      onPointerMove={(e) => {
        if (e.buttons) setFromY(e.clientY)
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      className="relative h-full w-full cursor-ns-resize overflow-hidden rounded-md bg-muted/50"
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
      style={{
        borderColor: w.color,
        background: on ? w.color : 'transparent',
        color: on ? '#fff' : undefined
      }}
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

function XYPad({ w, onSendMany }: { w: OscWidget; onSendMany: SendMany }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pend = useRef<{ x: number; y: number } | null>(null)

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
  function setFrom(clientX: number, clientY: number): void {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    pend.current = {
      x: clamp01((clientX - r.left) / r.width),
      y: clamp01(1 - (clientY - r.top) / r.height)
    }
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setFrom(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (e.buttons) setFrom(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      className="relative h-full w-full cursor-crosshair overflow-hidden rounded-md bg-muted/50"
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

function ColorPad({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const hex = rgb01ToHex(w.r, w.g, w.b)
  return (
    <label
      className="relative flex h-full w-full cursor-pointer items-end justify-center overflow-hidden rounded-md border border-white/15"
      style={{ background: hex }}
    >
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const { r, g, b } = hexToRgb01(e.target.value)
          useOscSurface.getState().updateWidget(w.id, { r, g, b })
          onSend({
            address: w.address,
            args: [
              { type: 'f', value: r },
              { type: 'f', value: g },
              { type: 'f', value: b }
            ]
          })
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <span className="mb-1 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] uppercase text-white">
        {hex}
      </span>
    </label>
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

function WidgetEditor({ w, onRemove }: { w: OscWidget; onRemove: () => void }): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
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
            // sinnvolle Zweitadresse für XY ergänzen, sonst Adressen behalten
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
        <Input
          value={host}
          spellCheck={false}
          placeholder="127.0.0.1"
          onChange={(e) => setHost(e.target.value)}
        />
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
        <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {status.lastError}
        </p>
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
            {' · '}Empfangen:{' '}
            <span className="tabular-nums text-foreground">{status?.recvCount ?? 0}</span>
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
          <p className="px-1 py-2 text-center text-xs text-muted-foreground">
            Noch keine OSC-Aktivität.
          </p>
        ) : (
          log.map((e) => (
            <div key={e.id} className="flex items-baseline gap-2 font-mono text-[11px]">
              <SlidersHorizontal
                className={cn(
                  'size-3 shrink-0 translate-y-0.5',
                  e.dir === 'out' ? 'text-primary' : 'text-emerald-500'
                )}
              />
              <span className="shrink-0 text-muted-foreground">{e.dir === 'out' ? '→' : '←'}</span>
              <span className="truncate text-foreground" title={e.address}>
                {e.address}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {fmtArgs(e.args)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
