// Steuer-UI des Stage-Timers: Abschnitte verwalten (laufen nacheinander),
// Transport (Start/Pause/±1 min/Weiter), Farbschwellen + Ablauf-Verhalten,
// Nachrichten an die Bühne und das Vollbild-Ausgabefenster. Der main-Prozess
// tickt autoritativ -> Vorschau hier und Ausgabefenster sind immer synchron.

import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronsLeft,
  ChevronsRight,
  Globe,
  Hourglass,
  MessageSquare,
  MonitorUp,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Smartphone,
  Square,
  Timer as TimerIcon,
  Trash2,
  Wifi,
  X
} from 'lucide-react'
import { QrCode } from '@renderer/components/QrCode'
import { RemoteAccess } from '@renderer/components/RemoteAccess'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { TextField } from '@renderer/components/ui/text-field'
import {
  BarDivider,
  BarToggle,
  PanelSection,
  ToolBar,
  ToolShell
} from '@renderer/components/ToolShell'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { cn } from '@renderer/lib/utils'
import { api } from '@renderer/lib/api'
import { migrateLocalStorage, updateSettings, useSettings } from '@renderer/lib/settings'
import { toast } from '@renderer/lib/toast'
import { useDraft } from '@renderer/lib/useDraft'
import { useElementWidth } from '@renderer/lib/useElementWidth'
import {
  DEFAULT_TIMER_SETTINGS,
  type DisplayInfo,
  type RemoteStatus,
  type StageTimerState,
  type TimerCommand,
  type TimerNdiConfig,
  type TimerNdiStatus,
  type TimerSegment
} from '@shared/types'
import { selectClass } from '../_calc/ui'
import { displayUrls, fmtTimer, parseDuration } from './format'
import { TimerDisplay } from './TimerDisplay'

const QUICK_MESSAGES = ['Bitte zum Ende kommen', 'Letzte Minute!', 'Zeit ist um']

/** Abschnitte aus einem alten localStorage-Stand (ältere kannten nur `label`). */
function legacySegments(raw: unknown): TimerSegment[] {
  if (!Array.isArray(raw)) return []
  const out: TimerSegment[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const seg = x as Record<string, unknown>
    if (typeof seg.id !== 'string' || typeof seg.durationSec !== 'number') continue
    if (!(seg.durationSec > 0)) continue
    out.push({
      id: seg.id,
      speaker: typeof seg.speaker === 'string' ? seg.speaker : '',
      title:
        typeof seg.title === 'string' ? seg.title : typeof seg.label === 'string' ? seg.label : '',
      durationSec: seg.durationSec
    })
  }
  return out
}

function cmd(c: TimerCommand): void {
  void api.timer.command(c)
}

function SectionTitle({ children }: { children: string }): JSX.Element {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{children}</h2>
  )
}

/** mm:ss-Eingabe, geparst beim Verlassen/Enter (erlaubt auch "5" = 5 Minuten). */
function DurationInput({
  seconds,
  onCommit,
  className
}: {
  seconds: number
  onCommit: (sec: number) => void
  className?: string
}): JSX.Element {
  const { ref, text, setText } = useDraft(fmtTimer(seconds))
  const commit = (): void => {
    const sec = parseDuration(text)
    if (sec != null) onCommit(sec)
    else setText(fmtTimer(seconds))
  }
  return (
    <Input
      ref={ref}
      value={text}
      inputMode="numeric"
      className={className}
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

/** Textfeld mit lokalem Puffer: tippt man mitten im Text, springt der Cursor
 *  NICHT ans Ende, obwohl der Wert über main (setSegments) zurückgespiegelt wird.
 *  Externe Änderungen (z. B. Reorder) werden nur übernommen, wenn nicht fokussiert. */
function SegText({
  value,
  onCommit,
  className,
  placeholder
}: {
  value: string
  onCommit: (v: string) => void
  className?: string
  placeholder?: string
}): JSX.Element {
  const { ref, text, setText } = useDraft(value)
  return (
    <Input
      ref={ref}
      value={text}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        setText(e.target.value)
        onCommit(e.target.value)
      }}
    />
  )
}

/** Fernsteuer-Server des Timers – Handy-Steuerung UND Bühnen-Anzeige im Browser laufen darüber.
 *  Ein Zustand für Ausgabe-Leiste und Panels. Der Timer läuft im main-Prozess, die Steuerseite
 *  funktioniert daher auch, wenn dieses Werkzeug danach geschlossen wird. */
function useTimerRemote(): {
  remote: RemoteStatus | null
  port: number
  setPort: (p: number) => void
  toggle: () => Promise<void>
} {
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [port, setPort] = useState(8092)

  useEffect(() => {
    void api.timer.remoteStatus().then((s) => {
      setRemote(s)
      setPort(s.port)
    })
    return api.timer.onRemoteChanged(setRemote)
  }, [])

  async function toggle(): Promise<void> {
    if (remote?.running) setRemote(await api.timer.remoteStop())
    else {
      try {
        setRemote(await api.timer.remoteStart(port))
      } catch (e) {
        toast.error(
          `Fernsteuerung konnte nicht starten (Port ${port} belegt?)`,
          e instanceof Error ? e.message : undefined
        )
      }
    }
  }
  return { remote, port, setPort, toggle }
}

function RemotePanel({
  remote,
  port,
  setPort
}: {
  remote: RemoteStatus | null
  port: number
  setPort: (p: number) => void
}): JSX.Element {
  return (
    <>
      <Field
        label="Port"
        hint="Handy/Tablet im selben WLAN startet/pausiert den Timer, wechselt Abschnitte und schickt Nachrichten an die Bühne (ohne Passwort). Ein/Aus mit „Handy & Browser“ in der Ausgabe-Leiste."
      >
        <Input
          className="h-8 w-24"
          type="number"
          value={port}
          onChange={(e) => setPort(Number(e.target.value) || 8092)}
          disabled={remote?.running}
        />
      </Field>
      {remote && <RemoteAccess status={remote} />}
    </>
  )
}

/** Bühnen-Anzeige im Browser: läuft über den Server der Fernsteuerung (nur Anzeige). */
function BrowserDisplayPanel({
  remote,
  onStart
}: {
  remote: RemoteStatus | null
  onStart: () => void
}): JSX.Element {
  const urls = remote ? displayUrls(remote) : []
  return (
    <>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        Für Fernseher, Tablets und Rechner ohne NDI.
        <InfoTip
          label="Erklärung zur Anzeige im Browser"
          text="Dieselbe Bühnenanzeige im Browser – nur Anzeige, keine Bedienung. Antippen schaltet auf Vollbild. Läuft über den Server der Fernsteuerung (im selben Netz, ohne Passwort)."
        />
      </p>
      {urls.length > 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-2">
          <QrCode text={urls[0]} size={96} />
          <div className="min-w-0 space-y-1 text-xs">
            <p className="text-muted-foreground">Im Browser öffnen (QR scannen oder eintippen):</p>
            {urls.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => void navigator.clipboard?.writeText(u)}
                title="Adresse kopieren"
                className="block max-w-full break-all text-left font-mono text-[11px] text-primary hover:underline"
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={onStart}>
          <Wifi className="size-4" /> Aktivieren
        </Button>
      )}
    </>
  )
}

const NDI_RESOLUTIONS: [number, number][] = [
  [1920, 1080],
  [1280, 720]
]

/** NDI-Zustand des Timers: von der Ausgabe-Leiste (Ein/Aus) und dem Panel geteilt. */
function useTimerNdi(cfg: TimerNdiConfig): {
  status: TimerNdiStatus | null
  toggle: () => Promise<void>
} {
  const [status, setStatus] = useState<TimerNdiStatus | null>(null)
  useEffect(() => {
    // frühere Versionen: nur im localStorage
    migrateLocalStorage('stage-timer-ndi', (old) => {
      const ndi: Partial<TimerNdiConfig> = {}
      if (typeof old.name === 'string' && old.name.trim()) ndi.name = old.name.trim()
      if (old.width === 1920 || old.width === 1280) ndi.width = old.width
      if (old.height === 1080 || old.height === 720) ndi.height = old.height
      if (old.fps === 25 || old.fps === 30 || old.fps === 50) ndi.fps = old.fps
      return { timer: { ndi } }
    })
  }, [])

  useEffect(() => {
    void api.timer.ndiStatus().then(setStatus)
    return api.timer.onNdiChanged(setStatus)
  }, [])

  // Frame-Zähler leben nur im main -> während des Sendens gelegentlich nachfragen.
  useEffect(() => {
    if (!status?.running) return
    const t = setInterval(() => void api.timer.ndiStatus().then(setStatus), 2000)
    return () => clearInterval(t)
  }, [status?.running])

  async function toggle(): Promise<void> {
    setStatus(await (status?.running ? api.timer.ndiStop() : api.timer.ndiStart(cfg)))
  }
  return { status, toggle }
}

/** NDI-Ausgabe (experimentell): Timer-Anzeige als NDI-Quelle ins Netz senden.
 *  Ohne installiertes NDI-Modul zeigt das Panel nur einen Hinweis. */
function NdiPanel({ status }: { status: TimerNdiStatus | null }): JSX.Element {
  // gemerkt in settings.json (timer.ndi), in allen Fenstern gleich
  const cfg = useSettings((s) => s.timer.ndi) ?? DEFAULT_TIMER_SETTINGS.ndi

  function patchCfg(patch: Partial<TimerNdiConfig>): void {
    updateSettings({ timer: { ndi: patch } })
  }

  if (!status) return <p className="text-xs text-muted-foreground">Lade…</p>

  if (!status.available) {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          NDI-Modul nicht verfügbar – die App läuft normal weiter. Zum Aktivieren einmalig
          <span className="font-mono"> npm run ndi:setup</span> ausführen (siehe docs/NDI.md).
        </p>
        {status.error && <p className="break-words font-mono text-[10px]">{status.error}</p>}
      </div>
    )
  }

  const running = status.running
  return (
    <>
      <Field label="Quellenname im Netz">
        <TextField
          value={cfg.name}
          disabled={running}
          maxLength={60}
          onCommit={(name) => patchCfg({ name })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Auflösung">
          <select
            className={selectClass}
            disabled={running}
            value={`${cfg.width}x${cfg.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number)
              patchCfg({ width: w, height: h })
            }}
          >
            {NDI_RESOLUTIONS.map(([w, h]) => (
              <option key={`${w}x${h}`} value={`${w}x${h}`}>
                {w} × {h}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bildrate">
          <select
            className={selectClass}
            disabled={running}
            value={cfg.fps}
            onChange={(e) => patchCfg({ fps: Number(e.target.value) })}
          >
            {[25, 30, 50].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </Field>
      </div>
      {running ? (
        <p className="text-xs text-muted-foreground">
          Sendet als <span className="font-medium text-foreground">„{status.config.name}“</span> ·{' '}
          {status.config.width}×{status.config.height}@{status.config.fps} ·{' '}
          <span className="tabular-nums">{status.framesSent}</span> Frames
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Ein/Aus mit „NDI“ in der Ausgabe-Leiste.</p>
      )}
      {status.error && <p className="text-xs text-destructive">{status.error}</p>}
    </>
  )
}

const END_LABEL: Record<StageTimerState['endBehavior'], string> = {
  overtime: 'Überziehung zählen',
  stop: 'bei 0:00 stehen',
  next: 'automatisch weiter'
}

export function StageTimer(): JSX.Element {
  const [state, setState] = useState<StageTimerState | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [displayId, setDisplayId] = useState<number | null>(null)
  const [msgText, setMsgText] = useState('')
  const [msgFlash, setMsgFlash] = useState(false)
  const rc = useTimerRemote()
  const ndiCfg = useSettings((s) => s.timer.ndi) ?? DEFAULT_TIMER_SETTINGS.ndi
  const ndi = useTimerNdi(ndiCfg)

  useEffect(() => {
    void api.timer.getState().then((s) => {
      // Den Ablauf merkt sich der main-Prozess selbst (settings.json). Frühere Versionen
      // hielten ihn nur im localStorage dieses Fensters -> einmalig übergeben.
      const legacy = migrateLocalStorage('stage-timer-setup', () => null)
      const segments = legacySegments(legacy?.segments)
      if (legacy && s.segments.length === 0 && segments.length > 0) {
        cmd({ type: 'setSegments', segments })
        if (typeof legacy.warnSec === 'number' && typeof legacy.alertSec === 'number') {
          cmd({ type: 'setThresholds', warnSec: legacy.warnSec, alertSec: legacy.alertSec })
        }
        if (
          legacy.endBehavior === 'stop' ||
          legacy.endBehavior === 'overtime' ||
          legacy.endBehavior === 'next'
        ) {
          cmd({ type: 'setEndBehavior', behavior: legacy.endBehavior })
        }
        cmd({ type: 'resetAll' })
        return
      }
      setState(s)
      setRemaining(s.remainingSec)
    })
    const offState = api.timer.onState((s) => {
      setState(s)
      setRemaining(s.remainingSec)
    })
    const offTick = api.timer.onTick((t) => setRemaining(t.remainingSec))
    void api.screen.list().then((d) => {
      setDisplays(d)
      setDisplayId((cur) => cur ?? (d.find((x) => !x.primary) ?? d[0])?.id ?? null)
    })
    return () => {
      offState()
      offTick()
    }
  }, [])

  // Container-basiertes Layout: Abschnitte neben die Vorschau, sobald genug Breite
  // da ist (auch nach dem Einklappen der Einstellungen) -> Vorschau wird dann kleiner.
  // Vor dem Early-Return aufrufen (Hook-Reihenfolge muss konstant bleiben).
  const [mainRef, mainW] = useElementWidth<HTMLDivElement>()

  if (!state) return <div className="p-6 text-sm text-muted-foreground">Lade…</div>

  function patchSegments(next: TimerSegment[]): void {
    cmd({ type: 'setSegments', segments: next })
  }

  const segs = state.segments
  const isClock = state.displayMode === 'clock'
  const seg = state.current >= 0 ? segs[state.current] : undefined
  const twoCol = !isClock && mainW >= 820

  return (
    <ToolShell
      id="stage-timer"
      asideWidth={360}
      bar={
        <ToolBar
          label="Ausgabe"
          active={state.outputOpen || Boolean(ndi.status?.running)}
          status={
            isClock ? (
              <span className="text-muted-foreground">Uhr</span>
            ) : seg ? (
              <>
                {state.running ? (
                  <Play className="size-3.5 shrink-0 fill-current text-primary" />
                ) : (
                  <Pause className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="max-w-[16rem] truncate font-medium">
                  {seg.title || seg.speaker || `Abschnitt ${state.current + 1}`}
                </span>
                <span className={remaining < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                  {remaining < 0
                    ? `${fmtTimer(-remaining)} überzogen`
                    : `noch ${fmtTimer(remaining)}`}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Kein Abschnitt</span>
            )
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
          {state.outputOpen ? (
            <Button size="sm" variant="destructive" onClick={() => void api.timer.closeOutput()}>
              <X className="size-4" /> Vollbild beenden
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={displayId == null}
              title="Esc im Ausgabefenster schließt es wieder"
              onClick={() => displayId != null && void api.timer.openOutput(displayId)}
            >
              <MonitorUp className="size-4" /> Vollbild starten
            </Button>
          )}
          <BarDivider />
          <BarToggle
            on={Boolean(ndi.status?.running)}
            disabled={!ndi.status?.available}
            title={
              ndi.status?.available === false
                ? 'NDI-Modul nicht verfügbar (npm run ndi:setup, siehe docs/NDI.md)'
                : 'Timer-Anzeige als NDI-Quelle ins Netz senden'
            }
            onClick={() => void ndi.toggle()}
          >
            NDI
          </BarToggle>
          <BarToggle
            on={Boolean(rc.remote?.running)}
            title="Fernsteuerung fürs Handy und Bühnen-Anzeige im Browser (ein gemeinsamer Server)"
            onClick={() => void rc.toggle()}
          >
            Handy &amp; Browser
          </BarToggle>
        </ToolBar>
      }
      aside={
        <>
          <PanelSection
            id="behavior"
            title="Anzeige"
            icon={TimerIcon}
            summary={
              isClock
                ? `Uhr${state.clockShowSeconds ? ' · Sekunden' : ''}${state.clockShowDate ? ' · Datum' : ''}`
                : `Timer (Restzeit)${state.showClockInTimer ? ' · Uhrzeit klein' : ''}`
            }
          >
            <Field label="Anzeige">
              <select
                className={selectClass}
                value={state.displayMode}
                onChange={(e) =>
                  cmd({ type: 'setDisplayMode', mode: e.target.value as 'timer' | 'clock' })
                }
              >
                <option value="timer">Timer (Restzeit)</option>
                <option value="clock">Uhr</option>
              </select>
            </Field>
            {isClock ? (
              <>
                <Checkbox
                  checked={state.clockShowSeconds}
                  onChange={(v) => cmd({ type: 'setClockOptions', showSeconds: v })}
                  label="Sekunden anzeigen"
                />
                <Checkbox
                  checked={state.clockShowDate}
                  onChange={(v) => cmd({ type: 'setClockOptions', showDate: v })}
                  label="Datum anzeigen"
                />
              </>
            ) : (
              <Checkbox
                checked={state.showClockInTimer}
                onChange={(v) => cmd({ type: 'setShowClock', show: v })}
                label="Uhrzeit klein einblenden"
              />
            )}
          </PanelSection>

          {!isClock && (
            <PanelSection
              id="flow"
              title="Ablauf und Farben"
              icon={Hourglass}
              summary={`${END_LABEL[state.endBehavior]} · Gelb ab ${fmtTimer(state.warnSec)} · Rot ab ${fmtTimer(state.alertSec)}`}
            >
              <Field label="Wenn die Zeit abgelaufen ist">
                <select
                  className={selectClass}
                  value={state.endBehavior}
                  onChange={(e) =>
                    cmd({
                      type: 'setEndBehavior',
                      behavior: e.target.value as StageTimerState['endBehavior']
                    })
                  }
                >
                  <option value="overtime">Überziehung zählen (rot)</option>
                  <option value="stop">Bei 0:00 stehen bleiben</option>
                  <option value="next">Automatisch nächster Abschnitt</option>
                </select>
              </Field>
              {state.endBehavior === 'overtime' && (
                <Checkbox
                  checked={state.overtimeFlash}
                  onChange={(v) => cmd({ type: 'setOvertimeFlash', flash: v })}
                  label="Beim Überziehen rot blinken"
                  hint="Aus: Nur die Ziffern sind rot, das Bild blinkt nicht."
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Gelb ab Rest">
                  <DurationInput
                    seconds={state.warnSec}
                    onCommit={(sec) =>
                      cmd({ type: 'setThresholds', warnSec: sec, alertSec: state.alertSec })
                    }
                  />
                </Field>
                <Field label="Rot ab Rest">
                  <DurationInput
                    seconds={state.alertSec}
                    onCommit={(sec) =>
                      cmd({ type: 'setThresholds', warnSec: state.warnSec, alertSec: sec })
                    }
                  />
                </Field>
              </div>
            </PanelSection>
          )}

          <PanelSection
            id="browser"
            title="Anzeige im Browser"
            icon={Globe}
            defaultOpen={false}
            summary={
              rc.remote?.running ? (displayUrls(rc.remote)[0] ?? 'an') : 'aus – „Handy & Browser“'
            }
            right={rc.remote?.running ? <Badge tone="success">an</Badge> : undefined}
          >
            <BrowserDisplayPanel remote={rc.remote} onStart={() => void rc.toggle()} />
          </PanelSection>

          <PanelSection
            id="ndi"
            title="NDI"
            icon={Radio}
            defaultOpen={false}
            summary={`„${ndiCfg.name}“ · ${ndiCfg.width} × ${ndiCfg.height} · ${ndiCfg.fps} fps`}
            right={ndi.status?.running ? <Badge tone="success">sendet</Badge> : undefined}
          >
            <NdiPanel status={ndi.status} />
          </PanelSection>

          <PanelSection
            id="remote"
            title="Fernsteuerung"
            icon={Smartphone}
            defaultOpen={false}
            summary={`Port ${rc.remote?.port ?? rc.port} · ${rc.remote?.running ? 'an' : 'aus'}`}
            right={rc.remote?.running ? <Badge tone="success">an</Badge> : undefined}
          >
            <RemotePanel remote={rc.remote} port={rc.port} setPort={rc.setPort} />
          </PanelSection>
        </>
      }
      main={
        <div
          ref={mainRef}
          className={
            isClock
              ? 'flex max-w-2xl flex-col gap-4 p-6'
              : twoCol
                ? 'grid items-start gap-4 p-6'
                : 'flex flex-col gap-4 p-6'
          }
          // Vorschau-Spalte wächst mit, bleibt aber gedeckelt -> daneben bleibt
          // immer genug Platz für die Abschnitte.
          style={twoCol ? { gridTemplateColumns: 'minmax(0, min(38%, 34rem)) 1fr' } : undefined}
        >
          {/* Spalte 1: Vorschau, Steuerung, Nachricht an die Bühne (≈ Vorschaubreite) */}
          <div className="space-y-4">
            <Card className="overflow-hidden p-0">
              <div className="relative aspect-video w-full">
                <TimerDisplay state={state} remainingSec={remaining} />
              </div>
            </Card>

            {!isClock && (
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cmd({ type: 'prev' })}
                    disabled={state.current <= 0}
                  >
                    <ChevronsLeft className="size-4" /> Voriger
                  </Button>
                  <Button
                    size="default"
                    className="min-w-28"
                    onClick={() => cmd({ type: 'toggle' })}
                    disabled={segs.length === 0}
                  >
                    {state.running ? <Pause className="size-4" /> : <Play className="size-4" />}
                    {state.running ? 'Pause' : 'Start'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cmd({ type: 'next' })}
                    disabled={state.current >= segs.length - 1}
                  >
                    Nächster <ChevronsRight className="size-4" />
                  </Button>
                  <span className="mx-1 h-6 w-px bg-border" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cmd({ type: 'adjust', deltaSec: -60 })}
                    disabled={state.current < 0}
                  >
                    −1 min
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cmd({ type: 'adjust', deltaSec: 60 })}
                    disabled={state.current < 0}
                  >
                    +1 min
                  </Button>
                  <span className="mx-1 h-6 w-px bg-border" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cmd({ type: 'reset' })}
                    disabled={state.current < 0}
                  >
                    <RotateCcw className="size-4" /> Abschnitt
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cmd({ type: 'resetAll' })}
                    disabled={segs.length === 0}
                    title="Stoppen und zurück zum ersten Abschnitt"
                  >
                    <Square className="size-4" /> Stopp
                  </Button>
                </div>
              </Card>
            )}

            {/* Nachrichten */}
            <Card className="p-5">
              <SectionTitle>Nachricht an die Bühne</SectionTitle>
              <div className="mt-3 flex gap-2">
                <Input
                  value={msgText}
                  placeholder="z.B. Bitte lauter sprechen"
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && msgText.trim()) {
                      cmd({ type: 'message', text: msgText.trim(), flash: msgFlash })
                    }
                  }}
                />
                <Button
                  onClick={() =>
                    msgText.trim() &&
                    cmd({ type: 'message', text: msgText.trim(), flash: msgFlash })
                  }
                  disabled={!msgText.trim()}
                >
                  <MessageSquare className="size-4" /> Senden
                </Button>
                {state.message && (
                  <Button variant="outline" onClick={() => cmd({ type: 'clearMessage' })}>
                    <X className="size-4" /> Ausblenden
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={msgFlash}
                    onChange={(e) => setMsgFlash(e.target.checked)}
                  />
                  blinkend
                </label>
                <span className="h-4 w-px bg-border" />
                {QUICK_MESSAGES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => cmd({ type: 'message', text: q, flash: msgFlash })}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Spalte 2: Abschnitte – bekommt so viel Platz wie möglich */}
          {!isClock && (
            <Card className="p-5">
              <SectionTitle>Abschnitte</SectionTitle>
              <div className="mt-3 space-y-1.5">
                {segs.map((seg, i) => (
                  <div
                    key={seg.id}
                    className={`flex items-center gap-2 rounded-md border p-2 ${
                      i === state.current ? 'border-primary/60 bg-primary/[0.07]' : 'border-border'
                    }`}
                  >
                    <button
                      type="button"
                      title="Zu diesem Abschnitt springen"
                      onClick={() => cmd({ type: 'goto', index: i })}
                      className={`size-6 shrink-0 rounded-full border text-[11px] font-bold ${
                        i === state.current
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary'
                      }`}
                    >
                      {i + 1}
                    </button>
                    <SegText
                      value={seg.speaker}
                      placeholder="Redner"
                      className="h-8 w-48 shrink-0 text-xs"
                      onCommit={(v) =>
                        patchSegments(segs.map((x, j) => (j === i ? { ...x, speaker: v } : x)))
                      }
                    />
                    <SegText
                      value={seg.title}
                      placeholder="Titel / Beitrag"
                      className="h-8 flex-1 text-sm font-medium"
                      onCommit={(v) =>
                        patchSegments(segs.map((x, j) => (j === i ? { ...x, title: v } : x)))
                      }
                    />
                    <DurationInput
                      seconds={seg.durationSec}
                      className="h-8 w-20 shrink-0 text-center text-sm"
                      onCommit={(sec) =>
                        patchSegments(
                          segs.map((x, j) => (j === i ? { ...x, durationSec: sec } : x))
                        )
                      }
                    />
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => {
                          const next = [...segs]
                          ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                          patchSegments(next)
                        }}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={i === segs.length - 1}
                        onClick={() => {
                          const next = [...segs]
                          ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                          patchSegments(next)
                        }}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => patchSegments(segs.filter((_, j) => j !== i))}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      title="Abschnitt löschen"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  patchSegments([
                    ...segs,
                    {
                      id: crypto.randomUUID(),
                      speaker: `Redner ${segs.length + 1}`,
                      title: '',
                      durationSec: 600
                    }
                  ])
                }
              >
                <Plus className="size-4" /> Abschnitt hinzufügen
              </Button>
              {segs.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Abschnitte laufen nacheinander – z.B. „Begrüßung 5:00“, „Vortrag 20:00“, „Q&amp;A
                  10:00“.
                </p>
              )}
            </Card>
          )}
        </div>
      }
    />
  )
}
