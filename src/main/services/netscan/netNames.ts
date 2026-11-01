// Sprechende Namen der Netzwerk-Adapter: Das System meldet nur Kürzel wie „Ethernet 2“ oder „en0“,
// daran erkennt niemand das WLAN oder einen virtuellen Loopback-Adapter. Reine Anzeige, best effort:
// Fehlt ein Befehl oder ein Name, bleibt es beim Kürzel. Unter Windows dauert das Sekunden (Start
// von PowerShell), deshalb getrennt von listInterfaces, damit die Auswahl nicht darauf wartet.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { NetInterfaceNames } from '@shared/types'

const pexecFile = promisify(execFile)

const QUERY_TIMEOUT = 10000

// UTF-8 ausdrücklich: Sonst kommen Umlaute („… für KM-TEST“) in der OEM-Codepage an.
const WINDOWS_QUERY =
  '[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false; ' +
  '@{ adapters = @(Get-NetAdapter | Select-Object Name, InterfaceDescription); ' +
  'profiles = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | ' +
  'Select-Object InterfaceAlias, Name) } | ConvertTo-Json -Compress'

// Windows nennt Netze ohne Router „Nicht identifiziertes Netzwerk“ (je nach Sprache anders, der
// Wortstamm bleibt). Als Name taugt das nicht: So hieße jedes Kabelnetz; dort hilft der Adapter.
const UNIDENTIFIED = /identif/i

interface WindowsQueryResult {
  adapters?: { Name?: string; InterfaceDescription?: string }[]
  profiles?: { InterfaceAlias?: string; Name?: string }[]
}

/** Parst die JSON-Ausgabe von WINDOWS_QUERY. Exportiert für Tests. */
export function parseWindowsNames(text: string): NetInterfaceNames {
  const data = JSON.parse(text) as WindowsQueryResult
  const out: NetInterfaceNames = {}
  for (const a of data.adapters ?? []) {
    if (a.Name) out[a.Name] = { adapter: a.InterfaceDescription || null, network: null }
  }
  for (const p of data.profiles ?? []) {
    if (!p.InterfaceAlias || !p.Name || UNIDENTIFIED.test(p.Name)) continue
    out[p.InterfaceAlias] = { adapter: out[p.InterfaceAlias]?.adapter ?? null, network: p.Name }
  }
  return out
}

/** Parst `networksetup -listallhardwareports` (macOS): Blöcke aus „Hardware Port“ und „Device“.
 *  Exportiert für Tests. */
export function parseMacPorts(text: string): NetInterfaceNames {
  const out: NetInterfaceNames = {}
  let port: string | null = null
  for (const line of text.split('\n')) {
    const m = /^(Hardware Port|Device): (.+)$/.exec(line.trim())
    if (!m) continue
    if (m[1] === 'Hardware Port') port = m[2]
    else if (port) out[m[2]] = { adapter: port, network: null }
  }
  return out
}

/** Parst `nmcli -t -f DEVICE,NAME connection show --active` (Linux): „Gerät:Name“, ein Doppelpunkt
 *  im Namen ist mit Backslash geschützt. Exportiert für Tests. */
export function parseNmcli(text: string): NetInterfaceNames {
  const out: NetInterfaceNames = {}
  for (const line of text.split('\n')) {
    const i = line.indexOf(':')
    if (i < 1) continue
    const network = line
      .slice(i + 1)
      .replace(/\\(.)/g, '$1')
      .trim()
    if (network) out[line.slice(0, i)] = { adapter: null, network }
  }
  return out
}

async function query(): Promise<NetInterfaceNames> {
  const opts = { windowsHide: true, timeout: QUERY_TIMEOUT }
  if (process.platform === 'win32') {
    const args = ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY]
    return parseWindowsNames((await pexecFile('powershell.exe', args, opts)).stdout)
  }
  if (process.platform === 'darwin') {
    const args = ['-listallhardwareports']
    return parseMacPorts((await pexecFile('networksetup', args, opts)).stdout)
  }
  const args = ['-t', '-f', 'DEVICE,NAME', 'connection', 'show', '--active']
  return parseNmcli((await pexecFile('nmcli', args, opts)).stdout)
}

/** Namen je Adapter (Schlüssel: NetInterface.label). Wirft nie, im Zweifel leer. */
export function readInterfaceNames(): Promise<NetInterfaceNames> {
  return query().catch(() => ({}))
}
