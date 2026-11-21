// Stream fürs Heimnetz (Stage-Timer, Video-Player): Zustand für Ausgabe-Leiste und Schublade und
// der Schubladen-Bereich mit Auflösung, Bildrate, Qualität und Port. Gesendet wird im main
// (services/stream/streamSender.ts) aus der Offscreen-Erfassung des Werkzeugs.

import { useEffect, useState } from 'react'
import { Tv } from 'lucide-react'
import { PanelSection } from '@renderer/components/ToolShell'
import { Badge } from '@renderer/components/ui/badge'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import type { StreamConfig, StreamStatus } from '@shared/types'

/** Was ein Werkzeug für seinen Stream anbietet (api.timer, api.player) */
export interface StreamApi {
  streamStart(config: StreamConfig): Promise<StreamStatus>
  streamStop(): Promise<StreamStatus>
  streamStatus(): Promise<StreamStatus>
  onStreamChanged(cb: (status: StreamStatus) => void): () => void
}

const AUFLOESUNGEN: [number, number][] = [
  [1920, 1080],
  [1280, 720]
]

/** Stream-Zustand: von der Ausgabe-Leiste (Ein/Aus) und dem Schubladen-Bereich geteilt. */
export function useStream(
  streamApi: StreamApi,
  cfg: StreamConfig
): { status: StreamStatus | null; toggle: () => Promise<void> } {
  const [status, setStatus] = useState<StreamStatus | null>(null)
  useEffect(() => {
    void streamApi.streamStatus().then(setStatus)
    return streamApi.onStreamChanged(setStatus)
  }, [streamApi])
  // Datenrate und Zuschauer leben im main -> während des Sendens nachfragen.
  useEffect(() => {
    if (!status?.running) return
    const t = setInterval(() => void streamApi.streamStatus().then(setStatus), 2000)
    return () => clearInterval(t)
  }, [status?.running, streamApi])

  async function toggle(): Promise<void> {
    setStatus(await (status?.running ? streamApi.streamStop() : streamApi.streamStart(cfg)))
  }
  return { status, toggle }
}

/** Schublade „Stream fürs Heimnetz“: Kopf mit Port und Empfängern, „sendet“ während des Sendens. */
export function StreamSection({
  status,
  cfg,
  patch,
  raten,
  hinweis
}: {
  status: StreamStatus | null
  cfg: StreamConfig
  patch: (p: Partial<StreamConfig>) => void
  /** Qualitätsstufen: kbit/s und Name */
  raten: [number, string][]
  /** Satz unter den Feldern, solange der Stream aus ist */
  hinweis: string
}): JSX.Element {
  return (
    <PanelSection
      id="stream"
      title="Stream fürs Heimnetz"
      icon={Tv}
      defaultOpen={false}
      summary={
        status?.running
          ? `Port ${status.config.port} · ${status.clients} Empfänger`
          : `${cfg.width} × ${cfg.height} · ${cfg.fps} fps · aus`
      }
      right={status?.running ? <Badge tone="success">sendet</Badge> : undefined}
    >
      <StreamPanel status={status} cfg={cfg} patch={patch} raten={raten} hinweis={hinweis} />
    </PanelSection>
  )
}

function StreamPanel({
  status,
  cfg,
  patch,
  raten,
  hinweis
}: {
  status: StreamStatus | null
  cfg: StreamConfig
  patch: (p: Partial<StreamConfig>) => void
  raten: [number, string][]
  hinweis: string
}): JSX.Element {
  if (!status) return <p className="text-xs text-muted-foreground">Lade…</p>
  const running = status.running
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Auflösung">
          <Select
            className="w-full"
            disabled={running}
            value={`${cfg.width}x${cfg.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number)
              patch({ width: w, height: h })
            }}
          >
            {AUFLOESUNGEN.map(([w, h]) => (
              <option key={`${w}x${h}`} value={`${w}x${h}`}>
                {w} × {h}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bildrate">
          <Select
            className="w-full"
            disabled={running}
            value={cfg.fps}
            onChange={(e) => patch({ fps: Number(e.target.value) })}
          >
            {[25, 30].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Qualität">
          <Select
            className="w-full"
            disabled={running}
            value={cfg.bitrateKbps}
            onChange={(e) => patch({ bitrateKbps: Number(e.target.value) })}
          >
            {raten.map(([kbps, label]) => (
              <option key={kbps} value={kbps}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Port" hint="Die Empfänger öffnen http://<dieser Rechner>:<Port>/live.ts">
          {running ? (
            <p className="py-1.5 text-sm tabular-nums">{status.config.port}</p>
          ) : (
            <NumberField
              value={cfg.port}
              min={1024}
              max={65535}
              onCommit={(port) => patch({ port })}
              aria-label="Port"
            />
          )}
        </Field>
      </div>
      {running ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Adresse für Heimkino, VLC („Netzwerkstream öffnen“) oder Smart-TV:</p>
          {status.urls.map((u) => (
            <p key={u} className="select-all break-all font-mono text-foreground">
              {u}
            </p>
          ))}
          <p className="tabular-nums">
            {status.clients === 0
              ? 'Niemand schaut zu – kodiert wird erst, wenn ein Empfänger verbindet.'
              : `${status.clients} Empfänger · ${status.kbps} kbit/s${status.encoder ? ` · ${status.encoder}` : ''}`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{hinweis}</p>
      )}
      {status.error && <p className="text-xs text-danger">{status.error}</p>}
    </>
  )
}
