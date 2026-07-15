// Orchestriert den Netzwerk-Scan: TCP-Sweep über das Subnetz + ATEM-UDP-Probe,
// danach ARP (Hersteller) auflösen; parallel läuft mDNS zur Anreicherung.
// Geräte werden per Upsert (nach IP) live an den Renderer gemeldet. Ein neuer
// Scan (oder Stop) bricht den laufenden über einen Token ab.

import { Socket } from 'node:net'
import type { NetDevice, NetScanProgress } from '@shared/types'
import { logLine } from '../log'
import { readArpTable } from './arp'
import { probeAtem } from './atem'
import { browseMdns, type MdnsInfo } from './mdns'
import { hostRange, ipToInt, listInterfaces, rangeIps } from './netUtil'
import { vendorFor } from './oui'
import { classify, PROBE_PORTS } from './ports'

const SWEEP_CONCURRENCY = 64
const TCP_TIMEOUT = 600
const MDNS_TAIL_MS = 1500 // mDNS nach dem Sweep noch nachlaufen lassen

let token = 0
let devices = new Map<string, NetDevice>()
let atemIps = new Set<string>()
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

export function getNetscanProgress(): NetScanProgress {
  return progress
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
  timeoutMs: number
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
      s.connect(port, ip)
    } catch {
      fin('timeout')
    }
  })
}

async function probeHost(
  ip: string
): Promise<{ alive: boolean; ports: number[]; rtt: number | null; atem: boolean }> {
  const ports: number[] = []
  let alive = false
  let rtt: number | null = null
  const [, atem] = await Promise.all([
    Promise.all(
      PROBE_PORTS.map(async (port) => {
        const r = await tcpProbe(ip, port, TCP_TIMEOUT)
        if (r.state === 'open') {
          ports.push(port)
          alive = true
          if (rtt == null || r.ms < rtt) rtt = r.ms
        } else if (r.state === 'refused') {
          alive = true
        }
      })
    ),
    probeAtem(ip)
  ])
  if (atem) alive = true
  ports.sort((a, b) => a - b)
  return { alive, ports, rtt, atem }
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
  const n = ipToInt(ip)
  if (n < scanFirst || n > scanLast) return // nur unser Subnetz
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
  scanFirst = ipToInt(ips[0])
  scanLast = ipToInt(ips[ips.length - 1])
  progress = { running: true, phase: 'sweep', scanned: 0, total: ips.length, found: 0 }
  emitProgress(true)
  logLine('[netscan] Start', iface.address, `(${ips.length} Hosts)`)

  mdnsStop = browseMdns((ip, info) => {
    if (myToken === token) applyMdns(ip, info)
  })

  await pool(
    ips,
    async (ip) => {
      if (myToken !== token) return
      const res = await probeHost(ip)
      if (myToken !== token) return
      progress.scanned++
      if (res.alive) {
        if (res.atem) atemIps.add(ip)
        const isNew = !devices.has(ip)
        const d = devices.get(ip) ?? newDevice(ip)
        d.ports = res.ports
        d.rttMs = res.rtt
        d.seenAt = Date.now()
        reclassify(d)
        upsert(d, isNew)
      }
      emitProgress()
    },
    SWEEP_CONCURRENCY
  )
  if (myToken !== token) return progress

  // ARP: MAC/Hersteller ergänzen (auch für Hosts, die nur auf ARP reagieren).
  progress.phase = 'resolve'
  emitProgress(true)
  const arp = await readArpTable().catch(() => new Map<string, string>())
  if (myToken !== token) return progress
  for (const [ip, mac] of arp) {
    const n = ipToInt(ip)
    if (n < scanFirst || n > scanLast) continue
    const isNew = !devices.has(ip)
    const d = devices.get(ip) ?? newDevice(ip)
    d.mac = mac
    d.vendor = vendorFor(mac)
    d.seenAt = Date.now()
    reclassify(d)
    upsert(d, isNew)
  }

  await sleep(MDNS_TAIL_MS)
  if (myToken !== token) return progress
  stopMdns()
  progress = { ...progress, running: false, phase: 'done', found: devices.size }
  emitProgress(true)
  logLine('[netscan] Fertig', `(${devices.size} Geräte)`)
  return progress
}
