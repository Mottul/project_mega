import { describe, expect, it } from 'vitest'
import { fittedSize, imageKind, jpegOrientation, orientBitmap } from './fotoImage'

/** Minimales JPEG: SOI, optional JFIF, APP1 mit EXIF-Ausrichtung, dann SOS */
function jpeg(orientation: number | null, opts: { le?: boolean; jfif?: boolean } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]
  if (opts.jfif) parts.push(Buffer.from([0xff, 0xe0, 0x00, 0x05, 0x4a, 0x46, 0x49]))
  if (orientation !== null) {
    const le = opts.le ?? false
    const tiff = Buffer.alloc(8 + 2 + 12 + 4)
    tiff.write(le ? 'II' : 'MM', 0, 'latin1')
    if (le) {
      tiff.writeUInt16LE(42, 2)
      tiff.writeUInt32LE(8, 4)
      tiff.writeUInt16LE(1, 8)
      tiff.writeUInt16LE(0x0112, 10)
      tiff.writeUInt16LE(3, 12)
      tiff.writeUInt32LE(1, 14)
      tiff.writeUInt16LE(orientation, 18)
    } else {
      tiff.writeUInt16BE(42, 2)
      tiff.writeUInt32BE(8, 4)
      tiff.writeUInt16BE(1, 8)
      tiff.writeUInt16BE(0x0112, 10)
      tiff.writeUInt16BE(3, 12)
      tiff.writeUInt32BE(1, 14)
      tiff.writeUInt16BE(orientation, 18)
    }
    const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
    const len = Buffer.alloc(2)
    len.writeUInt16BE(payload.length + 2)
    parts.push(Buffer.from([0xff, 0xe1]), len, payload)
  }
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00]))
  return Buffer.concat(parts)
}

describe('imageKind', () => {
  it('erkennt JPEG und PNG an den ersten Bytes, sonst nichts', () => {
    expect(imageKind(jpeg(null))).toBe('jpg')
    expect(imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png')
    expect(imageKind(Buffer.from('GIF89a'))).toBeNull()
    expect(imageKind(Buffer.from([0xff, 0xd8]))).toBeNull()
  })
})

describe('fittedSize', () => {
  it('verkleinert auf die längste Seite, vergrößert nie', () => {
    expect(fittedSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fittedSize(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
    expect(fittedSize(800, 600, 2000)).toEqual({ width: 800, height: 600 })
    expect(fittedSize(10000, 1, 2000)).toEqual({ width: 2000, height: 1 })
  })
})

describe('jpegOrientation', () => {
  it('liest die Ausrichtung in beiden Byte-Reihenfolgen, auch hinter JFIF', () => {
    for (let o = 1; o <= 8; o++) expect(jpegOrientation(jpeg(o))).toBe(o)
    expect(jpegOrientation(jpeg(6, { le: true }))).toBe(6)
    expect(jpegOrientation(jpeg(8, { jfif: true }))).toBe(8)
  })

  it('ohne EXIF, mit unsinnigem Wert oder abgeschnitten: 1', () => {
    expect(jpegOrientation(jpeg(null))).toBe(1)
    expect(jpegOrientation(jpeg(9))).toBe(1)
    const cut = jpeg(6)
    expect(jpegOrientation(cut.subarray(0, 20))).toBe(1)
    // Segmentlänge zeigt hinter das Dateiende
    const bad = Buffer.from(cut)
    bad.writeUInt16BE(0xfff0, 4)
    expect(jpegOrientation(bad)).toBe(1)
  })
})

describe('orientBitmap', () => {
  // 3 × 2 Pixel, jedes trägt seine Nummer: a b c / d e f
  const [a, b, c, d, e, f] = [1, 2, 3, 4, 5, 6]
  const src = new Uint8Array(new Uint32Array([a, b, c, d, e, f]).buffer)
  const px = (r: { data: Uint8Array; width: number; height: number }): number[] =>
    Array.from(new Uint32Array(r.data.buffer, r.data.byteOffset, r.width * r.height))

  it('dreht und spiegelt wie die EXIF-Werte 1–8', () => {
    expect(px(orientBitmap(src, 3, 2, 1))).toEqual([a, b, c, d, e, f])
    expect(px(orientBitmap(src, 3, 2, 2))).toEqual([c, b, a, f, e, d])
    expect(px(orientBitmap(src, 3, 2, 3))).toEqual([f, e, d, c, b, a])
    expect(px(orientBitmap(src, 3, 2, 4))).toEqual([d, e, f, a, b, c])
    expect(px(orientBitmap(src, 3, 2, 5))).toEqual([a, d, b, e, c, f])
    expect(px(orientBitmap(src, 3, 2, 6))).toEqual([d, a, e, b, f, c])
    expect(px(orientBitmap(src, 3, 2, 7))).toEqual([f, c, e, b, d, a])
    expect(px(orientBitmap(src, 3, 2, 8))).toEqual([c, f, b, e, a, d])
  })

  it('tauscht bei 5–8 Breite und Höhe', () => {
    const r = orientBitmap(src, 3, 2, 6)
    expect([r.width, r.height]).toEqual([2, 3])
    expect([orientBitmap(src, 3, 2, 3).width, orientBitmap(src, 3, 2, 3).height]).toEqual([3, 2])
  })

  it('kommt mit einer ungeraden Lage im Speicher zurecht', () => {
    const shifted = new Uint8Array(src.length + 1)
    shifted.set(src, 1)
    expect(px(orientBitmap(shifted.subarray(1), 3, 2, 6))).toEqual([d, a, e, b, f, c])
  })
})
