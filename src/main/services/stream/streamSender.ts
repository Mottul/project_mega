// Stream fürs Heimnetz: Ein unsichtbares Offscreen-Fenster rendert eine App-Route (wie beim
// NDI-Sender), ffmpeg kodiert die Bilder zu H.264 in MPEG-TS, ein kleiner HTTP-Server verteilt
// den Strom unter /live.ts an alle Empfänger (Heimkino-Box, VLC …).
//
// - ffmpeg läuft nur, solange jemand zuschaut: Start beim ersten Empfänger, Ende kurz nach dem
//   letzten. Der Server und das Fenster laufen, solange „Stream“ an ist.
// - Jedes neue Bild geht sofort an ffmpeg, das die Wanduhr als Zeitstempel nimmt (streamArgs).
//   Ein Hänger im main-Prozess wird so eine kurze Lücke statt dauerhaft verlorener Zeit. Bei
//   Standbildern kommt kein paint – dann wiederholt ein Takt das letzte Bild.
// - Im main-Prozess so wenig Arbeit wie möglich: das Bild nur umwandeln, solange jemand
//   zuschaut, nie skalieren (das macht ffmpeg), nicht dauernd neu zeichnen lassen.
// - Scheitert ein GPU-Encoder, einmal mit libx264 weiter (wie encodeWithFallback beim Konverter).
//
// Das Offscreen-Fenster ist (noch) ein eigenes, auch wenn NDI parallel läuft – zusammengelegt
// wird die Erfassung mit dem Ton des Video-Players (siehe PLAN-STREAM, Stufe 2).

import { BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { StreamConfig, StreamStatus } from '@shared/types'
import { CPU_ENCODERS } from '@shared/encoderChoice'
import { resolveEncoder } from '../convert/encoders'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'
import { logLine } from '../log'
import { lanUrls } from '../remote/remoteHttp'
import { loadRoute, secureWebPreferences } from '../windows/appWindows'
import { buildStreamArgs, type StreamInput } from './streamArgs'
import { TsVerteiler } from './tsVerteiler'

/** So lange läuft ffmpeg nach dem letzten Empfänger weiter (Box schaltet kurz um, VLC lädt neu). */
const NACHLAUF_MS = 10_000

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** neuestes Bild (BGRA) mit seiner Größe */
interface Frame extends StreamInput {
  data: Buffer
}

export class OffscreenStreamSender {
  private win: BrowserWindow | null = null
  private server: Server | null = null
  private ffmpeg: ChildProcessWithoutNullStreams | null = null
  private readonly verteiler = new TsVerteiler((n) => this.onClients(n))
  private config: StreamConfig | null = null
  /** neuestes Bild – nur, solange ffmpeg läuft */
  private frame: Frame | null = null
  /** Größe der paint-Bilder (bei Bildschirm-Skalierung größer als eingestellt) */
  private paintSize: StreamInput | null = null
  /** Eingangsgröße des laufenden ffmpeg */
  private inputSize: StreamInput | null = null
  /** wann zuletzt ein Bild an ffmpeg ging (für den Takt bei Standbildern) */
  private lastWrite = 0
  private pump: ReturnType<typeof setInterval> | null = null
  private nachlauf: ReturnType<typeof setTimeout> | null = null
  /** GPU-Encoder ist gescheitert: bis zum Stopp mit libx264 */
  private cpuOnly = false
  private encoder: string | null = null
  /** zählt jeden Start und Stopp: was nach einem await nicht mehr aktuell ist, bricht ab */
  private generation = 0
  private problem: string | null = null
  /** gemessene Datenrate: Bytes und Zeit beim letzten Statusabruf */
  private rate = { bytes: 0, at: 0, kbps: 0 }

  constructor(
    /** Präfix der Logzeilen, z. B. '[timer-stream]' */
    private readonly tag: string,
    /** Zustand geändert -> Status an die Fenster */
    private readonly emit: () => void
  ) {}

  get running(): boolean {
    return this.server != null
  }

  status(fallback: StreamConfig): StreamStatus {
    const cfg = this.config ?? fallback
    const now = Date.now()
    if (now - this.rate.at >= 1000) {
      const bytes = this.verteiler.bytes
      this.rate.kbps = this.rate.at
        ? Math.round(((bytes - this.rate.bytes) * 8) / (now - this.rate.at))
        : 0
      this.rate.bytes = bytes
      this.rate.at = now
    }
    return {
      running: this.running,
      config: cfg,
      clients: this.verteiler.count,
      kbps: this.ffmpeg ? this.rate.kbps : 0,
      encoder: this.ffmpeg ? this.encoder : null,
      urls: this.running ? lanUrls(cfg.port).map((u) => `${u}/live.ts`) : [],
      error: this.problem
    }
  }

  async start(cfg: StreamConfig, route: string): Promise<void> {
    this.stop(false)
    const gen = this.generation
    this.problem = null
    this.config = cfg
    this.cpuOnly = false

    const server = createServer((req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end()
        return
      }
      const path = (req.url ?? '/').split('?')[0]
      if (path === '/live.ts') {
        res.writeHead(200, {
          'Content-Type': 'video/mp2t',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        })
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        res.socket?.setNoDelay(true)
        this.verteiler.add(res)
        logLine(this.tag, 'Empfänger verbunden:', req.socket.remoteAddress ?? '?')
        return
      }
      if (path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Mottulbox-Stream: /live.ts (H.264 in MPEG-TS) – z. B. in VLC öffnen.\n')
        return
      }
      res.writeHead(404).end()
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(cfg.port, () => {
          server.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      server.close()
      if (gen !== this.generation) return
      const code = (err as NodeJS.ErrnoException).code
      this.report(
        code === 'EADDRINUSE'
          ? `Port ${cfg.port} ist schon belegt – in den Einstellungen einen anderen wählen.`
          : `Stream-Server startet nicht: ${message(err)}`
      )
      return
    }
    if (gen !== this.generation) {
      server.close()
      return
    }
    this.server = server
    // Encoder-Probeläufe jetzt anstoßen (einmal je Sitzung, gecacht): Liefen sie erst beim ersten
    // Empfänger, wartete die Box Sekunden länger auf das erste Bild.
    void resolveEncoder('auto').catch(() => {})
    // Ein Empfänger kann nach dem Stopp noch hängen; close() wartet sonst auf ihn.
    server.on('error', (err) => this.report(`Stream-Server: ${message(err)}`))

    const win = new BrowserWindow({
      show: false,
      width: cfg.width,
      height: cfg.height,
      frame: false,
      webPreferences: secureWebPreferences({ offscreen: true, backgroundThrottling: false })
    })
    this.win = win
    win.webContents.setFrameRate(cfg.fps)
    win.webContents.on('paint', (_e, _dirty, image) => this.onPaint(image))
    win.on('closed', () => {
      if (this.win !== win) return
      this.win = null
      this.stop()
    })
    loadRoute(win, route)
    // Kein Neuzeichnen im Takt (wie beim NDI-Sender): Eine unveränderte Anzeige malt Chromium
    // nicht neu, dann wiederholt der Takt in startEncoder das letzte Bild – ohne Rendern und
    // ohne 8 MB Kopie je Bild im main-Prozess.

    logLine(this.tag, 'gestartet:', `${cfg.width}x${cfg.height}@${cfg.fps}`, `Port ${cfg.port}`)
    this.emit()
  }

  stop(emit = true): void {
    this.generation++
    this.stopEncoder()
    if (this.win) {
      const w = this.win
      this.win = null // vor destroy nullen -> 'closed'-Handler stoppt nicht doppelt
      if (!w.isDestroyed()) w.destroy()
    }
    this.verteiler.closeAll()
    if (this.server) {
      this.server.close()
      this.server.closeAllConnections?.()
      this.server = null
    }
    this.frame = null
    this.paintSize = null
    if (emit) {
      logLine(this.tag, 'gestoppt')
      this.emit()
    }
  }

  /**
   * Neues Bild aus dem Offscreen-Fenster. Umgewandelt (8 MB je Bild bei 1080p) wird nur, solange
   * ffmpeg läuft – und nie skaliert: Bei Bildschirm-Skalierung über 100 % kommt das Bild größer,
   * ffmpeg bringt es in seinem eigenen Prozess auf die Ausgabegröße.
   */
  private onPaint(image: Electron.NativeImage): void {
    const { width, height } = image.getSize()
    if (width < 2 || height < 2) return
    this.paintSize = { width, height }
    const proc = this.ffmpeg
    if (!proc) return
    this.frame = { width, height, data: image.toBitmap() }
    this.writeFrame(proc)
  }

  private report(text: string): void {
    this.problem = text
    logLine(this.tag, text)
    this.emit()
  }

  private onClients(n: number): void {
    if (n > 0) {
      if (this.nachlauf) clearTimeout(this.nachlauf)
      this.nachlauf = null
      if (!this.ffmpeg && this.running) void this.startEncoder()
    } else if (this.ffmpeg && !this.nachlauf) {
      this.nachlauf = setTimeout(() => {
        this.nachlauf = null
        if (this.verteiler.count === 0) this.stopEncoder()
        this.emit()
      }, NACHLAUF_MS)
    }
    this.emit()
  }

  private async startEncoder(): Promise<void> {
    const cfg = this.config
    if (!cfg) return
    const gen = this.generation
    const enc = this.cpuOnly ? CPU_ENCODERS.h264 : await resolveEncoder('auto')
    if (gen !== this.generation || this.ffmpeg || this.verteiler.count === 0) return

    // Eingang in der Größe der paint-Bilder; vor dem ersten paint die eingestellte.
    const input = this.paintSize ?? { width: cfg.width, height: cfg.height }
    let proc: ChildProcessWithoutNullStreams
    try {
      proc = spawn(ffmpegBinPath('ffmpeg'), buildStreamArgs(enc.id, cfg, input), {
        windowsHide: true
      })
    } catch (err) {
      this.report(`ffmpeg startet nicht: ${message(err)}`)
      this.verteiler.closeAll()
      return
    }
    this.ffmpeg = proc
    this.inputSize = input
    this.frame = null
    this.encoder = enc.label
    this.problem = null
    let stderr = ''
    let sentBytes = false
    proc.stdout.on('data', (chunk: Buffer) => {
      sentBytes = true
      this.verteiler.push(chunk)
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000)
    })
    // EPIPE beim Beenden ist erwartet – ohne Handler stürzte der main-Prozess ab.
    proc.stdin.on('error', () => {})
    proc.on('error', (err) => {
      if (this.ffmpeg !== proc) return
      this.ffmpeg = null
      this.stopPump()
      this.report(`ffmpeg startet nicht (${message(err)}) – ist ffmpeg installiert?`)
      this.verteiler.closeAll()
    })
    proc.on('exit', (code) => {
      if (this.ffmpeg !== proc) return // selbst beendet
      this.ffmpeg = null
      this.stopPump()
      const grund = stderr.trim().split('\n').pop() || `Code ${code}`
      logLine(this.tag, `ffmpeg (${enc.id}) beendet:`, grund)
      // GPU-Encoder gescheitert (Treiber, Sitzungslimit) -> einmal mit der CPU weiter.
      if (enc.hardware && !sentBytes && gen === this.generation && this.verteiler.count > 0) {
        this.cpuOnly = true
        void this.startEncoder()
        return
      }
      this.report(`Kodieren abgebrochen: ${grund}`)
      this.verteiler.closeAll()
    })

    logLine(this.tag, 'ffmpeg läuft:', enc.id, `${input.width}x${input.height}`)
    // Gleich ein frisches Bild holen (bis eben wurde nichts umgewandelt); danach bringt jedes
    // paint das nächste.
    const win = this.win
    if (win && !win.isDestroyed()) win.webContents.invalidate()
    // Standbild: Chromium malt nicht neu, ffmpeg braucht trotzdem laufend Bilder – der fps-Filter
    // gibt ein Bild erst aus, wenn das nächste kommt. Also das letzte wiederholen.
    const takt = Math.round(1000 / cfg.fps)
    this.lastWrite = 0
    this.pump = setInterval(() => {
      if (Date.now() - this.lastWrite >= takt) this.writeFrame(proc)
    }, takt)
    this.emit()
  }

  /** Neuestes Bild an ffmpeg. Bei Rückstau auslassen – die Zeit kommt von der Uhr. */
  private writeFrame(proc: ChildProcessWithoutNullStreams): void {
    const frame = this.frame
    const input = this.inputSize
    if (!frame || !input || this.ffmpeg !== proc) return
    if (frame.width !== input.width || frame.height !== input.height) {
      // Größe geändert (Bildschirm-Skalierung umgestellt): ffmpeg neu starten, die Empfänger
      // bleiben verbunden.
      logLine(this.tag, 'Bildgröße geändert:', `${frame.width}x${frame.height}`)
      this.stopEncoder()
      void this.startEncoder()
      return
    }
    // ffmpeg kommt nicht nach -> Bild auslassen, statt den Speicher zu füllen. Die Lücke füllt
    // der fps-Filter mit dem letzten Bild.
    if (proc.stdin.writableLength > frame.data.length * 2) return
    proc.stdin.write(frame.data)
    this.lastWrite = Date.now()
  }

  private stopPump(): void {
    if (this.pump) clearInterval(this.pump)
    this.pump = null
  }

  private stopEncoder(): void {
    if (this.nachlauf) clearTimeout(this.nachlauf)
    this.nachlauf = null
    this.stopPump()
    const proc = this.ffmpeg
    if (!proc) return
    this.ffmpeg = null
    this.encoder = null
    proc.stdin.end()
    // ffmpeg schließt nach stdin-Ende selbst; hängt es (GPU-Treiber), hart beenden.
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill()
    }, 2000)
    logLine(this.tag, 'ffmpeg beendet')
  }
}
