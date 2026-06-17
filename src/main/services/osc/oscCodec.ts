// Minimaler, abhängigkeitsfreier OSC-Codec (Encoder + Decoder), passend zur
// OSC-1.0-Spezifikation: Strings sind null-terminiert und auf 4 Byte aufgefüllt,
// Zahlen big-endian. Reicht für MadMapper & Co. (float/int/string/bool) und
// versteht eingehende #bundle-Pakete.

import type { OscFeedback, OscMessage } from '@shared/types'

/** Nächste durch 4 teilbare Position (OSC richtet alles an 4-Byte-Grenzen aus). */
function align4(pos: number): number {
  return pos + ((4 - (pos % 4)) % 4)
}

/** OSC-String: UTF-8 + mindestens ein Nullbyte, auf 4 Byte aufgefüllt. */
function encodeString(s: string): Buffer {
  const raw = Buffer.from(s, 'utf-8')
  const nulls = 4 - (raw.length % 4) // 1..4 Nullbytes
  return Buffer.concat([raw, Buffer.alloc(nulls)])
}

export function encodeOsc(msg: OscMessage): Buffer {
  const address = msg.address.startsWith('/') ? msg.address : `/${msg.address}`
  const parts: Buffer[] = [encodeString(address)]
  let tags = ','
  const argBufs: Buffer[] = []
  for (const a of msg.args) {
    switch (a.type) {
      case 'i': {
        tags += 'i'
        const b = Buffer.alloc(4)
        b.writeInt32BE(a.value | 0, 0)
        argBufs.push(b)
        break
      }
      case 'f': {
        tags += 'f'
        const b = Buffer.alloc(4)
        b.writeFloatBE(Number.isFinite(a.value) ? a.value : 0, 0)
        argBufs.push(b)
        break
      }
      case 's': {
        tags += 's'
        argBufs.push(encodeString(a.value))
        break
      }
      case 'T':
        tags += 'T'
        break
      case 'F':
        tags += 'F'
        break
    }
  }
  parts.push(encodeString(tags), ...argBufs)
  return Buffer.concat(parts)
}

interface Reader {
  buf: Buffer
  pos: number
}

function readString(r: Reader): string {
  const start = r.pos
  let end = start
  while (end < r.buf.length && r.buf[end] !== 0) end++
  const s = r.buf.toString('utf-8', start, end)
  r.pos = align4(end + 1) // Nullbyte + Auffüllung überspringen
  return s
}

/** Dekodiert ein OSC-Paket (Message oder #bundle) zu flachen Feedback-Einträgen. */
export function decodeOsc(buf: Buffer): OscFeedback[] {
  const out: OscFeedback[] = []
  decodePacket(buf, 0, buf.length, out)
  return out
}

function decodePacket(buf: Buffer, start: number, end: number, out: OscFeedback[]): void {
  if (end - start < 4) return
  // '#bundle\0' -> Elemente (je int32-Länge + Inhalt), Zeitstempel ignorieren wir.
  if (buf[start] === 0x23 /* '#' */) {
    let pos = start + 16 // 8 Byte "#bundle\0" + 8 Byte Timetag
    while (pos + 4 <= end) {
      const size = buf.readInt32BE(pos)
      pos += 4
      if (size < 0 || pos + size > end) break
      decodePacket(buf, pos, pos + size, out)
      pos += size
    }
    return
  }

  const r: Reader = { buf, pos: start }
  try {
    const address = readString(r)
    if (!address.startsWith('/')) return
    const args: (number | string | boolean)[] = []
    if (r.pos < end && buf[r.pos] === 0x2c /* ',' */) {
      const tags = readString(r)
      for (let i = 1; i < tags.length && r.pos <= end; i++) {
        switch (tags[i]) {
          case 'i':
            args.push(buf.readInt32BE(r.pos))
            r.pos += 4
            break
          case 'f':
            args.push(buf.readFloatBE(r.pos))
            r.pos += 4
            break
          case 'd':
            args.push(buf.readDoubleBE(r.pos))
            r.pos += 8
            break
          case 'h':
            args.push(Number(buf.readBigInt64BE(r.pos)))
            r.pos += 8
            break
          case 's':
          case 'S':
            args.push(readString(r))
            break
          case 'T':
            args.push(true)
            break
          case 'F':
            args.push(false)
            break
          case 'b': {
            const len = buf.readInt32BE(r.pos)
            r.pos = align4(r.pos + 4 + Math.max(0, len))
            break
          }
          default:
            i = tags.length // unbekannter Typ -> Rest verwerfen
        }
      }
    }
    out.push({ address, args, at: Date.now() })
  } catch {
    // unvollständiges/ungültiges Paket ignorieren
  }
}
