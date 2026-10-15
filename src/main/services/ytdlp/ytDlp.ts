// yt-dlp-Wrapper: findet die Binary (userData/bin oder System-PATH), haelt sie
// aktuell und fuehrt Download-Jobs mit Fortschritt aus. Muxing uebernimmt das
// gebuendelte ffmpeg (--ffmpeg-location). Bewusst dependency-frei (Electron
// `net` fuer die Netzzugriffe).
//
// Aktualisierung: beim App-Start wird die neueste stabile Version ermittelt und
// die verwaltete Binary bei Bedarf ersetzt. Jeder Download wird VOR dem
// Umbenennen gegen die SHA2-256SUMS des Releases geprueft -- eine abgeschnittene
// oder unterwegs veraenderte Datei wird nie ausfuehrbar abgelegt. Das ersetzt
// keine Signaturpruefung (dafuer braeuchte es den GPG-Schluessel des Projekts):
// es sichert die Uebertragung, nicht das Release selbst.

import { app, net } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type {
  YtCookieSource,
  YtEnqueueRequest,
  YtJob,
  YtProbeResult,
  YtToolStatus
} from '@shared/types'
import { binaryVersion } from '../binaryVersion'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'
import { JobList } from '../jobs/jobList'
import { getSettings } from '../store'
import { logLine } from '../log'
import {
  authArgs,
  buildDownloadArgs,
  buildProbeArgs,
  explainYtError,
  needsImpersonation,
  normalizeUrl,
  parseProbeJson,
  sanitizeRequest,
  ytErrorText
} from './ytRequest'

const LATEST_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest'
const USER_AGENT = 'MegaToolBox' // manche GitHub-CDN-Edges verlangen einen UA

function binDir(): string {
  const dir = join(app.getPath('userData'), 'bin')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function managedBinary(): string {
  return join(binDir(), process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
}

/** Asset des EIGENSTAENDIGEN Builds je Plattform (kein Python noetig). */
function assetName(): string {
  if (process.platform === 'win32') return 'yt-dlp.exe'
  if (process.platform === 'darwin') return 'yt-dlp_macos'
  return 'yt-dlp_linux'
}

function releaseUrl(tag: string, file: string): string {
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${tag}/${file}`
}

/** yt-dlp-Releases heissen 2025.01.26 (optional mit vierter Zahl). Streng
 *  pruefen, denn der Tag wird in eine URL eingesetzt. */
export function isValidTag(tag: string): boolean {
  return /^\d{4}\.\d{2}\.\d{2}(\.\d+)?$/.test(tag)
}

/**
 * Zieht die Version aus der Weiterleitung von /releases/latest, also z. B.
 * ".../releases/tag/2025.01.26". Liefert null, wenn die Adresse nicht auf ein
 * Release des yt-dlp-Projekts zeigt -- eine umgebogene Weiterleitung darf nie
 * bestimmen, von wo geladen wird.
 */
export function tagFromReleaseUrl(url: string): string | null {
  const m = /^https:\/\/github\.com\/yt-dlp\/yt-dlp\/releases\/tag\/([^/?#]+)$/.exec(url.trim())
  const tag = m ? decodeURIComponent(m[1]) : ''
  return isValidTag(tag) ? tag : null
}

/** SHA2-256SUMS des Releases: je Zeile "<hash>  <dateiname>". */
export function parseChecksums(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(line.trim())
    if (m) map.set(m[2], m[1].toLowerCase())
  }
  return map
}

/** Bevorzugt die selbst verwaltete Binary, sonst PATH. */
async function locateBinary(): Promise<{ bin: string; location: 'managed' | 'path' } | null> {
  const managed = managedBinary()
  if (existsSync(managed) && (await versionOf(managed))) {
    return { bin: managed, location: 'managed' }
  }
  if (await versionOf('yt-dlp')) return { bin: 'yt-dlp', location: 'path' }
  return null
}

// asynchron und zwischengespeichert (binaryVersion.ts); ein bloßer Name auf dem PATH ist unter
// Windows nur über die Shell auflösbar
function versionOf(bin: string): Promise<string | null> {
  const shell = process.platform === 'win32' && !/[\\/]/.test(bin)
  return binaryVersion(bin, ['--version'], { timeoutMs: 8000, shell })
}

function ffmpegAvailable(): boolean {
  const ff = ffmpegBinPath('ffmpeg')
  return ff.includes('/') || ff.includes('\\') ? existsSync(ff) : true
}

/* ------------------------------ Netzzugriff ------------------------------ */

function fetchBuffer(url: string, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = net.request(url) // folgt Redirects (GitHub -> CDN) standardmaessig
    req.setHeader('User-Agent', USER_AGENT)
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      req.abort()
      finish(() => reject(new Error('Zeitüberschreitung beim Abruf')))
    }, timeoutMs)

    req.on('response', (res) => {
      const status = res.statusCode ?? 0
      if (status !== 200) {
        res.on('data', () => {}) // Antwort leeren, sonst bleibt die Verbindung offen
        res.on('end', () => finish(() => reject(new Error(`HTTP ${status} bei ${url}`))))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => finish(() => resolve(Buffer.concat(chunks))))
      res.on('error', (err: Error) => finish(() => reject(err)))
    })
    req.on('error', (err) => finish(() => reject(err)))
    req.end()
  })
}

/**
 * Neueste stabile Version ueber die Weiterleitung von /releases/latest.
 * Bewusst NICHT ueber die GitHub-API: die ist ohne Anmeldung auf 60 Anfragen je
 * Stunde und IP begrenzt, was hinter einem Firmen-NAT regelmaessig zuschlaegt.
 * Der Weiterleitung wird nicht gefolgt -- ihre Zieladresse ist die Antwort.
 */
function fetchLatestTag(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url: LATEST_URL, redirect: 'manual' })
    req.setHeader('User-Agent', USER_AGENT)
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      req.abort()
      finish(() => reject(new Error('Zeitüberschreitung bei der Versionsprüfung')))
    }, 12000)

    req.on('redirect', (_status, _method, redirectUrl) => {
      req.abort() // Seite selbst wird nicht gebraucht
      const tag = tagFromReleaseUrl(redirectUrl)
      finish(() =>
        tag ? resolve(tag) : reject(new Error(`Unerwartete Release-Adresse: ${redirectUrl}`))
      )
    })
    req.on('response', (res) => {
      res.on('data', () => {})
      res.on('end', () =>
        finish(() => reject(new Error(`Keine Weiterleitung erhalten (HTTP ${res.statusCode})`)))
      )
    })
    req.on('error', (err) => finish(() => reject(err)))
    req.end()
  })
}

/** Laedt das Release-Asset, prueft die Pruefsumme und legt es erst dann ab. */
async function downloadVerified(tag: string): Promise<void> {
  const name = assetName()
  const sumsText = (await fetchBuffer(releaseUrl(tag, 'SHA2-256SUMS'), 20000)).toString('utf-8')
  const expected = parseChecksums(sumsText).get(name)
  if (!expected) throw new Error(`Keine Prüfsumme für ${name} im Release ${tag}`)

  const data = await fetchBuffer(releaseUrl(tag, name), 300000)
  const actual = createHash('sha256').update(data).digest('hex')
  if (actual !== expected) {
    throw new Error(`Prüfsumme stimmt nicht — Download verworfen (${actual.slice(0, 12)}…)`)
  }

  // Erst vollstaendig daneben schreiben, dann umbenennen: ein Abbruch darf nie
  // eine halbe, ausfuehrbare Datei hinterlassen.
  const target = managedBinary()
  const tmp = `${target}.${randomUUID().slice(0, 8)}.part`
  writeFileSync(tmp, data)
  if (process.platform !== 'win32') chmodSync(tmp, 0o755)
  try {
    renameSync(tmp, target)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  logLine('[yt-dlp] aktualisiert auf', tag)
}

/* -------------------------------- Status -------------------------------- */

const state: {
  latest: string | null
  checking: boolean
  lastCheck: number | null
  lastError: string | null
} = { latest: null, checking: false, lastCheck: null, lastError: null }

let statusSink: (status: YtToolStatus) => void = () => {}

export function setStatusSink(sink: (status: YtToolStatus) => void): void {
  statusSink = sink
}

export async function getStatus(): Promise<YtToolStatus> {
  const found = await locateBinary()
  const version = found ? await versionOf(found.bin) : null
  // Zustand erst NACH dem Warten lesen: Die erste Versionsabfrage dauert, inzwischen kann die
  // Prüfung fertig sein
  return {
    available: found != null,
    version,
    location: found?.location ?? null,
    ffmpeg: ffmpegAvailable(),
    latest: state.latest,
    upToDate: state.latest == null || version == null ? null : version === state.latest,
    checking: state.checking,
    lastCheck: state.lastCheck,
    lastError: state.lastError
  }
}

// Meldungen in Auftragsreihenfolge: Ein Status, der auf eine ältere (langsamere) Versionsabfrage
// wartet, darf einen neueren nicht überschreiben
let published = 0
function publish(): void {
  const seq = ++published
  void getStatus().then((s) => {
    if (seq === published) statusSink(s)
  })
}

/**
 * Prueft die neueste stabile Version und ersetzt die verwaltete Binary bei
 * Bedarf. Eine per System-PATH installierte Binary wird nur gemeldet, nie
 * angefasst -- die gehoert der Paketverwaltung.
 */
export async function ensureUpToDate(): Promise<YtToolStatus> {
  if (state.checking) return getStatus()
  state.checking = true
  state.lastError = null
  publish()
  try {
    const tag = await fetchLatestTag()
    state.latest = tag
    const found = await locateBinary()
    if (found?.location !== 'path' && (!found || (await versionOf(found.bin)) !== tag)) {
      // Waehrend eines laufenden Downloads laesst sich die Binary unter Windows
      // nicht ersetzen -- dann beim naechsten Start bzw. per Knopf erneut.
      if (ytManager.running()) throw new Error('Download läuft — Aktualisierung später möglich')
      await downloadVerified(tag)
    }
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err)
    logLine('[yt-dlp] Aktualisierung fehlgeschlagen:', state.lastError)
  } finally {
    state.checking = false
    state.lastCheck = Date.now()
    publish()
  }
  return getStatus()
}

/** Frueher: reiner Download per Knopf. Jetzt derselbe gepruefte Weg. */
export async function updateTool(): Promise<YtToolStatus> {
  return ensureUpToDate()
}

/**
 * Einmalige Pruefung kurz nach dem App-Start. Bewusst verzoegert und
 * fehlertolerant: ohne Netz startet die App unveraendert, der Fehler steht nur
 * im Status des Werkzeugs.
 */
export function checkOnStartup(): void {
  if (!getSettings().ytdlpAutoUpdate) return
  setTimeout(() => void ensureUpToDate(), 1500)
}

/**
 * yt-dlp samt Kindprozessen beenden: Es startet ffmpeg zum Zusammenführen von Bild und Ton,
 * und unter Windows stirbt ein Kind nicht mit dem Elternprozess (taskkill /T beendet den Baum).
 */
function killTree(proc: ChildProcessWithoutNullStreams): void {
  if (process.platform === 'win32' && proc.pid) {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }).on(
      'error',
      () => proc.kill('SIGKILL')
    )
  } else proc.kill('SIGKILL')
}

/**
 * Anmeldung aus den Einstellungen, bei jedem Aufruf frisch gelesen (in einem anderen Fenster
 * geändert gilt sofort). Eine gewählte cookies.txt muss es geben – sonst lieber eine klare
 * Meldung als ein Download ohne Anmeldung, der mit einer englischen Fehlerzeile scheitert.
 */
function auth(impersonate: boolean): { args: string[]; cookies: YtCookieSource } {
  const yt = getSettings().youtube
  const fileOk = (p: string): boolean => {
    try {
      return isAbsolute(p) && statSync(p).isFile()
    } catch {
      return false
    }
  }
  if (yt.cookies === 'file' && !fileOk(yt.cookiesFile.trim())) {
    throw new Error(
      yt.cookiesFile.trim()
        ? `cookies.txt nicht gefunden: ${yt.cookiesFile} – unter „Anmeldung“ neu wählen.`
        : 'Keine cookies.txt gewählt – unter „Anmeldung“ eine Datei wählen.'
    )
  }
  return { args: authArgs(yt, { impersonate, fileOk }), cookies: yt.cookies }
}

// Downloads laufen in der Spur „download“ der gemeinsamen Warteschlange (zwei gleichzeitig);
// Abbrechen löst das Signal aus, das yt-dlp samt ffmpeg beendet. Läuft einer, wird die Binary
// nicht ersetzt (running()).
class YtManager extends JobList<YtJob, YtEnqueueRequest> {
  // streng steigend: mehrere Aufträge in derselben Millisekunde (Playlist) bleiben sortierbar
  private lastCreated = 0

  constructor() {
    super('download', '[yt-dlp]')
  }

  protected label(job: YtJob): string {
    return job.url
  }

  enqueue(request: YtEnqueueRequest): { jobId: string } {
    // Fremde Eingabe (Adresse!) -> prüfen, bevor sie je an yt-dlp geht
    const req = sanitizeRequest(request)
    const id = randomUUID()
    const job: YtJob = {
      id,
      url: req.url,
      format: req.format,
      status: 'queued',
      progress: 0,
      title: req.title ?? null,
      speed: null,
      eta: null,
      outputDir: req.outputDir,
      outputFile: null,
      createdAt: (this.lastCreated = Math.max(Date.now(), this.lastCreated + 1))
    }
    this.add(job, req)
    return { jobId: id }
  }

  protected async run(job: YtJob, req: YtEnqueueRequest, signal: AbortSignal): Promise<void> {
    const found = await locateBinary()
    // während der (ersten, langsamen) Versionsabfrage abgebrochen -> bleibt abgebrochen
    if (this.isCanceled(job)) return
    if (!found) {
      this.update(job, { status: 'error', error: 'yt-dlp nicht gefunden – zuerst herunterladen.' })
      return
    }
    let first: { args: string[]; cookies: YtCookieSource }
    try {
      first = auth(false)
    } catch (err) {
      this.fail(job, err)
      return
    }
    this.update(job, { status: 'running' })
    let res = await this.attempt(job, found.bin, req, first.args, signal)
    let impersonated = false
    if (res.code !== 0 && !this.isCanceled(job) && needsImpersonation(res.errTail)) {
      // Seite sperrt Programme aus (Cloudflare): einmal so tun, als sei es ein Browser
      logLine('[yt-dlp] Seite blockt automatische Abrufe – zweiter Versuch als Browser:', job.url)
      impersonated = true
      res = await this.attempt(job, found.bin, req, auth(true).args, signal)
    }
    // abgebrochen, oder 'error' beim Start (Fehlertext steht schon)
    if (this.isCanceled(job) || job.status === 'error') return
    if (res.code === 0) {
      this.update(job, { status: 'done', progress: 1, speed: null, eta: null })
      return
    }
    logLine('[yt-dlp] Fehler', job.url, '->', ytErrorText(res.errTail) ?? `Code ${res.code}`)
    this.update(job, {
      status: 'error',
      error:
        explainYtError(res.errTail, { cookies: first.cookies, impersonated }) ??
        `yt-dlp beendet mit Code ${res.code}`
    })
  }

  /** Ein yt-dlp-Lauf; Abbrechen beendet ihn samt ffmpeg. Liefert Code und Ende von stderr. */
  private attempt(
    job: YtJob,
    bin: string,
    req: YtEnqueueRequest,
    extra: string[],
    signal: AbortSignal
  ): Promise<{ code: number | null; errTail: string }> {
    return new Promise((resolve) => {
      // ein schon ausgelöstes Signal meldet kein 'abort' mehr – dann gar nicht erst starten
      if (signal.aborted) {
        resolve({ code: null, errTail: '' })
        return
      }
      const proc = spawn(bin, buildDownloadArgs(req, ffmpegBinPath('ffmpeg'), extra), {
        windowsHide: true
      })
      const onAbort = (): void => killTree(proc)
      signal.addEventListener('abort', onAbort, { once: true })
      let outBuf = ''
      let errTail = ''
      let settled = false
      // nach 'error' (z. B. Start gescheitert) kann noch 'close' kommen: nur einmal melden
      const finish = (code: number | null): void => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve({ code, errTail })
      }

      const handleLine = (line: string): void => {
        const pct = /\[download\]\s+([\d.]+)%/.exec(line)
        if (pct) {
          const p = Math.min(0.999, Math.max(0, parseFloat(pct[1]) / 100))
          const speed = /at\s+([\d.]+\s?\w+\/s)/.exec(line)?.[1] ?? null
          const eta = /ETA\s+([\d:]+)/.exec(line)?.[1] ?? null
          if (p - job.progress >= 0.005 || speed !== job.speed) {
            this.update(job, { progress: p, speed, eta })
          }
        }
        const dest =
          /\[download\] Destination:\s+(.+)/.exec(line) ??
          /Merging formats into "(.+)"/.exec(line) ??
          /\[ExtractAudio\] Destination:\s+(.+)/.exec(line)
        if (dest) {
          const file = dest[1].trim().replace(/"$/, '')
          const name = file.split(/[/\\]/).pop() ?? file
          this.update(job, { outputFile: file, title: name.replace(/\.[^.]+$/, '') })
        }
      }

      proc.stdout.on('data', (chunk: Buffer) => {
        outBuf += chunk.toString()
        const lines = outBuf.split('\n')
        outBuf = lines.pop() ?? ''
        for (const l of lines) handleLine(l)
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        errTail = (errTail + chunk.toString()).slice(-2000)
      })
      proc.on('error', (err) => {
        this.fail(job, err)
        finish(null)
      })
      proc.on('close', (code) => finish(code))
    })
  }
}

export const ytManager = new YtManager()

/* ---------------------------- Adress-Analyse ----------------------------- */

const PROBE_TIMEOUT = 90_000
/** Lange Playlists liefern viel JSON – mehr als das ist kein sinnvolles Ergebnis. */
const PROBE_MAX_BYTES = 64 * 1024 * 1024

/**
 * Adresse vor dem Laden analysieren: einzelnes Video oder Playlist samt Einträgen.
 * Flach (`--flat-playlist`): die Videos einer Playlist werden dabei nicht abgerufen.
 */
export async function probeUrl(rawUrl: string): Promise<YtProbeResult> {
  const url = normalizeUrl(rawUrl)
  const found = await locateBinary()
  if (!found) throw new Error('yt-dlp nicht gefunden – zuerst herunterladen.')
  const first = auth(false)
  let res = await probeOnce(found.bin, url, first.args)
  let impersonated = false
  if (res.code !== 0 && needsImpersonation(res.errTail)) {
    logLine('[yt-dlp] Seite blockt automatische Abrufe – Analyse als Browser:', url)
    impersonated = true
    res = await probeOnce(found.bin, url, auth(true).args)
  }
  if (res.code !== 0) {
    logLine('[yt-dlp] Analyse fehlgeschlagen', url, '->', ytErrorText(res.errTail) ?? res.code)
    throw new Error(
      explainYtError(res.errTail, { cookies: first.cookies, impersonated }) ??
        `yt-dlp beendet mit Code ${res.code}`
    )
  }
  try {
    return parseProbeJson(JSON.parse(res.stdout), url)
  } catch (err) {
    logLine('[yt-dlp] Analyse nicht lesbar:', err instanceof Error ? err.message : String(err))
    throw new Error('Antwort von yt-dlp nicht lesbar', { cause: err })
  }
}

/** Ein Analyse-Lauf mit Zeit- und Größengrenze */
function probeOnce(
  bin: string,
  url: string,
  extra: string[]
): Promise<{ code: number | null; stdout: string; errTail: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, buildProbeArgs(url, extra), { windowsHide: true })
    const chunks: Buffer[] = []
    let size = 0
    let errTail = ''
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      finish(() => reject(new Error('Zeitüberschreitung beim Prüfen der Adresse')))
    }, PROBE_TIMEOUT)

    proc.stdout.on('data', (c: Buffer) => {
      size += c.length
      if (size > PROBE_MAX_BYTES) {
        proc.kill('SIGKILL')
        finish(() => reject(new Error('Antwort von yt-dlp zu groß')))
      } else chunks.push(c)
    })
    proc.stderr.on('data', (c: Buffer) => {
      errTail = (errTail + c.toString()).slice(-4000)
    })
    proc.on('error', (err) => finish(() => reject(err)))
    proc.on('close', (code) =>
      finish(() => resolve({ code, stdout: Buffer.concat(chunks).toString('utf-8'), errTail }))
    )
  })
}
