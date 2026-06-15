// Jingle-Player: Raster belegbarer Pads (Klick oder Hotkey spielt ab), je Pad
// Datei/Farbe/Lautstärke/Loop/Modus/Fade. Audio geht aufs gewählte Ausgabegerät
// (z.B. Interface/Pult). Bänke als Sets, Solo-Modus, großer Fade-All-Stopp.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Music, Plus, Settings2, Square, Trash2, Upload, Wifi, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type { JingleRemoteSnapshot, RemoteStatus } from '@shared/types'
import { selectClass } from '../_calc/ui'
import { QrCode } from '../video-player/QrCode'
import { useJingleEngine } from './engine'
import { HOTKEYS, PAD_COLORS, useJingles, type Pad } from './store'

const AUDIO_FILTER = [
  { name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'aif', 'aiff'] }
]

export function JinglePlayer(): JSX.Element {
  const s = useJingles()
  const bank = s.currentBank()
  const [editPad, setEditPad] = useState<string | null>(null)
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

  // Fernsteuerung: Status holen + auf Änderungen lauschen; Trigger vom Handy
  // (main -> Renderer) an die Engine geben (Audio läuft hier im Tab).
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

  // Schnappschuss der Bank/Wiedergabe an den Server geben (für die Handy-Seite).
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

  // Tab geschlossen -> der Server zeigt „nicht geöffnet".
  useEffect(() => {
    return () => {
      void api.jingles.publish({ connected: false, bankName: '', columns: 4, pads: [], playing: [] })
    }
  }, [])

  async function toggleRemote(): Promise<void> {
    if (remote?.running) setRemote(await api.jingles.remoteStop())
    else {
      try {
        setRemote(await api.jingles.remoteStart(remotePort))
      } catch {
        // Port belegt o.ä.
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

  // Hotkeys: Position -> Taste; Esc/Leertaste = alles ausfaden.
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
      const padId = padByKey.get(e.key.toLowerCase())
      if (padId) {
        e.preventDefault()
        engineRef.current.trigger(padId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [padByKey])

  async function pickFor(padId: string): Promise<void> {
    const paths = await api.selectPaths({ title: 'Jingle wählen', filters: AUDIO_FILTER })
    if (paths.length === 0) return
    const [res] = await api.jingles.import(paths)
    if (res) s.assignJingle(padId, res.storedName, res.originalName)
  }

  async function dropFor(padId: string, files: FileList): Promise<void> {
    const paths = Array.from(files)
      .map((f) => api.pathForFile(f))
      .filter(Boolean)
    if (paths.length === 0) return
    const [res] = await api.jingles.import(paths)
    if (res) s.assignJingle(padId, res.storedName, res.originalName)
  }

  const editing = editPad ? bank.pads.find((p) => p.id === editPad) ?? null : null

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Bänke + globale Steuerung */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
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
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={s.soloMode}
            onChange={(e) => s.set({ soloMode: e.target.checked })}
          />
          Solo (nur einer)
        </label>
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
        <Button variant="destructive" size="sm" onClick={() => engine.stopAll()}>
          <Square className="size-4" /> Stopp (Esc)
        </Button>
      </Card>

      {/* Pad-Raster */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${s.columns}, minmax(0, 1fr))` }}>
        {bank.pads.map((pad, i) => (
          <PadTile
            key={pad.id}
            pad={pad}
            hotkey={HOTKEYS[i]}
            playing={!!engine.playing[pad.id]}
            progress={engine.progress[pad.id] ?? 0}
            onTrigger={() => engine.trigger(pad.id)}
            onStop={() => engine.stop(pad.id)}
            onPick={() => void pickFor(pad.id)}
            onDrop={(files) => void dropFor(pad.id, files)}
            onEdit={() => setEditPad(pad.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => s.addPad()}
          className="flex min-h-[104px] items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="size-5" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Tipp: Datei auf ein Pad ziehen oder „Laden“. Tasten {HOTKEYS.slice(0, Math.min(bank.pads.length, 9)).join(' ')}…
        spielen die Pads, <kbd className="rounded border border-border px-1">Esc</kbd> faded alles aus.
      </p>

      {/* Ausgabegerät + Set-Verwaltung */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[260px] flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Audio-Ausgabegerät</span>
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
          </label>
          <Input
            className="h-9 w-40"
            value={bank.name}
            onChange={(e) => s.renameBank(bank.id, e.target.value)}
            aria-label="Set-Name"
          />
          {s.banks.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => s.deleteBank(bank.id)}>
              <Trash2 className="size-4" /> Set löschen
            </Button>
          )}
        </div>
        {devices.length === 0 || devices.every((d) => !d.label) ? (
          <p className="text-xs text-muted-foreground">
            Gerätenamen erscheinen erst nach Audio-Freigabe – die Wiedergabe funktioniert dennoch.
          </p>
        ) : null}
      </Card>

      {/* Fernsteuerung per Handy/Tablet */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Wifi className="size-4 text-primary" />
            <span className="text-sm font-medium">Fernsteuerung</span>
            {remote?.running && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400 light:text-emerald-700">
                an
              </span>
            )}
          </div>
          <div className="flex-1" />
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
          <Button variant={remote?.running ? 'outline' : 'default'} size="sm" onClick={() => void toggleRemote()}>
            <Wifi className="size-4" /> {remote?.running ? 'Stoppen' : 'Aktivieren'}
          </Button>
        </div>
        {remote?.running && (
          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/30 p-3">
            {remote.urls[0] && <QrCode text={remote.urls[0]} size={120} />}
            <div className="min-w-0 text-sm">
              <p className="text-muted-foreground">Im selben WLAN öffnen (ohne Passwort):</p>
              {remote.urls.map((u) => (
                <p key={u} className="font-mono text-xs text-foreground">
                  {u}
                </p>
              ))}
              <p className="mt-1 text-xs text-muted-foreground">
                Dieses Fenster muss offen bleiben – die Jingles spielen hier auf dem gewählten Gerät.
              </p>
            </div>
          </div>
        )}
      </Card>

      {editing && (
        <PadEditor
          pad={editing}
          onClose={() => setEditPad(null)}
          onChange={(patch) => s.updatePad(editing.id, patch)}
          onClear={() => {
            s.clearPad(editing.id)
            setEditPad(null)
          }}
          onRemove={() => {
            s.removePad(editing.id)
            setEditPad(null)
          }}
        />
      )}
    </div>
  )
}

function PadTile({
  pad,
  hotkey,
  playing,
  progress,
  onTrigger,
  onStop,
  onPick,
  onDrop,
  onEdit
}: {
  pad: Pad
  hotkey: string | undefined
  playing: boolean
  progress: number
  onTrigger: () => void
  onStop: () => void
  onPick: () => void
  onDrop: (files: FileList) => void
  onEdit: () => void
}): JSX.Element {
  const [over, setOver] = useState(false)
  const empty = !pad.storedName

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
      className={`relative min-h-[104px] overflow-hidden rounded-lg border-2 transition-colors ${
        over ? 'border-primary' : 'border-transparent'
      }`}
      style={{ background: empty ? undefined : `${pad.color}22`, borderColor: playing ? pad.color : undefined }}
    >
      {/* Fortschrittsbalken */}
      {playing && (
        <div
          className="absolute inset-x-0 top-0 h-1 transition-[width]"
          style={{ width: `${progress * 100}%`, background: pad.color }}
        />
      )}
      {empty ? (
        <button
          type="button"
          onClick={onPick}
          className="flex size-full min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Upload className="size-5" />
          <span className="text-xs">Laden / hierher ziehen</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onTrigger}
          className="flex size-full min-h-[104px] flex-col justify-between p-3 text-left"
          style={{ borderRadius: 6 }}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="flex size-6 items-center justify-center rounded text-xs font-bold text-black" style={{ background: pad.color }}>
              {hotkey?.toUpperCase() ?? <Music className="size-3.5" />}
            </span>
            <div className="flex items-center gap-1">
              {pad.loop && <span className="text-[10px] text-muted-foreground">⟳</span>}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="text-muted-foreground hover:text-foreground"
                title="Pad bearbeiten"
              >
                <Settings2 className="size-4" />
              </span>
            </div>
          </div>
          <span className="line-clamp-2 text-sm font-medium leading-tight">{pad.label}</span>
        </button>
      )}
      {playing && (
        <button
          type="button"
          onClick={onStop}
          className="absolute bottom-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          title="Stoppen"
        >
          <Square className="size-3" />
        </button>
      )}
    </div>
  )
}

function PadEditor({
  pad,
  onClose,
  onChange,
  onClear,
  onRemove
}: {
  pad: Pad
  onClose: () => void
  onChange: (patch: Partial<Pad>) => void
  onClear: () => void
  onRemove: () => void
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-md space-y-4 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Pad bearbeiten</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

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
              <option value="oneshot">One-Shot (neu starten)</option>
              <option value="toggle">Toggle (Start/Stopp)</option>
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
          <input type="checkbox" checked={pad.loop} onChange={(e) => onChange({ loop: e.target.checked })} />
          Wiederholen (Loop)
        </label>

        <div className="flex justify-between border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="size-4" /> Pad entfernen
          </Button>
          {pad.storedName && (
            <Button variant="outline" size="sm" onClick={onClear}>
              Jingle leeren
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
