// Byte-Bereich einer Anfrage (`Range: bytes=…`) – rein und getestet (range.test.ts). Eine Stelle
// für alles, was Dateien stückweise ausliefert: die Protokolle media:// und jingle:// und die
// Medien der Player-Fernsteuerung (main/services/serveFile.ts). Vorher rechnete jede der drei
// Stellen selbst, und nur eine verstand `bytes=-500`.

export interface ByteRange {
  /** erstes und letztes Byte, beide eingeschlossen */
  start: number
  end: number
}

const SPEC = /bytes=(\d*)-(\d*)/

/**
 * Liest die Kopfzeile `Range` für eine Datei mit `total` Bytes.
 * - `null`: keine oder keine lesbare Angabe – die ganze Datei geht mit 200 hinaus (eine Angabe,
 *   die der Server nicht versteht, wird übergangen, nicht abgewiesen).
 * - `'unerfuellbar'`: Der Bereich liegt hinter dem Ende der Datei oder ist leer – Antwort 416.
 * - sonst der Bereich, auf die Datei gekappt. Von mehreren Bereichen zählt der erste.
 */
export function parseRange(
  header: string | null | undefined,
  total: number
): ByteRange | 'unerfuellbar' | null {
  if (!header) return null
  const m = SPEC.exec(header)
  if (!m || (m[1] === '' && m[2] === '')) return null
  const last = total - 1
  if (m[1] === '') {
    // „bytes=-500“: die letzten 500 Bytes (ein Player liest so das Ende einer MP4)
    const n = Number(m[2])
    if (n <= 0 || total <= 0) return 'unerfuellbar'
    return { start: Math.max(0, total - n), end: last }
  }
  const start = Number(m[1])
  const end = m[2] === '' ? last : Math.min(Number(m[2]), last)
  if (start > end || start >= total) return 'unerfuellbar'
  return { start, end }
}
