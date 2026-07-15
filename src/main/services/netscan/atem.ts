// Best-effort-Erkennung eines Blackmagic ATEM (Video-Mischer). ATEM spricht
// UDP 9910, nicht TCP – der TCP-Sweep sieht es nicht. Wir senden den bekannten
// „Hello"-Handshake und werten JEDE Antwort vom Ziel als „ist ein ATEM".

import { createSocket } from 'node:dgram'

const ATEM_PORT = 9910

// Init-/Hello-Paket, wie es ATEM-Clients zum Verbindungsaufbau senden.
const HELLO = Buffer.from([
  0x10, 0x14, 0x53, 0xab, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3a, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00
])

/** Antwortet unter `ip` ein ATEM auf UDP 9910? */
export function probeAtem(ip: string, timeoutMs = 700): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const sock = createSocket('udp4')
    const finish = (v: boolean): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        sock.close()
      } catch {
        /* egal */
      }
      resolve(v)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    sock.on('message', (_msg, rinfo) => {
      if (rinfo.address === ip) finish(true)
    })
    sock.on('error', () => finish(false))
    try {
      sock.send(HELLO, ATEM_PORT, ip)
    } catch {
      finish(false)
    }
  })
}
