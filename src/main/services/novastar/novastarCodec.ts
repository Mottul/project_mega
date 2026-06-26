// NovaStar „Central Control Protocol" – Paketrahmen für den NovaPro UHD Jr (& Co).
//
// GESICHERT (aus dem offenen Bitfocus-Companion-Modul novastar-controller):
//   * Transport: TCP, Port 5200.
//   * Paket: Header 0x55 0xAA, danach Kommando + optionale Nutzdaten, am Ende eine
//     2-Byte-Prüfsumme = (Summe ALLER Bytes ab Offset 2) + 0x5555, little-endian.
//
// BEST-EFFORT (am echten Gerät zu bestätigen): die genauen Kommando-Bytes für
// „Helligkeit setzen". Sie sind hier bewusst über das Register parametrierbar,
// und das Tool bietet zusätzlich einen Roh-Befehl-Sender, um exakte Frames aus
// der NovaStar-Doku / einem NovaLCT-Mitschnitt zu verifizieren, ohne Code-Änderung.

export const PORT = 5200

/** Hängt die NovaStar-Prüfsumme an ein Paket an (Header bereits enthalten). */
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

/** Standard-Register für die Bild-Helligkeit (0x02000001 – aus dem NovaStar-
 *  Register-Protokoll; am Gerät bestätigen, sonst im UI anpassen). */
export const BRIGHTNESS_REG = 0x02000001

/** Best-effort Helligkeits-Frame: schreibt 1 Byte (0..255) ins Helligkeits-
 *  Register. Struktur aus dem Companion-Modul abgeleitet (Schreib-Flag + Register
 *  + 1 Byte Daten). pct = 0..100. */
export function brightnessPacket(regAddr: number, pct: number): Buffer {
  const clamped = Math.max(0, Math.min(100, pct))
  const val = Math.round((clamped / 100) * 255)
  const cmd = Buffer.alloc(18)
  cmd[0] = 0x55
  cmd[1] = 0xaa
  cmd[6] = 0x01 // Gerätetyp (Empfangskarte)
  cmd[10] = 0x01 // 1 = schreiben (0 = lesen)
  cmd.writeUInt32LE(regAddr >>> 0, 12) // Zielregister (Default 0x02000001)
  cmd.writeUInt16LE(1, 16) // Datenlänge = 1 Byte
  return withChecksum(Buffer.concat([cmd, Buffer.from([val])]))
}

/** Hex-String ("55aa..." oder "55 AA ..") -> Byte-Array. Ungültige Zeichen
 *  werden ignoriert; ungerade Länge -> null. */
export function parseHex(hex: string): number[] | null {
  const clean = hex.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0) return null
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16))
  return out
}
