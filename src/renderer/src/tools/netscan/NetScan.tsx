// Netzwerk-Scanner: findet Geräte im lokalen Subnetz (LED-Prozessoren,
// Video-Mischer/ATEM, PTZ-Kameras, Projektoren, Rechner …) über einen aktiven
// TCP-Sweep + ARP (Hersteller aus der MAC) + Bonjour/mDNS-Namen. Der Scan läuft
// im main-Prozess; hier werden Fortschritt und Geräte live gespiegelt.

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'
import {
  Ban,
  Camera,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  HelpCircle,
  Lightbulb,
  Monitor as MonitorIcon,
  MonitorCog,
  MonitorPlay,
  Printer,
  Projector,
  Radio,
  Router,
  Search,
  Smartphone,
  Video,
  Volume2,
  Wand2,
  Wifi
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import type { NetDevice, NetDeviceType, NetInterface, NetScanProgress } from '@shared/types'
import { Badge, type BadgeTone } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Progress } from '@renderer/components/ui/progress'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { toolPageClass } from '@renderer/lib/toolPage'
import { useHandoff } from '@renderer/lib/handoff'
import { deviceKey, useNetLabels } from './store'

// Anzeige-Namen für bekannte Ports (Spiegel der main-Seite, nur zur Darstellung).
const PORT_LABEL: Record<number, string> = {
  22: 'SSH',
  23: 'Telnet',
  80: 'HTTP',
  443: 'HTTPS',
  445: 'SMB',
  554: 'RTSP',
  1935: 'RTMP',
  3389: 'RDP',
  4352: 'PJLink',
  5200: 'NovaStar',
  5900: 'VNC',
  7000: 'AirPlay',
  8000: 'ONVIF',
  8080: 'HTTP',
  8443: 'HTTPS'
}
const WEB_PORTS = [80, 443, 8080, 8443, 8000]

const TYPE_META: Record<NetDeviceType, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  novastar: { label: 'LED-Prozessor', tone: 'info', icon: MonitorCog },
  atem: { label: 'Video-Mischer', tone: 'info', icon: Video },
  camera: { label: 'Kamera', tone: 'info', icon: Camera },
  video: { label: 'Video/Streaming', tone: 'info', icon: MonitorPlay },
  projector: { label: 'Projektor', tone: 'info', icon: Projector },
  lighting: { label: 'Licht', tone: 'info', icon: Lightbulb },
  audio: { label: 'Audio', tone: 'info', icon: Volume2 },
  printer: { label: 'Drucker', tone: 'neutral', icon: Printer },
  computer: { label: 'Computer', tone: 'neutral', icon: MonitorIcon },
  mobile: { label: 'Handy/Tablet', tone: 'neutral', icon: Smartphone },
  router: { label: 'Router', tone: 'neutral', icon: Router },
  web: { label: 'Web-Gerät', tone: 'neutral', icon: Globe },
  unknown: { label: 'Unbekannt', tone: 'neutral', icon: HelpCircle }
}

// Reihenfolge der Typen im Auswahlmenü.
const TYPE_ORDER: NetDeviceType[] = [
  'novastar',
  'atem',
  'camera',
  'video',
  'projector',
  'lighting',
  'audio',
  'printer',
  'computer',
  'mobile',
  'router',
  'web',
  'unknown'
]

const ipToSortKey = (ip: string): number =>
  ip.split('.').reduce((n, o) => n * 256 + (Number(o) || 0), 0)

const PHASE_LABEL: Record<NetScanProgress['phase'], string> = {
  idle: 'bereit',
  sweep: 'suche Geräte …',
  resolve: 'ermittle Hersteller …',
  done: 'fertig'
}

export function NetScan(): JSX.Element {
  const navigate = useNavigate()
  const labels = useNetLabels((s) => s.labels)
  const setLabel = useNetLabels((s) => s.setLabel)
  const typeOverrides = useNetLabels((s) => s.types)
  const setType = useNetLabels((s) => s.setType)
  // Offenes Typ-Menü: an welchem Gerät + Bildschirmposition.
  const [typeMenu, setTypeMenu] = useState<{
    key: string
    detected: NetDeviceType
    x: number
    y: number
  } | null>(null)

  const [interfaces, setInterfaces] = useState<NetInterface[]>([])
  const [iface, setIface] = useState<string>('')
  const [progress, setProgress] = useState<NetScanProgress>({
    running: false,
    phase: 'idle',
    scanned: 0,
    total: 0,
    found: 0
  })
  const [devices, setDevices] = useState<NetDevice[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  // Geräte nach IP sammeln (Upserts vom main-Prozess), Liste daraus ableiten.
  const mapRef = useRef<Map<string, NetDevice>>(new Map())
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void api.netscan.interfaces().then((list) => {
      setInterfaces(list)
      setIface((cur) => cur || list[0]?.address || '')
    })
    const offProgress = api.netscan.onProgress(setProgress)
    const offDevice = api.netscan.onDevice((d) => {
      mapRef.current.set(d.ip, d)
      setDevices([...mapRef.current.values()].sort((a, b) => ipToSortKey(a.ip) - ipToSortKey(b.ip)))
    })
    return () => {
      offProgress()
      offDevice()
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  const selected = interfaces.find((i) => i.address === iface) ?? null

  async function startOrStop(): Promise<void> {
    if (progress.running) {
      setProgress(await api.netscan.stop())
      return
    }
    mapRef.current = new Map()
    setDevices([])
    setProgress(await api.netscan.start(iface))
  }

  function copyIp(ip: string): void {
    void navigator.clipboard?.writeText(ip).catch(() => {})
    setCopied(ip)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(null), 1200)
  }
  function openWeb(d: NetDevice): void {
    const https = d.ports.includes(443) || d.ports.includes(8443)
    const port = d.ports.includes(80)
      ? ''
      : d.ports.includes(8080)
        ? ':8080'
        : d.ports.includes(8000)
          ? ':8000'
          : d.ports.includes(8443)
            ? ':8443'
            : ''
    window.open(`${https && !d.ports.includes(80) ? 'https' : 'http'}://${d.ip}${port}`, '_blank')
  }
  function openInNovastar(ip: string): void {
    useHandoff.getState().setNovastarHost(ip)
    navigate('/tool/novastar')
  }
  function openInOsc(ip: string): void {
    useHandoff.getState().setNovastarHost(ip)
    navigate('/tool/osc-control')
  }

  const pct = progress.total > 0 ? progress.scanned / progress.total : 0

  return (
    <div className={toolPageClass('5xl')}>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Sucht Geräte im lokalen Netz per aktivem Scan (typische AV-Ports), erkennt den Hersteller
        über die MAC-Adresse und liest Bonjour/mDNS-Namen. Nur im eigenen Netzwerk verwenden.
      </div>

      {/* Steuerung */}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Netzwerk-Adapter</span>
            <select
              value={iface}
              onChange={(e) => setIface(e.target.value)}
              disabled={progress.running || interfaces.length === 0}
              className="block h-9 w-full min-w-0 rounded-md border border-border bg-input/40 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              {interfaces.length === 0 && <option value="">kein Adapter gefunden</option>}
              {interfaces.map((i) => (
                <option key={i.address} value={i.address}>
                  {i.label} · {i.address} · {i.hosts} Hosts
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => void startOrStop()}
            disabled={!iface}
            variant={progress.running ? 'outline' : 'default'}
          >
            {progress.running ? (
              <>
                <Ban className="size-4" /> Stopp
              </>
            ) : (
              <>
                <Search className="size-4" /> Scannen
              </>
            )}
          </Button>
        </div>

        {selected && (
          <p className="text-xs text-muted-foreground">
            Subnetz von {selected.address} / {selected.netmask} · {selected.hosts} Hosts
          </p>
        )}

        {(progress.running || progress.scanned > 0) && (
          <div className="space-y-1.5">
            <Progress
              value={pct}
              indeterminate={progress.running && progress.phase === 'resolve'}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {progress.running && <Wifi className="size-3.5 animate-pulse text-primary" />}
                {PHASE_LABEL[progress.phase]}
              </span>
              <span className="tabular-nums">
                {progress.scanned}/{progress.total} geprüft · {progress.found} gefunden
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Ergebnisse */}
      {devices.length === 0 ? (
        <Card className="flex h-32 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {progress.running ? 'Suche läuft …' : 'Noch keine Geräte. „Scannen" starten.'}
        </Card>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => {
            const key = deviceKey(d.mac, d.ip)
            const override = typeOverrides[key]
            const effType = override ?? d.type
            const meta = TYPE_META[effType]
            const hasWeb = d.ports.some((p) => WEB_PORTS.includes(p))
            const oui = d.mac ? d.mac.slice(0, 8) : null
            const openTypeMenu = (e: ReactMouseEvent<HTMLElement>): void => {
              const r = e.currentTarget.getBoundingClientRect()
              setTypeMenu({ key, detected: d.type, x: r.left, y: r.bottom + 4 })
            }
            return (
              <Card key={d.ip} className="flex items-center gap-3 p-3">
                {/* Typ-Symbol = Auswahlknopf; manuell gesetzt -> kleiner Marker. */}
                <button
                  type="button"
                  onClick={openTypeMenu}
                  title={`Typ: ${meta.label}${override ? ' (manuell)' : ''} – ändern`}
                  className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-primary transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  <meta.icon className="size-5" />
                  {override && (
                    <span
                      className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-card"
                      title="manuell festgelegt"
                    />
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={labels[key] ?? ''}
                      placeholder={d.hostname || 'Bezeichnung …'}
                      onChange={(e) => setLabel(key, e.target.value)}
                      className="h-7 w-44 text-sm"
                    />
                    <button
                      type="button"
                      onClick={openTypeMenu}
                      title="Typ ändern"
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                      <Badge tone={meta.tone} className="cursor-pointer hover:opacity-80">
                        {meta.label}
                        <ChevronDown className="size-3 opacity-70" />
                      </Badge>
                    </button>
                    {d.ports.map((p) => (
                      <Badge key={p} tone="neutral" title={`Port ${p}`}>
                        {PORT_LABEL[p] ?? p}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-mono text-foreground">{d.ip}</span>
                    {d.vendor ? (
                      <span>{d.vendor}</span>
                    ) : (
                      oui && <span className="font-mono">OUI {oui}</span>
                    )}
                    {d.hostname && <span className="truncate">{d.hostname}</span>}
                    {d.rttMs != null && <span className="tabular-nums">{d.rttMs} ms</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconBtn
                    title={copied === d.ip ? 'kopiert!' : 'IP kopieren'}
                    onClick={() => copyIp(d.ip)}
                    active={copied === d.ip}
                  >
                    <Copy className="size-4" />
                  </IconBtn>
                  <IconBtn
                    title="Web-Oberfläche öffnen"
                    onClick={() => openWeb(d)}
                    disabled={!hasWeb}
                  >
                    <ExternalLink className="size-4" />
                  </IconBtn>
                  <IconBtn
                    title="IP im NovaStar-Tool verwenden"
                    onClick={() => openInNovastar(d.ip)}
                  >
                    <MonitorCog className="size-4" />
                  </IconBtn>
                  <IconBtn
                    title="IP in der OSC-Steuerung verwenden"
                    onClick={() => openInOsc(d.ip)}
                  >
                    <Radio className="size-4" />
                  </IconBtn>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Wand2 className="size-3 shrink-0" />
        Tipp: Symbol oder Typ-Etikett anklicken, um den Gerätetyp – und damit das Symbol – manuell
        zu setzen (bleibt gespeichert). <MonitorCog className="inline size-3" /> übergibt die IP an
        die NovaStar-Steuerung.
      </p>

      {typeMenu && (
        <TypeMenu
          x={typeMenu.x}
          y={typeMenu.y}
          detected={typeMenu.detected}
          current={typeOverrides[typeMenu.key] ?? null}
          onPick={(t) => {
            setType(typeMenu.key, t)
            setTypeMenu(null)
          }}
          onClose={() => setTypeMenu(null)}
        />
      )}
    </div>
  )
}

/** Popover zur manuellen Wahl des Gerätetyps (setzt zugleich das Symbol).
 *  „Automatisch" verwirft die manuelle Wahl und nutzt wieder die Erkennung. */
function TypeMenu({
  x,
  y,
  detected,
  current,
  onPick,
  onClose
}: {
  x: number
  y: number
  detected: NetDeviceType
  current: NetDeviceType | null
  onPick: (t: NetDeviceType | null) => void
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onClose])
  const left = Math.max(8, Math.min(x, window.innerWidth - 236))
  const top = Math.max(8, Math.min(y, window.innerHeight - 430))
  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 50 }}
      className="max-h-[80vh] w-56 select-none overflow-auto rounded-lg border border-border bg-card p-1.5 shadow-xl"
    >
      <button
        type="button"
        onClick={() => onPick(null)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60',
          current === null && 'bg-primary/10 text-primary'
        )}
      >
        <Wand2 className="size-4 shrink-0" />
        <span className="flex-1">Automatisch</span>
        <span className="text-xs text-muted-foreground">{TYPE_META[detected].label}</span>
        {current === null && <Check className="size-3.5 shrink-0" />}
      </button>
      <div className="my-1 h-px bg-border" />
      {TYPE_ORDER.map((t) => {
        const m = TYPE_META[t]
        const sel = current === t
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60',
              sel && 'bg-primary/10 text-primary'
            )}
          >
            <m.icon className="size-4 shrink-0" />
            <span className="flex-1">{m.label}</span>
            {sel && <Check className="size-3.5 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

/** Kompakter Icon-Knopf für die Geräteaktionen. */
function IconBtn({
  title,
  onClick,
  disabled,
  active,
  children
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground',
        active && 'border-emerald-500 text-emerald-400 light:text-emerald-700'
      )}
    >
      {children}
    </button>
  )
}
