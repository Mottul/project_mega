// Beim Beenden der App laufende Arbeit sauber abbrechen: Video-Konverter, Video-Generator
// (Aufträge und „Vorschau rechnen“), Player-Importe und Downloads. Unter Windows sterben
// Kindprozesse nicht mit der App – ffmpeg schriebe sonst weiter und hinterließe halbe Dateien,
// die wie fertige Videos aussehen. Die Aufträge löschen ihre halben Ausgaben selbst, sobald ihr
// ffmpeg beendet ist; darauf wird gewartet (mit Zeitgrenze), danach wird hart beendet.

import { converterJobs } from './convert/converterJobs'
import { convertQueue } from './convert/queue'
import { killAllFfmpeg, runningFfmpegCount } from './convert/runFfmpeg'
import { videoGenJobs } from './convert/videoGenJobs'
import { cancelPreview, previewBusy, previewIdle } from './convert/videoGenPreview'
import { logLine } from './log'
import { convertManager } from './player/convertManager'
import { ytManager } from './ytdlp/ytDlp'

/** Läuft oder wartet etwas, das beim Beenden abgebrochen werden muss? */
export function hasRunningWork(): boolean {
  return runningFfmpegCount() > 0 || convertQueue.busy() || previewBusy() || ytManager.busy()
}

/**
 * Alles abbrechen und das Aufräumen abwarten, höchstens `timeoutMs`; was danach noch läuft
 * (z. B. Vorschaubilder ohne Auftrag), wird hart beendet.
 */
export async function stopAllWork(timeoutMs = 3000): Promise<void> {
  const t0 = Date.now()
  converterJobs.cancelAll()
  videoGenJobs.cancelAll()
  convertManager.cancelAll()
  cancelPreview()
  ytManager.cancelAll()
  // Vorschaubilder und Messläufe gehören zu keinem Auftrag: sofort beenden
  killAllFfmpeg()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const result = await Promise.race([
    Promise.all([convertQueue.idle(), previewIdle()]).then(() => 'done' as const),
    timeout
  ])
  clearTimeout(timer)
  const left = killAllFfmpeg()
  logLine(
    '[beenden] laufende Arbeit abgebrochen:',
    result === 'done' ? 'aufgeräumt' : 'Zeitgrenze erreicht',
    `nach ${Date.now() - t0} ms`,
    left ? `(${left} ffmpeg hart beendet)` : ''
  )
}
