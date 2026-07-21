// OSC-Steuerung: frei belegbares Steuerpult (Fader/Taster/Schalter/XY/Farbe),
// das OSC an MadMapper & Co. sendet. Aufbau wie die übrigen Tools (ToolShell:
// Arbeitsfläche + Inspector). In der Kopfzeile: SETS (gespeicherte Setups) links,
// Edit-/Live-Umschalter rechts (wie im Jingle-Player). Die Kacheln liegen in
// einem Raster und sind in der Größe ziehbar (Edit-Modus). Gesendet wird über
// den main-Prozess (api.osc).

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject
} from 'react'
import {
  Activity,
  Copy,
  ExternalLink,
  Monitor as MonitorIcon,
  Pencil,
  Pipette,
  Play,
  Plus,
  Radio,
  RotateCw,
  Send,
  Settings2,
  Smartphone,
  SlidersHorizontal,
  Star,
  Tablet,
  Trash2,
  Tv,
  Wifi,
  Zap
} from 'lucide-react'
import type {
  NovastarStatus,
  OscArg,
  OscFeedback,
  OscMessage,
  OscRemoteSnapshot,
  OscSettings,
  OscStatus,
  RemoteStatus
} from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { PanelSection, ToolShell } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { useDraft } from '@renderer/lib/useDraft'
import { useHandoff } from '@renderer/lib/handoff'
import { QrCode } from '@renderer/components/QrCode'
import {
  makeWidget,
  MAX_CH,
  MAX_COLS,
  MIN_COLS,
  NOVA_FN_LABEL,
  NOVA_PALETTE,
  oscSlug,
  useOscSurface,
  WIDGET_COLORS,
  WIDGET_MIN,
  WIDGET_ORDER,
  WIDGET_TYPE_LABEL,
  type NovaWidgetKind,
  type OscItem,
  type OscWidget,
  type OscWidgetType
} from './store'
import { labelForValue } from './mapping'

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
  const h = (x: number): string =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, '0')
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
  let r: number
  let g: number
  let b: number
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

// Restzeit eines laufenden Videos (für die Anzeige/Meter-Quelle „Video"). Wird
// von OscControl aus dem Video-Player gespeist und von den Meter-Kacheln gelesen.
interface VideoInfo {
  playing: boolean
  remainingSec: number | null
  durationSec: number
}
const VideoCtx = createContext<VideoInfo>({ playing: false, remainingSec: null, durationSec: 0 })

/** Sekunden als m:ss bzw. h:mm:ss. */
function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}
// Schachbrett-Hintergrund (zeigt Transparenz hinter dem Alpha-Regler).
const CHECKER = 'repeating-conic-gradient(#0006 0% 25%, #fff3 0% 50%) 50% / 10px 10px'

interface LogEntry {
  id: number
  dir: 'out' | 'in'
  address: string
  args: (number | string | boolean)[]
  at: number
}

type Send = (msg: OscMessage) => void
type SendMany = (msgs: OscMessage[]) => void
// NovaStar-Widget ausführen. `arg`: Fader=Helligkeit 0..100, Schalter=0/1,
// Taster=1 (Druck), Auswahl=Preset-Nummer.
type Nova = (w: OscWidget, arg: number) => void

/* ------------------------------ Hauptansicht ---------------------------- */

export function OscControl(): JSX.Element {
  const projects = useOscSurface((s) => s.projects)
  const currentProjectId = useOscSurface((s) => s.currentProjectId)
  const defaultProjectId = useOscSurface((s) => s.defaultProjectId)
  const mode = useOscSurface((s) => s.mode)
  const setStore = useOscSurface((s) => s.set)
  const live = mode === 'live'

  const project = projects.find((p) => p.id === currentProjectId) ?? projects[0]
  const sets = project.sets
  const currentSetId = project.currentSetId
  const set = sets.find((x) => x.id === currentSetId) ?? sets[0]
  const widgets = set.widgets
  const columns = set.columns
  const device = set.device
  const landscape = set.landscape

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Klick-zum-Einfügen: geklickte Zelle (gx/gy) + Bildschirmposition (x/y) des Pickers.
  // gx/gy gesetzt = an dieser Zelle einfügen (Flächen-Klick); ohne = seitlich
  // einreihen (Button „Widget hinzufügen“).
  const [picker, setPicker] = useState<{ gx?: number; gy?: number; x: number; y: number } | null>(
    null
  )
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [remotePort, setRemotePort] = useState(8091)
  const [video, setVideo] = useState<VideoInfo>({
    playing: false,
    remainingSec: null,
    durationSec: 0
  })
  const [status, setStatus] = useState<OscStatus | null>(null)
  const [config, setConfig] = useState<OscSettings | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const logRef = useRef<LogEntry[]>([])
  const logSeq = useRef(0)
  // Gedrosselte Spiegelung des Logs an etwaige OSC-Monitor-Fenster.
  const monPub = useRef<{ last: number; t: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    t: null
  })
  // Learn: ID des Widgets, das die nächste eingehende OSC-Adresse übernimmt.
  const [learnId, setLearnId] = useState<string | null>(null)
  const learnRef = useRef<string | null>(null)
  useEffect(() => {
    learnRef.current = learnId
  }, [learnId])

  // Set-Wechsel -> Auswahl + Einfüge-Picker zurücksetzen.
  useEffect(() => {
    setSelectedId(null)
    setPicker(null)
  }, [currentSetId])
  // Im Live-Modus keinen Einfüge-Picker offen lassen.
  useEffect(() => {
    if (mode === 'live') setPicker(null)
  }, [mode])
  // Auswahl-/Set-Wechsel -> Learn beenden.
  useEffect(() => setLearnId(null), [selectedId, currentSetId])

  const pushLog = useCallback(
    (dir: 'out' | 'in', address: string, args: (number | string | boolean)[]) => {
      const now = Date.now()
      const cur = logRef.current
      const top = cur[0]
      if (top && top.dir === dir && top.address === address && now - top.at < 80) {
        logRef.current = [{ ...top, args, at: now }, ...cur.slice(1)]
      } else {
        logRef.current = [{ id: logSeq.current++, dir, address, args, at: now }, ...cur].slice(
          0,
          60
        )
      }
      setLog(logRef.current)
      // gedrosselt (~150 ms) an etwaige Monitor-Fenster spiegeln
      const p = monPub.current
      const flush = (): void => {
        p.last = Date.now()
        p.t = null
        void api.osc.publishMonitor(logRef.current)
      }
      const since = now - p.last
      if (since >= 150) flush()
      else if (!p.t) p.t = setTimeout(flush, 150 - since)
    },
    []
  )

  // Anstehende Monitor-Spiegelung beim Schließen aufräumen.
  useEffect(() => {
    const p = monPub.current
    return () => {
      if (p.t) clearTimeout(p.t)
    }
  }, [])

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

  /* ---- NovaStar-Widgets (Ziel = geteilter Prozessor statt OSC) ---- */
  // Zuletzt gesetzte Helligkeit (0..100) -> Grundlage für relative Schritte und
  // weiche Blenden. Die Blende läuft als Intervall (wie im NovaStar-Tool).
  const novaBrightRef = useRef(100)
  const novaFadeRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopNovaFade = useCallback((): void => {
    if (novaFadeRef.current) {
      clearInterval(novaFadeRef.current)
      novaFadeRef.current = null
    }
  }, [])
  // Helligkeit setzen: an den Prozessor senden, merken und etwaige Helligkeits-
  // Fader auf der Fläche mitziehen (damit weiche Blenden sichtbar sind).
  const setNovaBright = useCallback(
    (pct: number): void => {
      const v = clamp(pct, 0, 100)
      novaBrightRef.current = v
      void api.novastar.brightness(v)
      const st = useOscSurface.getState()
      for (const x of st.currentSet().widgets) {
        if (x.target === 'nova' && x.nova.fn === 'brightness' && x.value !== v)
          st.updateWidget(x.id, { value: v })
      }
      pushLog('out', 'nova/helligkeit', [Math.round(v)])
    },
    [pushLog]
  )
  const fadeNovaTo = useCallback(
    (to: number, sec: number): void => {
      stopNovaFade()
      const from = novaBrightRef.current
      const steps = Math.max(1, Math.round((Math.max(0.1, sec) * 1000) / 50))
      let i = 0
      novaFadeRef.current = setInterval(() => {
        i++
        setNovaBright(from + (to - from) * (i / steps))
        if (i >= steps) stopNovaFade()
      }, 50)
    },
    [setNovaBright, stopNovaFade]
  )
  // Blackout und Freeze sind am Gerät EIN Anzeigemodus -> schließen sich
  // gegenseitig aus. Beim Einschalten des einen den anderen Schalter optisch lösen.
  const clearNovaMode = useCallback((keep: 'freeze' | 'blackout'): void => {
    const other = keep === 'freeze' ? 'blackout' : 'freeze'
    const st = useOscSurface.getState()
    for (const x of st.currentSet().widgets) {
      if (x.target === 'nova' && x.nova.fn === other && x.value >= 0.5)
        st.updateWidget(x.id, { value: 0 })
    }
  }, [])
  const runNova = useCallback<Nova>(
    (w, arg) => {
      const n = w.nova
      switch (n.fn) {
        case 'brightness':
          stopNovaFade()
          setNovaBright(arg)
          break
        case 'brightnessSet':
          stopNovaFade()
          setNovaBright(n.value)
          break
        case 'brightnessStep':
          stopNovaFade()
          setNovaBright(novaBrightRef.current + n.value)
          break
        case 'fadeToBlack':
          fadeNovaTo(arg >= 0.5 ? 0 : n.restore, n.value)
          break
        case 'freeze':
          if (arg >= 0.5) clearNovaMode('freeze')
          void api.novastar.freeze(arg >= 0.5)
          pushLog('out', 'nova/freeze', [arg >= 0.5 ? 1 : 0])
          break
        case 'blackout':
          if (arg >= 0.5) clearNovaMode('blackout')
          void api.novastar.blackout(arg >= 0.5)
          pushLog('out', 'nova/blackout', [arg >= 0.5 ? 1 : 0])
          break
        case 'preset':
          void api.novastar.preset(Math.round(arg))
          pushLog('out', 'nova/preset', [Math.round(arg)])
          break
      }
    },
    [setNovaBright, fadeNovaTo, stopNovaFade, clearNovaMode, pushLog]
  )
  // Laufende Blende beim Schließen des Tabs stoppen.
  useEffect(() => () => stopNovaFade(), [stopNovaFade])

  useEffect(() => {
    let alive = true
    void api.osc.config().then((c) => alive && setConfig(c))
    void api.osc.status().then((st) => alive && setStatus(st))
    const offStatus = api.osc.onStatus((st) => setStatus(st))
    const offFeedback = api.osc.onFeedback((fb) => {
      pushLog('in', fb.address, fb.args)
      // Learn-Modus: die nächste eingehende Adresse ins gewählte Widget übernehmen.
      if (learnRef.current) {
        useOscSurface.getState().updateWidget(learnRef.current, { address: fb.address })
        setLearnId(null)
        return
      }
      reflectFeedback(fb)
    })
    return () => {
      alive = false
      offStatus()
      offFeedback()
    }
  }, [pushLog])

  // Fernsteuerung: Status beobachten + Steuerbefehle vom Handy/Tablet anwenden
  // (Live-Wert aktualisieren UND OSC senden – wie eine lokale Bedienung).
  useEffect(() => {
    void api.osc.remoteStatus().then(setRemote)
    const offChanged = api.osc.onRemoteChanged(setRemote)
    const offCmd = api.osc.onRemoteCommand((cmd) => {
      const st = useOscSurface.getState()
      // Set-Wechsel vom Handy: kein Widget-Bezug -> vor der Widget-Suche behandeln.
      // Der Publish-Effekt schickt danach automatisch den neuen Schnappschuss.
      if (cmd.kind === 'selectSet') {
        if (st.currentProject().sets.some((s) => s.id === cmd.id)) st.selectSet(cmd.id)
        return
      }
      const w = st.currentSet().widgets.find((x) => x.id === cmd.id)
      if (!w) return
      // NovaStar-Widgets: gleiche Basis-Kommandos vom Handy, aber an den Prozessor.
      if (w.target === 'nova') {
        if (cmd.kind === 'fader') {
          st.updateWidget(w.id, { value: cmd.value })
          runNova(w, cmd.value)
        } else if (cmd.kind === 'toggle') {
          st.updateWidget(w.id, { value: cmd.on ? 1 : 0 })
          runNova(w, cmd.on ? 1 : 0)
        } else if (cmd.kind === 'button') {
          if (cmd.down) runNova(w, 1)
        } else if (cmd.kind === 'select') {
          const it = w.items[cmd.index]
          if (it) {
            st.updateWidget(w.id, { value: cmd.index })
            runNova(w, it.value)
          }
        }
        return
      }
      if (cmd.kind === 'fader') {
        st.updateWidget(w.id, { value: cmd.value })
        send(fmsg(w.address, cmd.value))
      } else if (cmd.kind === 'toggle') {
        st.updateWidget(w.id, { value: cmd.on ? 1 : 0 })
        send(fmsg(w.address, cmd.on ? w.onValue : w.offValue))
      } else if (cmd.kind === 'button') {
        send(fmsg(w.address, cmd.down ? w.onValue : w.offValue))
      } else if (cmd.kind === 'xy') {
        st.updateWidget(w.id, { x: cmd.x, y: cmd.y })
        const msgs: OscMessage[] = [fmsg(w.address, cmd.x)]
        if (w.addressY) msgs.push(fmsg(w.addressY, cmd.y))
        sendMany(msgs)
      } else if (cmd.kind === 'color') {
        st.updateWidget(w.id, { r: cmd.r, g: cmd.g, b: cmd.b, a: cmd.a })
        send({
          address: w.address,
          args: [
            { type: 'f', value: cmd.r },
            { type: 'f', value: cmd.g },
            { type: 'f', value: cmd.b },
            { type: 'f', value: cmd.a }
          ]
        })
      } else if (cmd.kind === 'select') {
        const it = w.items[cmd.index]
        if (it) {
          st.updateWidget(w.id, { value: cmd.index })
          send(fmsg(it.address || w.address, it.value))
        }
      } else if (cmd.kind === 'bank') {
        const it = w.items[cmd.index]
        if (!it) return
        const addr = it.address || w.address
        const setItem = (value: number): void =>
          st.updateWidget(w.id, {
            items: w.items.map((x, i) => (i === cmd.index ? { ...x, value } : x))
          })
        if (w.bankMode === 'knob') {
          setItem(cmd.value)
          send(fmsg(addr, cmd.value))
        } else if (w.bankMode === 'toggle') {
          const on = cmd.value >= 0.5
          setItem(on ? 1 : 0)
          send(fmsg(addr, on ? w.onValue : w.offValue))
        } else {
          send(fmsg(addr, cmd.value >= 0.5 ? w.onValue : w.offValue))
        }
      } else if (cmd.kind === 'knob') {
        st.updateWidget(w.id, { value: cmd.value })
        send(fmsg(w.address, cmd.value))
      } else if (cmd.kind === 'knobStep') {
        // Handy sendet nur die Richtung (±1 je Rastung); Schrittweite = onValue.
        send(fmsg(w.address, cmd.delta * (Math.abs(w.onValue) || 1)))
      }
    })
    return () => {
      offChanged()
      offCmd()
    }
  }, [send, sendMany, runNova])

  // Schnappschuss der Oberfläche an den Fernsteuer-Server – gedrosselt, da sich
  // Werte beim Ziehen schnell ändern.
  const pubRef = useRef<{ t: number; timer: ReturnType<typeof setTimeout> | null }>({
    t: 0,
    timer: null
  })
  const publishSnapshot = useCallback((): void => {
    const store = useOscSurface.getState()
    const cs = store.currentSet()
    const snap: OscRemoteSnapshot = {
      connected: true,
      setName: cs.name,
      columns: cs.columns,
      sets: store.currentProject().sets.map((s) => ({ id: s.id, name: s.name })),
      currentSetId: cs.id,
      widgets: cs.widgets.map((w) => {
        const m = w.type === 'meter' ? meterReadout(w, video) : { level: 0, text: '' }
        return {
          id: w.id,
          type: w.type,
          label: w.label,
          color: w.color,
          address: w.address,
          addressY: w.addressY,
          min: w.min,
          max: w.max,
          gx: w.gx,
          gy: w.gy,
          cw: w.cw,
          ch: w.ch,
          value: w.value,
          x: w.x,
          y: w.y,
          r: w.r,
          g: w.g,
          b: w.b,
          a: w.a,
          align: w.align,
          meterLevel: m.level,
          meterText: m.text,
          items: w.items.map((it) => ({ label: it.label, address: it.address, value: it.value })),
          orient: w.orient,
          cols: w.cols,
          bankMode: w.bankMode,
          endless: w.endless
        }
      })
    }
    void api.osc.publish(snap)
  }, [video])
  useEffect(() => {
    const p = pubRef.current
    const run = (): void => {
      p.t = Date.now()
      p.timer = null
      publishSnapshot()
    }
    const dt = Date.now() - p.t
    if (dt >= 150) run()
    else if (!p.timer) p.timer = setTimeout(run, 150 - dt)
    // `sets` als Dep -> auch Umbenennen/Hinzufügen/Löschen anderer Sets erneuert
    // die Umschaltleiste am Handy. `publishSnapshot` hängt an `video` (Meter).
  }, [set, sets, columns, widgets, publishSnapshot])

  // Beim Schließen des Tabs ausstehende Veröffentlichung abbrechen und dem
  // Server „getrennt" melden. pubRef zeigt auf ein stabiles Objekt -> die
  // Referenz beim Mount einzufangen ist korrekt.
  useEffect(() => {
    const p = pubRef.current
    return () => {
      if (p.timer) {
        clearTimeout(p.timer)
        p.timer = null
      }
      void api.osc.publish({
        connected: false,
        setName: '',
        columns: 24,
        widgets: [],
        sets: [],
        currentSetId: ''
      })
    }
  }, [])

  // Restzeit des laufenden Videos beobachten (Quelle „Video" der Anzeige/Meter).
  // Bewusst grob: nur bei ganzzahliger Sekundenänderung neu rendern.
  useEffect(() => {
    let playing = false
    let dur = 0
    let pos = 0
    const apply = (): void => {
      const remaining = playing && dur > 0 ? Math.max(0, Math.round(dur - pos)) : null
      setVideo((prev) =>
        prev.playing === playing && prev.remainingSec === remaining && prev.durationSec === dur
          ? prev
          : { playing, remainingSec: remaining, durationSec: dur }
      )
    }
    void api.player
      .getState()
      .then((s) => {
        if (!s) return
        playing = s.playing
        dur = s.durationSec
        pos = s.positionSec
        apply()
      })
      .catch(() => {})
    const offState = api.player.onState((s) => {
      playing = s.playing
      dur = s.durationSec
      pos = s.positionSec
      apply()
    })
    const offTick = api.player.onTick((t) => {
      dur = t.durationSec
      pos = t.positionSec
      apply()
    })
    return () => {
      offState()
      offTick()
    }
  }, [])

  const selected = widgets.find((w) => w.id === selectedId) ?? null

  // Geräte-Vorschau (Stufe 2): die Fläche in einem Handy-/Tablet-Rahmen zeigen.
  const previewing = device !== 'off'
  const dim = device === 'off' ? null : DEVICES[device]
  const frameW = dim ? (landscape ? dim.h : dim.w) : 0
  const frameH = dim ? (landscape ? dim.w : dim.h) : 0

  // Stabile Kachel-Handler (Deps leer) -> React.memo der Kacheln greift.
  const removeWidget = useCallback((id: string): void => {
    useOscSurface.getState().removeWidget(id)
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  const duplicateWidgetSel = useCallback((id: string): void => {
    const nid = useOscSurface.getState().duplicateWidget(id)
    if (nid) setSelectedId(nid)
  }, [])

  const placePick = useCallback((gx: number, gy: number, x: number, y: number): void => {
    setPicker((p) => (p ? null : { gx, gy, x, y }))
  }, [])

  async function toggleRemote(): Promise<void> {
    if (remote?.running) {
      setRemote(await api.osc.remoteStop())
    } else {
      try {
        setRemote(await api.osc.remoteStart(remotePort))
        publishSnapshot() // dem Server sofort den aktuellen Stand geben
      } catch {
        // Port belegt o.ä. – Status bleibt unverändert
      }
    }
  }

  function onAdd(type: OscWidgetType, pos?: { gx: number; gy: number }): void {
    const id = useOscSurface.getState().addWidget(type, pos)
    setSelectedId(id)
    if (mode !== 'edit') setStore({ mode: 'edit' })
  }
  function onAddNova(kind: NovaWidgetKind, pos?: { gx: number; gy: number }): void {
    const id = useOscSurface.getState().addNovaWidget(kind, pos)
    setSelectedId(id)
    if (mode !== 'edit') setStore({ mode: 'edit' })
  }

  const statusDot = status
    ? status.lastError
      ? 'bg-destructive'
      : 'bg-emerald-500'
    : 'bg-muted-foreground'

  const main = (
    <VideoCtx.Provider value={video}>
      <div className="flex h-full flex-col">
        {/* Kopfzeile: Projekt-Zeile (Set-Sammlungen) + Set-Zeile darunter */}
        <div className="border-b border-border px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Projekt
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => useOscSurface.getState().selectProject(p.id)}
                  className={cn(
                    'flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm transition-colors',
                    p.id === project.id
                      ? 'border-primary/60 bg-primary/10 font-semibold text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  )}
                >
                  {p.id === defaultProjectId && <Star className="size-3 fill-current opacity-70" />}
                  {p.name || '—'}
                </button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                title="Projekt hinzufügen (übernimmt das Default-Projekt, falls gesetzt)"
                onClick={() => useOscSurface.getState().addProject()}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="h-5 w-px bg-border" />
            <Input
              value={project.name}
              onChange={(e) => useOscSurface.getState().renameProject(project.id, e.target.value)}
              placeholder="Projekt-Titel"
              title="Titel = erstes OSC-Adresssegment neuer Widgets (z. B. „mottl“ → /mottl/fader)"
              className="h-8 w-40"
            />
            <Button
              variant="outline"
              size="sm"
              title="Aktuelles Projekt als Default-Projekt speichern (Vorlage für neue Projekte)"
              onClick={() => useOscSurface.getState().saveAsDefaultProject()}
            >
              <Star
                className={cn(
                  'size-3.5',
                  defaultProjectId === project.id && 'fill-current text-primary'
                )}
              />{' '}
              Default
            </Button>
            {projects.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                title="Projekt löschen"
                onClick={() => {
                  void api
                    .confirm({
                      message: `Projekt „${project.name}“ mit allen Sets löschen?`,
                      confirmLabel: 'Löschen',
                      danger: true
                    })
                    .then((ok) => {
                      if (ok) useOscSurface.getState().deleteProject(project.id)
                    })
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>

          {/* deutliche Trennung Projekt <-> Sets */}
          <div className="-mx-5 my-2 h-px bg-border" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Set
            </span>
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

            {/* Aktives Set: Name + Spaltenraster direkt im Header. */}
            <div className="h-5 w-px bg-border" />
            <Input
              value={set.name}
              onChange={(e) => useOscSurface.getState().renameSet(set.id, e.target.value)}
              placeholder="Set-Name"
              className="h-8 w-36"
            />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
              Spalten
              <NumberField
                value={columns}
                min={MIN_COLS}
                max={MAX_COLS}
                onCommit={(v) => useOscSurface.getState().setColumns(v)}
                className="h-8 w-16"
              />
            </label>
            {sets.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                title="Set löschen"
                onClick={() => {
                  void api
                    .confirm({
                      message: `Set „${set.name}“ wirklich löschen?`,
                      confirmLabel: 'Löschen',
                      danger: true
                    })
                    .then((ok) => {
                      if (ok) useOscSurface.getState().deleteSet(set.id)
                    })
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            )}

            <div className="flex-1" />

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

            {/* Geräte-Vorschau */}
            <div className="flex overflow-hidden rounded-md border border-border">
              <DeviceBtn
                active={!previewing}
                title="Normale Ansicht"
                onClick={() => useOscSurface.getState().setDevice('off')}
              >
                <MonitorIcon className="size-4" />
              </DeviceBtn>
              <DeviceBtn
                active={device === 'phone'}
                title="Handy-Vorschau"
                onClick={() => useOscSurface.getState().setDevice('phone')}
              >
                <Smartphone className="size-4" />
              </DeviceBtn>
              <DeviceBtn
                active={device === 'tablet'}
                title="Tablet-Vorschau"
                onClick={() => useOscSurface.getState().setDevice('tablet')}
              >
                <Tablet className="size-4" />
              </DeviceBtn>
            </div>
            {previewing && (
              <Button
                variant="ghost"
                size="icon"
                title="Hoch-/Querformat"
                onClick={() => useOscSurface.getState().setLandscape(!landscape)}
              >
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
                  !live
                    ? 'bg-primary/15 font-semibold text-primary'
                    : 'text-muted-foreground hover:text-foreground'
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
        </div>

        {/* Steuerpult – normal oder im Geräterahmen (Vorschau ist auch im
          Edit-Modus bearbeitbar). */}
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {previewing ? (
            <DeviceFrame w={frameW} h={frameH}>
              {(scale) =>
                widgets.length === 0 && live ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Noch keine Bedienelemente.
                  </p>
                ) : (
                  <SurfaceGrid
                    columns={columns}
                    widgets={widgets}
                    live={live}
                    scale={scale}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onDuplicate={duplicateWidgetSel}
                    onRemove={removeWidget}
                    onSend={send}
                    onSendMany={sendMany}
                    onNova={runNova}
                    onPlacePick={placePick}
                  />
                )
              }
            </DeviceFrame>
          ) : widgets.length === 0 && live ? (
            <Card className="flex h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Noch keine Bedienelemente.
            </Card>
          ) : (
            <>
              {widgets.length === 0 && (
                <p className="mb-3 text-center text-sm text-muted-foreground">
                  Leere Rasterfläche anklicken, um hier ein Widget einzufügen – oder „Widget
                  hinzufügen“ rechts.
                </p>
              )}
              <SurfaceGrid
                columns={columns}
                widgets={widgets}
                live={live}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDuplicate={duplicateWidgetSel}
                onRemove={removeWidget}
                onSend={send}
                onSendMany={sendMany}
                onNova={runNova}
                onPlacePick={placePick}
              />
            </>
          )}
        </div>
        {picker && (
          <WidgetPicker
            x={picker.x}
            y={picker.y}
            onPick={(t) => {
              onAdd(
                t,
                picker.gx != null && picker.gy != null
                  ? { gx: picker.gx, gy: picker.gy }
                  : undefined
              )
              setPicker(null)
            }}
            onPickNova={(kind) => {
              onAddNova(
                kind,
                picker.gx != null && picker.gy != null
                  ? { gx: picker.gx, gy: picker.gy }
                  : undefined
              )
              setPicker(null)
            }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </VideoCtx.Provider>
  )

  const aside = (
    <>
      <div className="border-b border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            if (mode !== 'edit') setStore({ mode: 'edit' })
            setPicker({ x: Math.max(8, r.left - 140), y: r.bottom + 4 })
          }}
        >
          <Plus className="size-4" /> Widget hinzufügen
        </Button>
      </div>

      <PanelSection id="widget" title="Widget" icon={Settings2}>
        {selected ? (
          <WidgetEditor
            key={selected.id}
            w={selected}
            columns={columns}
            learning={learnId === selected.id}
            canLearn={!!status?.listening}
            onToggleLearn={() => setLearnId((id) => (id === selected.id ? null : selected.id))}
            onDuplicate={() => {
              const id = useOscSurface.getState().duplicateWidget(selected.id)
              if (id) setSelectedId(id)
            }}
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

      <PanelSection
        id="connection"
        title="Verbindung"
        icon={Radio}
        right={<span className={cn('size-2.5 rounded-full', statusDot)} />}
      >
        <ConnectionPanel
          config={config}
          status={status}
          onApplied={(st) => setStatus(st)}
          onSend={send}
        />
      </PanelSection>

      <PanelSection
        id="osc-remote"
        title="Fernsteuerung"
        icon={Wifi}
        right={
          <span
            className={cn(
              'size-2.5 rounded-full',
              remote?.running ? 'bg-emerald-500' : 'bg-muted-foreground'
            )}
          />
        }
      >
        <p className="text-sm text-muted-foreground">
          Handy/Tablet im selben WLAN bedient diese Oberfläche (ohne Passwort). Dieses Fenster muss
          offen bleiben.
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Port
            <Input
              type="number"
              value={remotePort}
              onChange={(e) => setRemotePort(Number(e.target.value) || 8091)}
              disabled={remote?.running}
              className="h-8 w-24"
            />
          </label>
          <Button
            variant={remote?.running ? 'outline' : 'default'}
            size="sm"
            className="ml-auto"
            onClick={() => void toggleRemote()}
          >
            <Wifi className="size-4" /> {remote?.running ? 'Stoppen' : 'Aktivieren'}
          </Button>
        </div>
        {remote?.running && remote.urls[0] && (
          <div className="flex items-start gap-3 rounded-md border border-border p-2">
            <div className="shrink-0 rounded bg-white p-1">
              <QrCode text={remote.urls[0]} size={96} />
            </div>
            <div className="min-w-0 text-xs">
              <p className="mb-1 text-muted-foreground">
                Im Browser öffnen (QR scannen oder eintippen):
              </p>
              {remote.urls.map((u) => (
                <div key={u} className="truncate font-mono text-foreground">
                  {u}
                </div>
              ))}
            </div>
          </div>
        )}
      </PanelSection>

      <PanelSection
        id="novastar"
        title="NovaStar (LED)"
        icon={Tv}
        defaultOpen={false}
        right={<NovaStarDot />}
      >
        <NovaStarPanel />
      </PanelSection>

      <PanelSection id="monitor" title="OSC-Monitor" icon={Activity} defaultOpen={false}>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          title="OSC-Monitor in einem eigenen Fenster öffnen (spiegelt dieses Log)"
          onClick={() => void api.osc.openMonitor()}
        >
          <ExternalLink className="size-3.5" /> Eigenes Fenster
        </Button>
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
  const toNum = (a: string | number | boolean | undefined): number | null =>
    typeof a === 'number' ? a : typeof a === 'boolean' ? (a ? 1 : 0) : null
  const num = toNum(fb.args[0])
  const st = useOscSurface.getState()
  for (const w of st.currentSet().widgets) {
    if (w.target === 'nova') continue // NovaStar-Widgets kennen kein OSC-Feedback
    if (w.type === 'color' && w.address === fb.address && num != null) {
      // r,g,b(,a) aus den ersten Argumenten – fehlende Kanäle bleiben unverändert.
      const patch: Partial<OscWidget> = { r: clamp01(num) }
      const g = toNum(fb.args[1])
      const b = toNum(fb.args[2])
      const a = toNum(fb.args[3])
      if (g != null) patch.g = clamp01(g)
      if (b != null) patch.b = clamp01(b)
      if (a != null) patch.a = clamp01(a)
      st.updateWidget(w.id, patch)
      continue
    }
    // Text-Anzeige: beliebige Argumente (auch Strings) übernehmen – z.B.
    // Blendmodus oder Surface-Name von MadMapper. Muss VOR dem num-Guard stehen,
    // da String-Feedback keinen numerischen Wert hat. Kommt eine ZAHL und sind
    // Wert→Text-Zuordnungen gepflegt, wird der passende Name gezeigt (MadMapper
    // sendet für Enums nur Zahlen, keinen Klartext).
    if (w.type === 'meter' && w.source === 'text' && w.address === fb.address) {
      const first = fb.args[0]
      const text =
        typeof first === 'number' && w.items.length > 0
          ? labelForValue(first, w.items)
          : fb.args.map((a) => (typeof a === 'boolean' ? (a ? 'An' : 'Aus') : String(a))).join(' ')
      st.updateWidget(w.id, { text })
      continue
    }
    if (num == null) continue
    if ((w.type === 'fader' || (w.type === 'knob' && !w.endless)) && w.address === fb.address) {
      const lo = Math.min(w.min, w.max)
      const hi = Math.max(w.min, w.max)
      st.updateWidget(w.id, { value: clamp(num, lo, hi) })
    } else if (w.type === 'toggle' && w.address === fb.address) {
      st.updateWidget(w.id, { value: num >= 0.5 ? 1 : 0 })
    } else if (w.type === 'xy') {
      if (w.address === fb.address) st.updateWidget(w.id, { x: clamp01(num) })
      if (w.addressY === fb.address) st.updateWidget(w.id, { y: clamp01(num) })
    } else if (w.type === 'meter' && w.source === 'osc' && w.address === fb.address) {
      st.updateWidget(w.id, { value: num })
    } else if (w.type === 'select') {
      // Option, deren Adresse+Wert zum Feedback passt -> als aktiv markieren.
      const idx = w.items.findIndex(
        (it) => (it.address || w.address) === fb.address && it.value === num
      )
      if (idx >= 0) st.updateWidget(w.id, { value: idx })
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

// memo: OSC-Feedback/Log-Spam rendert sonst bei JEDER Nachricht ALLE Kacheln neu.
// Der Store erhält die Identität unveränderter Widgets, die Callbacks sind
// id-basiert und stabil -> nur tatsächlich betroffene Kacheln rendern.
const WidgetTile = memo(function WidgetTile({
  w,
  live,
  selected,
  columns,
  gridRef,
  scale = 1,
  onSelect,
  onSend,
  onSendMany,
  onNova,
  onDuplicate,
  onRemove
}: {
  w: OscWidget
  live: boolean
  selected: boolean
  columns: number
  gridRef: RefObject<HTMLDivElement>
  scale?: number
  onSelect: (id: string) => void
  onSend: Send
  onSendMany: SendMany
  onNova: Nova
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
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
    onSelect(w.id)
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
      // In der skalierten Geräte-Vorschau zeigt der Zeiger Bildschirm-Pixel ->
      // durch scale teilen, um Layout-Pixel zu erhalten.
      const ngx = clampInt(sgx + (ev.clientX - spx) / scale / colStep, 0, columns - cw)
      const ngy = Math.max(0, Math.round(sgy + (ev.clientY - spy) / scale / rowStep))
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
      const ncw = clampInt(((ev.clientX - left) / scale + GAP) / colStep, 1, columns - gx)
      const nch = clampInt(((ev.clientY - top) / scale + GAP) / rowStep, 1, MAX_CH)
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

  const showAddr =
    !live &&
    w.ch >= 2 &&
    w.type !== 'label' &&
    w.type !== 'select' &&
    w.type !== 'bank' &&
    !(w.type === 'meter' && w.source === 'video')

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
      {!compact && w.type !== 'label' && (
        <div className="mb-1 flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full" style={{ background: w.color }} />
          <span className="truncate text-xs font-medium" title={w.label}>
            {w.label || '—'}
          </span>
        </div>
      )}

      <div className={cn('min-h-0 flex-1', !live && 'pointer-events-none')}>
        {w.type === 'fader' && <Fader w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'knob' && <Knob w={w} onSend={onSend} />}
        {w.type === 'toggle' && <Toggle w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'button' && <Momentary w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'xy' && <XYPad w={w} onSendMany={onSendMany} />}
        {w.type === 'color' && <ColorPad w={w} onSend={onSend} />}
        {w.type === 'label' && <LabelView w={w} />}
        {w.type === 'meter' && <Meter w={w} />}
        {w.type === 'select' && <SelectPad w={w} onSend={onSend} onNova={onNova} />}
        {w.type === 'bank' && <BankGrid w={w} onSend={onSend} />}
      </div>

      {showAddr && (
        <div
          className="mt-1 truncate pr-4 font-mono text-[10px] text-muted-foreground"
          title={w.address}
        >
          {w.address}
          {w.type === 'xy' && w.addressY ? `  ${w.addressY}` : ''}
        </div>
      )}

      {!live && (
        <>
          <div
            data-no-drag
            className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <TileBtn title="Duplizieren" onClick={() => onDuplicate(w.id)}>
              <Copy className="size-3.5" />
            </TileBtn>
            <TileBtn title="Entfernen" onClick={() => onRemove(w.id)}>
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
})

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
// verfügbare Größe herunterskaliert. Reicht den Skalierungsfaktor an die Kinder
// weiter, damit das Ziehen in der Vorschau rastergenau bleibt.
function DeviceFrame({
  w,
  h,
  children
}: {
  w: number
  h: number
  children: (scale: number) => ReactNode
}): JSX.Element {
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
          {/* Scrollbar im „Display" ausblenden: die 10px-Scrollleiste läge sonst
              als dicke Linie direkt am Rahmen und würde ihn optisch verdoppeln.
              Gescrollt wird weiterhin (Rad/Ziehen); scrollbar-width für nicht-
              Chromium-Fälle, ::-webkit-scrollbar für Electron. */}
          <div
            style={{ width: w, height: h }}
            className="overflow-auto rounded-[1.6rem] bg-background p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {children(scale)}
          </div>
        </div>
      </div>
    </div>
  )
}

// Das Raster mit allen Kacheln. Wird sowohl normal als auch in der
// Geräte-Vorschau verwendet; `scale` macht das Ziehen im skalierten Rahmen
// korrekt, `live` entscheidet über Bedienen (true) bzw. Bearbeiten (false).
// memo: Log-/Status-Re-Renders des Elternteils ohne Widget-Änderung überspringen.
const SurfaceGrid = memo(function SurfaceGrid({
  columns,
  widgets,
  live,
  scale = 1,
  selectedId,
  onSelect,
  onDuplicate,
  onRemove,
  onSend,
  onSendMany,
  onNova,
  onPlacePick
}: {
  columns: number
  widgets: OscWidget[]
  live: boolean
  scale?: number
  selectedId: string | null
  onSelect: (id: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onSend: Send
  onSendMany: SendMany
  onNova: Nova
  onPlacePick?: (gx: number, gy: number, clientX: number, clientY: number) => void
}): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null)
  // Merkt sich, wo ein Druck begann -> ein Klick nach Drag/Resize (Bewegung oder
  // Start auf einer Kachel) öffnet NICHT den Picker.
  const downRef = useRef<{ x: number; y: number; onGrid: boolean }>({ x: 0, y: 0, onGrid: false })
  // Zelle unter dem Cursor (nur leere Fläche, Edit) -> Hover-Hinweis „hier einfügen".
  const [hoverCell, setHoverCell] = useState<{ gx: number; gy: number } | null>(null)
  const maxBottom = widgets.reduce((m, w) => Math.max(m, w.gy + w.ch), 0)
  const rows = live ? Math.max(maxBottom, 1) : Math.max(maxBottom + 3, 10)

  function handleGridPointerDown(e: ReactPointerEvent<HTMLDivElement>): void {
    downRef.current = { x: e.clientX, y: e.clientY, onGrid: e.target === gridRef.current }
  }

  /** Rasterzelle aus Bildschirmkoordinaten (berücksichtigt die Vorschau-Skalierung). */
  function cellAt(clientX: number, clientY: number): { gx: number; gy: number } | null {
    const grid = gridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    const colStep = (grid.clientWidth + GAP) / columns
    const rowStep = ROW_H + GAP
    const gx = Math.max(
      0,
      Math.min(columns - 1, Math.floor((clientX - rect.left) / scale / colStep))
    )
    const gy = Math.max(0, Math.floor((clientY - rect.top) / scale / rowStep))
    return { gx, gy }
  }

  // Hover über leere Fläche -> Zelle hervorheben (Rahmen + Plus signalisiert „hier
  // klicken zum Einfügen"). Über Kacheln/Live nichts.
  function handleGridMove(e: ReactMouseEvent<HTMLDivElement>): void {
    if (live || !onPlacePick || e.target !== gridRef.current) {
      if (hoverCell) setHoverCell(null)
      return
    }
    const c = cellAt(e.clientX, e.clientY)
    if (c && (!hoverCell || hoverCell.gx !== c.gx || hoverCell.gy !== c.gy)) setHoverCell(c)
  }

  // Klick auf die leere Rasterfläche (nur Edit) -> Picker an der Zelle öffnen
  // (Klicks auf/aus Kacheln oder nach Drag/Resize werden ignoriert).
  function handleEmptyClick(e: ReactMouseEvent<HTMLDivElement>): void {
    const grid = gridRef.current
    if (live || !onPlacePick || !grid || e.target !== grid) return
    const d = downRef.current
    const moved = Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4
    if (!d.onGrid || moved) return
    const c = cellAt(e.clientX, e.clientY)
    if (c) onPlacePick(c.gx, c.gy, e.clientX, e.clientY)
  }

  return (
    <div
      ref={gridRef}
      onPointerDown={handleGridPointerDown}
      onClick={handleEmptyClick}
      onMouseMove={handleGridMove}
      onMouseLeave={() => setHoverCell(null)}
      className="grid select-none"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_H}px`,
        gap: `${GAP}px`
      }}
    >
      {!live && <GridBackdrop columns={columns} rows={rows} />}
      {!live && hoverCell && (
        <div
          className="pointer-events-none z-0 flex items-center justify-center rounded-[4px] border-2 border-dashed border-primary/70 bg-primary/10 text-primary"
          style={{ gridColumn: `${hoverCell.gx + 1}`, gridRow: `${hoverCell.gy + 1}` }}
        >
          <Plus className="size-4" />
        </div>
      )}
      {widgets.map((w) => (
        <WidgetTile
          key={w.id}
          w={w}
          live={live}
          selected={w.id === selectedId}
          columns={columns}
          gridRef={gridRef}
          scale={scale}
          onSelect={onSelect}
          onSend={onSend}
          onSendMany={onSendMany}
          onNova={onNova}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
})

/** Klick-zum-Einfügen: kleine Palette am Klickpunkt; Auswahl fügt das Widget an
 *  der angeklickten Zelle ein. Per fixed positioniert (außerhalb der skalierten
 *  Geräte-Vorschau gerendert, daher Viewport-Koordinaten). */
function WidgetPicker({
  x,
  y,
  onPick,
  onPickNova,
  onClose
}: {
  x: number
  y: number
  onPick: (t: OscWidgetType) => void
  onPickNova: (kind: NovaWidgetKind) => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  // Schließen erfolgt über Escape, Auswahl oder einen weiteren Klick auf die
  // Arbeitsfläche (Toggle im Aufrufer) – kein eigener Outside-Click-Listener,
  // damit der Flächen-Klick nicht sofort wieder einen neuen Picker öffnet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // am Klickpunkt verankern, aber im Viewport halten (höher wegen NovaStar-Block)
  const left = Math.max(8, Math.min(x, window.innerWidth - 220))
  const top = Math.max(8, Math.min(y, window.innerHeight - 420))
  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 50 }}
      className="max-h-[80vh] w-52 select-none overflow-auto rounded-lg border border-border bg-card p-2 shadow-xl"
    >
      <p className="mb-1.5 px-1 text-xs text-muted-foreground">Widget einfügen</p>
      <div className="grid grid-cols-2 gap-1.5">
        {WIDGET_ORDER.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-muted/40"
          >
            <Plus className="size-3 shrink-0" /> {WIDGET_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {/* NovaStar-Bedienelemente: eigene Kacheln, die an den Prozessor senden. */}
      <p className="mb-1.5 mt-2.5 flex items-center gap-1 px-1 text-xs text-muted-foreground">
        <Tv className="size-3" /> NovaStar (LED)
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {NOVA_PALETTE.map((e) => (
          <button
            key={e.kind}
            type="button"
            onClick={() => onPickNova(e.kind)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-primary/50 hover:bg-muted/40"
          >
            <Plus className="size-3 shrink-0" /> {e.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------- Bedienelement: Fader ------------------------- */

function Fader({ w, onSend, onNova }: { w: OscWidget; onSend: Send; onNova?: Nova }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)
  const pending = useRef<number | null>(null)
  const start = useRef<{ p: number; v: number } | null>(null)
  const horiz = w.orient === 'h'
  const isNova = w.target === 'nova'
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
    if (isNova) onNova?.(w, v)
    else onSend(fmsg(w.address, v))
  }
  // Relativ: ab dem Anfasspunkt ziehen (kein Sprung auf den Klickwert).
  function drag(client: number): void {
    const el = ref.current
    const st = start.current
    if (!el || !st) return
    const r = el.getBoundingClientRect()
    const dNorm = horiz ? (client - st.p) / r.width : -(client - st.p) / r.height
    pending.current = clamp(st.v + dNorm * span, lo, hi)
    if (!raf.current) raf.current = requestAnimationFrame(flush)
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { p: horiz ? e.clientX : e.clientY, v: w.value }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(horiz ? e.clientX : e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
      className={cn(
        'relative h-full w-full touch-none overflow-hidden rounded-md bg-muted/50',
        horiz ? 'cursor-ew-resize' : 'cursor-ns-resize'
      )}
    >
      {horiz ? (
        <>
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${norm * 100}%`, background: w.color, opacity: 0.85 }}
          />
          <div className="absolute inset-y-0" style={{ left: `${norm * 100}%` }}>
            <div className="h-full w-0.5 bg-foreground/80" />
          </div>
        </>
      ) : (
        <>
          <div
            className="absolute inset-x-0 bottom-0"
            style={{ height: `${norm * 100}%`, background: w.color, opacity: 0.85 }}
          />
          <div className="absolute inset-x-0" style={{ bottom: `${norm * 100}%` }}>
            <div className="h-0.5 w-full bg-foreground/80" />
          </div>
        </>
      )}
      <span className="absolute inset-x-0 bottom-1 text-center text-[11px] tabular-nums text-foreground/90">
        {isNova ? `${Math.round(w.value)} %` : w.value.toFixed(2)}
      </span>
    </div>
  )
}

/* -------------------------- Bedienelement: Poti ------------------------- */

// Drehknopf/Poti: vertikal ziehen ändert den Wert. Absolut (min..max) oder als
// Endlos-Encoder (sendet relative Schritte = onValue je „Rastung").
function Knob({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const span = hi - lo || 1
  const norm = w.endless ? 0.5 : clamp01((w.value - lo) / span)
  const start = useRef<{ py: number; v: number; acc: number } | null>(null)
  const step = Math.abs(w.onValue) || 1
  // Zifferblatt: 270°-Bogen von -135° bis +135°.
  const ang = -135 + norm * 270
  const dialRef = useRef<SVGSVGElement>(null)

  function drag(clientY: number): void {
    const st = start.current
    if (!st) return
    const dNorm = -(clientY - st.py) / 140 // 140 px = ganzer Bereich
    if (w.endless) {
      // relative Schritte beim Überschreiten je 1/20 des Bereichs
      const acc = st.acc + dNorm
      const detents = Math.trunc(acc / 0.05)
      if (detents !== 0) {
        st.acc = acc - detents * 0.05
        st.py = clientY
        const d = detents > 0 ? step : -step
        for (let i = 0; i < Math.abs(detents); i++) onSend(fmsg(w.address, d))
      }
    } else {
      const v = clamp(st.v + dNorm * span, lo, hi)
      useOscSurface.getState().updateWidget(w.id, { value: v })
      onSend(fmsg(w.address, v))
    }
  }

  return (
    <div
      className="flex h-full w-full touch-none items-center justify-center"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { py: e.clientY, v: w.value, acc: 0 }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
    >
      <svg
        ref={dialRef}
        viewBox="0 0 100 100"
        className="h-full max-h-full w-auto cursor-ns-resize"
      >
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/25"
          strokeWidth="3"
        />
        <circle
          cx="50"
          cy="50"
          r="32"
          fill="none"
          stroke={w.color}
          strokeWidth="2.5"
          opacity="0.7"
        />
        <line
          x1="50"
          y1="50"
          x2={50 + 34 * Math.cos(((ang - 90) * Math.PI) / 180)}
          y2={50 + 34 * Math.sin(((ang - 90) * Math.PI) / 180)}
          stroke={w.color}
          strokeWidth="4"
          strokeLinecap="round"
        />
        {!w.endless && (
          <text
            x="50"
            y="92"
            textAnchor="middle"
            className="fill-foreground/80"
            style={{ fontSize: 13 }}
          >
            {w.value.toFixed(2)}
          </text>
        )}
      </svg>
    </div>
  )
}

/* ------------------------- Bedienelement: Schalter ---------------------- */

function Toggle({ w, onSend, onNova }: { w: OscWidget; onSend: Send; onNova?: Nova }): JSX.Element {
  const on = w.value >= 0.5
  return (
    <button
      type="button"
      onClick={() => {
        const next = on ? 0 : 1
        useOscSurface.getState().updateWidget(w.id, { value: next })
        if (w.target === 'nova') onNova?.(w, next)
        else onSend(fmsg(w.address, next ? w.onValue : w.offValue))
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

function Momentary({
  w,
  onSend,
  onNova
}: {
  w: OscWidget
  onSend: Send
  onNova?: Nova
}): JSX.Element {
  const [pressed, setPressed] = useState(false)
  const isNova = w.target === 'nova'
  function release(): void {
    if (!pressed) return
    setPressed(false)
    // NovaStar-Taster feuern die Aktion beim Druck (kein „Loslassen"-Wert).
    if (!isNova) onSend(fmsg(w.address, w.offValue))
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setPressed(true)
        if (isNova) onNova?.(w, 1)
        else onSend(fmsg(w.address, w.onValue))
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="flex h-full w-full items-center justify-center rounded-md border text-sm font-semibold transition-transform active:scale-[0.98]"
      style={{ borderColor: w.color, background: pressed ? w.color : 'transparent' }}
    >
      {isNova && w.nova.fn === 'brightnessSet' ? (
        <span style={{ color: pressed ? '#fff' : w.color }}>{Math.round(w.nova.value)} %</span>
      ) : isNova && w.nova.fn === 'brightnessStep' ? (
        <span style={{ color: pressed ? '#fff' : w.color }}>
          {w.nova.value >= 0 ? '+' : '−'}
          {Math.abs(Math.round(w.nova.value))} %
        </span>
      ) : (
        <Zap className="size-7" style={{ color: pressed ? '#fff' : w.color }} />
      )}
    </button>
  )
}

/* ------------------------- Bedienelement: Auswahl ----------------------- */

// 1-aus-n: Tippen sendet die Adresse der Option (Fallback: Widget-Adresse) mit
// ihrem Wert; die zuletzt gewählte Option bleibt markiert (value = Index).
function SelectPad({
  w,
  onSend,
  onNova
}: {
  w: OscWidget
  onSend: Send
  onNova?: Nova
}): JSX.Element {
  const sel = Math.round(w.value)
  const cols = w.cols >= 1 ? w.cols : 1
  return (
    <div
      className="grid h-full w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }}
    >
      {w.items.map((it, i) => {
        const active = i === sel
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              useOscSurface.getState().updateWidget(w.id, { value: i })
              if (w.target === 'nova') onNova?.(w, it.value)
              else onSend(fmsg(it.address || w.address, it.value))
            }}
            className="flex min-h-0 items-center justify-center overflow-hidden rounded-md border px-1 text-sm font-medium transition-colors"
            style={{
              borderColor: w.color,
              background: active ? w.color : 'transparent',
              color: active ? '#fff' : undefined
            }}
          >
            <span className="truncate">{it.label || `Option ${i + 1}`}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------- Bedienelement: Bank -------------------------- */

// Raster gleichartiger Felder; je nach bankMode Taster (momentan), Schalter
// (rastend) oder Drehknopf. Spalten frei wählbar (cols), Zeilen folgen aus der
// Anzahl. Jedes Feld feuert seine eigene Adresse (Fallback: Widget-Adresse).
function BankGrid({ w, onSend }: { w: OscWidget; onSend: Send }): JSX.Element {
  const cols = w.cols >= 1 ? w.cols : Math.min(Math.max(1, w.items.length), 4)
  return (
    <div
      className="grid h-full w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: '1fr' }}
    >
      {w.items.map((it, i) => (
        <BankCell key={i} w={w} item={it} index={i} onSend={onSend} />
      ))}
    </div>
  )
}

function BankCell({
  w,
  item,
  index,
  onSend
}: {
  w: OscWidget
  item: OscItem
  index: number
  onSend: Send
}): JSX.Element {
  const addr = item.address || w.address
  const setItem = (value: number): void =>
    useOscSurface.getState().updateWidget(w.id, {
      items: w.items.map((x, i) => (i === index ? { ...x, value } : x))
    })

  if (w.bankMode === 'toggle') {
    const on = item.value >= 0.5
    return (
      <button
        type="button"
        onClick={() => {
          const next = on ? 0 : 1
          setItem(next)
          onSend(fmsg(addr, next ? w.onValue : w.offValue))
        }}
        className="flex min-h-0 items-center justify-center overflow-hidden rounded-md border px-1 text-sm font-semibold transition-colors"
        style={{
          borderColor: w.color,
          background: on ? w.color : 'transparent',
          color: on ? '#fff' : w.color
        }}
      >
        <span className="truncate">{item.label || index + 1}</span>
      </button>
    )
  }

  if (w.bankMode === 'knob') {
    return <BankKnob w={w} item={item} index={index} onSend={onSend} />
  }

  return <BankButton w={w} item={item} index={index} onSend={onSend} />
}

function BankKnob({
  w,
  item,
  index,
  onSend
}: {
  w: OscWidget
  item: OscItem
  index: number
  onSend: Send
}): JSX.Element {
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const span = hi - lo || 1
  const norm = clamp01((item.value - lo) / span)
  const ang = -135 + norm * 270
  const addr = item.address || w.address
  const start = useRef<{ py: number; v: number } | null>(null)
  function drag(clientY: number): void {
    const st = start.current
    if (!st) return
    const v = clamp(st.v + (-(clientY - st.py) / 140) * span, lo, hi)
    useOscSurface.getState().updateWidget(w.id, {
      items: w.items.map((x, i) => (i === index ? { ...x, value: v } : x))
    })
    onSend(fmsg(addr, v))
  }
  return (
    <div
      className="flex min-h-0 touch-none flex-col items-center justify-center"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { py: e.clientY, v: item.value }
      }}
      onPointerMove={(e) => {
        if (e.buttons) drag(e.clientY)
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        start.current = null
      }}
    >
      <svg viewBox="0 0 100 100" className="min-h-0 w-auto flex-1 cursor-ns-resize">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/25"
          strokeWidth="4"
        />
        <line
          x1="50"
          y1="50"
          x2={50 + 34 * Math.cos(((ang - 90) * Math.PI) / 180)}
          y2={50 + 34 * Math.sin(((ang - 90) * Math.PI) / 180)}
          stroke={w.color}
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
      {item.label && (
        <span className="max-w-full truncate text-[10px] text-muted-foreground">{item.label}</span>
      )}
    </div>
  )
}

function BankButton({
  w,
  item,
  index,
  onSend
}: {
  w: OscWidget
  item: OscItem
  index: number
  onSend: Send
}): JSX.Element {
  const [pressed, setPressed] = useState(false)
  const addr = item.address || w.address
  function release(): void {
    if (!pressed) return
    setPressed(false)
    onSend(fmsg(addr, w.offValue))
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setPressed(true)
        onSend(fmsg(addr, w.onValue))
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="flex min-h-0 items-center justify-center overflow-hidden rounded-md border px-1 text-sm font-semibold transition-transform active:scale-[0.98]"
      style={{
        borderColor: w.color,
        background: pressed ? w.color : 'transparent',
        color: pressed ? '#fff' : w.color
      }}
    >
      <span className="truncate">{item.label || index + 1}</span>
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
  const rgba = `rgba(${Math.round(w.r * 255)}, ${Math.round(w.g * 255)}, ${Math.round(w.b * 255)}, ${w.a})`
  const hueAccent = (() => {
    const c = hsv2rgb(hsv.h, 1, 1)
    return rgb01ToHex(c.r, c.g, c.b)
  })()

  function emit(r: number, g: number, b: number, a: number): void {
    useOscSurface.getState().updateWidget(w.id, { r, g, b, a })
    onSend({
      address: w.address,
      args: [
        { type: 'f', value: r },
        { type: 'f', value: g },
        { type: 'f', value: b },
        { type: 'f', value: a }
      ]
    })
  }
  function setHue(h: number): void {
    const { r, g, b } = hsv2rgb(h, hsv.s, hsv.v)
    emit(r, g, b, w.a)
  }
  async function pickColor(): Promise<void> {
    const ED = (
      window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }
    ).EyeDropper
    if (!ED) return
    try {
      const res = await new ED().open()
      const c = hexToRgb01(res.sRGBHex)
      emit(c.r, c.g, c.b, w.a)
    } catch {
      // abgebrochen
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {/* Farbanzeige füllt die verbleibende Widget-Höhe; Hex-Code mittig. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center rounded border border-white/15 font-mono text-[11px] uppercase"
        style={{
          background: `linear-gradient(${rgba}, ${rgba}), ${CHECKER}`,
          color: lum > 0.55 ? '#000' : '#fff'
        }}
      >
        {hex}
        {HAS_EYEDROPPER && (
          <button
            type="button"
            onClick={() => void pickColor()}
            title="Pipette"
            className="absolute right-1 top-1 flex size-6 items-center justify-center rounded border border-white/20 bg-background/70 text-foreground/80 hover:bg-background hover:text-foreground"
          >
            <Pipette className="size-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Alle Regler greifen relativ (kein Sprung auf den Klickpunkt). */}
        <ChannelRow
          letter="H"
          value={hsv.h / 360}
          accent={hueAccent}
          track={HUE_GRADIENT}
          onChange={(v) => setHue(v * 360)}
        />
        <ChannelRow
          letter="R"
          value={w.r}
          accent="#ef4444"
          onChange={(v) => emit(v, w.g, w.b, w.a)}
        />
        <ChannelRow
          letter="G"
          value={w.g}
          accent="#22c55e"
          onChange={(v) => emit(w.r, v, w.b, w.a)}
        />
        <ChannelRow
          letter="B"
          value={w.b}
          accent="#3b82f6"
          onChange={(v) => emit(w.r, w.g, v, w.a)}
        />
        <ChannelRow
          letter="A"
          value={w.a}
          accent="#cbd5e1"
          track={`linear-gradient(to right, transparent, ${hex}), ${CHECKER}`}
          onChange={(v) => emit(w.r, w.g, w.b, v)}
        />
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

/* ------------------------- Anzeige: Label ------------------------------- */
// Reine Beschriftung/Überschrift (kein OSC). Textgröße wächst mit der Kachelhöhe.

function LabelView({ w }: { w: OscWidget }): JSX.Element {
  const align =
    w.align === 'left'
      ? 'items-start text-left'
      : w.align === 'right'
        ? 'items-end text-right'
        : 'items-center text-center'
  return (
    <div className={cn('flex h-full w-full flex-col justify-center', align)}>
      <span
        className="font-semibold leading-tight"
        style={{ color: w.color, fontSize: Math.min(10 + w.ch * 6, 42) }}
      >
        {w.label || 'Überschrift'}
      </span>
    </div>
  )
}

/* ------------------------- Anzeige: Meter ------------------------------- */
// Zeigt einen Wert als Balken + Zahl. Quelle: eingehendes OSC-Feedback (Adresse)
// oder die Restzeit des laufenden Videos aus dem Video-Player.

function meterReadout(w: OscWidget, video: VideoInfo): { level: number; text: string } {
  if (w.source === 'video') {
    if (video.remainingSec == null) return { level: 0, text: '–:––' }
    const level = video.durationSec > 0 ? clamp01(video.remainingSec / video.durationSec) : 0
    return { level, text: fmtClock(video.remainingSec) }
  }
  // Text-Quelle: zuletzt empfangenen OSC-String zeigen (kein Balken).
  if (w.source === 'text') return { level: 0, text: w.text || '–' }
  const lo = Math.min(w.min, w.max)
  const hi = Math.max(w.min, w.max)
  const level = hi > lo ? clamp01((w.value - lo) / (hi - lo)) : 0
  const text = Number.isInteger(w.value) ? String(w.value) : w.value.toFixed(2)
  return { level, text }
}

function Meter({ w }: { w: OscWidget }): JSX.Element {
  const video = useContext(VideoCtx)
  const { level, text } = meterReadout(w, video)
  // Text-Quelle: nur den String zeigen (umbrechend, kein Balken).
  const isText = w.source === 'text'
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5">
      <div
        className={cn(
          'text-center font-semibold leading-tight',
          isText ? 'break-words text-base' : 'text-lg leading-none tabular-nums'
        )}
        style={{ color: w.color }}
      >
        {text}
      </div>
      {!isText && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${level * 100}%`, background: w.color }}
          />
        </div>
      )}
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
  const { ref, text, setText } = useDraft(String(value))
  function commit(): void {
    const n = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(n)) onCommit(n)
    else setText(String(value))
  }
  return (
    <Input
      ref={ref}
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

/** Editor für die Einträge einer Auswahl-/Taster-Bank-Kachel (Label + Wert bzw.
 *  Label + Adresse, hinzufügen/entfernen). */
function ItemsEditor({ w }: { w: OscWidget }): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  // Neues Taster-Item bekommt die Adresse mit AKTUELLEM Projekt-Titel als erstem
  // Segment (nicht mehr hart „megatoolbox"). Titel „mottl" -> /mottl/btn/N.
  const projectName = useOscSurface((s) => s.currentProject().name)
  const isSelect = w.type === 'select'
  const items = w.items
  const setItem = (i: number, patch: Partial<OscItem>): void =>
    update(w.id, { items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  const add = (): void =>
    update(w.id, {
      items: [
        ...items,
        isSelect
          ? {
              label: String.fromCharCode(65 + (items.length % 26)),
              address: '',
              value: items.length
            }
          : {
              label: String(items.length + 1),
              address: `/${oscSlug(projectName)}/btn/${items.length + 1}`,
              value: 1
            }
      ]
    })
  const remove = (i: number): void => update(w.id, { items: items.filter((_, j) => j !== i) })
  return (
    <div className="space-y-2">
      <span className="block text-xs text-muted-foreground">
        {isSelect ? 'Optionen' : 'Taster'}
      </span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={it.label}
            placeholder="Label"
            className="h-8 w-0 flex-1"
            onChange={(e) => setItem(i, { label: e.target.value })}
          />
          {isSelect ? (
            <DecimalField
              value={it.value}
              onCommit={(v) => setItem(i, { value: v })}
              className="h-8 w-16"
            />
          ) : (
            <Input
              value={it.address}
              spellCheck={false}
              placeholder="/adresse"
              className="h-8 w-0 flex-1 font-mono text-xs"
              onChange={(e) => setItem(i, { address: e.target.value })}
            />
          )}
          <button
            type="button"
            title="Eintrag entfernen"
            onClick={() => remove(i)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="size-3.5" /> {isSelect ? 'Option' : 'Taster'} hinzufügen
      </Button>
    </div>
  )
}

/** Wert→Text-Zuordnungen einer Text-Anzeige. MadMapper sendet für Enums
 *  (Blendmodus, Surface …) nur Zahlen; hier ordnet man jedem beobachteten Wert
 *  einen Namen zu. Die Zahlen liest man am besten im OSC-Monitor ab. */
function TextMeterMappings({ w }: { w: OscWidget }): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  const items = w.items
  const setItem = (i: number, patch: Partial<OscItem>): void =>
    update(w.id, { items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  const add = (): void =>
    update(w.id, { items: [...items, { label: '', address: '', value: items.length }] })
  const remove = (i: number): void => update(w.id, { items: items.filter((_, j) => j !== i) })
  return (
    <div className="space-y-2">
      <span className="block text-xs text-muted-foreground">
        Wert → Text (leer = Rohwert zeigen; Zahlen im OSC-Monitor ablesen)
      </span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <DecimalField
            value={it.value}
            onCommit={(v) => setItem(i, { value: v })}
            className="h-8 w-20"
          />
          <span className="shrink-0 text-muted-foreground">→</span>
          <Input
            value={it.label}
            placeholder="Text"
            className="h-8 w-0 flex-1"
            onChange={(e) => setItem(i, { label: e.target.value })}
          />
          <button
            type="button"
            title="Zuordnung entfernen"
            onClick={() => remove(i)}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="size-3.5" /> Zuordnung
      </Button>
    </div>
  )
}

/** Kompakte Umschaltleiste (gleich breite Knöpfe nebeneinander). */
function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="flex gap-1">
      {options.map(([v, lbl]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'h-9 flex-1 rounded-md border text-sm transition-colors',
            value === v
              ? 'border-foreground bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          {lbl}
        </button>
      ))}
    </div>
  )
}

/** Einstellungen eines NovaStar-Widgets (nur die zur Funktion passenden Felder).
 *  Bindet an w.nova; Preset-Optionen werden weiter unten über den ItemsEditor
 *  bearbeitet (Auswahl-Kachel). */
function NovaConfigEditor({ w }: { w: OscWidget }): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  const setNova = (patch: Partial<OscWidget['nova']>): void =>
    update(w.id, { nova: { ...w.nova, ...patch } })
  const fn = w.nova.fn
  return (
    <div className="space-y-2.5 rounded-md border border-border bg-muted/20 p-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Tv className="size-3.5" /> {NOVA_FN_LABEL[fn]}
      </p>
      {fn === 'brightness' && (
        <p className="text-xs text-muted-foreground">
          Fader 0–100 %. Blendet die LED-Helligkeit direkt. Ausrichtung unten wählbar.
        </p>
      )}
      {fn === 'brightnessSet' && (
        <Field label="Ziel-Helligkeit (%)">
          <DecimalField
            value={w.nova.value}
            onCommit={(v) => setNova({ value: clamp(v, 0, 100) })}
            className="h-9"
          />
        </Field>
      )}
      {fn === 'brightnessStep' && (
        <Field label="Schrittweite (± %)">
          <DecimalField
            value={w.nova.value}
            onCommit={(v) => setNova({ value: clamp(v, -100, 100) })}
            className="h-9"
          />
        </Field>
      )}
      {fn === 'fadeToBlack' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fade-Dauer (s)">
            <DecimalField
              value={w.nova.value}
              onCommit={(v) => setNova({ value: Math.max(0.1, v) })}
              className="h-9"
            />
          </Field>
          <Field label="Aufblenden auf (%)">
            <DecimalField
              value={w.nova.restore}
              onCommit={(v) => setNova({ restore: clamp(v, 0, 100) })}
              className="h-9"
            />
          </Field>
        </div>
      )}
      {(fn === 'freeze' || fn === 'blackout') && (
        <p className="text-xs text-muted-foreground">
          Schalter (an/aus). Blackout und Freeze teilen sich am Gerät einen Anzeigemodus – nur eines
          gleichzeitig; das aktive ausschalten geht zurück auf Normal.
        </p>
      )}
      {fn === 'preset' && (
        <p className="text-xs text-muted-foreground">
          Auswahl der Preset-/Szenennummern (unten als Optionen). Der Wert einer Option ist die
          abzurufende Preset-Nummer.
        </p>
      )}
    </div>
  )
}

function WidgetEditor({
  w,
  columns,
  learning,
  canLearn,
  onToggleLearn,
  onDuplicate,
  onRemove
}: {
  w: OscWidget
  columns: number
  learning: boolean
  canLearn: boolean
  onToggleLearn: () => void
  onDuplicate: () => void
  onRemove: () => void
}): JSX.Element {
  const update = useOscSurface((s) => s.updateWidget)
  const min = WIDGET_MIN[w.type]
  const isNova = w.target === 'nova'
  const hasRange =
    !isNova &&
    (w.type === 'fader' ||
      (w.type === 'knob' && !w.endless) ||
      (w.type === 'meter' && w.source === 'osc') ||
      (w.type === 'bank' && w.bankMode === 'knob'))
  const hasOnOff =
    !isNova &&
    (w.type === 'button' || w.type === 'toggle' || (w.type === 'bank' && w.bankMode !== 'knob'))
  return (
    <div className="space-y-2.5">
      {/* Schnellaktionen oben: Duplizieren + Entfernen */}
      <div className="flex gap-2 border-b border-border pb-2.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
          <Copy className="size-3.5" /> Duplizieren
        </Button>
        <Button variant="ghost" size="sm" className="flex-1 text-destructive" onClick={onRemove}>
          <Trash2 className="size-3.5" /> Entfernen
        </Button>
      </div>
      {/* Name + Typ in einer Zeile -> kürzeres Panel */}
      <div className="grid grid-cols-2 gap-2">
        <Field label={w.type === 'label' ? 'Text' : 'Name'}>
          <Input
            className="h-9"
            value={w.label}
            onChange={(e) => update(w.id, { label: e.target.value })}
          />
        </Field>
        <Field label="Typ">
          {isNova ? (
            <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 text-sm text-muted-foreground">
              <Tv className="size-3.5 shrink-0" /> NovaStar
            </div>
          ) : (
            <select
              value={w.type}
              onChange={(e) => {
                const type = e.target.value as OscWidgetType
                const patch: Partial<OscWidget> = { type }
                if (type === 'xy' && !w.addressY) patch.addressY = makeWidget('xy').addressY
                // Auswahl/Bank brauchen Einträge -> Beispiele setzen, falls leer.
                if ((type === 'select' || type === 'bank') && w.items.length === 0)
                  patch.items = makeWidget(type).items
                update(w.id, patch)
              }}
              className="h-9 w-full rounded-md border border-border bg-input/40 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              {WIDGET_ORDER.map((t) => (
                <option key={t} value={t}>
                  {WIDGET_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {isNova && <NovaConfigEditor w={w} />}

      {w.type === 'meter' && (
        <Field label="Quelle">
          <select
            value={w.source}
            onChange={(e) => update(w.id, { source: e.target.value as 'osc' | 'video' | 'text' })}
            className="h-9 w-full rounded-md border border-border bg-input/40 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            <option value="osc">OSC-Feedback (Zahl)</option>
            <option value="text">OSC-Text (String)</option>
            <option value="video">Video-Restzeit</option>
          </select>
        </Field>
      )}

      {!isNova && w.type !== 'label' && !(w.type === 'meter' && w.source === 'video') && (
        <Field
          label={
            w.type === 'xy'
              ? 'OSC-Adresse (X)'
              : w.type === 'select' || w.type === 'bank'
                ? 'OSC-Adresse (Standard)'
                : 'OSC-Adresse'
          }
        >
          <div className="flex gap-1.5">
            <Input
              value={w.address}
              spellCheck={false}
              className="flex-1 font-mono text-xs"
              onChange={(e) => update(w.id, { address: e.target.value })}
            />
            <button
              type="button"
              onClick={onToggleLearn}
              disabled={!canLearn && !learning}
              title={
                canLearn || learning
                  ? 'OSC-Adresse lernen: die nächste eingehende Adresse übernehmen'
                  : 'Erst Feedback-Empfang aktivieren (siehe Verbindung)'
              }
              className={cn(
                'flex h-9 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors',
                learning
                  ? 'animate-pulse border-emerald-500 text-emerald-400 light:text-emerald-700'
                  : 'border-border text-muted-foreground hover:text-foreground disabled:opacity-40'
              )}
            >
              <Radio className="size-4" />
              {learning ? 'lernt…' : 'Learn'}
            </button>
          </div>
        </Field>
      )}

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

      {w.type === 'label' && (
        <Field label="Ausrichtung">
          <Segmented
            value={w.align}
            options={[
              ['left', 'Links'],
              ['center', 'Mitte'],
              ['right', 'Rechts']
            ]}
            onChange={(a) => update(w.id, { align: a })}
          />
        </Field>
      )}

      {w.type === 'fader' && (
        <Field label="Ausrichtung">
          <Segmented
            value={w.orient}
            options={[
              ['v', 'Vertikal'],
              ['h', 'Horizontal']
            ]}
            onChange={(o) => update(w.id, { orient: o })}
          />
        </Field>
      )}

      {w.type === 'knob' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={w.endless}
            onChange={(e) => update(w.id, { endless: e.target.checked })}
            className="size-4"
          />
          Endlos-Encoder (relative Schritte)
        </label>
      )}

      {w.type === 'bank' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Modus">
            <Segmented
              value={w.bankMode}
              options={[
                ['momentary', 'Taster'],
                ['toggle', 'Schalter'],
                ['knob', 'Poti']
              ]}
              onChange={(m) => update(w.id, { bankMode: m })}
            />
          </Field>
          <Field label="Spalten">
            <NumberField
              value={w.cols}
              min={1}
              max={12}
              onCommit={(v) => update(w.id, { cols: v })}
              className="h-9"
            />
          </Field>
        </div>
      )}

      {w.type === 'select' && (
        <Field label="Spalten">
          <NumberField
            value={w.cols}
            min={1}
            max={12}
            onCommit={(v) => update(w.id, { cols: v })}
            className="h-9"
          />
        </Field>
      )}

      {(w.type === 'select' || w.type === 'bank') && <ItemsEditor w={w} />}

      {w.type === 'meter' && w.source === 'text' && <TextMeterMappings w={w} />}

      {hasRange && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <DecimalField value={w.min} onCommit={(v) => update(w.id, { min: v })} />
          </Field>
          <Field label="Max">
            <DecimalField value={w.max} onCommit={(v) => update(w.id, { max: v })} />
          </Field>
        </div>
      )}

      {w.type === 'knob' && w.endless && (
        <Field label="Schrittweite (je Rastung)">
          <DecimalField value={w.onValue} onCommit={(v) => update(w.id, { onValue: v })} />
        </Field>
      )}

      {hasOnOff && (
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
          <NumberField
            value={w.cw}
            min={min.cw}
            max={columns}
            onCommit={(v) => update(w.id, { cw: v })}
            className="h-9"
          />
        </Field>
        <Field label="Höhe (Zeilen)">
          <NumberField
            value={w.ch}
            min={min.ch}
            max={MAX_CH}
            onCommit={(v) => update(w.id, { ch: v })}
            className="h-9"
          />
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
    </div>
  )
}

/* ------------------------- Inspector: NovaStar -------------------------- */

/** Status des (werkzeugübergreifend geteilten) NovaStar-Prozessors abonnieren. */
function useNovastarStatus(): NovastarStatus | null {
  const [status, setStatus] = useState<NovastarStatus | null>(null)
  useEffect(() => {
    let alive = true
    void api.novastar.status().then((s) => alive && setStatus(s))
    const off = api.novastar.onStatus(setStatus)
    return () => {
      alive = false
      off()
    }
  }, [])
  return status
}

/** Kleiner Statuspunkt (grün = verbunden) für die Panel-Kopfzeile. */
function NovaStarDot(): JSX.Element {
  const status = useNovastarStatus()
  return (
    <span
      className={cn(
        'size-2.5 rounded-full',
        status?.connected ? 'bg-emerald-500' : 'bg-muted-foreground'
      )}
    />
  )
}

/** Verbindung zum NovaStar-Prozessor direkt aus der OSC-Steuerung (dieselbe
 *  geteilte Verbindung wie im NovaStar-Tool). Damit NovaStar-Widgets ohne
 *  Werkzeugwechsel funktionieren. */
function NovaStarPanel(): JSX.Element {
  const status = useNovastarStatus()
  const [host, setHost] = useState('')
  const [port, setPort] = useState(5200)
  const connected = status?.connected ?? false
  // IP-Übergabe aus dem Netzwerk-Scanner übernehmen (einmalig, beim Öffnen).
  useEffect(() => {
    const ip = useHandoff.getState().takeNovastarHost()
    if (ip) setHost(ip)
  }, [])
  async function toggle(): Promise<void> {
    if (connected) await api.novastar.disconnect()
    else if (host.trim()) await api.novastar.connect(host, port)
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        NovaStar-Widgets senden an diesen Prozessor (geteilt mit dem NovaStar-Tool). Ohne Verbindung
        bleiben sie wirkungslos.
      </p>
      <div className="flex items-end gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">Prozessor-IP</span>
          <Input
            value={host}
            placeholder="z. B. 192.168.0.10"
            onChange={(e) => setHost(e.target.value)}
            disabled={connected}
            className="h-8"
          />
        </label>
        <label className="w-20">
          <span className="mb-1 block text-xs text-muted-foreground">Port</span>
          <Input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 5200)}
            disabled={connected}
            className="h-8 tabular-nums"
          />
        </label>
        <Button variant={connected ? 'outline' : 'default'} size="sm" onClick={() => void toggle()}>
          <Wifi className="size-4" /> {connected ? 'Trennen' : 'Verbinden'}
        </Button>
      </div>
      {status?.lastError && <p className="text-xs text-destructive">Fehler: {status.lastError}</p>}
      {connected && (
        <p className="text-xs text-emerald-400 light:text-emerald-700">
          Verbunden {status?.host}:{status?.port}
        </p>
      )}
    </>
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
                  e.dir === 'out' ? 'text-primary' : 'text-emerald-400 light:text-emerald-700'
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
