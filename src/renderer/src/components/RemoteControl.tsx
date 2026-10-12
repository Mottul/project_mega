// Handy-Fernsteuerung eines Werkzeugs, für alle gleich (Video-Player, Jingles, OSC, Stage-Timer):
// - useRemoteControl: Status aus dem main (läuft er nicht, steht im Status der gemerkte Port),
//   Port, Ein/Aus mit Meldung, wenn der Port belegt ist
// - RemoteToggle: der Schalter „Handy“ in der Ausgabe-Leiste
// - RemoteSection: der Bereich „Fernsteuerung“ der Schublade (Port, QR-Code und Adressen)
// Start, Stopp, Merken und Autostart erledigt der main-Prozess (ipc/remoteControls.ts).

import { useEffect, useRef, useState } from 'react'
import { Smartphone } from 'lucide-react'
import type { RemoteStatus } from '@shared/types'
import { BarToggle, PanelSection } from '@renderer/components/ToolShell'
import { RemoteAccess } from '@renderer/components/RemoteAccess'
import { Badge } from '@renderer/components/ui/badge'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { toast } from '@renderer/lib/toast'

/** Was jede Fernsteuerung im Preload bereitstellt (api.player, api.jingles, api.osc, api.timer) */
export interface RemoteApi {
  remoteStatus(): Promise<RemoteStatus>
  remoteStart(port: number): Promise<RemoteStatus>
  remoteStop(): Promise<RemoteStatus>
  onRemoteChanged(cb: (status: RemoteStatus) => void): () => void
}

export interface RemoteControl {
  remote: RemoteStatus | null
  running: boolean
  port: number
  setPort: (port: number) => void
  toggle: () => Promise<void>
}

export function useRemoteControl(
  remoteApi: RemoteApi,
  defaultPort: number,
  /** nach dem Start, z. B. dem Server sofort den aktuellen Stand geben (OSC) */
  onStarted?: () => void
): RemoteControl {
  const [remote, setRemote] = useState<RemoteStatus | null>(null)
  const [port, setPort] = useState(defaultPort)
  // in einer Ref: Der Effekt soll genau einmal abonnieren, egal wie oft neu gerendert wird
  const apiRef = useRef(remoteApi)
  apiRef.current = remoteApi

  useEffect(() => {
    const ra = apiRef.current
    // Jede Meldung bringt auch den Port mit (läuft sie nicht: den gemerkten) – so zeigt jedes
    // Fenster denselben, auch wenn in einem anderen auf einem neuen Port gestartet wurde.
    const apply = (s: RemoteStatus): void => {
      setRemote(s)
      setPort(s.port)
    }
    void ra.remoteStatus().then(apply)
    return ra.onRemoteChanged(apply)
  }, [])

  async function toggle(): Promise<void> {
    if (remote?.running) {
      setRemote(await apiRef.current.remoteStop())
      return
    }
    try {
      setRemote(await apiRef.current.remoteStart(port))
      onStarted?.()
    } catch (e) {
      toast.error(
        `Fernsteuerung konnte nicht starten (Port ${port} belegt?)`,
        e instanceof Error ? e.message : undefined
      )
    }
  }

  return { remote, running: !!remote?.running, port, setPort, toggle }
}

/** Schalter in der Ausgabe-Leiste */
export function RemoteToggle({
  rc,
  label = 'Handy',
  title = 'Fernsteuerung fürs Handy/Tablet im selben WLAN'
}: {
  rc: RemoteControl
  label?: string
  title?: string
}): JSX.Element {
  return (
    <BarToggle on={rc.running} title={title} onClick={() => void rc.toggle()}>
      {label}
    </BarToggle>
  )
}

/** Bereich „Fernsteuerung“ in der Schublade */
export function RemoteSection({
  rc,
  hint,
  id = 'remote'
}: {
  rc: RemoteControl
  /** was das Handy hier steuern kann (Erklärung hinter dem ⓘ am Port) */
  hint: string
  /** Kennung des Bereichs – merkt, ob er auf- oder zugeklappt ist */
  id?: string
}): JSX.Element {
  return (
    <PanelSection
      id={id}
      title="Fernsteuerung"
      icon={Smartphone}
      defaultOpen={false}
      summary={`Port ${rc.remote?.port ?? rc.port} · ${rc.running ? 'an' : 'aus'}`}
      right={rc.running ? <Badge tone="success">an</Badge> : undefined}
    >
      <Field label="Port" hint={`${hint} Im selben WLAN, ohne Passwort.`}>
        {rc.running ? (
          // Läuft sie, gilt der Port des Servers; ändern erst nach dem Ausschalten
          <p className="text-sm tabular-nums text-muted-foreground">{rc.remote?.port}</p>
        ) : (
          <NumberField value={rc.port} min={1} max={65535} onCommit={rc.setPort} className="w-24" />
        )}
      </Field>
      {rc.remote && <RemoteAccess status={rc.remote} />}
    </PanelSection>
  )
}
