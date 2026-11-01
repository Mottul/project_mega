// Orchestriert den Netzwerk-Scan: TCP-Sweep über das Subnetz + ATEM-UDP-Probe,
// danach ARP (Hersteller) auflösen; parallel läuft mDNS zur Anreicherung.
// Geräte werden per Upsert (nach IP) live an den Renderer gemeldet. Ein neuer
// Scan (oder Stop) bricht den laufenden über einen Token ab.
//
// Alles läuft über den gewählten Adapter: Liegen zwei im selben Netz (Link-Local 169.254.x.x, etwa
// Kabel zum Mischer + Loopback-Adapter), entschiede sonst die Route, welcher antwortet. Ein großes
// Netz wird nur um die eigene Adresse abgetastet (hostRange) – was ARP oder mDNS jenseits davon im
// selben Netz melden, gehört trotzdem dazu und wird gezielt nachgeprüft (probeExtra).

import { Socket } from 'node:net'
import type { NetDevice, NetScanProgress } from '@shared/types'
import { logLine } from '../log'
import { readArpTable } from './arp'
import { probeAtem } from './atem'
import { browseMdns, type MdnsInfo } from './mdns'
import { hostRange, inSubnet, ipToInt, listInterfaces, rangeIps } from './netUtil'
import { vendorFor } from './oui'
import { classify, PROBE_PORTS } from './ports'

const SWEEP_CONCURRENCY = 64
const TCP_TIMEOUT = 600
const MDNS_TAIL_MS = 1500 // mDNS nach dem Sweep noch nachlaufen lassen

let token = 0
let devices = new Map<string, NetDevice>()
let atemIps = new Set<string>()
let extraProbes = new Map<string, Promise<void>>()
let scanFirst = 0
let scanLast = -1
let progress: NetScanProgress = { running: false, phase: 'idle', scanned: 0, total: 0, found: 0 }
let progressSink: (p: NetScanProgress) => void = () => {}
let deviceSink: (d: NetDevice) => void = () => {}
let mdnsStop: (() => void) | null = null
let lastProgressEmit = 0

export function setNetscanSinks(
  onProgress: (p: NetScanProgress) => void,
  onDevice: (d: NetDevice) => void
): void {
  progressSink = onProgress
  deviceSink = onDevice
}

function emitProgress(force = false): void {
  const now = Date.now()
  if (!force && now - lastProgressEmit < 120) return
  lastProgressEmit = now
  progressSink(progress)
}

function stopMdns(): void {
  if (mdnsStop) {
    mdnsStop()
    mdnsStop = null
  }
}

export function stopScan(): NetScanProgress {
  token++ // laufende Worker/Callbacks brechen ab
  stopMdns()
  if (progress.running) {
    progress = { ...progress, running: false, phase: 'done' }
    emitProgress(true)
  }
  return progress
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function newDevice(ip: string): NetDevice {
  return {
    ip,
    mac: null,
    vendor: null,
    hostname: null,
    type: 'unknown',
    ports: [],
    services: [],
    rttMs: null,
    seenAt: Date.now()
  }
}

function reclassify(d: NetDevice): void {
  d.type = classify({
    ports: d.ports,
    vendor: d.vendor,
    services: d.services,
    atem: atemIps.has(d.ip)
  })
}

/** Ein Gerät aktualisieren/anlegen und an den Renderer melden. */
function upsert(d: NetDevice, isNew: boolean): void {
  devices.set(d.ip, d)
  progress.found = devices.size
  deviceSink(d)
  void isNew
}

/** Einzelnen Port anklopfen: offen / abgelehnt (Host existiert) / keine Antwort. */
function tcpProbe(
  ip: string,
  port: number,
  timeoutMs: number,
  localAddress: string
): Promise<{ state: 'open' | 'refused' | 'timeout'; ms: number }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const s = new Socket()
    let done = false
    const fin = (state: 'open' | 'refused' | 'timeout'): void => {
      if (done) return
      done = true
      s.destroy()
      resolve({ state, ms: Date.now() - start })
    }
    s.setTimeout(timeoutMs)
    s.once('connect', () => fin('open'))
    s.once('timeout', () => fin('timeout'))
    s.once('error', (e: NodeJS.ErrnoException) =>
      fin(e.code === 'ECONNREFUSED' ? 'refused' : 'timeout')
    )
    try {
      s.connect({ port, host: ip, localAddress })
    } catch {
      fin('timeout')
    }
  })
}

interface HostProbe {
  alive: boolean
  ports: number[]
  rtt: number | null
  atem: boolean
}

async function probeHost(ip: string, localAddress: string): Promise<HostProbe> {
  const ports: number[] = []
  let alive = false
  let rtt: number | null = null
  const [, atem] = await Promise.all([
    Promise.all(
      PROBE_PORTS.map(async (port) => {
        const r = await tcpProbe(ip, port, TCP_TIMEOUT, localAddress)
        if (r.state === 'open') {
          ports.push(port)
          alive = true
          if (rtt == null || r.ms < rtt) rtt = r.ms
        } else if (r.state === 'refused') {
          alive = true
        }
      })
    ),
    probeAtem(ip, localAddress)
  ])
  if (atem) alive = true
  ports.sort((a, b) => a - b)
  return { alive, ports, rtt, atem }
}

/** Ergebnis der Abtastung ins Gerät übernehmen. */
function applyProbe(ip: string, res: HostProbe): void {
  if (res.atem) atemIps.add(ip)
  const isNew = !devices.has(ip)
  const d = devices.get(ip) ?? newDevice(ip)
  d.ports = res.ports
  d.rttMs = res.rtt
  d.seenAt = Date.now()
  reclassify(d)
  upsert(d, isNew)
}

/** Adresse aus ARP/mDNS abtasten, wenn der Sweep sie nicht erfasst hat (je Adresse einmal). */
function probeExtra(ip: string, localAddress: string, myToken: number): Promise<void> {
  const n = ipToInt(ip)
  if (myToken !== token || (n >= scanFirst && n <= scanLast)) return Promise.resolve()
  const known = extraProbes.get(ip)
  if (known) return known
  const job = probeHost(ip, localAddress).then((res) => {
    if (myToken === token && res.alive) applyProbe(ip, res)
  })
  extraProbes.set(ip, job)
  return job
}

async function pool<T>(items: T[], worker: (t: T) => Promise<void>, limit: number): Promise<void> {
  let i = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await worker(items[i++])
  })
  await Promise.all(runners)
}

/** mDNS-Treffer (Hostname/Dienste) in ein Gerät einpflegen. */
function applyMdns(ip: string, info: MdnsInfo): void {
  const isNew = !devices.has(ip)
  const d = devices.get(ip) ?? newDevice(ip)
  let changed = isNew
  if (info.hostname && d.hostname !== info.hostname) {
    d.hostname = info.hostname
    changed = true
  }
  for (const svc of info.services) {
    if (!d.services.some((s) => s.type === svc.type && s.port === svc.port)) {
      d.services.push(svc)
      changed = true
    }
  }
  if (!changed) return
  d.seenAt = Date.now()
  reclassify(d)
  upsert(d, isNew)
}

export async function startScan(interfaceAddress: string): Promise<NetScanProgress> {
  stopScan()
  const myToken = ++token
  const iface = listInterfaces().find((i) => i.address === interfaceAddress) ?? listInterfaces()[0]
  const range = iface ? hostRange(iface.address, iface.netmask) : null
  if (!iface || !range) {
    progress = { running: false, phase: 'done', scanned: 0, total: 0, found: 0 }
    emitProgress(true)
    return progress
  }

  const ips = rangeIps(range.start, range.end)
  devices = new Map()
  atemIps = new Set()
  extraProbes = new Map()
  scanFirst = ipToInt(ips[0])
  scanLast = ipToInt(ips[ips.length - 1])
  progress = { running: true, phase: 'sweep', scanned: 0, total: ips.length, found: 0 }
  emitProgress(true)
  logLine('[netscan] Start', iface.address, `(${ips.length} Hosts)`)

  const inNet = (ip: string): boolean => inSubnet(ip, iface.address, iface.netmask)

  mdnsStop = browseMdns(iface.address, (ip, info) => {
    if (myToken !== token || !inNet(ip)) return
    applyMdns(ip, info)
    void probeExtra(ip, iface.address, myToken)
  })

  await pool(
    ips,
    async (ip) => {
      if (myToken !== token) return
      const res = await probeHost(ip, iface.address)
      if (myToken !== token) return
      progress.scanned++
      if (res.alive) applyProbe(ip, res)
      emitProgress()
    },
    SWEEP_CONCURRENCY
  )
  if (myToken !== token) return progress

  // ARP: MAC/Hersteller ergänzen (auch für Hosts, die nur auf ARP reagieren).
  progress.phase = 'resolve'
  emitProgress(true)
  const arp = await readArpTable(iface.address).catch(() => new Map<string, string>())
  if (myToken !== token) return progress
  for (const [ip, mac] of arp) {
    if (!inNet(ip)) continue
    const isNew = !devices.has(ip)
    const d = devices.get(ip) ?? newDevice(ip)
    d.mac = mac
    d.vendor = vendorFor(mac)
    d.seenAt = Date.now()
    reclassify(d)
    upsert(d, isNew)
  }
  const arpIps = [...arp.keys()].filter(inNet)
  await pool(arpIps, (ip) => probeExtra(ip, iface.address, myToken), SWEEP_CONCURRENCY)
  if (myToken !== token) return progress

  await sleep(MDNS_TAIL_MS)
  if (myToken !== token) return progress
  stopMdns()
  await Promise.all(extraProbes.values())
  if (myToken !== token) return progress
  progress = { ...progress, running: false, phase: 'done', found: devices.size }
  emitProgress(true)
  logLine('[netscan] Fertig', `(${devices.size} Geräte)`)
  return progress
}
