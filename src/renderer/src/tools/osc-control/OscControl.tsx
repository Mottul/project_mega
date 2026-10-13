// OSC-Steuerung: frei belegbares Steuerpult (Fader/Taster/Schalter/XY/Farbe),
// das OSC an MadMapper & Co. sendet. Aufbau wie die übrigen Tools (ToolShell:
// Arbeitsfläche + Inspector). In der Kopfzeile: SETS (gespeicherte Setups) links,
// Edit-/Live-Umschalter rechts (wie im Jingle-Player). Die Kacheln liegen in
// einem Raster und sind in der Größe ziehbar (Edit-Modus). Gesendet wird über
// den main-Prozess (api.osc).

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  ExternalLink,
  Monitor as MonitorIcon,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCw,
  Settings2,
  Smartphone,
  Star,
  Tablet,
  Trash2,
  Tv
} from 'lucide-react'
import type {
  OscFeedback,
  OscMessage,
  OscRemoteSnapshot,
  OscSettings,
  OscStatus
} from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { BarDivider, PanelSection, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { RemoteSection, RemoteToggle, useRemoteControl } from '@renderer/components/RemoteControl'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import {
  MAX_COLS,
  MIN_COLS,
  useOscSurface,
  type NovaWidgetKind,
  type OscWidget,
  type OscWidgetType
} from './store'
import { labelForValue } from './mapping'
import {
  argVal,
  clamp,
  clamp01,
  DEVICES,
  fmsg,
  type LogEntry,
  type Nova,
  type SendFn,
  type SendMany,
  VideoCtx,
  type VideoInfo
} from './oscShared'
import { meterReadout } from './Displays'
import { DeviceBtn, DeviceFrame, SurfaceGrid, WidgetPicker } from './Surface'
import { WidgetEditor } from './WidgetEditor'
import { ConnectionPanel } from './ConnectionPanel'
import { NovaStarDot, NovaStarPanel } from './NovaStarPanel'
import { Monitor } from './MonitorLog'

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
  // Fernsteuerung; nach dem Start bekommt der Server sofort den aktuellen Stand
  const rc = useRemoteControl(api.osc, 8091, () => publishSnapshot())
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

  const send = useCallback<SendFn>(
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

  // Steuerbefehle vom Handy/Tablet anwenden (Live-Wert aktualisieren UND OSC senden – wie eine
  // lokale Bedienung).
  useEffect(() => {
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
    return offCmd
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
      : 'bg-success'
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

            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                if (mode !== 'edit') setStore({ mode: 'edit' })
                setPicker({ x: Math.max(8, r.left - 140), y: r.bottom + 4 })
              }}
            >
              <Plus className="size-4" /> Widget
            </Button>

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
                    ? 'bg-success/20 font-semibold text-success'
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
      <PanelSection
        id="widget"
        title="Widget"
        icon={Settings2}
        summary={selected ? selected.label || selected.address || 'ohne Namen' : 'keins gewählt'}
      >
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
        summary={
          status
            ? `${status.host}:${status.outPort}${status.listening ? ` · Feedback ${status.inPort}` : ''}`
            : undefined
        }
        right={<span className={cn('size-2.5 rounded-full', statusDot)} />}
      >
        <ConnectionPanel
          config={config}
          status={status}
          onApplied={(st) => setStatus(st)}
          onSend={send}
        />
      </PanelSection>

      <RemoteSection
        rc={rc}
        id="osc-remote"
        hint="Das Handy bedient diese Oberfläche. Dieses Fenster muss dafür offen bleiben. Ein/Aus mit „Handy“ in der Ausgabe-Leiste."
      />

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

  const bar = (
    <ToolBar label="Ausgabe">
      <span className="flex items-center gap-2 text-sm">
        <span className={cn('size-2.5 rounded-full', statusDot)} />
        <span className="tabular-nums">
          {status ? `${status.host}:${status.outPort}` : 'nicht verbunden'}
        </span>
        {status?.listening && (
          <span
            className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-xs"
            title="Feedback-Port"
          >
            <Radio className="size-3" /> {status.inPort}
          </span>
        )}
      </span>
      {status?.lastError && (
        <span className="max-w-[20rem] truncate text-xs text-danger">{status.lastError}</span>
      )}
      <BarDivider />
      <RemoteToggle rc={rc} />
      <Button
        variant="ghost"
        size="sm"
        title="OSC-Monitor in einem eigenen Fenster öffnen"
        onClick={() => void api.osc.openMonitor()}
      >
        <Activity className="size-4" /> OSC-Monitor
      </Button>
    </ToolBar>
  )

  return <ToolShell id="osc-control" bar={bar} main={main} aside={aside} asideWidth={380} />
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
