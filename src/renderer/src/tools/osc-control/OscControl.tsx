// OSC-Steuerung: frei belegbares Steuerpult (Fader/Taster/Schalter/XY/Farbe),
// das OSC an MadMapper & Co. sendet. Aufbau wie die übrigen Tools (ToolShell:
// Arbeitsfläche + Inspector). In der Kopfzeile: SETS (gespeicherte Setups) links,
// Edit-/Live-Umschalter rechts (wie im Jingle-Player). Die Kacheln liegen in
// einem Raster und sind in der Größe ziehbar (Edit-Modus). Gesendet wird über
// den main-Prozess (api.osc).

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ExternalLink, Radio, Settings2, Tv } from 'lucide-react'
import type { OscSettings, OscStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { BarDivider, PanelSection, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { RemoteSection, RemoteToggle, useRemoteControl } from '@renderer/components/RemoteControl'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { useOscSurface, type NovaWidgetKind, type OscWidgetType } from './store'
import { argVal, DEVICES, type SendFn, type SendMany, VideoCtx } from './oscShared'
import { DeviceFrame, SurfaceGrid, WidgetPicker } from './Surface'
import { WidgetEditor } from './WidgetEditor'
import { ConnectionPanel } from './ConnectionPanel'
import { NovaStarDot, NovaStarPanel } from './NovaStarPanel'
import { Monitor } from './MonitorLog'
import { ProjectSetBar } from './ProjectSetBar'
import { useNovaRunner } from './useNovaRunner'
import { useOscLog } from './useOscLog'
import { useOscRemoteCommands } from './useOscRemoteCommands'
import { useOscSnapshot } from './useOscSnapshot'
import { useVideoRemaining } from './useVideoRemaining'
import { reflectFeedback } from './feedback'

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
  const video = useVideoRemaining()
  const [status, setStatus] = useState<OscStatus | null>(null)
  const [config, setConfig] = useState<OscSettings | null>(null)
  const { log, pushLog, clearLog } = useOscLog()
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

  const runNova = useNovaRunner(pushLog)

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

  useOscRemoteCommands(send, sendMany, runNova)

  const publishSnapshot = useOscSnapshot(video, set, sets, columns, widgets)

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
        <ProjectSetBar
          projects={projects}
          project={project}
          defaultProjectId={defaultProjectId}
          sets={sets}
          set={set}
          columns={columns}
          device={device}
          landscape={landscape}
          previewing={previewing}
          mode={mode}
          live={live}
          setStore={setStore}
          setPicker={setPicker}
        />

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
        <Monitor log={log} onClear={clearLog} />
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
