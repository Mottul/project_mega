// System-ARP-Tabelle lesen (IP -> MAC), plattformübergreifend, best effort.
// Abhängigkeitsfrei (node:child_process / node:fs).

import { exec } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { normalizeMac } from './netUtil'

const IP_RE = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/
const MAC_RE = /\b([0-9a-f]{1,2}(?:[:-][0-9a-f]{1,2}){5})\b/i

/** Parst beliebige `arp -a`-Ausgaben (Linux/macOS/Windows): je Zeile IP + MAC
 *  heraussuchen und paaren. Exportiert für Tests. */
export function parseArpOutput(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const ipm = IP_RE.exec(line)
    const macm = MAC_RE.exec(line)
    if (!ipm || !macm) continue
    const mac = normalizeMac(macm[1])
    if (mac) map.set(ipm[1], mac)
  }
  return map
}

/** Parst /proc/net/arp (Linux): Spalten IP, HW-Typ, Flags, MAC, Maske, Gerät. */
export function parseProcNetArp(text: string): Map<string, string> {
  const map = new Map<string, string>()
  const lines = text.split('\n').slice(1) // Kopfzeile überspringen
  for (const line of lines) {
    const c = line.trim().split(/\s+/)
    if (c.length < 4) continue
    const ip = c[0]
    const mac = normalizeMac(c[3])
    if (mac && IP_RE.test(ip)) map.set(ip, mac)
  }
  return map
}

function execText(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, timeout: 6000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

/** IP -> MAC der aktuellen ARP-Tabelle. Auf Linux zuerst /proc/net/arp
 *  (zuverlässig, ohne net-tools), sonst `arp -a`. */
export async function readArpTable(): Promise<Map<string, string>> {
  if (process.platform === 'linux') {
    try {
      const txt = await readFile('/proc/net/arp', 'utf8')
      const map = parseProcNetArp(txt)
      if (map.size) return map
    } catch {
      /* Fallback auf arp -a */
    }
  }
  const cmd = process.platform === 'win32' ? 'arp -a' : 'arp -a -n'
  const out = await execText(cmd).catch(() => '')
  return parseArpOutput(out)
}
