// NDI-Ausgabe des Video-Players: Zustand (geteilt von Ausgabe-Leiste und Schublade) und das
// Panel mit Quellenname, Auflösung, Bildrate und Ton. Gesendet wird im main über den
// gemeinsamen Offscreen-Sender (services/ndi/ndiSender.ts).

import { useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Select } from '@renderer/components/ui/select'
import { TextField } from '@renderer/components/ui/text-field'
import { PanelSection } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { migrateLocalStorage, updateSettings, useSettings } from '@renderer/lib/settings'
import {
  DEFAULT_PLAYER_NDI,
  DEFAULT_PLAYER_SETTINGS,
  type PlayerNdiConfig,
  type PlayerNdiMode,
  type PlayerNdiPrefs,
  type PlayerNdiStatus
} from '@shared/types'

type NdiMode = PlayerNdiMode

/** Frühere Versionen merkten sich das NDI-Panel nur im localStorage. */
function legacyNdi(old: Record<string, unknown>): Partial<PlayerNdiPrefs> {
  const out: Partial<PlayerNdiPrefs> = {}
  if (typeof old.name === 'string' && old.name.trim()) out.name = old.name.trim()
  if (old.mode === 'wall' || old.mode === 'half' || old.mode === 'hd1080' || old.mode === 'hd720') {
    out.mode = old.mode
  }
  if (old.fps === 25 || old.fps === 30 || old.fps === 50) out.fps = old.fps
  if (typeof old.audio === 'boolean') out.audio = old.audio
  return out
}

// NDI mag gerade Maße; außerdem Untergrenze für sinnvolle Streams.
function evenDim(n: number): number {
  return Math.max(320, Math.round(n / 2) * 2)
}

function ndiConfigFor(
  mode: NdiMode,
  name: string,
  fps: number,
  audio: boolean,
  wallW: number,
  wallH: number
): PlayerNdiConfig {
  const base = { name: name.trim() || DEFAULT_PLAYER_NDI.name, fps, audio }
  switch (mode) {
    case 'half':
      return { ...base, width: evenDim(wallW / 2), height: evenDim(wallH / 2), fit: 'fill' }
    case 'hd1080':
      return { ...base, width: 1920, height: 1080, fit: 'contain' }
    case 'hd720':
      return { ...base, width: 1280, height: 720, fit: 'contain' }
    default:
      return { ...base, width: evenDim(wallW), height: evenDim(wallH), fit: 'fill' }
  }
}

/** NDI-Zustand des Players: von der Ausgabe-Leiste (Ein/Aus) und dem Panel geteilt. */
export function usePlayerNdi(
  wallW: number,
  wallH: number
): { status: PlayerNdiStatus | null; toggle: () => Promise<void> } {
  const prefs = useSettings((s) => s.player.ndi) ?? DEFAULT_PLAYER_SETTINGS.ndi
  const [status, setStatus] = useState<PlayerNdiStatus | null>(null)
  useEffect(() => {
    migrateLocalStorage('player:ndi', (old) => ({ player: { ndi: legacyNdi(old) } }))
  }, [])

  useEffect(() => {
    void api.player.ndiStatus().then(setStatus)
    return api.player.onNdiChanged(setStatus)
  }, [])

  // Frame-Zähler lebt im main -> während des Sendens gelegentlich nachfragen.
  useEffect(() => {
    if (!status?.running) return
    const t = setInterval(() => void api.player.ndiStatus().then(setStatus), 2000)
    return () => clearInterval(t)
  }, [status?.running])

  async function toggle(): Promise<void> {
    if (status?.running) setStatus(await api.player.ndiStop())
    else
      setStatus(
        await api.player.ndiStart(
          ndiConfigFor(prefs.mode, prefs.name, prefs.fps, prefs.audio, wallW, wallH)
        )
      )
  }
  return { status, toggle }
}

/** Schublade „NDI“: Kopf mit Quellenname und Bildrate, „sendet“ während des Sendens. */
export function NdiSection({
  wallW,
  wallH,
  status
}: {
  wallW: number
  wallH: number
  status: PlayerNdiStatus | null
}): JSX.Element {
  const prefs = useSettings((s) => s.player.ndi) ?? DEFAULT_PLAYER_SETTINGS.ndi
  return (
    <PanelSection
      id="ndi"
      title="NDI"
      icon={Radio}
      defaultOpen={false}
      summary={`„${prefs.name}“ · ${prefs.fps} fps`}
      right={status?.running ? <Badge tone="success">sendet</Badge> : undefined}
    >
      <PlayerNdiPanel wallW={wallW} wallH={wallH} status={status} />
    </PanelSection>
  )
}

/** NDI-Ausgabe des Players (experimentell): Wandbild (und optional Ton) als
 *  NDI-Quelle ins Netz. Ohne installiertes NDI-Modul nur ein Hinweis. */
function PlayerNdiPanel({
  wallW,
  wallH,
  status
}: {
  wallW: number
  wallH: number
  status: PlayerNdiStatus | null
}): JSX.Element {
  // gemerkt in settings.json (player.ndi), in allen Fenstern gleich
  const prefs = useSettings((s) => s.player.ndi) ?? DEFAULT_PLAYER_SETTINGS.ndi

  function patch(p: Partial<PlayerNdiPrefs>): void {
    updateSettings({ player: { ndi: p } })
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
  const modes: { value: NdiMode; label: string }[] = [
    { value: 'wall', label: `Wand 1:1 (${evenDim(wallW)} × ${evenDim(wallH)})` },
    { value: 'half', label: `Wand 50 % (${evenDim(wallW / 2)} × ${evenDim(wallH / 2)})` },
    { value: 'hd1080', label: '1920 × 1080 (einbetten)' },
    { value: 'hd720', label: '1280 × 720 (einbetten)' }
  ]
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Quellenname im Netz</span>
        <TextField
          value={prefs.name}
          disabled={running}
          maxLength={60}
          onCommit={(name) => patch({ name })}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Auflösung</span>
          <Select
            className="w-full"
            disabled={running}
            value={prefs.mode}
            onChange={(e) => patch({ mode: e.target.value as NdiMode })}
          >
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Bildrate</span>
          <Select
            className="w-full"
            disabled={running}
            value={prefs.fps}
            onChange={(e) => patch({ fps: Number(e.target.value) })}
          >
            {[25, 30, 50].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          disabled={running}
          checked={prefs.audio}
          onChange={(e) => patch({ audio: e.target.checked })}
        />
        Audio mitsenden
        <InfoTip
          label="Erklärung zu Audio"
          text="Ton ist Pre-Fader (unabhängig von lokaler Lautstärke/Stumm). Volle Auflösung braucht Gigabit-LAN (~100–150 Mbit/s bei 1080p30)."
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Ein/Aus mit „NDI“ in der Ausgabe-Leiste; Änderungen hier gelten beim nächsten Start.
      </p>
      {running && (
        <p className="text-xs text-muted-foreground">
          Sendet als <span className="font-medium text-foreground">„{status.config.name}“</span> ·{' '}
          {status.config.width}×{status.config.height}@{status.config.fps}
          {status.config.audio
            ? ` · Audio: ${status.audioChunks} Blöcke, Pegel ${Math.round(status.audioLevel * 100)} %`
            : ''}{' '}
          · <span className="tabular-nums">{status.framesSent}</span> Frames
        </p>
      )}
      {status.error && <p className="text-xs text-danger">{status.error}</p>}
    </>
  )
}
