import { describe, expect, it } from 'vitest'
import {
  blackoutPacket,
  brightnessPacket,
  freezePacket,
  parseHex,
  presetPacket,
  withChecksum
} from './novastarCodec'

const hex = (b: Buffer): string => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')

// Erwartungswerte = die exakten Frames des praxiserprobten Bitfocus-Companion-
// Moduls (companion-module-novastar-controller, Modell „NovaPro UHD Jr").
// Einziger Unterschied: Byte 3 (Seriennummer) ist hier fest 0 statt der von
// Companion aufgezeichneten Werte -- das Gerät spiegelt die Seriennummer nur
// zurück, sie ist inhaltlich egal (Prüfsummen entsprechend neu berechnet).
describe('NovaStar-Codec – Frames nach Companion-Modul (NovaPro UHD Jr)', () => {
  it('Helligkeit 0 % / 100 % (an alle Empfangskarten)', () => {
    expect(hex(brightnessPacket(0))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 01 00 00 02 01 00 00 55 5a'
    )
    expect(hex(brightnessPacket(100))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 01 00 00 02 01 00 ff 54 5b'
    )
  })

  // Anzeigemodus (Steuerkarte): Normal=03, Freeze=04, Black=05. Companion-Frames
  // (mit Byte 3 = 0) und ihre Prüfsummen: Normal 70 56, Freeze 71 56, Black 72 56.
  it('Blackout an = Black-Modus, aus = Normal', () => {
    expect(hex(blackoutPacket(true))).toBe(
      '55 aa 00 00 fe 00 00 00 00 00 01 00 04 00 00 13 02 00 05 00 72 56'
    )
    expect(hex(blackoutPacket(false))).toBe(
      '55 aa 00 00 fe 00 00 00 00 00 01 00 04 00 00 13 02 00 03 00 70 56'
    )
  })
  it('Freeze an = Freeze-Modus, aus = Normal', () => {
    expect(hex(freezePacket(true))).toBe(
      '55 aa 00 00 fe 00 00 00 00 00 01 00 04 00 00 13 02 00 04 00 71 56'
    )
    expect(hex(freezePacket(false))).toBe(
      '55 aa 00 00 fe 00 00 00 00 00 01 00 04 00 00 13 02 00 03 00 70 56'
    )
  })

  // Preset (Steuerkarte, 0-indiziert): Preset 1 -> Datenbyte 00, Preset 2 -> 01 …
  it('Preset 1 / 2 / 3 (0-indiziert)', () => {
    expect(hex(presetPacket(1))).toBe(
      '55 aa 00 00 fe 00 00 00 00 00 01 00 00 01 51 13 01 00 00 ba 56'
    )
    expect(hex(presetPacket(2))).toBe(
      '55 aa 00 00 fe 00 00 00 00 00 01 00 00 01 51 13 01 00 01 bb 56'
    )
    expect(hex(presetPacket(3))).toBe(
      '55 aa 00 00 fe 00 00 00 00 00 01 00 00 01 51 13 01 00 02 bc 56'
    )
  })

  it('withChecksum reproduziert ein bekanntes Frame', () => {
    const content = parseHex('55 aa 00 00 fe ff 01 ff ff ff 01 00 f2 ff 08 00 01 00 00')
    expect(content).not.toBeNull()
    expect(hex(withChecksum(content!))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 f2 ff 08 00 01 00 00 4b 5c'
    )
  })
  it('parseHex toleriert Trennzeichen/0x und lehnt Ungerades ab', () => {
    expect(parseHex('55 AA 00')).toEqual([0x55, 0xaa, 0x00])
    expect(parseHex('0x55aa')).toEqual([0x55, 0xaa])
    expect(parseHex('abc')).toBeNull()
    expect(parseHex('')).toBeNull()
  })
})
