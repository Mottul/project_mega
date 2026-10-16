// Atomar schreiben: erst vollständig (und auf den Datenträger) in eine Nachbardatei, dann
// umbenennen. Bricht der Strom mitten im Schreiben weg, bleibt die alte Datei heil. Genutzt für
// settings.json und die Projektdateien.

import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { open, rename, rm, writeFile } from 'node:fs/promises'
import { logLine } from './log'

let seq = 0

/** Eindeutige Nachbardatei: Zwei gleichzeitige Schreibvorgänge dürfen sich nicht treffen. */
function tmpName(file: string): string {
  return `${file}.${process.pid}-${Date.now().toString(36)}-${(seq++).toString(36)}.tmp`
}

export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  const tmp = tmpName(file)
  const fd = openSync(tmp, 'w')
  try {
    if (typeof data === 'string') writeSync(fd, data, null, 'utf-8')
    else writeSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmp, file)
  } catch (err) {
    // Windows: Virenscanner/Indexer halten die Datei kurz -> dann eben direkt schreiben
    logLine('[fs] Umbenennen fehlgeschlagen, schreibe direkt:', String(err))
    writeFileSync(file, data)
    rmSync(tmp, { force: true })
  }
}

/** Wie writeFileAtomic, ohne den main-Prozess zu blockieren (große Projektdateien). */
export async function writeFileAtomicAsync(file: string, data: Uint8Array): Promise<void> {
  const tmp = tmpName(file)
  const fh = await open(tmp, 'w')
  try {
    await fh.writeFile(data)
    await fh.sync()
  } catch (err) {
    await fh.close().catch(() => {})
    await rm(tmp, { force: true }).catch(() => {})
    throw err
  }
  await fh.close()
  try {
    await rename(tmp, file)
  } catch (err) {
    logLine('[fs] Umbenennen fehlgeschlagen, schreibe direkt:', String(err))
    try {
      await writeFile(file, data)
    } finally {
      await rm(tmp, { force: true }).catch(() => {})
    }
  }
}

/**
 * Neue Datei anlegen – nie eine vorhandene ersetzen: Gibt es sie inzwischen doch (Kollege auf dem
 * NAS), scheitert das mit EEXIST. Bricht das Schreiben ab, wird die halbe Datei wieder entfernt.
 */
export async function writeNewFileAsync(file: string, data: Uint8Array): Promise<void> {
  const fh = await open(file, 'wx')
  try {
    await fh.writeFile(data)
    await fh.sync()
  } catch (err) {
    await fh.close().catch(() => {})
    await rm(file, { force: true }).catch(() => {})
    throw err
  }
  await fh.close()
}
