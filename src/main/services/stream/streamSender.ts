// Stream fürs Heimnetz: Bilder (und beim Video-Player der Ton) kommen aus der Offscreen-Erfassung
// des Werkzeugs (erfassung/offscreenErfassung.ts) – derselben, aus der auch NDI sendet. ffmpeg
// kodiert sie zu H.264 (+ AAC) in MPEG-TS, ein kleiner HTTP-Server verteilt den Strom unter
// /live.ts an alle Empfänger (Heimkino-Box, VLC …).
//
// - ffmpeg läuft nur, solange jemand zuschaut: Start beim ersten Empfänger, Ende kurz nach dem
//   letzten. Der Server läuft, solange „Stream“ an ist.
// - Jedes neue Bild geht sofort an ffmpeg, das die Wanduhr als Zeitstempel nimmt (streamArgs).
//   Ein Hänger im main-Prozess wird so eine kurze Lücke statt dauerhaft verlorener Zeit. Bei
//   Standbildern kommt kein paint – dann wiederholt ein Takt das letzte Bild.
// - Ton: ffmpeg verbindet sich mit einem lokalen TCP-Port und liest Stereo-Float ohne
//   Zeitstempel; wohin jedes Sample gehört, entscheidet der Ton-Takt (tontakt.ts) nach der
//   Sample-Nummer der Blöcke – auch wenn sie nach einem Hänger als Schub kommen. Um so viel, wie
//   das Bild später in den Strom kommt (Spiegel, paint, Raster von ffmpeg), liegt der Ton später:
//   erfassung/bildweg.ts und bildRaster.ts messen es laufend.
// - Im main-Prozess so wenig Arbeit wie möglich: Bilder nur, solange ffmpeg läuft, nie skalieren
//   (das macht ffmpeg), nicht dauernd neu zeichnen lassen.
// - Scheitert ein GPU-Encoder, einmal mit libx264 weiter (wie encodeWithFallback beim Konverter).

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import net from 'node:net'
import type { StreamConfig, StreamStatus } from '@shared/types'
import { CPU_ENCODERS } from '@shared/encoderChoice'
import { resolveEncoder } from '../convert/encoders'
import type {
  ErfassungsAusgang,
  ErfassungsBild,
  ErfassungsTon,
  ErfassungsWunsch,
  OffscreenErfassung
} from '../erfassung/offscreenErfassung'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'
import { logLine } from '../log'
import { lanUrls } from '../remote/remoteHttp'
import { BildRaster } from './bildRaster'
import { buildStreamArgs, STREAM_TON_RATE, type StreamInput } from './streamArgs'
import { stille, verschraenkt } from './tonFormat'
import { Tontakt } from './tontakt'
import { TsVerteiler } from './tsVerteiler'

/** So lange läuft ffmpeg nach dem letzten Empfänger weiter (Box schaltet kurz um, VLC lädt neu). */
const NACHLAUF_MS = 10_000
/** Takt, in dem fehlender Ton als Stille nachgeschoben wird */
const TON_TICK_MS = 20
/** Ist der Weg des Bildes so lange nach dem Start nicht gemessen, steht im Protokoll, warum */
const BILDWEG_GEDULD_MS = 5000
/** Weiter verschiebt der Sender den Ton nie (ms) – zeigt der Spiegel früh, auch nach vorn */
const BILDWEG_MIN_MS = -100
const BILDWEG_MAX_MS = 300
/** Erst ab so viel Änderung (ms) setzt der Sender den Ton neu an – jedes Mal eine kurze Lücke
 *  oder ein paar ms weniger; die Messung wackelt im Betrieb um ±2–4 ms */
const BILDWEG_SPRUNG_MS = 5

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export interface StreamSenderOptions {
  /** Ton aus dem Spiegel mitsenden (Video-Player) */
  ton?: boolean
}

/** Ton-Weg zu einem laufenden ffmpeg */
interface TonWeg {
  server: net.Server
  socket: net.Socket | null
  takt: Tontakt
  tick: ReturnType<typeof setInterval> | null
  /** Sample-Nummer, falls ein Block keine mitbringt (zusammenhängend angenommen) */
  naechsterFrame: number
  /** Wanduhr beim Öffnen (ms): ab wann ein fehlender Weg des Bildes gemeldet wird */
  seit: number
}

export class StreamSender implements ErfassungsAusgang {
  private server: Server | null = null
  private ffmpeg: ChildProcessWithoutNullStreams | null = null
  private readonly verteiler = new TsVerteiler((n) => this.onClients(n))
  private config: StreamConfig | null = null
  private mitTon = false
  private tonWeg: TonWeg | null = null
  /** neuestes Bild – nur, solange ffmpeg läuft */
  private frame: ErfassungsBild | null = null
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
  private falscheRateGemeldet = false
  /** Weg des Bildes, um den der Ton später liegt (ms); null, solange nicht gemessen */
  private bildweg: number | null = null
  /** „nicht messbar“ steht schon im Protokoll */
  private bildwegFehlt = false
  /** wo ffmpeg die Bilder ins Raster legt (je Start von ffmpeg neu) */
  private raster: BildRaster | null = null
  /** gemessene Datenrate: Bytes und Zeit beim letzten Statusabruf */
  private rate = { bytes: 0, at: 0, kbps: 0 }

  constructor(
    /** Präfix der Logzeilen, z. B. '[timer-stream]' */
    private readonly tag: string,
    /** Zustand geändert -> Status an die Fenster */
    private readonly emit: () => void,
    /** Offscreen-Erfassung des Werkzeugs (geteilt mit NDI) */
    private readonly erfassung: OffscreenErfassung
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

  async start(cfg: StreamConfig, opts: StreamSenderOptions = {}): Promise<void> {
    this.stop(false)
    const gen = this.generation
    this.problem = null
    this.config = cfg
    this.mitTon = opts.ton === true
    this.cpuOnly = false
    this.bildweg = null
    this.bildwegFehlt = false
    this.falscheRateGemeldet = false

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
    // Bilder (und Ton) kommen ab jetzt aus der Erfassung – sie öffnet ihr Fenster bei Bedarf.
    this.erfassung.verbinde(this)

    logLine(
      this.tag,
      'gestartet:',
      `${cfg.width}x${cfg.height}@${cfg.fps}`,
      `Port ${cfg.port}`,
      this.mitTon ? 'mit Ton' : 'ohne Ton'
    )
    this.emit()
  }

  stop(emit = true): void {
    this.generation++
    this.stopEncoder()
    this.erfassung.trenne(this)
    this.verteiler.closeAll()
    if (this.server) {
      this.server.close()
      this.server.closeAllConnections?.()
      this.server = null
    }
    this.frame = null
    if (emit) {
      logLine(this.tag, 'gestoppt')
      this.emit()
    }
  }

  // --- Ausgang der Erfassung ---

  wunsch(): ErfassungsWunsch {
    const cfg = this.config
    return {
      width: cfg?.width ?? 1920,
      height: cfg?.height ?? 1080,
      fps: cfg?.fps ?? 30,
      // ffmpeg skaliert und passt ein – das Fenster darf eine andere Größe haben (NDI parallel)
      festeGroesse: false,
      takt: false,
      ton: this.mitTon,
      // allein: in die Auflösung einbetten, ein anderes Seitenverhältnis der Wand nicht verzerren
      fit: 'contain'
    }
  }

  willBilder(): boolean {
    return this.ffmpeg != null
  }

  bild(b: ErfassungsBild): void {
    const proc = this.ffmpeg
    if (!proc) return
    this.frame = b
    // frisches Bild: messen, wo es im Strom landet (Wiederholungen des Standbilds zählen nicht)
    const raster = this.raster
    this.writeFrame(proc, (geschrieben) => raster?.geschrieben(b.zeit, geschrieben))
  }

  ton(t: ErfassungsTon): void {
    const weg = this.tonWeg
    if (!weg?.socket) return // ffmpeg hat sich noch nicht verbunden: Der Block läge davor
    if (t.sampleRate !== STREAM_TON_RATE) {
      if (!this.falscheRateGemeldet) {
        this.falscheRateGemeldet = true
        this.report(`Ton mit ${t.sampleRate} Hz statt ${STREAM_TON_RATE} Hz – bleibt stumm.`)
      }
      return
    }
    const laenge = t.channels[0].length
    const frame = typeof t.frame === 'number' ? t.frame : weg.naechsterFrame
    weg.naechsterFrame = frame + laenge
    const platz = weg.takt.block(Date.now(), frame, laenge, t.gerendert, this.bildwegFuerTon(weg))
    if (platz.stille > 0) weg.socket.write(stille(platz.stille))
    if (platz.anzahl > 0) weg.socket.write(verschraenkt(t.channels, platz.von, platz.anzahl))
  }

  /**
   * Das Bild liegt im Strom später als der Ton, der der Medien-Uhr folgt: Übergabe im Spiegel
   * nach der Uhr und Weg bis zum paint (gemessen von der Erfassung), dazu wo ffmpeg es ins Raster
   * legt (BildRaster). Um die Summe den Ton später einordnen. Wackelt sie um wenige ms, bleibt
   * der Wert – jeder Wechsel setzt den Ton neu an (eine kurze Lücke). Kommt aus dem Spiegel
   * nichts, steht einmal im Protokoll, warum.
   */
  private bildwegFuerTon(weg: TonWeg): number {
    const s = this.erfassung.bildwegStand
    const imStrom = this.raster?.ms ?? null
    if (s || imStrom !== null) {
      const summe = (s?.ms ?? 0) + (imStrom ?? 0)
      if (this.bildweg === null || Math.abs(summe - this.bildweg) > BILDWEG_SPRUNG_MS) {
        this.bildweg = Math.max(BILDWEG_MIN_MS, Math.min(BILDWEG_MAX_MS, summe))
        const spiegel = s
          ? `paint ${s.weg} ms nach der Übergabe, Übergabe ${s.spaet} ms nach der Medien-Uhr ` +
            `(${s.unten} … ${s.oben} ms, ${s.proben} Proben)`
          : 'Spiegel nicht gemessen'
        const strom = imStrom === null ? '' : `, im Strom ${imStrom} ms nach dem paint`
        logLine(
          this.tag,
          'Weg des Bildes:',
          `${summe} ms (${spiegel}${strom}) – der Ton liegt so viel später`
        )
      }
    }
    if (!s && !this.bildwegFehlt) {
      if (Date.now() - weg.seit > BILDWEG_GEDULD_MS) {
        this.bildwegFehlt = true
        const z = this.erfassung.bildwegZaehler
        logLine(
          this.tag,
          'Weg des Bildes nicht messbar:',
          `${z.uebergaben} Übergaben aus dem Spiegel, ${z.paints} paints, ${z.verworfen} ohne ` +
            'passenden paint – der Ton bleibt bei der Renderzeit'
        )
      }
    }
    return this.bildweg ?? 0
  }

  tonFehler(text: string): void {
    this.report(`Ton: ${text}`)
  }

  /** Erfassungsfenster von außen geschlossen (z. B. App-Ende) -> sauber stoppen */
  beendet(): void {
    this.stop()
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
    // Ton-Weg vor ffmpeg: Es verbindet sich beim Start mit diesem Port.
    const weg = this.mitTon ? await this.oeffneTonWeg() : null
    if (gen !== this.generation || this.ffmpeg || this.verteiler.count === 0) {
      weg?.server.close()
      return
    }

    // Eingang in der Größe, in der die Erfassung malt; vor dem ersten Bild die eingestellte.
    const input = this.erfassung.bildGroesse ?? { width: cfg.width, height: cfg.height }
    const startMs = Date.now()
    let proc: ChildProcessWithoutNullStreams
    try {
      const ton = weg
        ? { port: (weg.server.address() as net.AddressInfo).port, startMs }
        : undefined
      proc = spawn(ffmpegBinPath('ffmpeg'), buildStreamArgs(enc.id, cfg, input, ton), {
        windowsHide: true
      })
    } catch (err) {
      weg?.server.close()
      this.report(`ffmpeg startet nicht: ${message(err)}`)
      this.verteiler.closeAll()
      return
    }
    this.ffmpeg = proc
    this.inputSize = input
    this.frame = null
    this.raster = new BildRaster(cfg.fps, Date.now())
    this.encoder = enc.label
    this.problem = null
    if (weg) {
      weg.takt = new Tontakt(startMs)
      this.tonWeg = weg
    }
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
      this.schliesseTonWeg()
      this.report(`ffmpeg startet nicht (${message(err)}) – ist ffmpeg installiert?`)
      this.verteiler.closeAll()
    })
    proc.on('exit', (code) => {
      if (this.ffmpeg !== proc) return // selbst beendet
      this.ffmpeg = null
      this.stopPump()
      this.schliesseTonWeg()
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
    this.erfassung.neuZeichnen()
    // Standbild: Chromium malt nicht neu, ffmpeg braucht trotzdem laufend Bilder – der fps-Filter
    // gibt ein Bild erst aus, wenn das nächste kommt. Also das letzte wiederholen.
    const takt = Math.round(1000 / cfg.fps)
    this.lastWrite = 0
    this.pump = setInterval(() => {
      if (Date.now() - this.lastWrite >= takt) this.writeFrame(proc)
    }, takt)
    this.emit()
  }

  /**
   * Lokaler TCP-Port für den Ton: nur 127.0.0.1, nur EINE Verbindung (ffmpeg), danach nimmt der
   * Server keine weitere an. Was vor der Verbindung an Blöcken kommt, läge ohnehin davor.
   */
  private async oeffneTonWeg(): Promise<TonWeg | null> {
    const server = net.createServer()
    const weg: TonWeg = {
      server,
      socket: null,
      takt: new Tontakt(Date.now()),
      tick: null,
      naechsterFrame: 0,
      seit: Date.now()
    }
    server.on('connection', (socket) => {
      const lokal = /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(socket.remoteAddress ?? '')
      if (weg.socket || !lokal || this.tonWeg !== weg) {
        socket.destroy()
        return
      }
      weg.socket = socket
      server.close() // keine zweite Verbindung
      socket.setNoDelay(true)
      // EPIPE/ECONNRESET beim Beenden von ffmpeg ist erwartet
      socket.on('error', () => {})
      // Zeit seit dem Start (ffmpeg las zuerst das Bild) als Stille, dann der Takt
      socket.write(stille(weg.takt.beginn(Date.now())))
      weg.tick = setInterval(() => {
        const n = weg.takt.tick(Date.now(), TON_TICK_MS)
        if (n > 0 && weg.socket) weg.socket.write(stille(n))
      }, TON_TICK_MS)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject)
          resolve()
        })
      })
      return weg
    } catch (err) {
      server.close()
      this.report(`Ton-Weg zu ffmpeg nicht geöffnet: ${message(err)} – der Stream läuft ohne Ton.`)
      return null
    }
  }

  private schliesseTonWeg(): void {
    const weg = this.tonWeg
    if (!weg) return
    this.tonWeg = null
    if (weg.tick) clearInterval(weg.tick)
    weg.server.close()
    weg.socket?.destroy()
  }

  /** Neuestes Bild an ffmpeg. Bei Rückstau auslassen – die Zeit kommt von der Uhr. */
  /** `angekommen`: Wanduhr, sobald ffmpeg das Bild ganz hat – dann stempelt es (Raster) */
  private writeFrame(
    proc: ChildProcessWithoutNullStreams,
    angekommen?: (geschriebenMs: number) => void
  ): void {
    const frame = this.frame
    const input = this.inputSize
    if (!frame || !input || this.ffmpeg !== proc) return
    if (frame.width !== input.width || frame.height !== input.height) {
      // Größe geändert (Bildschirm-Skalierung umgestellt, NDI dazu oder weg): ffmpeg neu
      // starten, die Empfänger bleiben verbunden.
      logLine(this.tag, 'Bildgröße geändert:', `${frame.width}x${frame.height}`)
      this.stopEncoder()
      void this.startEncoder()
      return
    }
    // ffmpeg kommt nicht nach -> Bild auslassen, statt den Speicher zu füllen. Die Lücke füllt
    // der fps-Filter mit dem letzten Bild.
    if (proc.stdin.writableLength > frame.data.length * 2) return
    proc.stdin.write(frame.data, (err) => {
      if (!err) angekommen?.(Date.now())
    })
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
    this.schliesseTonWeg()
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
