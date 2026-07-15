// NovaStar-Steuerung (NovaPro UHD Jr & Co.), TCP-Port 5200 – Paket-Codec.
//
// Die Byte-Sequenzen für Anzeigemodus (Freeze/Black) und Preset stammen aus dem
// quelloffenen, praxiserprobten Bitfocus-Companion-Modul
// (companion-module-novastar-controller, Modell „NovaPro UHD Jr"). Die Frames
// der offiziellen „Central Control Protocol"-Doku V1.5.0 werden von diesem Gerät
// NICHT angenommen – nur die Helligkeit stimmte zufällig überein. Alle Prüfsummen
// sind gegen die Companion-Frames verifiziert (Unit-Test).
//
// Rahmen: [12-Byte-Header][Register 4 B LE][Datenlänge 2 B LE][Daten][Prüfsumme 2 B LE].
// Prüfsumme = (Summe aller Bytes ab Offset 2 + 0x5555) & 0xffff, little-endian.
//
// Header-Bytes 4..9 = Adressierung, unterscheidet die Befehlsklassen:
//  - Helligkeit geht an ALLE Empfangskarten (Broadcast: fe ff 01 ff ff ff)
//  - Anzeigemodus + Preset gehen an die Steuer-/Hauptkarte (fe 00 00 00 00 00)
// Byte 3 ist die Seriennummer (vom Gerät nur zurückgespiegelt) -> fest 0.

export const PORT = 5200

// 12-Byte-Header: [55 aa][00 = Command][00 = Seriennummer][Adressierung 6 B].
const HDR_CARDS = [0x55, 0xaa, 0x00, 0x00, 0xfe, 0xff, 0x01, 0xff, 0xff, 0xff, 0x01, 0x00]
const HDR_MAIN = [0x55, 0xaa, 0x00, 0x00, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]

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

/** Register-Schreibbefehl: Header + Register (LE) + Datenlänge (LE) + Daten + Checksum. */
function frame(header: number[], regAddr: number, data: number[]): Buffer {
  const buf = Buffer.alloc(header.length + 4 + 2 + data.length)
  Buffer.from(header).copy(buf, 0)
  buf.writeUInt32LE(regAddr >>> 0, header.length) // 0x0c–0x0f
  buf.writeUInt16LE(data.length, header.length + 4) // 0x10–0x11
  if (data.length) Buffer.from(data).copy(buf, header.length + 6) // 0x12…
  return withChecksum(buf)
}

// Register-Werte als UInt32LE -> exakte Wire-Bytes des Companion-Moduls.
export const REG = {
  brightness: 0x02000001, // Helligkeit (1 B 0..255), an alle Empfangskarten -> 01 00 00 02
  displayMode: 0x13000004, // Anzeigemodus (2 B: modus, 00), an die Steuerkarte -> 04 00 00 13
  preset: 0x13510100 // Preset abrufen (1 B 0-indiziert), an die Steuerkarte -> 00 01 51 13
} as const

/** Anzeigemodi der Steuerkarte -- sich GEGENSEITIG AUSSCHLIESSEND (ein Zustand,
 *  nicht zwei Toggles): Blackout und Freeze sind nur Werte desselben Registers. */
export const DISPLAY_MODE = { normal: 0x03, freeze: 0x04, black: 0x05 } as const

/** Helligkeit in Prozent (0..100) -> Register-Byte (0..255). */
export function brightnessPacket(pct: number): Buffer {
  const v = Math.round((Math.max(0, Math.min(100, pct)) / 100) * 255)
  return frame(HDR_CARDS, REG.brightness, [v])
}

function displayModePacket(mode: number): Buffer {
  return frame(HDR_MAIN, REG.displayMode, [mode, 0x00])
}

/** Blackout: Bild schwarz (Black-Modus) bzw. zurück auf Normal. Da Freeze/Black
 *  EIN Anzeigemodus sind, heißt „Blackout AUS" = Normal (nicht etwa Freeze). */
export function blackoutPacket(on: boolean): Buffer {
  return displayModePacket(on ? DISPLAY_MODE.black : DISPLAY_MODE.normal)
}

/** Freeze: Bild einfrieren bzw. zurück auf Normal. */
export function freezePacket(on: boolean): Buffer {
  return displayModePacket(on ? DISPLAY_MODE.freeze : DISPLAY_MODE.normal)
}

/** Preset/Szene 1..N abrufen. Das Protokoll ist 0-indiziert -> Nummer − 1. */
export function presetPacket(n: number): Buffer {
  const idx = Math.max(0, Math.min(255, Math.round(n) - 1))
  return frame(HDR_MAIN, REG.preset, [idx])
}

/** Hex-String ("55aa.." / "55 AA ..") -> Byte-Array. Ungültig/ungerade -> null. */
export function parseHex(hex: string): number[] | null {
  const clean = hex.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '')
  if (clean.length === 0 || clean.length % 2 !== 0) return null
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16))
  return out
}
