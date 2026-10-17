// Reine Bild-Helfer fürs Einfügen von Fotos (ohne Electron, getestet): Format an den ersten Bytes
// erkennen, Zielgröße rechnen, EXIF-Ausrichtung lesen und anwenden.
//
// Warum selbst drehen: Electrons nativeImage ignoriert die EXIF-Ausrichtung (gemessen mit
// Electron 44) – ein hochkant gehaltenes Handyfoto käme quer an. Beim Neukodieren fallen alle
// Metadaten weg, auch GPS-Koordinaten des Aufbauorts.

export type FotoKind = 'jpg' | 'png'

export function imageKind(buf: Uint8Array): FotoKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length >= 8 && png.every((b, i) => buf[i] === b)) return 'png'
  return null
}

/** Größe, in die ein Bild passt (längste Seite höchstens `max`), nie vergrößert */
export function fittedSize(w: number, h: number, max: number): { width: number; height: number } {
  const s = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

/**
 * EXIF-Ausrichtung (1–8) eines JPEG; 1, wenn keine oder eine kaputte Angabe da ist. Liest nur die
 * Segmente vor den Bilddaten und prüft jede Länge – die Datei kommt von außen.
 */
export function jpegOrientation(buf: Uint8Array): number {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let p = 2
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) return 1
    const marker = buf[p + 1]
    if (marker === 0xda || marker === 0xd9) return 1 // Bilddaten bzw. Ende: kein EXIF davor
    const len = dv.getUint16(p + 2)
    if (len < 2 || p + 2 + len > buf.length) return 1
    if (marker === 0xe1) {
      const o = exifOrientation(dv, p + 4, len - 2)
      if (o) return o
    }
    p += 2 + len
  }
  return 1
}

function exifOrientation(dv: DataView, start: number, size: number): number | null {
  // „Exif\0\0“, dann der TIFF-Kopf
  if (size < 14) return null
  const sig = [0x45, 0x78, 0x69, 0x66, 0, 0]
  if (!sig.every((b, i) => dv.getUint8(start + i) === b)) return null
  const tiff = start + 6
  const end = start + size
  const order = dv.getUint16(tiff)
  if (order !== 0x4949 && order !== 0x4d4d) return null
  const le = order === 0x4949
  if (dv.getUint16(tiff + 2, le) !== 42) return null
  const ifd = tiff + dv.getUint32(tiff + 4, le)
  if (ifd + 2 > end) return null
  const count = dv.getUint16(ifd, le)
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12
    if (e + 12 > end) return null
    if (dv.getUint16(e, le) !== 0x0112) continue
    const v = dv.getUint16(e + 8, le) // Typ SHORT: Wert steht vorne im Feld
    return v >= 1 && v <= 8 ? v : null
  }
  return null
}

/**
 * Bitmap (4 Bytes je Pixel) so umordnen, dass sie aufrecht steht. Ausrichtung nach EXIF:
 * 2 gespiegelt, 3 um 180°, 4 senkrecht gespiegelt, 5 transponiert, 6 um 90° im Uhrzeigersinn
 * zu drehen, 7 quer transponiert, 8 um 90° gegen den Uhrzeigersinn zu drehen.
 */
export function orientBitmap(
  src: Uint8Array,
  w: number,
  h: number,
  orientation: number
): { data: Uint8Array; width: number; height: number } {
  if (orientation < 2 || orientation > 8) return { data: src, width: w, height: h }
  const swap = orientation >= 5
  const W = swap ? h : w
  const H = swap ? w : h
  const out = new Uint8Array(W * H * 4)
  // Uint32-Sicht braucht eine durch 4 teilbare Lage im Speicher – sonst erst kopieren
  const aligned = src.byteOffset % 4 ? new Uint8Array(src) : src
  const s32 = new Uint32Array(aligned.buffer, aligned.byteOffset, w * h)
  const o32 = new Uint32Array(out.buffer)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Quellpixel (sx, sy) für das Zielpixel (x, y)
      let sx: number
      let sy: number
      switch (orientation) {
        case 2:
          sx = w - 1 - x
          sy = y
          break
        case 3:
          sx = w - 1 - x
          sy = h - 1 - y
          break
        case 4:
          sx = x
          sy = h - 1 - y
          break
        case 5:
          sx = y
          sy = x
          break
        case 6:
          sx = y
          sy = h - 1 - x
          break
        case 7:
          sx = w - 1 - y
          sy = h - 1 - x
          break
        default: // 8
          sx = w - 1 - y
          sy = x
      }
      o32[y * W + x] = s32[sy * w + sx]
    }
  }
  return { data: out, width: W, height: H }
}
