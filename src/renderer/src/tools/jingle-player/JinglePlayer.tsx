// Jingle-Player: Raster belegbarer Pads. Zwei Modi – LIVE (Klick/Hotkey spielt
// ab) und EDIT (Klick wählt ein Pad aus, Einstellungen inkl. Wellenform erscheinen
// im seitlichen Panel, wie in den anderen Tools). Audio geht aufs gewählte
// Ausgabegerät; Bänke als Sets, Solo-Modus, großer Fade-All-Stopp, Fernsteuerung.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderOpen,
  Music,
  Pencil,
  Play,
  Plus,
  Settings2,
  Square,
  Trash2,
  Upload,
  Volume2,
  Wifi
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { ToolShell, PanelSection } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { useDraft } from '@renderer/lib/useDraft'
import type { JingleRemoteSnapshot, RemoteStatus } from '@shared/types'
import { selectClass } from '../_calc/ui'
import { QrCode } from '../video-player/QrCode'
import { useJingleEngine } from './engine'
import { Waveform } from './Waveform'
import { HOTKEYS, PAD_COLORS, useJingles, type Pad } from './store'

const AUDIO_FILTER = [
  {
    name: 'Audio',
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff']
  }
]

export function JinglePlayer(): JSX.Element {
  const s = useJingles()
  const bank = s.currentBank()
  const live = s.mode === 'live'
  const [selectedPadId, setSelectedPadId] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [remotePort, setRemotePort] = useState(8089)

  const engine = useJingleEngine({
    pads: bank.pads,
    outputDeviceId: s.outputDeviceId,
    soloMode: s.soloMode
  })
  const engineRef = useRef(engine)
  engineRef.current = engine

  // Fernsteuerung: Status + Trigger vom Handy an die Engine geben.
  useEffect(() => {
    void api.jingles.remoteStatus().then(setRemote)
    const offChanged = api.jingles.onRemoteChanged(setRemote)
    const offCmd = api.jingles.onRemoteCommand((cmd) => {
      if (cmd.type === 'stopAll') engineRef.current.stopAll()
      else if (cmd.type === 'trigger') engineRef.current.trigger(cmd.padId)
    })
    return () => {
      offChanged()
      offCmd()
    }
  }, [])

  // Schnappschuss der Bank/Wiedergabe an den Server (für die Handy-Seite).
  useEffect(() => {
    const snap: JingleRemoteSnapshot = {
      connected: true,
      bankName: bank.name,
      columns: s.columns,
      pads: bank.pads.map((p) => ({
        id: p.id,
        label: p.label || (p.storedName ? 'Jingle' : ''),
        color: p.color,
        loaded: !!p.storedName
      })),
      playing: Object.keys(engine.playing)
    }
    void api.jingles.publish(snap)
  }, [bank, s.columns, engine.playing])

  useEffect(() => {
    return () => {
      void api.jingles.publish({
        connected: false,
        bankName: '',
        columns: 4,
        pads: [],
        playing: []
      })
    }
  }, [])

  async function toggleRemote(): Promise<void> {
    if (remote?.running) setRemote(await api.jingles.remoteStop())
    else {
      try {
        setRemote(await api.jingles.remoteStart(remotePort))
      } catch (e) {
        toast.error(
          `Fernsteuerung konnte nicht starten (Port ${remotePort} belegt?)`,
          e instanceof Error ? e.message : undefined
        )
      }
    }
  }

  // Ausgabegeräte auflisten (Labels brauchen u.U. eine Audio-Berechtigung).
  useEffect(() => {
    const load = (): void => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((d) => setDevices(d.filter((x) => x.kind === 'audiooutput')))
        .catch(() => setDevices([]))
    }
    load()
    navigator.mediaDevices.addEventListener('devicechange', load)
    return () => navigator.mediaDevices.removeEventListener('devicechange', load)
  }, [])

  // Beim Set-Wechsel die Pad-Auswahl zurücksetzen.
  useEffect(() => setSelectedPadId(null), [s.currentBankId])

  // Hotkeys: NUR im Live-Modus spielen Pads; Esc/Leertaste stoppt immer.
  const padByKey = useMemo(() => {
    const map = new Map<string, string>()
    bank.pads.forEach((p, i) => {
      if (HOTKEYS[i]) map.set(HOTKEYS[i], p.id)
    })
    return map
  }, [bank.pads])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault()
        engineRef.current.stopAll()
        return
      }
      if (s.mode !== 'live') return
      const padId = padByKey.get(e.key.toLowerCase())
      if (padId) {
        e.preventDefault()
        engineRef.current.trigger(padId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [padByKey, s.mode])

  async function pickFor(padId: string): Promise<void> {
    const paths = await api.selectPaths({ title: 'Jingle wählen', filters: AUDIO_FILTER })
    if (paths.length === 0) return
    const [res] = await api.jingles.import(paths)
    if (res) {
      s.assignJingle(padId, res.storedName, res.originalName)
      setSelectedPadId(padId)
    }
  }

  async function dropFor(padId: string, files: FileList): Promise<void> {
    const paths = Array.from(files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    if (paths.length === 0) return
    const [res] = await api.jingles.import(paths)
    if (res) {
      s.assignJingle(padId, res.storedName, res.originalName)
      setSelectedPadId(padId)
    }
  }

  function onPadClick(pad: Pad): void {
    if (!pad.storedName) {
      void pickFor(pad.id) // leeres Pad: immer laden
      return
    }
    if (live) engine.trigger(pad.id)
    else setSelectedPadId(pad.id)
  }

  const selected = selectedPadId ? (bank.pads.find((p) => p.id === selectedPadId) ?? null) : null

  const main = (
    <div className="space-y-4 p-6">
      {/* Bänke + globale Steuerung */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {s.banks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => s.set({ currentBankId: b.id })}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                b.id === bank.id
                  ? 'border-primary/60 bg-primary/10 font-semibold text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {b.name}
            </button>
          ))}
          <Button variant="ghost" size="icon" title="Set hinzufügen" onClick={() => s.addBank()}>
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex-1" />
        {/* Edit / Live */}
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => s.set({ mode: 'edit' })}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              !live
                ? 'bg-primary/15 font-semibold text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Pencil className="size-4" /> Edit
          </button>
          <button
            type="button"
            onClick={() => s.set({ mode: 'live' })}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm transition-colors ${
              live
                ? 'bg-emerald-500/20 font-semibold text-emerald-400 light:text-emerald-700'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Play className="size-4" /> Live
          </button>
        </div>
        <select
          className={`${selectClass} h-8 w-auto`}
          value={s.columns}
          onChange={(e) => s.set({ columns: Number(e.target.value) })}
          title="Spalten"
        >
          {[3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} Spalten
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={s.soloMode}
            onChange={(e) => s.set({ soloMode: e.target.checked })}
          />
          Solo
        </label>
        <Button variant="destructive" size="sm" onClick={() => engine.stopAll()}>
          <Square className="size-4" /> Stopp (Esc)
        </Button>
      </div>

      {/* Pad-Raster */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${s.columns}, minmax(0, 1fr))` }}
      >
        {bank.pads.map((pad, i) => (
          <PadTile
            key={pad.id}
            pad={pad}
            hotkey={HOTKEYS[i]}
            live={live}
            selected={pad.id === selectedPadId}
            playing={!!engine.playing[pad.id]}
            progress={engine.progress[pad.id] ?? 0}
            onClick={() => onPadClick(pad)}
            onStop={() => engine.stop(pad.id)}
            onDrop={(files) => void dropFor(pad.id, files)}
          />
        ))}
        {!live && (
          <button
            type="button"
            onClick={() => s.addPad()}
            className="flex min-h-[104px] items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-5" />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {live ? (
          <>
            Klick oder Tasten {HOTKEYS.slice(0, Math.min(bank.pads.length, 9)).join(' ')}… spielen
            die Pads, <kbd className="rounded border border-border px-1">Esc</kbd> faded alles aus.
          </>
        ) : (
          <>
            Edit-Modus: Pad anklicken, um es rechts zu bearbeiten. Leeres Pad anklicken oder Datei
            darauf ziehen, um zu laden.
          </>
        )}
      </p>

      {/* Ausschnitt-Editor in voller Breite unter dem Raster (wenn ein Pad gewählt ist) */}
      {selected && (
        <ExcerptEditor
          pad={selected}
          outputDeviceId={s.outputDeviceId}
          onChange={(patch) => s.updatePad(selected.id, patch)}
        />
      )}
    </div>
  )

  const aside = (
    <>
      <PanelSection id="pad" title="Pad" icon={Settings2}>
        {selected ? (
          <PadSettings
            pad={selected}
            onChange={(patch) => s.updatePad(selected.id, patch)}
            onPick={() => void pickFor(selected.id)}
            onClear={() => s.clearPad(selected.id)}
            onRemove={() => {
              s.removePad(selected.id)
              setSelectedPadId(null)
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {live
              ? 'In den Edit-Modus wechseln und ein Pad anklicken.'
              : 'Ein Pad anklicken, um es hier zu bearbeiten.'}
          </p>
        )}
      </PanelSection>

      <PanelSection id="output" title="Audio-Ausgabe" icon={Volume2}>
        <select
          className={selectClass}
          value={s.outputDeviceId}
          onChange={(e) => s.set({ outputDeviceId: e.target.value })}
        >
          <option value="">Standardgerät</option>
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Ausgabegerät ${i + 1}`}
            </option>
          ))}
        </select>
        {devices.length === 0 || devices.every((d) => !d.label) ? (
          <p className="text-xs text-muted-foreground">
            Gerätenamen erscheinen erst nach Audio-Freigabe – die Wiedergabe funktioniert dennoch.
          </p>
        ) : null}
      </PanelSection>

      <PanelSection
        id="remote"
        title="Fernsteuerung"
        icon={Wifi}
        defaultOpen={false}
        right={remote?.running ? <Badge tone="success">an</Badge> : undefined}
      >
        <p className="text-xs text-muted-foreground">
          Handy/Tablet im selben WLAN steuert die Pads (ohne Passwort). Dieses Fenster muss offen
          bleiben.
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Port
            <Input
              className="h-8 w-20"
              type="number"
              value={remotePort}
              onChange={(e) => setRemotePort(Number(e.target.value) || 8089)}
              disabled={remote?.running}
            />
          </label>
          <Button
            variant={remote?.running ? 'outline' : 'default'}
            size="sm"
            onClick={() => void toggleRemote()}
          >
            <Wifi className="size-4" /> {remote?.running ? 'Stoppen' : 'Aktivieren'}
          </Button>
        </div>
        {remote?.running && remote.urls[0] && (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
            <QrCode text={remote.urls[0]} size={96} />
            <div className="min-w-0">
              {remote.urls.map((u) => (
                <p key={u} className="truncate font-mono text-[11px] text-foreground">
                  {u}
                </p>
              ))}
            </div>
          </div>
        )}
      </PanelSection>

      <PanelSection id="set" title="Set" icon={Music} defaultOpen={false}>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Name</span>
          <Input value={bank.name} onChange={(e) => s.renameBank(bank.id, e.target.value)} />
        </label>
        {s.banks.length > 1 && (
          <Button variant="outline" size="sm" onClick={() => s.deleteBank(bank.id)}>
            <Trash2 className="size-4" /> Set löschen
          </Button>
        )}
      </PanelSection>
    </>
  )

  return <ToolShell id="jingle-player" main={main} aside={aside} asideWidth={400} />
}

function PadTile({
  pad,
  hotkey,
  live,
  selected,
  playing,
  progress,
  onClick,
  onStop,
  onDrop
}: {
  pad: Pad
  hotkey: string | undefined
  live: boolean
  selected: boolean
  playing: boolean
  progress: number
  onClick: () => void
  onStop: () => void
  onDrop: (files: FileList) => void
}): JSX.Element {
  const [over, setOver] = useState(false)
  const empty = !pad.storedName
  const ring = over
    ? 'border-primary'
    : selected && !live
      ? 'border-foreground/70'
      : playing
        ? ''
        : 'border-transparent'

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) onDrop(e.dataTransfer.files)
      }}
      className={`relative min-h-[104px] overflow-hidden rounded-lg border-2 transition-colors ${ring}`}
      style={{
        background: empty ? undefined : `${pad.color}22`,
        borderColor: playing ? pad.color : undefined
      }}
    >
      {playing && (
        <div
          className="absolute inset-x-0 top-0 h-1 transition-[width]"
          style={{ width: `${progress * 100}%`, background: pad.color }}
        />
      )}
      {empty ? (
        <button
          type="button"
          onClick={onClick}
          className="flex size-full min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Upload className="size-5" />
          <span className="text-xs">Laden / hierher ziehen</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="flex size-full min-h-[104px] flex-col justify-between p-3 text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <span
              className="flex size-6 items-center justify-center rounded text-xs font-bold text-black"
              style={{ background: pad.color }}
            >
              {hotkey?.toUpperCase() ?? <Music className="size-3.5" />}
            </span>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {pad.loop && <span title="Loop">⟳</span>}
              {pad.mode === 'toggle' && <span title="Toggle">⇄</span>}
              {(pad.startSec > 0 || pad.endSec != null) && <span title="Ausschnitt">✂</span>}
              {!live && <Pencil className="size-3" />}
            </div>
          </div>
          <span className="line-clamp-2 text-sm font-medium leading-tight">{pad.label}</span>
        </button>
      )}
      {playing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStop()
          }}
          className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          title="Stoppen"
        >
          <Square className="size-3" />
        </button>
      )}
    </div>
  )
}

// Ausschnitt-Editor (Wellenform + Marker) – volle Breite unter dem Pad-Raster.
function ExcerptEditor({
  pad,
  outputDeviceId,
  onChange
}: {
  pad: Pad
  outputDeviceId: string
  onChange: (patch: Partial<Pad>) => void
}): JSX.Element {
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          Ausschnitt{pad.label ? ` – ${pad.label}` : ''}
        </h2>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Start
          <MarkInput
            value={pad.startSec}
            placeholder="0:00.000"
            className="h-8 w-28"
            onCommit={(v) => onChange({ startSec: v ?? 0 })}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Ende
          <MarkInput
            value={pad.endSec}
            placeholder="bis Ende"
            className="h-8 w-28"
            onCommit={(v) => onChange({ endSec: v })}
          />
        </label>
      </div>
      {pad.storedName ? (
        <Waveform
          storedName={pad.storedName}
          color={pad.color}
          volume={pad.volume}
          outputDeviceId={outputDeviceId}
          startSec={pad.startSec}
          endSec={pad.endSec}
          onChange={(start, end) => onChange({ startSec: start, endSec: end })}
        />
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Kein Jingle geladen. Im Panel rechts „Datei laden" wählen oder eine Datei aufs Pad ziehen.
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Marker ziehen für Start/Stopp · Mausrad zoomt · Ende leer = bis zum Dateiende.
      </p>
    </Card>
  )
}

function PadSettings({
  pad,
  onChange,
  onPick,
  onClear,
  onRemove
}: {
  pad: Pad
  onChange: (patch: Partial<Pad>) => void
  onPick: () => void
  onClear: () => void
  onRemove: () => void
}): JSX.Element {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Beschriftung</span>
        <Input value={pad.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>

      <div>
        <span className="mb-1 block text-xs text-muted-foreground">Farbe</span>
        <div className="flex flex-wrap gap-1.5">
          {PAD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ color: c })}
              className={`size-7 rounded-full border-2 ${pad.color === c ? 'border-foreground' : 'border-transparent'}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Lautstärke</span>
          <span>{Math.round(pad.volume * 100)} %</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={pad.volume}
          onChange={(e) => onChange({ volume: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Modus</span>
          <select
            className={selectClass}
            value={pad.mode}
            onChange={(e) => onChange({ mode: e.target.value as Pad['mode'] })}
          >
            <option value="oneshot">One-Shot</option>
            <option value="toggle">Toggle</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Fade-Out</span>
          <select
            className={selectClass}
            value={pad.fadeMs}
            onChange={(e) => onChange({ fadeMs: Number(e.target.value) })}
          >
            <option value={0}>Hart (0 ms)</option>
            <option value={200}>200 ms</option>
            <option value={400}>400 ms</option>
            <option value={1000}>1 s</option>
            <option value={2000}>2 s</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={pad.loop}
          onChange={(e) => onChange({ loop: e.target.checked })}
        />
        Wiederholen (Loop)
      </label>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="outline" size="sm" onClick={onPick}>
          <FolderOpen className="size-4" /> {pad.storedName ? 'Datei ersetzen' : 'Datei laden'}
        </Button>
        {pad.storedName && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Leeren
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-4" /> Pad
        </Button>
      </div>
    </div>
  )
}

// Marker-Feld (mm:ss.mmm oder Sekunden). Leer -> null. Lokaler Puffer, Commit bei Blur.
function fmtMark(sec: number | null): string {
  if (sec == null) return ''
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  const ms = Math.round((s - Math.floor(s)) * 1000)
  return `${m}:${String(r).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}
function parseMark(text: string): number | null {
  const t = text.trim().replace(',', '.')
  if (t === '') return null
  if (t.includes(':')) {
    const parts = t.split(':').map(Number)
    if (parts.some((n) => !Number.isFinite(n))) return null
    return parts.reduce((acc, n) => acc * 60 + n, 0)
  }
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function MarkInput({
  value,
  onCommit,
  placeholder,
  className
}: {
  value: number | null
  onCommit: (v: number | null) => void
  placeholder?: string
  className?: string
}): JSX.Element {
  const { ref, text, setText } = useDraft(fmtMark(value))
  const commit = (): void => {
    const v = parseMark(text)
    onCommit(v)
    setText(fmtMark(v))
  }
  return (
    <Input
      ref={ref}
      value={text}
      placeholder={placeholder}
      inputMode="numeric"
      className={className}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
