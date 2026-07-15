// Minimaler, abhängigkeitsfreier Bonjour/mDNS-Browser (DNS-SD). Fragt gängige
// Diensttypen per Multicast ab und wertet A-/PTR-/SRV-Antworten aus, um je IP
// einen Hostnamen und die angebotenen Dienste zu ermitteln. Reine Anreicherung:
// alles ist defensiv gekapselt und darf den restlichen Scan nie stören.

import { createSocket } from 'node:dgram'
import type { NetService } from '@shared/types'

const MDNS_ADDR = '224.0.0.251'
const MDNS_PORT = 5353

// Abgefragte Diensttypen (PTR). Deckt Kameras, AirPlay/Cast, Drucker, Web ab.
const SERVICE_TYPES = [
  '_services._dns-sd._udp.local',
  '_http._tcp.local',
  '_https._tcp.local',
  '_rtsp._tcp.local',
  '_workstation._tcp.local',
  '_ssh._tcp.local',
  '_googlecast._tcp.local',
  '_airplay._tcp.local',
  '_raop._tcp.local',
  '_ipp._tcp.local',
  '_printer._tcp.local',
  '_axis-video._tcp.local',
  '_pdl-datastream._tcp.local'
]

type MdnsData =
  | { kind: 'a'; ip: string }
  | { kind: 'ptr'; ptr: string }
  | { kind: 'srv'; target: string; port: number }
  | { kind: 'other' }

export interface MdnsRecord {
  name: string
  type: number
  data: MdnsData
}

/** DNS-Namen ab `off` lesen (mit 0xC0-Kompression). Liefert [name, nextOffset]. */
function readName(buf: Buffer, off: number): [string, number] {
  const labels: string[] = []
  let pos = off
  let next = -1
  let jumped = false
  let guard = 0
  while (guard++ < 128) {
    if (pos < 0 || pos >= buf.length) break
    const len = buf[pos]
    if (len === 0) {
      if (!jumped) next = pos + 1
      break
    }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= buf.length) break
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1]
      if (!jumped) next = pos + 2
      jumped = true
      pos = ptr
      continue
    }
    const start = pos + 1
    const end = start + len
    if (end > buf.length) break
    labels.push(buf.toString('utf8', start, end))
    pos = end
  }
  if (next < 0) next = pos + 1
  return [labels.join('.'), next]
}

/** Eine DNS/mDNS-Nachricht in Resource Records zerlegen (nur A/PTR/SRV genau,
 *  Rest als 'other'). Exportiert für Tests. */
export function parseMdnsMessage(buf: Buffer): MdnsRecord[] {
  const records: MdnsRecord[] = []
  if (buf.length < 12) return records
  const qd = buf.readUInt16BE(4)
  const total = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10)
  let off = 12
  for (let i = 0; i < qd; i++) {
    const [, next] = readName(buf, off)
    off = next + 4 // QTYPE + QCLASS
    if (off > buf.length) return records
  }
  for (let i = 0; i < total; i++) {
    if (off + 10 > buf.length) break
    const [name, afterName] = readName(buf, off)
    let p = afterName
    const type = buf.readUInt16BE(p)
    p += 8 // TYPE(2) + CLASS(2) + TTL(4)
    const rdlen = buf.readUInt16BE(p)
    p += 2
    const rdStart = p
    if (rdStart + rdlen > buf.length) break
    let data: MdnsData = { kind: 'other' }
    if (type === 1 && rdlen === 4) {
      data = {
        kind: 'a',
        ip: `${buf[rdStart]}.${buf[rdStart + 1]}.${buf[rdStart + 2]}.${buf[rdStart + 3]}`
      }
    } else if (type === 12) {
      const [ptr] = readName(buf, rdStart)
      data = { kind: 'ptr', ptr }
    } else if (type === 33) {
      const port = buf.readUInt16BE(rdStart + 4)
      const [target] = readName(buf, rdStart + 6)
      data = { kind: 'srv', target, port }
    }
    records.push({ name, type, data })
    off = rdStart + rdlen
  }
  return records
}

const stripLocal = (n: string): string => n.replace(/\.?local\.?$/i, '').replace(/\.$/, '')
const firstLabel = (n: string): string => n.split('.')[0] || n

export interface MdnsInfo {
  hostname?: string
  services: NetService[]
}

/** Eine PTR-Anfrage für `name` an die mDNS-Gruppe senden. */
function sendQuery(sock: ReturnType<typeof createSocket>, name: string): void {
  const parts = name.split('.')
  const bufs: Buffer[] = [Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])] // header, 1 Frage
  for (const part of parts) {
    const b = Buffer.from(part, 'utf8')
    bufs.push(Buffer.from([b.length]), b)
  }
  bufs.push(Buffer.from([0, 0, 12, 0, 1])) // root, QTYPE=PTR(12), QCLASS=IN(1)
  try {
    sock.send(Buffer.concat(bufs), MDNS_PORT, MDNS_ADDR)
  } catch {
    /* Senden best effort */
  }
}

/** Startet einen mDNS-Browse. `onUpdate(ip, info)` wird für Hostnamen und
 *  Dienste aufgerufen (mehrfach möglich). Liefert eine Stopp-Funktion. */
export function browseMdns(onUpdate: (ip: string, info: MdnsInfo) => void): () => void {
  const aByName = new Map<string, string>() // Name -> IP (A-Record)
  const srvByInstance = new Map<string, { target: string; port: number }>()
  const ptrs: { service: string; instance: string }[] = []
  const sentHost = new Set<string>()

  const recompute = (): void => {
    for (const [name, ip] of aByName) {
      const host = stripLocal(name)
      const key = ip + '|' + host
      if (host && !sentHost.has(key)) {
        sentHost.add(key)
        onUpdate(ip, { hostname: host, services: [] })
      }
    }
    for (const { service, instance } of ptrs) {
      const srv = srvByInstance.get(instance)
      if (!srv) continue
      const ip = aByName.get(srv.target)
      if (!ip) continue
      onUpdate(ip, {
        services: [{ type: stripLocal(service), name: firstLabel(instance), port: srv.port }]
      })
    }
  }

  let s: ReturnType<typeof createSocket>
  try {
    s = createSocket({ type: 'udp4', reuseAddr: true })
  } catch {
    return () => {}
  }
  s.on('message', (msg) => {
    try {
      for (const r of parseMdnsMessage(msg)) {
        if (r.data.kind === 'a') aByName.set(r.name, r.data.ip)
        else if (r.data.kind === 'srv')
          srvByInstance.set(r.name, { target: r.data.target, port: r.data.port })
        else if (r.data.kind === 'ptr') ptrs.push({ service: r.name, instance: r.data.ptr })
      }
      recompute()
    } catch {
      /* mDNS darf den Scan nie stören */
    }
  })
  s.on('error', () => {
    try {
      s.close()
    } catch {
      /* egal */
    }
  })
  try {
    s.bind(MDNS_PORT, () => {
      try {
        s.addMembership(MDNS_ADDR)
        s.setMulticastTTL(255)
      } catch {
        /* ohne Multicast-Beitritt gibt es eben keine mDNS-Treffer */
      }
      for (const t of SERVICE_TYPES) sendQuery(s, t)
    })
  } catch {
    /* Bind fehlgeschlagen (Port belegt) -> mDNS still deaktiviert */
  }
  return () => {
    try {
      s.close()
    } catch {
      /* egal */
    }
  }
}
