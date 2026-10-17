// Fotos der Projektdateien – im main, unter ihrem sha256 in userData/Projektfotos (ein Ordner für
// alle Dateien: gleiche Fotos liegen nur einmal da, und ein Werkzeug ohne gebundene Datei behält
// seine Fotos auch über einen Neustart). Werkzeuge kennen nur den Hash; angezeigt wird über das
// Protokoll foto:// (registerFotoProtocol), in die Projektdatei kommt das Foto beim Speichern.
//
// Einfügen: JPG/PNG, auf FOTO_MAX_SIDE verkleinert, nach EXIF aufgerichtet und neu kodiert – so
// fallen auch Metadaten wie GPS-Koordinaten weg. Was aus einer Projektdatei kommt, wird nur
// übernommen, wenn der Inhalt zu seinem Hash passt.

import { app, nativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { FOTO_MAX_SIDE, isFotoHash } from '@shared/fotos'
import type { FotoImport } from '@shared/types'
import { writeNewFileAsync } from '../fsAtomic'
import { logLine } from '../log'
import { fittedSize, imageKind, jpegOrientation, orientBitmap, type FotoKind } from './fotoImage'

/** größte Bilddatei, die eingefügt wird (Handyfotos haben 3–15 MB) */
const MAX_INPUT_BYTES = 40 * 1024 * 1024
const JPEG_QUALITY = 85

async function fotoDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'Projektfotos')
  await mkdir(dir, { recursive: true })
  return dir
}

export const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

const exists = (p: string): Promise<boolean> =>
  stat(p).then(
    (s) => s.isFile(),
    () => false
  )

/** Pfad und Art eines gespeicherten Fotos oder null */
export async function findFoto(hash: string): Promise<{ path: string; ext: FotoKind } | null> {
  if (!isFotoHash(hash)) return null
  const dir = await fotoDir()
  for (const ext of ['jpg', 'png'] as const) {
    const path = join(dir, `${hash}.${ext}`)
    if (await exists(path)) return { path, ext }
  }
  return null
}

/** Foto ablegen (falls noch nicht da). `hash` muss zum Inhalt passen – sonst nichts. */
export async function storeFoto(hash: string, ext: FotoKind, data: Uint8Array): Promise<boolean> {
  if (!isFotoHash(hash)) return false
  if (await findFoto(hash)) return true // schon da: nicht jedes Öffnen alles neu hashen
  if (sha256(data) !== hash) return false
  try {
    await writeNewFileAsync(join(await fotoDir(), `${hash}.${ext}`), data)
  } catch (err) {
    // gleichzeitig von zwei Seiten abgelegt: dasselbe Foto, also gut
    if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') throw err
  }
  return true
}

/** Bilddatei des Nutzers einfügen: prüfen, verkleinern, aufrichten, neu kodieren, ablegen. */
export async function importFotoFile(path: string): Promise<FotoImport> {
  const name = path.split(/[\\/]/).pop() ?? path
  try {
    const st = await stat(path)
    if (!st.isFile()) return { ok: false, name, reason: 'format' }
    if (st.size > MAX_INPUT_BYTES) return { ok: false, name, reason: 'zu-gross' }
    const buf = await readFile(path)
    const kind = imageKind(buf)
    if (!kind) return { ok: false, name, reason: 'format' }
    let img = nativeImage.createFromBuffer(buf)
    if (img.isEmpty()) return { ok: false, name, reason: 'kaputt' }

    const size = img.getSize()
    const fit = fittedSize(size.width, size.height, FOTO_MAX_SIDE)
    if (fit.width !== size.width || fit.height !== size.height) {
      img = img.resize({ ...fit, quality: 'best' })
    }
    const orientation = kind === 'jpg' ? jpegOrientation(buf) : 1
    if (orientation !== 1) {
      const s = img.getSize()
      const r = orientBitmap(img.toBitmap(), s.width, s.height, orientation)
      const bitmap = Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength)
      img = nativeImage.createFromBitmap(bitmap, {
        width: r.width,
        height: r.height
      })
    }
    // PNG bleibt PNG (Bildschirmfotos, Skizzen: Schrift bleibt scharf), sonst JPEG
    const data = kind === 'png' ? img.toPNG() : img.toJPEG(JPEG_QUALITY)
    const hash = sha256(data)
    await storeFoto(hash, kind, data)
    const out = img.getSize()
    logLine('[fotos] eingefügt', name, `${out.width}×${out.height}`, `${data.byteLength} Bytes`)
    return {
      ok: true,
      hash,
      ext: kind,
      width: out.width,
      height: out.height,
      bytes: data.byteLength
    }
  } catch (err) {
    logLine('[fotos] Einfügen fehlgeschlagen:', path, String(err))
    return { ok: false, name, reason: 'fehler' }
  }
}
