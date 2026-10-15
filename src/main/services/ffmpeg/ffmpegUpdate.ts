// ffmpeg in der fertigen App aktuell halten (Windows/Linux). Ablauf:
//   1. einmal am Tag (erste Prüfung eine Minute nach dem Start) die Release-Liste von
//      BtbN/FFmpeg-Builds holen und den neuesten Build wählen, der mindestens 7 Tage alt ist
//      (ffmpegUpdatePlan.ts – Begründung dort und in SICHERHEIT.md),
//   2. nur wenn er neuer ist als der laufende: Archiv laden, gegen die checksums.sha256 DESSELBEN
//      Releases prüfen (sichert die Übertragung, nicht das Release selbst – wie bei yt-dlp),
//   3. entpacken, Selbsttest (Encoder, Filter, Probe-Kodierung) und als „bereit“ ablegen,
//   4. beim NÄCHSTEN Start aktivieren – nie mitten in der Sitzung (in der Show soll sich nichts
//      ändern; Fähigkeiten und Encoder-Probeläufe sind zwischengespeichert).
// Ablage: userData/ffmpeg/<build>/ (ffmpeg, ffprobe), aktiv.json, bereit.json, abgelehnt.json.
// Bleiben aktueller und vorheriger Build; „Mitgeliefertes verwenden“ macht den laufenden Build
// zum abgelehnten – erst ein neuerer wird wieder geladen.
// macOS: evermeet.cx liefert keine Prüfsummen -> dort kommt ffmpeg mit dem Installer.
//
// Test (E2E): MOTTULBOX_FFMPEG_RELEASES_URL zeigt auf eine eigene Release-Liste (lokaler Server);
// dann sind Downloads von deren Ursprung erlaubt, und die Aktualisierung läuft auch ungepackt.

import { app, net } from 'electron'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { FfmpegToolStatus } from '@shared/types'
import { binaryVersion } from '../binaryVersion'
import { parseEncoderNames, parseFilterNames } from '../convert/capabilities'
import { logLine } from '../log'
import { getSettings } from '../store'
import { ffmpegBinPath, ffmpegExeName, managedFfmpegDir, setManagedFfmpegDir } from './ffmpegPath'
import {
  buildNumber,
  checksumFor,
  missingFeatures,
  pickCandidate,
  type BuildCandidate,
  type ReleaseInfo,
  type UpdatePlatform
} from './ffmpegUpdatePlan'

const RELEASES_URL = 'https://api.github.com/repos/BtbN/FFmpeg-Builds/releases?per_page=40'
const DOWNLOAD_PREFIX = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/'
const MIN_AGE_DAYS = 7
const START_DELAY_MS = 60_000
const CHECK_EVERY_MS = 24 * 3600 * 1000
const USER_AGENT = 'Mottulbox'

const testUrl = (): string | null => process.env.MOTTULBOX_FFMPEG_RELEASES_URL || null

function platform(): UpdatePlatform | null {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'linux') return 'linux'
  return null
}

/** Warum es in dieser App keine Aktualisierung gibt; null = es gibt sie. */
function unsupportedReason(): string | null {
  if (!platform()) {
    return 'Unter macOS kommt ffmpeg mit dem Installer (die Quelle liefert keine Prüfsummen).'
  }
  if (!app.isPackaged && !testUrl()) {
    return 'In der Entwicklung hält „npm run dev“ ffmpeg aktuell.'
  }
  return null
}

const root = (): string => join(app.getPath('userData'), 'ffmpeg')
const file = (name: string): string => join(root(), name)

interface BuildRef {
  build: string
  publishedAt: string
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

const isBuildName = (v: unknown): v is string =>
  typeof v === 'string' && /^N-\d+-g[0-9a-f]{6,40}$/.test(v)

/* --------------------------------- Status --------------------------------- */

const state = {
  active: null as (BuildRef & { previous?: string }) | null,
  checking: false,
  progress: null as number | null,
  lastCheck: null as number | null,
  lastResult: null as string | null,
  lastError: null as string | null
}

let sink: (s: FfmpegToolStatus) => void = () => {}
export function setFfmpegStatusSink(s: (status: FfmpegToolStatus) => void): void {
  sink = s
}

/** Erste Zeile von `-version` (asynchron, zwischengespeichert – binaryVersion.ts). */
function versionOf(bin: string): Promise<string | null> {
  return binaryVersion(bin, ['-version'], { timeoutMs: 10_000 })
}

export async function ffmpegToolStatus(): Promise<FfmpegToolStatus> {
  const bin = ffmpegBinPath('ffmpeg')
  // Zustand erst nach der Versionsabfrage lesen: Die erste dauert, inzwischen ändert er sich
  const version = await versionOf(bin)
  const managed = managedFfmpegDir() !== null && bin.startsWith(root())
  const ready = readJson<BuildRef>(file('bereit.json'))
  const reason = unsupportedReason()
  return {
    active: {
      source: managed ? 'aktualisiert' : /[\\/]/.test(bin) ? 'mitgeliefert' : 'system',
      version,
      build: managed ? (state.active?.build ?? null) : null
    },
    ready: ready && isBuildName(ready.build) ? ready : null,
    supported: reason === null,
    unsupportedReason: reason,
    checking: state.checking,
    progress: state.progress,
    lastCheck: state.lastCheck,
    lastResult: state.lastResult,
    lastError: state.lastError
  }
}

// Meldungen in Auftragsreihenfolge: Ein Status, der auf eine ältere (langsamere) Versionsabfrage
// wartet, darf einen neueren (etwa den Fortschritt) nicht überschreiben
let published = 0
function publish(): void {
  const seq = ++published
  void ffmpegToolStatus().then((s) => {
    if (seq === published) sink(s)
  })
}

/* ------------------------------- Netzzugriff ------------------------------- */

function allowedPrefix(): string {
  const t = testUrl()
  return t ? new URL(t).origin + '/' : DOWNLOAD_PREFIX
}

function fetchText(url: string, api = false, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request(url)
    req.setHeader('User-Agent', USER_AGENT)
    if (api) req.setHeader('Accept', 'application/vnd.github+json')
    const timer = setTimeout(() => {
      req.abort()
      reject(new Error('Zeitüberschreitung beim Abruf'))
    }, timeoutMs)
    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        clearTimeout(timer)
        const status = res.statusCode ?? 0
        if (status === 403) reject(new Error('GitHub-Abfragegrenze erreicht – später erneut'))
        else if (status !== 200) reject(new Error(`HTTP ${status} bei ${url}`))
        else resolve(Buffer.concat(chunks).toString('utf8'))
      })
      res.on('error', (err: Error) => reject(err))
    })
    req.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    req.end()
  })
}

/** Lädt nach `dest` und liefert die SHA-256 – berechnet beim Schreiben, ohne alles im Speicher. */
function downloadToFile(
  url: string,
  dest: string,
  size: number,
  onProgress: (p: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request(url) // folgt der Weiterleitung von GitHub zum CDN
    req.setHeader('User-Agent', USER_AGENT)
    const out = createWriteStream(dest)
    const hash = createHash('sha256')
    let got = 0
    let idle: NodeJS.Timeout
    const fail = (err: Error): void => {
      clearTimeout(idle)
      req.abort()
      out.destroy()
      reject(err)
    }
    const arm = (): void => {
      clearTimeout(idle)
      idle = setTimeout(() => fail(new Error('Download hängt (60 s ohne Daten)')), 60_000)
    }
    arm()
    req.on('response', (res) => {
      if (res.statusCode !== 200) {
        fail(new Error(`HTTP ${res.statusCode} beim Download`))
        return
      }
      res.on('data', (c: Buffer) => {
        arm()
        hash.update(c)
        out.write(c)
        got += c.length
        if (size > 0) onProgress(Math.min(0.999, got / size))
      })
      res.on('end', () => {
        clearTimeout(idle)
        out.end(() => resolve(hash.digest('hex')))
      })
      res.on('error', (err: Error) => fail(err))
    })
    req.on('error', (err) => fail(err))
    req.end()
  })
}

/* ------------------------------ Installieren ------------------------------- */

function findFile(dir: string, name: string): string | null {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      const hit = findFile(p, name)
      if (hit) return hit
    } else if (e.name.toLowerCase() === name.toLowerCase()) return p
  }
  return null
}

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout)))
    )
  })
}

/**
 * Entpacken mit tar: unter Windows das System-tar (bsdtar, kann ZIP) – ein tar aus Git für
 * Windows im PATH könnte es nicht. bsdtar und GNU tar entpacken nie außerhalb des Ziels.
 */
async function extract(archive: string, dest: string): Promise<void> {
  const tar =
    process.platform === 'win32'
      ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar'
  await run(tar, ['-xf', archive, '-C', dest], 300_000)
}

/**
 * Selbsttest eines Builds: ein Build des Entwicklungszweigs, alles Nötige, eine
 * Probe-Kodierung, ffprobe. (Dass es der erwartete Build ist, sichert schon die Prüfsumme.)
 */
async function selfTest(dir: string): Promise<string> {
  const ff = join(dir, ffmpegExeName('ffmpeg'))
  const fp = join(dir, ffmpegExeName('ffprobe'))
  const version = (await run(ff, ['-version'], 15_000)).split('\n')[0].trim()
  if (buildNumber(version) === null) throw new Error(`Selbsttest: unerwartete Version (${version})`)
  const [enc, fil] = await Promise.all([
    run(ff, ['-hide_banner', '-encoders'], 15_000),
    run(ff, ['-hide_banner', '-filters'], 15_000)
  ])
  const missing = missingFeatures(parseEncoderNames(enc), parseFilterNames(fil))
  if (missing.length) throw new Error(`Selbsttest: es fehlt ${missing.join(', ')}`)
  await run(
    ff,
    [
      ...['-hide_banner', '-nostdin', '-v', 'error', '-f', 'lavfi'],
      ...['-i', 'testsrc2=s=64x64:d=0.2', '-c:v', 'libx264', '-f', 'null', '-']
    ],
    30_000
  )
  await run(fp, ['-version'], 15_000)
  return version
}

/**
 * Ordner löschen, ohne dass ein Rest den Lauf scheitern lässt: Unter Windows hält ein
 * Virenscanner frisch entpackte .exe oft noch kurz fest (ENOTEMPTY/EBUSY/EPERM) – erst ein paar
 * Mal neu versuchen (asynchron, der main-Prozess wartet nicht), dann liegen lassen; beim nächsten
 * Start räumt activateAndPrune() die Reste weg. Vorher meldete ein erfolgreich installierter Build
 * deshalb einen Fehler (CI unter Windows, 12. Oktober 2026).
 */
async function removeDir(p: string): Promise<void> {
  try {
    await rm(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (err) {
    logLine('[ffmpeg] Aufräumen später:', p, err instanceof Error ? err.message : String(err))
  }
}

async function install(c: BuildCandidate): Promise<void> {
  const work = file(`tmp-${randomUUID().slice(0, 8)}`)
  mkdirSync(join(work, 'x'), { recursive: true })
  try {
    const expected = checksumFor(await fetchText(c.checksumsUrl), c.asset)
    if (!expected) throw new Error(`Keine Prüfsumme für ${c.asset}`)
    const archive = join(work, c.asset)
    const actual = await downloadToFile(c.url, archive, c.size, (p) => {
      // gedrosselt: jede Meldung geht an alle Fenster
      if (state.progress === null || p - state.progress >= 0.02) {
        state.progress = p
        publish()
      }
    })
    if (actual !== expected) {
      throw new Error(`Prüfsumme stimmt nicht – Download verworfen (${actual.slice(0, 12)}…)`)
    }
    state.progress = null
    state.lastResult = `${c.build}: prüfen …`
    publish()
    await extract(archive, join(work, 'x'))
    // erst vollständig daneben ablegen und testen, dann an den endgültigen Platz
    const next = join(work, c.build)
    mkdirSync(next)
    for (const name of ['ffmpeg', 'ffprobe'] as const) {
      const found = findFile(join(work, 'x'), ffmpegExeName(name))
      if (!found) throw new Error(`${ffmpegExeName(name)} fehlt im Archiv`)
      const target = join(next, ffmpegExeName(name))
      copyFileSync(found, target)
      if (process.platform !== 'win32') chmodSync(target, 0o755)
    }
    const version = await selfTest(next)
    const final = file(c.build)
    rmSync(final, { recursive: true, force: true })
    renameSync(next, final)
    writeFileSync(
      join(final, 'stand.json'),
      JSON.stringify({ geladen: new Date().toISOString(), quelle: c.url, version }, null, 2) + '\n'
    )
    writeFileSync(
      file('bereit.json'),
      JSON.stringify({ build: c.build, publishedAt: c.publishedAt } satisfies BuildRef) + '\n'
    )
    logLine('[ffmpeg] neuer Build bereit (ab dem nächsten Start):', c.build, version)
  } finally {
    await removeDir(work)
  }
}

/** Nummer des laufenden bzw. schon bereitliegenden Builds – der Maßstab für „neuer“. */
async function currentNumber(): Promise<number | null> {
  const inUse = await versionOf(ffmpegBinPath('ffmpeg'))
  const ready = readJson<BuildRef>(file('bereit.json'))
  const numbers = [
    buildNumber(ready?.build),
    buildNumber(state.active?.build),
    buildNumber(inUse),
    // abgelehnte Builds (und alles davor) nie wieder laden
    buildNumber(readJson<BuildRef>(file('abgelehnt.json'))?.build)
  ].filter((n): n is number => n !== null)
  return numbers.length ? Math.max(...numbers) : null
}

/* --------------------------------- Ablauf ---------------------------------- */

let running: Promise<FfmpegToolStatus> | null = null

/** Prüft und lädt ggf. einen neueren Build. Läuft schon eine Prüfung (etwa die beim Start),
 *  liefert „Jetzt prüfen“ deren Ergebnis statt des Zwischenstands „Suche …“. */
export function checkFfmpegUpdate(): Promise<FfmpegToolStatus> {
  if (running) return running
  const p = platform()
  if (!p || unsupportedReason()) return ffmpegToolStatus()
  running = runCheck(p).finally(() => {
    running = null
  })
  return running
}

async function runCheck(p: UpdatePlatform): Promise<FfmpegToolStatus> {
  state.checking = true
  state.lastError = null
  state.lastResult = 'Suche nach einem neueren Build …'
  publish()
  try {
    mkdirSync(root(), { recursive: true })
    const releases = JSON.parse(await fetchText(testUrl() ?? RELEASES_URL, true)) as ReleaseInfo[]
    if (!Array.isArray(releases)) throw new Error('Unerwartete Antwort der Release-Liste')
    const c = pickCandidate(releases, p, Date.now(), MIN_AGE_DAYS, allowedPrefix())
    const current = await currentNumber()
    if (!c) state.lastResult = 'Kein passender Build gefunden'
    else if (current !== null && c.number <= current) {
      state.lastResult = 'Aktuell – kein neuerer Build, der mindestens 7 Tage alt ist'
    } else {
      await install(c)
      state.lastResult = `${c.build} bereit – gilt ab dem nächsten Start`
    }
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err)
    state.lastResult = null
    logLine('[ffmpeg] Aktualisierung fehlgeschlagen:', state.lastError)
  } finally {
    state.checking = false
    state.progress = null
    state.lastCheck = Date.now()
    publish()
  }
  return ffmpegToolStatus()
}

/** Ab dem nächsten Start wieder das mitgelieferte ffmpeg; der laufende Build gilt als abgelehnt. */
export function useBundledFfmpeg(): Promise<FfmpegToolStatus> {
  const rejected = state.active ?? readJson<BuildRef>(file('bereit.json'))
  if (rejected && isBuildName(rejected.build)) {
    writeFileSync(file('abgelehnt.json'), JSON.stringify(rejected) + '\n')
  }
  rmSync(file('aktiv.json'), { force: true })
  rmSync(file('bereit.json'), { force: true })
  state.lastResult = 'Ab dem nächsten Start wieder das mitgelieferte ffmpeg'
  logLine('[ffmpeg] zurück zum mitgelieferten Build (ab dem nächsten Start)')
  publish()
  return ffmpegToolStatus()
}

/**
 * Beim Start, bevor irgendetwas ffmpeg aufruft: bereitliegenden Build aktivieren, Reste
 * aufräumen (abgebrochene Downloads, alte Builds), den aktiven Build einsetzen und die
 * tägliche Prüfung planen.
 */
export function initFfmpegUpdates(): void {
  try {
    if (existsSync(root())) activateAndPrune()
  } catch (err) {
    logLine('[ffmpeg] Start der Aktualisierung:', err instanceof Error ? err.message : err)
  }
  if (unsupportedReason()) return
  const tick = (): void => {
    if (getSettings().ffmpegAutoUpdate !== false) void checkFfmpegUpdate()
  }
  setTimeout(tick, testUrl() ? 0 : START_DELAY_MS).unref?.()
  setInterval(tick, CHECK_EVERY_MS).unref?.()
}

function activateAndPrune(): void {
  const ready = readJson<BuildRef>(file('bereit.json'))
  let active = readJson<BuildRef & { previous?: string }>(file('aktiv.json'))
  const complete = (b: string): boolean =>
    (['ffmpeg', 'ffprobe'] as const).every((n) => existsSync(join(file(b), ffmpegExeName(n))))
  if (ready && isBuildName(ready.build) && complete(ready.build)) {
    active = { ...ready, previous: active?.build }
    writeFileSync(file('aktiv.json'), JSON.stringify(active) + '\n')
    logLine('[ffmpeg] aktiviert:', ready.build)
  }
  rmSync(file('bereit.json'), { force: true })
  if (active && isBuildName(active.build) && complete(active.build)) {
    state.active = active
    setManagedFfmpegDir(file(active.build))
  } else {
    active = null
    rmSync(file('aktiv.json'), { force: true })
  }
  // nur aktiver und vorheriger Build bleiben; Reste abgebrochener Läufe weg
  const keep = new Set([active?.build, active?.previous].filter(Boolean))
  for (const e of readdirSync(root(), { withFileTypes: true })) {
    if (e.isDirectory() && !keep.has(e.name)) void removeDir(join(root(), e.name))
  }
}
