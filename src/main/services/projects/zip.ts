// Minimales ZIP für die Projektdatei – bewusst ohne Abhängigkeit (das Repo hält Laufzeit-Pakete
// klein). Schreiben: JSON komprimiert (Deflate), Fotos gespeichert (schon komprimiert), UTF-8-Namen,
// kein ZIP64. Lesen ist auf FREMDE Dateien ausgelegt (Kollegen, Mail): nur Methode 0/8, keine
// Verschlüsselung, Namen ohne „..“ und ohne absolute Pfade, harte Größen- und Anzahlgrenzen gegen
// ZIP-Bomben, CRC-Prüfung. Entpackt wird nur in den Speicher, nie auf die Platte.

import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntryIn {
  name: string
  data: Uint8Array
  /** Deflate versuchen (JSON); Fotos nicht – sie sind schon komprimiert */
  compress: boolean
}

export interface ZipLimits {
  entries: number
  entryBytes: number
  totalBytes: number
}

export class ZipError extends Error {}

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_END = 0x06054b50
const FLAG_UTF8 = 0x0800
const MAX16 = 0xffff
const MAX32 = 0xffffffff

let crcTable: Uint32Array | null = null

/** CRC-32 (IEEE), wie ZIP sie verlangt. Eigene Tabelle statt zlib.crc32 (erst ab Node 22.2). */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Datum/Uhrzeit im DOS-Format (nur zur Anzeige in Entpackprogrammen). */
function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, d.getFullYear()))
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

/** Erlaubte Namen: relative Pfade mit „/“, keine Teile „..“/„.“, kein Laufwerk, kein Backslash. */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.length > 255 || name.includes('\\') || name.startsWith('/')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name) || /^[a-zA-Z]:/.test(name)) return false
  return name.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

export function writeZip(entries: ZipEntryIn[], now = new Date()): Buffer {
  if (entries.length > MAX16) throw new ZipError('Zu viele Einträge')
  const { time, date } = dosTime(now)
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  const names = new Set<string>()
  let offset = 0
  for (const e of entries) {
    if (!isSafeEntryName(e.name) || names.has(e.name))
      throw new ZipError(`Ungültiger Name ${e.name}`)
    names.add(e.name)
    const raw = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength)
    if (raw.length > MAX32) throw new ZipError('Eintrag zu groß')
    const crc = crc32(raw)
    let method = 0
    let body = raw
    if (e.compress) {
      const packed = deflateRawSync(raw)
      if (packed.length < raw.length) {
        method = 8
        body = packed
      }
    }
    const name = Buffer.from(e.name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(SIG_LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(SIG_CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(FLAG_UTF8, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, name, body)
    centrals.push(central, name)
    offset += local.length + name.length + body.length
    if (offset > MAX32) throw new ZipError('Datei zu groß')
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(SIG_END, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

function findEnd(buf: Buffer): number {
  // EOCD steht am Ende, höchstens 65535 Byte Kommentar dahinter
  const min = Math.max(0, buf.length - 22 - MAX16)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_END) return i
  }
  throw new ZipError('Kein ZIP')
}

/**
 * Einträge lesen (alle oder nur die, die `want` annimmt). Wirft ZipError bei allem, was nicht
 * eindeutig sauber ist – die Datei gilt dann als beschädigt.
 */
export function readZip(
  buf: Buffer,
  limits: ZipLimits,
  want: (name: string) => boolean = () => true
): Map<string, Buffer> {
  if (buf.length < 22) throw new ZipError('Kein ZIP')
  const end = findEnd(buf)
  const count = buf.readUInt16LE(end + 10)
  const cdSize = buf.readUInt32LE(end + 12)
  const cdOffset = buf.readUInt32LE(end + 16)
  if (buf.readUInt16LE(end + 4) !== 0 || buf.readUInt16LE(end + 6) !== 0) {
    throw new ZipError('Mehrteilige ZIP-Archive werden nicht unterstützt')
  }
  if (count > limits.entries) throw new ZipError('Zu viele Einträge')
  if (cdOffset + cdSize > end) throw new ZipError('Verzeichnis außerhalb der Datei')
  const out = new Map<string, Buffer>()
  const seen = new Set<string>()
  let total = 0
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || buf.readUInt32LE(p) !== SIG_CENTRAL)
      throw new ZipError('Verzeichnis kaputt')
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const nameEnd = p + 46 + nameLen
    if (nameEnd > end) throw new ZipError('Verzeichnis kaputt')
    const name = buf.toString('utf8', p + 46, nameEnd)
    p = nameEnd + extraLen + commentLen
    if (name.endsWith('/')) continue // Ordner-Eintrag
    if (!isSafeEntryName(name)) throw new ZipError(`Unzulässiger Name ${name}`)
    if (seen.has(name)) throw new ZipError(`Doppelter Eintrag ${name}`)
    seen.add(name)
    if (flags & 0x1) throw new ZipError('Verschlüsselte Einträge werden nicht unterstützt')
    if (method !== 0 && method !== 8) throw new ZipError('Unbekannte Kompression')
    if (size === MAX32 || compSize === MAX32) throw new ZipError('ZIP64 wird nicht unterstützt')
    if (size > limits.entryBytes) throw new ZipError(`Eintrag zu groß: ${name}`)
    total += size
    if (total > limits.totalBytes) throw new ZipError('Inhalt zu groß')
    if (!want(name)) continue
    if (localOffset + 30 > cdOffset || buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new ZipError('Eintrag kaputt')
    }
    const start =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    if (start + compSize > cdOffset) throw new ZipError('Eintrag außerhalb der Datei')
    const body = buf.subarray(start, start + compSize)
    let data: Buffer
    if (method === 0) {
      if (compSize !== size) throw new ZipError('Größe passt nicht')
      data = Buffer.from(body)
    } else {
      try {
        data = inflateRawSync(body, { maxOutputLength: Math.max(1, size) })
      } catch {
        throw new ZipError(`Eintrag nicht lesbar: ${name}`)
      }
    }
    if (data.length !== size || crc32(data) !== crc) throw new ZipError(`Prüfsumme falsch: ${name}`)
    out.set(name, data)
  }
  return out
}
