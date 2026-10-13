// Inspector der OSC-Steuerung: NovaStar-Verbindung (Status, Adresse) für die NovaStar-Kacheln.

import { useEffect, useState } from 'react'
import { Wifi } from 'lucide-react'
import type { NovastarStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { useHandoff } from '@renderer/lib/handoff'

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
export function NovaStarDot(): JSX.Element {
  const status = useNovastarStatus()
  return (
    <span
      className={cn(
        'size-2.5 rounded-full',
        status?.connected ? 'bg-success' : 'bg-muted-foreground'
      )}
    />
  )
}

/** Verbindung zum NovaStar-Prozessor direkt aus der OSC-Steuerung (dieselbe
 *  geteilte Verbindung wie im NovaStar-Tool). Damit NovaStar-Widgets ohne
 *  Werkzeugwechsel funktionieren. */
export function NovaStarPanel(): JSX.Element {
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
      {status?.lastError && <p className="text-xs text-danger">Fehler: {status.lastError}</p>}
      {connected && (
        <p className="text-xs text-success">
          Verbunden {status?.host}:{status?.port}
        </p>
      )}
    </>
  )
}
