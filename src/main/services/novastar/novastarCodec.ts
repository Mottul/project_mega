// NovaStar „Central Control Protocol" (V1.5.0) – Paket-Codec für den NovaPro UHD
// Jr & Co. Bytes exakt nach der offiziellen Protokoll-Doku (TCP-Port 5200).
//
// Paket: [Header 55 AA][Inhalt][Checksum].
// Inhalt = fester 12-Byte-Präfix + Register (4 B, little-endian) + Datenlänge
//          (2 B, LE) + Daten. Checksum = (Summe ALLER Bytes ab Offset 2) + 0x5555,
//          als 2 Byte little-endian angehängt.
// Beispiel Helligkeit 0 %: 55 aa 00 00 fe ff 01 ff ff ff 01 00 01 00 00 02 01 00 00 55 5a

export const PORT = 5200

/** Fester Präfix (Offsets 0x00–0x0b) für alle Display-/Preset-/Output-Befehle. */
const PREFIX = Buffer.from([0x55, 0xaa, 0x00, 0x00, 0xfe, 0xff, 0x01, 0xff, 0xff, 0xff, 0x01, 0x00])

/** Hängt die NovaStar-Prüfsumme an (Summe ab Offset 2 + 0x5555, little-endian). */
export function withChecksum(packet: number[] | Buffer): Buffer {
  const buf = Buffer.isBuffer(packet) ? packet : Buffer.from(packet)
  let sum = 0
  for (let i = 2; i < buf.length; i++) sum += buf[i]
  sum = (sum + 0x5555) & 0xffff
  const out = Buffer.alloc(buf.length + 2)
  buf.copy(out, 0)
  out.writeUInt16LE(sum, buf.length)
  return out
}

/** Register-Schreibbefehl: Präfix + Register (LE) + Datenlänge (LE) + Daten + Checksum. */
export function regWrite(regAddr: number, data: number[]): Buffer {
  const buf = Buffer.alloc(PREFIX.length + 4 + 2 + data.length)
  PREFIX.copy(buf, 0)
  buf.writeUInt32LE(regAddr >>> 0, PREFIX.length) // 0x0c–0x0f
  buf.writeUInt16LE(data.length, PREFIX.length + 4) // 0x10–0x11
  if (data.length) Buffer.from(data).copy(buf, PREFIX.length + 6) // 0x12…
  return withChecksum(buf)
}

// Register-Werte als UInt32LE -> exakte Wire-Bytes der Doku. Hinweis: Die Doku
// beschriftet Black/Freeze als 0x0200100x, die TATSÄCHLICHEN Bytes (00 01 00 02 /
// 02 01 00 02) ergeben aber 0x02000100 / 0x02000102 – maßgeblich sind die Bytes
// (deren Prüfsumme im Doku-Beispiel stimmt). Per Unit-Test gegen die Doku gesichert.
export const REG = {
  brightness: 0x02000001, // Bild-Helligkeit (1 Byte 0..255) -> Bytes 01 00 00 02
  blackScreen: 0x02000100, // Empfangskarte schwarz: ff = schwarz, 00 = normal -> 00 01 00 02
  freeze: 0x02000102, // ff = einfrieren, 00 = auftauen -> 02 01 00 02
  preset: 0x0a000002 // 1 Byte = Preset-Nummer (1..26) -> 02 00 00 0a
} as const

/** Helligkeit in Prozent (0..100) -> Register-Byte (0..255). */
export function brightnessPacket(pct: number): Buffer {
  const v = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 255)
  return regWrite(REG.brightness, [v])
}

/** Empfangskarten schwarz (echter Blackout) bzw. zurück auf Normalbild. */
export function blackoutPacket(on: boolean): Buffer {
  return regWrite(REG.blackScreen, [on ? 0xff : 0x00])
}

/** Bild einfrieren / auftauen. */
export function freezePacket(on: boolean): Buffer {
  return regWrite(REG.freeze, [on ? 0xff : 0x00])
}

/** Preset/Szene 1..26 abrufen. */
export function presetPacket(n: number): Buffer {
  return regWrite(REG.preset, [Math.max(1, Math.min(255, Math.round(n)))])
}

/** Hex-String ("55aa.." / "55 AA ..") -> Byte-Array. Ungültig/ungerade -> null. */
export function parseHex(hex: string): number[] | null {
  const clean = hex.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0) return null
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16))
  return out
}
