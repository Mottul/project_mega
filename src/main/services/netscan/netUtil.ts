// Hilfen für den Netzwerk-Scanner: Interface-Liste, IP-Arithmetik, MAC-
// Normalisierung. Abhängigkeitsfrei (nur node:os).

import { networkInterfaces } from 'node:os'
import type { NetInterface } from '@shared/types'

// Deckel, damit ein großes Subnetz (z.B. /16) nicht 65k Hosts abtastet.
export const MAX_HOSTS = 1024

/** "192.168.0.1" -> 32-Bit-Zahl (unsigned). Ungültig -> -1. */
export function ipToInt(ip: string): number {
  const p = ip.split('.')
  if (p.length !== 4) return -1
  let n = 0
  for (const part of p) {
    const b = Number(part)
    if (!Number.isInteger(b) || b < 0 || b > 255 || part.trim() === '') return -1
    n = (n << 8) | b
  }
  return n >>> 0
}

/** 32-Bit-Zahl -> "192.168.0.1". */
export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** MAC beliebiger Schreibweise -> "aa:bb:cc:dd:ee:ff" (klein). Ungültig oder
 *  komplett null (unvollständiger ARP-Eintrag) -> null. */
export function normalizeMac(mac: string): string | null {
  const parts = mac.trim().toLowerCase().split(/[:-]/)
  if (parts.length !== 6) return null
  const out = parts.map((p) => (p.length === 1 ? '0' + p : p))
  if (out.some((p) => !/^[0-9a-f]{2}$/.test(p))) return null
  if (out.every((p) => p === '00')) return null
  return out.join(':')
}

/** Scannbare lokale IPv4-Interfaces (nicht intern, mit Adresse + Maske). */
export function listInterfaces(): NetInterface[] {
  const out: NetInterface[] = []
  const ifs = networkInterfaces()
  for (const [name, addrs] of Object.entries(ifs)) {
    for (const a of addrs ?? []) {
      // family kann je nach Node 'IPv4' oder 4 sein.
      const fam = String(a.family)
      if ((fam !== 'IPv4' && fam !== '4') || a.internal) continue
      const range = hostRange(a.address, a.netmask)
      if (!range) continue
      out.push({
        address: a.address,
        netmask: a.netmask,
        mac: a.mac,
        label: name,
        hosts: range.count
      })
    }
  }
  return out
}

/** Nutzbarer Host-Bereich (erste..letzte Adresse ohne Netz/Broadcast) aus IP +
 *  Maske. Zu große Netze werden auf das /24 der lokalen IP eingegrenzt. */
export function hostRange(
  address: string,
  netmask: string
): { start: number; end: number; count: number } | null {
  const ip = ipToInt(address)
  const mask = ipToInt(netmask)
  if (ip < 0 || mask < 0) return null
  let net = (ip & mask) >>> 0
  let bcast = (net | (~mask >>> 0)) >>> 0
  let count = bcast - net - 1
  if (count < 1) return { start: ip, end: ip, count: 1 } // /31, /32
  if (count > MAX_HOSTS) {
    net = (ip & 0xffffff00) >>> 0 // auf /24 eingrenzen
    bcast = (net | 0xff) >>> 0
    count = 254
  }
  return { start: (net + 1) >>> 0, end: (bcast - 1) >>> 0, count }
}

/** Alle Host-IPs eines Bereichs als Strings. */
export function rangeIps(start: number, end: number): string[] {
  const out: string[] = []
  for (let n = start; n <= end; n++) out.push(intToIp(n >>> 0))
  return out
}
