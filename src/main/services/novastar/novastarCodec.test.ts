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

// Erwartungswerte sind die WÖRTLICHEN Beispiel-Frames aus der NovaStar
// „Central Control Protocol"-Doku V1.5.0 (inkl. Prüfsumme) – damit ist der
// Codec gegen das offizielle Protokoll fixiert.
describe('NovaStar-Codec – Bytes exakt nach Protokoll-Doku V1.5.0', () => {
  it('Helligkeit 0 %', () => {
    expect(hex(brightnessPacket(0))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 01 00 00 02 01 00 00 55 5a'
    )
  })
  it('Helligkeit 100 % -> Datenbyte ff', () => {
    expect(hex(brightnessPacket(100))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 01 00 00 02 01 00 ff 54 5b'
    )
  })
  it('Blackout an (schwarz) / aus (normal)', () => {
    expect(hex(blackoutPacket(true))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 00 01 00 02 01 00 ff 54 5b'
    )
    expect(hex(blackoutPacket(false))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 00 01 00 02 01 00 00 55 5a'
    )
  })
  it('Freeze an / aus', () => {
    expect(hex(freezePacket(true))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 02 01 00 02 01 00 ff 56 5b'
    )
    expect(hex(freezePacket(false))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 02 01 00 02 01 00 00 57 5a'
    )
  })
  it('Preset 1 und 2', () => {
    expect(hex(presetPacket(1))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 02 00 00 0a 01 00 01 5f 5a'
    )
    expect(hex(presetPacket(2))).toBe(
      '55 aa 00 00 fe ff 01 ff ff ff 01 00 02 00 00 0a 01 00 02 60 5a'
    )
  })
  it('withChecksum reproduziert das Doku-Beispiel (Send-Only-Modus)', () => {
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
