// TCP-Verbindung zum NovaStar-Prozessor (NovaPro UHD Jr & Co), Port 5200.
// Dependency-frei (nur node:net). Ein einzelner Client; Frames kommen fertig
// gerahmt (inkl. Prüfsumme) aus novastarCodec.

import { Socket } from 'node:net'
import type { NovastarStatus } from '@shared/types'
import { logLine } from '../log'
import { PORT } from './novastarCodec'

let sock: Socket | null = null
let connected = false
let host = ''
let port = PORT
let lastError: string | null = null
let statusSink: (s: NovastarStatus) => void = () => {}

export function setNovastarStatusSink(fn: (s: NovastarStatus) => void): void {
  statusSink = fn
}

export function getNovastarStatus(): NovastarStatus {
  return { connected, host, port, lastError }
}
function emit(): void {
  statusSink(getNovastarStatus())
}

export function novastarDisconnect(): NovastarStatus {
  if (sock) {
    sock.removeAllListeners()
    sock.destroy()
    sock = null
  }
  connected = false
  emit()
  return getNovastarStatus()
}

export function novastarConnect(h: string, p: number): Promise<NovastarStatus> {
  novastarDisconnect()
  host = h.trim()
  port = Math.max(1, Math.min(65535, Math.round(p) || PORT))
  lastError = null
  return new Promise((resolve) => {
    const s = new Socket()
    let done = false
    const finish = (): void => {
      if (!done) {
        done = true
        resolve(getNovastarStatus())
      }
    }
    s.setTimeout(5000)
    s.on('connect', () => {
      s.setTimeout(0)
      connected = true
      lastError = null
      logLine('[novastar] verbunden mit', `${host}:${port}`)
      emit()
      finish()
    })
    s.on('timeout', () => {
      lastError = 'Zeitüberschreitung beim Verbinden'
      s.destroy()
    })
    s.on('error', (e) => {
      lastError = e.message
      logLine('[novastar] Fehler:', e.message)
    })
    s.on('close', () => {
      if (sock === s) {
        sock = null
        connected = false
        emit()
      }
      finish()
    })
    sock = s
    s.connect(port, host)
  })
}

/** Ein fertig gerahmtes Paket senden (wenn verbunden). */
export function novastarSend(buf: Buffer): void {
  if (sock && connected && sock.writable) sock.write(buf)
}
