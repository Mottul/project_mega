import { useEffect, useRef, useState } from 'react'
import { Radio, Send, Sun, Wifi } from 'lucide-react'
import type { NovastarStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'

// NovaStar-Prozessor-Steuerung (NovaPro UHD Jr & Co.) über TCP 5200.
// v0: Transport + Paket-Framing/Prüfsumme sind gesichert; die genauen Befehls-
// Bytes (Helligkeits-Register) sind best-effort und am echten Gerät zu
// bestätigen – daher Register editierbar + Roh-Befehl-Sender.

const DEFAULT_REG = '02000001'

export function Novastar(): JSX.Element {
  const [host, setHost] = useState('')
  const [port, setPort] = useState(5200)
  const [status, setStatus] = useState<NovastarStatus | null>(null)
  const [bright, setBright] = useState(100)
  const [reg, setReg] = useState(DEFAULT_REG)
  const [ftbSec, setFtbSec] = useState(2)
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
  const regNum = (() => {
    const n = parseInt(reg.replace(/^0x/i, ''), 16)
    return Number.isFinite(n) ? n >>> 0 : 0x02000001
  })()

  function applyBright(pct: number): void {
    const v = Math.max(0, Math.min(100, pct))
    setBright(v)
    void api.novastar.brightness(regNum, v)
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

  async function connect(): Promise<void> {
    if (connected) setStatus(await api.novastar.disconnect())
    else if (host.trim()) setStatus(await api.novastar.connect(host, port))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500 light:text-amber-700">
        <b>v0 / Vorabversion.</b> Transport (TCP 5200) und Paket-Framing/Prüfsumme sind gesichert; die
        genauen Befehls-Bytes für „Helligkeit" sind <b>best-effort</b> und am echten NovaPro zu
        bestätigen. Falls der Slider nicht greift: über <i>Roh-Befehl</i> den korrekten Frame finden
        (NovaStar-Doku / NovaLCT-Mitschnitt) und mir melden, dann fixe ich den Codec.
      </div>

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

      {/* Helligkeit & Fade-to-Black */}
      <Card className="space-y-4 p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Helligkeit &amp; Fade-to-Black</h2>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground"><Sun className="size-4" /> Helligkeit</span>
            <span className="tabular-nums text-foreground">{Math.round(bright)} %</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={bright}
            onChange={(e) => applyBright(Number(e.target.value))}
            className="w-full accent-primary"
            disabled={!connected}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={fadeToBlack} disabled={!connected} className="flex-1">
            Fade to Black
          </Button>
          <Button variant="outline" onClick={() => ramp(prevBright.current || 100)} disabled={!connected} className="flex-1">
            Wieder aufblenden
          </Button>
          <label className="w-28">
            <span className="mb-1 block text-xs text-muted-foreground">Fade-Dauer (s)</span>
            <Input type="number" step="0.5" min={0.1} value={ftbSec} onChange={(e) => setFtbSec(Number(e.target.value) || 2)} className="tabular-nums" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Helligkeits-Register (hex) – am Gerät prüfen, Standard 0x02000001</span>
          <Input value={reg} spellCheck={false} onChange={(e) => setReg(e.target.value)} className="font-mono text-xs" />
        </label>
        <p className="text-xs text-muted-foreground">
          Fade-to-Black ist eine <b>Helligkeits-Rampe</b> (es gibt keinen echten Blackout-Befehl). Floor
          ist faktisch ~0 %; für absolut Schwarz zusätzlich ein „Schwarz"-Preset im NovaPro hinterlegen.
        </p>
      </Card>

      {/* Roh-Befehl */}
      <Card className="space-y-3 p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          <Radio className="mr-1 inline size-3.5" /> Roh-Befehl (zum Verifizieren)
        </h2>
        <Input
          value={rawHex}
          spellCheck={false}
          placeholder="Hex, z. B. 55 AA 00 ... (Header + Inhalt)"
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
  )
}
