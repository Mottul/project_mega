import { useEffect, useRef, useState } from 'react'
import { Power, Radio, Send, Snowflake, Sun, Wifi } from 'lucide-react'
import type { NovastarStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { toolPageClass } from '@renderer/lib/toolPage'

// NovaStar-Prozessor-Steuerung (NovaPro UHD Jr & Co.) über TCP 5200.
// Paket-Bytes exakt nach „Central Control Protocol" V1.5.0.

export function Novastar(): JSX.Element {
  const [host, setHost] = useState('')
  const [port, setPort] = useState(5200)
  const [status, setStatus] = useState<NovastarStatus | null>(null)
  const [bright, setBright] = useState(100)
  const [ftbSec, setFtbSec] = useState(2)
  const [black, setBlack] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [preset, setPreset] = useState(1)
  const [rawHex, setRawHex] = useState('')
  const [rawChecksum, setRawChecksum] = useState(true)

  const rampRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevBright = useRef(100)

  useEffect(() => {
    void api.novastar.status().then(setStatus)
    const off = api.novastar.onStatus(setStatus)
    return () => {
      off()
      if (rampRef.current) clearInterval(rampRef.current)
    }
  }, [])

  const connected = status?.connected ?? false

  function applyBright(pct: number): void {
    const v = Math.max(0, Math.min(100, pct))
    setBright(v)
    void api.novastar.brightness(v)
  }
  function stopRamp(): void {
    if (rampRef.current) {
      clearInterval(rampRef.current)
      rampRef.current = null
    }
  }
  function ramp(to: number): void {
    stopRamp()
    const from = bright
    const steps = Math.max(1, Math.round((Math.max(0.1, ftbSec) * 1000) / 50))
    let i = 0
    rampRef.current = setInterval(() => {
      i++
      applyBright(from + (to - from) * (i / steps))
      if (i >= steps) stopRamp()
    }, 50)
  }
  function fadeToBlack(): void {
    if (bright > 0) prevBright.current = bright
    ramp(0)
  }
  function toggleBlackout(): void {
    const next = !black
    setBlack(next)
    void api.novastar.blackout(next)
  }
  function toggleFreeze(): void {
    const next = !frozen
    setFrozen(next)
    void api.novastar.freeze(next)
  }
  async function connect(): Promise<void> {
    if (connected) setStatus(await api.novastar.disconnect())
    else if (host.trim()) setStatus(await api.novastar.connect(host, port))
  }

  return (
    <div className={toolPageClass('full')}>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Befehls-Bytes exakt nach NovaStar „Central Control Protocol" V1.5.0 (TCP 5200). Auf echter
        Hardware noch nicht gegengeprüft – bei Problemen den <i>Roh-Befehl</i> nutzen.
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
      {/* Verbindung */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Verbindung</h2>
          <span className={cn('flex items-center gap-1.5 text-xs', connected ? 'text-emerald-500' : 'text-muted-foreground')}>
            <span className={cn('size-2.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground')} />
            {connected ? `verbunden ${status?.host}:${status?.port}` : 'getrennt'}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Prozessor-IP</span>
            <Input value={host} placeholder="z. B. 192.168.0.10" onChange={(e) => setHost(e.target.value)} disabled={connected} />
          </label>
          <label className="w-24">
            <span className="mb-1 block text-xs text-muted-foreground">Port</span>
            <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 5200)} disabled={connected} className="tabular-nums" />
          </label>
          <Button variant={connected ? 'outline' : 'default'} onClick={() => void connect()}>
            <Wifi className="size-4" /> {connected ? 'Trennen' : 'Verbinden'}
          </Button>
        </div>
        {status?.lastError && <p className="text-xs text-destructive">Fehler: {status.lastError}</p>}
      </Card>

      {/* Helligkeit, Blackout, Freeze */}
      <Card className="space-y-4 p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Bild</h2>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Sun className="size-4" /> Helligkeit</span>
            <span className="tabular-nums text-foreground">{Math.round(bright)} %</span>
          </div>
          <input type="range" min={0} max={100} value={bright} onChange={(e) => applyBright(Number(e.target.value))} className="w-full accent-primary" disabled={!connected} />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={fadeToBlack} disabled={!connected} className="flex-1">
            Fade to Black
          </Button>
          <Button variant="outline" onClick={() => ramp(prevBright.current || 100)} disabled={!connected} className="flex-1">
            Aufblenden
          </Button>
          <label className="w-28">
            <span className="mb-1 block text-xs text-muted-foreground">Fade-Dauer (s)</span>
            <Input type="number" step="0.5" min={0.1} value={ftbSec} onChange={(e) => setFtbSec(Number(e.target.value) || 2)} className="tabular-nums" />
          </label>
        </div>

        <div className="flex gap-2">
          <Button
            variant={black ? 'default' : 'outline'}
            onClick={toggleBlackout}
            disabled={!connected}
            className={cn('flex-1', black && 'bg-destructive hover:bg-destructive/90')}
          >
            <Power className="size-4" /> {black ? 'Blackout AUS' : 'Blackout (sofort)'}
          </Button>
          <Button variant={frozen ? 'default' : 'outline'} onClick={toggleFreeze} disabled={!connected} className="flex-1">
            <Snowflake className="size-4" /> {frozen ? 'Auftauen' : 'Einfrieren'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          „Fade to Black" blendet die Helligkeit weich aus; „Blackout" schaltet die Empfangskarten
          sofort hart schwarz (eigener Protokoll-Befehl).
        </p>
      </Card>

      {/* Presets */}
      <Card className="space-y-3 p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Presets / Szenen</h2>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <Button key={n} variant="outline" size="sm" disabled={!connected} onClick={() => void api.novastar.preset(n)} className="w-10 tabular-nums">
              {n}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <label className="w-28">
            <span className="mb-1 block text-xs text-muted-foreground">Preset-Nr. (1–26)</span>
            <Input type="number" min={1} max={26} value={preset} onChange={(e) => setPreset(Number(e.target.value) || 1)} className="tabular-nums" />
          </label>
          <Button variant="outline" disabled={!connected} onClick={() => void api.novastar.preset(preset)}>
            Abrufen
          </Button>
        </div>
      </Card>

      {/* Roh-Befehl */}
      <Card className="space-y-3 p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          <Radio className="mr-1 inline size-3.5" /> Roh-Befehl (erweitert)
        </h2>
        <Input
          value={rawHex}
          spellCheck={false}
          placeholder="Hex, z. B. 55 AA 00 ... (Inhalt; Prüfsumme optional automatisch)"
          onChange={(e) => setRawHex(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={rawChecksum} onChange={(e) => setRawChecksum(e.target.checked)} className="size-4" />
            Prüfsumme automatisch anhängen
          </label>
          <Button variant="outline" size="sm" disabled={!connected || !rawHex.trim()} onClick={() => void api.novastar.raw(rawHex, rawChecksum)}>
            <Send className="size-4" /> Senden
          </Button>
        </div>
      </Card>
      </div>
    </div>
  )
}
