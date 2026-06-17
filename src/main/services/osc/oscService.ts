// OSC-Dienst im main-Prozess: ein UDP-Socket (node:dgram) sendet OSC an
// host:outPort, ein zweiter lauscht – wenn aktiviert – auf inPort und reicht
// eingehende Pakete als Feedback an alle Fenster weiter. Konfiguration lebt in
// den App-Settings (AppSettings.osc), damit Host/Ports persistent sind.

import dgram from 'node:dgram'
import { Channels } from '@shared/ipc-contracts'
import { DEFAULT_OSC_SETTINGS, type OscMessage, type OscSettings, type OscStatus } from '@shared/types'
import { broadcast } from '../broadcast'
import { logLine } from '../log'
import { getSettings, setSettings } from '../store'
import { decodeOsc, encodeOsc } from './oscCodec'

let sendSock: dgram.Socket | null = null
let recvSock: dgram.Socket | null = null
let listening = false
let lastError: string | null = null
let sentCount = 0
let recvCount = 0

function cfg(): OscSettings {
  return getSettings().osc ?? DEFAULT_OSC_SETTINGS
}

export function oscStatus(): OscStatus {
  const c = cfg()
  return {
    host: c.host,
    outPort: c.outPort,
    inPort: c.inPort,
    listening,
    lastError,
    sentCount,
    recvCount
  }
}

function emitStatus(): void {
  broadcast(Channels.oscStatusChanged, oscStatus())
}

function ensureSendSocket(): dgram.Socket {
  if (!sendSock) {
    const sock = dgram.createSocket('udp4')
    sock.on('error', (err) => {
      lastError = err.message
      logLine('[osc] Sendefehler:', err.message)
      emitStatus()
    })
    sendSock = sock
  }
  return sendSock
}

export function oscSend(msg: OscMessage): void {
  if (!msg || typeof msg.address !== 'string') return
  const c = cfg()
  const sock = ensureSendSocket()
  let data: Buffer
  try {
    data = encodeOsc(msg)
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    emitStatus()
    return
  }
  sock.send(data, c.outPort, c.host, (err) => {
    if (err) {
      lastError = err.message
      logLine('[osc] send ->', `${c.host}:${c.outPort}`, 'fehlgeschlagen:', err.message)
      emitStatus()
    } else {
      sentCount++
      if (lastError) {
        lastError = null
        emitStatus()
      }
      // Erfolgreiche Sends NICHT broadcasten (Fader feuern viele pro Sekunde);
      // der Renderer protokolliert ausgehende Nachrichten selbst.
    }
  })
}

function stopRecv(): void {
  if (recvSock) {
    try {
      recvSock.close()
    } catch {
      // bereits geschlossen
    }
    recvSock = null
  }
  listening = false
}

function startRecv(): void {
  stopRecv()
  const c = cfg()
  if (!c.feedbackEnabled) return
  const sock = dgram.createSocket('udp4')
  sock.on('error', (err) => {
    lastError = err.message
    logLine('[osc] Feedback-Fehler:', err.message)
    listening = false
    recvSock = null
    try {
      sock.close()
    } catch {
      // egal
    }
    emitStatus()
  })
  sock.on('message', (data) => {
    recvCount++
    for (const fb of decodeOsc(data)) broadcast(Channels.oscFeedback, fb)
  })
  sock.bind(c.inPort, () => {
    listening = true
    lastError = null
    logLine('[osc] Feedback lauscht auf Port', c.inPort)
    emitStatus()
  })
  recvSock = sock
}

export function oscSetConfig(patch: Partial<OscSettings>): OscStatus {
  const next = { ...cfg(), ...patch }
  setSettings({ osc: next })
  // Feedback-Socket nur bei relevanter Änderung neu binden.
  if (patch.inPort !== undefined || patch.feedbackEnabled !== undefined) startRecv()
  emitStatus()
  return oscStatus()
}

/** Beim App-Start aufrufen: startet den Feedback-Listener, falls aktiviert. */
export function initOsc(): void {
  startRecv()
}

export function disposeOsc(): void {
  stopRecv()
  if (sendSock) {
    try {
      sendSock.close()
    } catch {
      // egal
    }
    sendSock = null
  }
}
