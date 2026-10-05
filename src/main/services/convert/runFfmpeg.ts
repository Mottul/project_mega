// ffmpeg ausführen – gemeinsam für Video-Konverter und Player-Import: Fortschritt aus
// -progress, verständlicher Fehlertext aus dem stderr-Ende, Abbrechen per AbortSignal.

import { spawn } from 'node:child_process'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'

export class FfmpegCanceledError extends Error {
  constructor() {
    super('Abgebrochen')
    this.name = 'FfmpegCanceledError'
  }
}

export interface RunFfmpegOptions {
  /** erwartete Ausgabedauer -> Fortschritt 0..1 (ohne Dauer kein Fortschritt) */
  durationSec?: number | null
  onProgress?: (p: number) => void
  signal?: AbortSignal
  /** nach erfolgreichem Lauf: Ende der ffmpeg-Ausgabe (stderr), z. B. Messwerte von Filtern */
  onStderr?: (tail: string) => void
}

/** Letzte aussagekräftige stderr-Zeile („Conversion failed!" ist keine Ursache). */
export function ffmpegErrorText(code: number | null, stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(Conversion failed!?|Exiting normally.*)$/i.test(l))
  // „[libx264 @ 0x55…] " vorne ist für Nutzer nur Rauschen
  const cause = lines.pop()?.replace(/^\[[^\]]+\]\s*/, '')
  return `ffmpeg beendet mit Code ${code ?? '?'}${cause ? ` – ${cause}` : ''}`
}

export function runFfmpeg(args: string[], opts: RunFfmpegOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new FfmpegCanceledError())
      return
    }
    const proc = spawn(ffmpegBinPath('ffmpeg'), args, { windowsHide: true })
    const onAbort = (): void => {
      proc.kill('SIGKILL')
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    let buf = ''
    let tail = ''
    let last = 0
    proc.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const eq = line.indexOf('=')
        if (eq < 0 || line.slice(0, eq) !== 'out_time_us') continue
        const us = Number(line.slice(eq + 1))
        const dur = opts.durationSec
        if (!dur || dur <= 0 || !Number.isFinite(us) || us < 0) continue
        const p = Math.min(0.999, us / 1e6 / dur)
        // gedrosselt: jede Meldung geht per IPC an alle Fenster
        if (p - last >= 0.005) {
          last = p
          opts.onProgress?.(p)
        }
      }
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-16000)
    })
    proc.on('error', (err: NodeJS.ErrnoException) => {
      opts.signal?.removeEventListener('abort', onAbort)
      reject(err.code === 'ENOENT' ? new Error('ffmpeg nicht gefunden') : err)
    })
    proc.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort)
      if (opts.signal?.aborted) reject(new FfmpegCanceledError())
      else if (code === 0) {
        opts.onStderr?.(tail)
        resolve()
      } else reject(new Error(ffmpegErrorText(code, tail)))
    })
  })
}
