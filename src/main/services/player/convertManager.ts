// Konvertierungs-Queue des Players: sammelt Quelldateien, backt sie in die
// Wand-Auflösung ein (Fit-Modus) und legt sie als abspielbereite Medien in der
// Bibliothek ab. Analyse, Plan (Drehung, Pixel, Halbbilder, Bildrate, HDR, Fit, Ton,
// Umverpacken) und ffmpeg-Ausführung kommen aus dem gemeinsamen Konvertierungs-Kern
// (wie beim Video-Konverter); hier bleibt nur, was die Bibliothek braucht.

import { existsSync, readdirSync, renameSync, rmSync, statSync, type Dirent } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { planConversion, type ConvertPlan } from '@shared/convertPlan'
import { dotted, STILL_IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from '@shared/mediaExtensions'
import type { ConvertJob, ConvertOptions, MediaKind, PlayerImportRequest } from '@shared/types'
import { buildConvertArgs } from '../convert/args'
import { getConvertCapabilities } from '../convert/capabilities'
import { convertQueue } from '../convert/queue'
import { FfmpegCanceledError, runFfmpeg } from '../convert/runFfmpeg'
import { probeMediaInfo } from '../ffmpeg/mediaInfo'
import { logLine } from '../log'
import { getSettings } from '../store'
import { CPU_ENCODERS, encodeWithFallback } from '../convert/encoders'
import { buildThumbArgs, resolveEncoder } from './encoder'
import { analyzeFit, playerOptions, type PlayerSpec } from './playerPlan'
import {
  convKeyFor,
  deleteMedia,
  findByConvKey,
  insertMedia,
  isGifExt,
  isImageExt,
  mediaFilePath,
  storedExtFor,
  updateMediaConversion
} from './mediaLibrary'

const VIDEO_EXT = new Set(dotted(VIDEO_EXTENSIONS))
const IMAGE_EXT = new Set(dotted(STILL_IMAGE_EXTENSIONS))
const MEDIA_EXT = new Set([...VIDEO_EXT, ...IMAGE_EXT, '.gif'])
export const ALLOWED_MEDIA_EXT = MEDIA_EXT

type JobSink = (job: ConvertJob) => void
type LibrarySink = () => void

function readEntries(dir: string): Dirent<string>[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function collectMedia(sources: string[]): string[] {
  const out = new Set<string>()
  const walk = (dir: string): void => {
    for (const e of readEntries(dir)) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) walk(fp)
      else if (MEDIA_EXT.has(extname(e.name).toLowerCase())) out.add(fp)
    }
  }
  for (const p of sources) {
    try {
      if (statSync(p).isDirectory()) walk(p)
      else if (MEDIA_EXT.has(extname(p).toLowerCase())) out.add(p)
    } catch {
      // unzugängliche Pfade ignorieren
    }
  }
  return [...out]
}

function kindOf(path: string): MediaKind {
  if (isGifExt(path)) return 'gif'
  if (isImageExt(path)) return 'image'
  return 'video'
}

function titleWithSuffix(base: string, suffix: string): string {
  return `${base} · ${suffix}`
}

/** Aktive Loudness-Normalisierung aus den Einstellungen (undefined = aus). */
function currentLoudnorm(): { i: number; tp: number; lra: number } | undefined {
  const p = getSettings().player
  if (!p.loudnormEnabled) return undefined
  return { i: p.loudnormI ?? -16, tp: p.loudnormTp ?? -1.5, lra: p.loudnormLra ?? 11 }
}

/** Aktuelle Blur-Fill-Parameter aus den Einstellungen (global). */
function currentBlur(): { blurStrength: number; blurDarken: number } {
  const p = getSettings().player
  return { blurStrength: p.blurStrength ?? 50, blurDarken: p.blurDarken ?? 0 }
}

/** Schlüssel-Variante nur für Blur-Fit (Stärke/Abdunkelung verändern das Bild). */
function blurVariant(spec: {
  fit: PlayerImportRequest['fitMode']
  blurStrength: number
  blurDarken: number
}): string | undefined {
  return spec.fit === 'blur' ? `b${spec.blurStrength}d${spec.blurDarken}` : undefined
}

interface Spec extends PlayerSpec {
  reconvertId?: string
}

interface Prepared {
  kind: MediaKind
  plan: ConvertPlan
  options: ConvertOptions
  suffix: string
  durationSec: number | null
}

/** Quelle analysieren (Medien-Info, mit Cache) und planen – gemeinsamer Kern. */
async function prepare(sourcePath: string, kindIn: MediaKind, spec: Spec): Promise<Prepared> {
  const res = await probeMediaInfo(sourcePath, { deep: true })
  if (!res.ok) throw new Error(res.detail ? `${res.error} (${res.detail})` : res.error)
  const v = res.info.video[0]
  if (!v) throw new Error('Keine Videospur gefunden')
  // GIF mit nur einem Bild ist ein Standbild -> als JPG statt als 1-Bild-Video
  const still = res.info.isStill || v.fpsMode === 'still'
  const kind: MediaKind = kindIn === 'gif' && still ? 'image' : kindIn
  const options = playerOptions(kind, spec, currentLoudnorm())
  const planned = planConversion(res.info, options, await getConvertCapabilities())
  if (!planned.ok) throw new Error(planned.error)
  const { suffix } = analyzeFit(
    spec.fit,
    v.displayWidth,
    v.displayHeight,
    spec.width,
    spec.height,
    Boolean(v.sar)
  )
  return {
    kind,
    plan: planned.plan,
    options,
    suffix,
    durationSec: kind === 'image' ? null : res.info.durationSec
  }
}

class ConvertManager {
  private jobs = new Map<string, ConvertJob>()
  private aborts = new Map<string, AbortController>()
  private specs = new Map<string, Spec>()
  private sink: JobSink = () => {}
  private librarySink: LibrarySink = () => {}

  setSink(sink: JobSink): void {
    this.sink = sink
  }
  setLibrarySink(sink: LibrarySink): void {
    this.librarySink = sink
  }

  list(): ConvertJob[] {
    return [...this.jobs.values()]
  }

  private isCanceled(job: ConvertJob): boolean {
    return job.status === 'canceled'
  }

  private update(job: ConvertJob, patch: Partial<ConvertJob>): void {
    Object.assign(job, patch)
    this.sink({ ...job })
  }

  // Eigene Spur der gemeinsamen Warteschlange: Importe warten nie auf den Video-Konverter
  private queue(job: ConvertJob): void {
    convertQueue.add(job.id, 'player', () => this.run(job))
  }

  enqueue(req: PlayerImportRequest): { jobIds: string[] } {
    const files = collectMedia(req.sources)
    const width = Math.max(2, Math.round(req.wall.width))
    const height = Math.max(2, Math.round(req.wall.height))
    const jobIds: string[] = []
    for (const src of files) {
      const id = randomUUID()
      const job: ConvertJob = {
        id,
        sourcePath: src,
        // Vorläufig ohne Zusatz -- der echte („Original"/„Scale"/Fit) steht erst
        // nach dem Prüfen der Quell-Auflösung fest (siehe run()).
        title: basename(src, extname(src)),
        status: 'queued',
        progress: 0,
        fitMode: req.fitMode,
        targetWidth: width,
        targetHeight: height,
        kind: kindOf(src),
        mediaId: null,
        encoder: null,
        createdAt: Date.now()
      }
      this.jobs.set(id, job)
      this.specs.set(id, { fit: req.fitMode, width, height, ...currentBlur() })
      this.sink({ ...job })
      this.queue(job)
      jobIds.push(id)
    }
    return { jobIds }
  }

  /** Vorhandene Bibliotheks-Medien neu auf die (neue) Wand-Auflösung konvertieren. */
  enqueueReconvert(
    items: {
      sourcePath: string
      title: string
      fit: PlayerImportRequest['fitMode']
      width: number
      height: number
      reconvertId: string
    }[]
  ): { jobIds: string[] } {
    const jobIds: string[] = []
    for (const it of items) {
      const id = randomUUID()
      const job: ConvertJob = {
        id,
        sourcePath: it.sourcePath,
        title: it.title,
        status: 'queued',
        progress: 0,
        fitMode: it.fit,
        targetWidth: Math.max(2, Math.round(it.width)),
        targetHeight: Math.max(2, Math.round(it.height)),
        kind: kindOf(it.sourcePath),
        mediaId: it.reconvertId,
        encoder: null,
        createdAt: Date.now()
      }
      this.jobs.set(id, job)
      this.specs.set(id, {
        fit: it.fit,
        width: job.targetWidth,
        height: job.targetHeight,
        ...currentBlur(),
        reconvertId: it.reconvertId
      })
      this.sink({ ...job })
      this.queue(job)
      jobIds.push(id)
    }
    return { jobIds }
  }

  /** Plan ausführen (Fortschritt am Auftrag, Abbrechen über den AbortController). */
  private async convert(job: ConvertJob, p: Prepared, output: string): Promise<void> {
    const copy = Boolean(p.plan.video?.copy)
    const encoder =
      p.kind === 'image' || copy ? undefined : await resolveEncoder(getSettings().player.encoder)
    // während der (ersten, langsamen) GPU-Erkennung abgebrochen -> „canceled" nicht überschreiben
    if (this.isCanceled(job)) throw new FfmpegCanceledError()
    const run = async (enc: string | undefined): Promise<void> => {
      this.update(job, {
        status: 'converting',
        progress: 0,
        encoder: copy ? 'copy' : (enc ?? null)
      })
      const args = buildConvertArgs(p.plan, p.options, {
        input: job.sourcePath,
        output,
        encoder: enc
      })
      await runFfmpeg(args, {
        durationSec: p.plan.durationSec,
        signal: this.aborts.get(job.id)?.signal,
        onProgress: (v) => this.update(job, { progress: v })
      })
    }
    if (!encoder) return run(undefined)
    // GPU-Fehler mitten im Import (Treiber, Sitzungslimit) -> einmal auf der CPU wiederholen
    await encodeWithFallback(encoder, CPU_ENCODERS.h264, (e) => run(e.id))
  }

  /** Vorschaubild aus dem AUFBEREITETEN Ergebnis (zeigt Blur-Rand/Letterbox/Streckung). */
  private async thumbnail(
    job: ConvertJob,
    input: string,
    output: string,
    p: Prepared
  ): Promise<boolean> {
    this.update(job, { status: 'thumbnail' })
    try {
      const seek = Math.min(1, (p.durationSec ?? 1) * 0.1)
      await runFfmpeg(
        buildThumbArgs({ input, output, seekSec: seek, isVideo: p.kind !== 'image' }),
        { signal: this.aborts.get(job.id)?.signal }
      )
      return existsSync(output)
    } catch (thumbErr) {
      // best effort -> ein fehlendes Vorschaubild darf den Import nicht versenken
      if (!(thumbErr instanceof FfmpegCanceledError)) {
        logLine(
          '[player] Thumbnail fehlgeschlagen:',
          thumbErr instanceof Error ? thumbErr.message : String(thumbErr)
        )
      }
      return false
    }
  }

  private async run(job: ConvertJob): Promise<void> {
    if (this.isCanceled(job)) return
    const spec = this.specs.get(job.id)!
    this.aborts.set(job.id, new AbortController())
    try {
      if (spec.reconvertId) await this.runReconvert(job, spec, spec.reconvertId)
      else await this.runImport(job, spec)
    } finally {
      this.aborts.delete(job.id)
    }
  }

  private async runImport(job: ConvertJob, spec: Spec): Promise<void> {
    try {
      const convKey = convKeyFor(
        job.sourcePath,
        spec.fit,
        spec.width,
        spec.height,
        blurVariant(spec)
      )

      // Dedup: gleiche Quelle, gleicher Fit, gleiche Auflösung, gleicher Blur-Look.
      const existing = findByConvKey(convKey)
      if (existing) {
        this.update(job, { status: 'done', progress: 1, mediaId: existing.id })
        return
      }

      this.update(job, { status: 'probing' })
      const p = await prepare(job.sourcePath, job.kind ?? kindOf(job.sourcePath), spec)
      if (this.isCanceled(job)) return
      const title = titleWithSuffix(basename(job.sourcePath, extname(job.sourcePath)), p.suffix)
      this.update(job, { title, kind: p.kind })

      const storedName = `${job.id}${storedExtFor(p.kind)}`
      const output = mediaFilePath(storedName)
      // eigener Suffix -> kollidiert nicht mit der gebackenen Bild-Datei (${id}.jpg)
      const thumbName = `${job.id}_thumb.jpg`
      const thumbPath = mediaFilePath(thumbName)

      await this.convert(job, p, output)
      if (this.isCanceled(job)) return
      const thumbOk = await this.thumbnail(job, output, thumbPath, p)
      if (this.isCanceled(job)) return

      const sizeBytes = (() => {
        try {
          return statSync(output).size
        } catch {
          return 0
        }
      })()

      const item = insertMedia({
        id: job.id,
        kind: p.kind,
        title: job.title,
        originalName: basename(job.sourcePath),
        storedName,
        thumbName: thumbOk ? thumbName : null,
        width: spec.width,
        height: spec.height,
        durationSec: p.durationSec,
        fitMode: spec.fit,
        hasAudio: p.kind !== 'image' && Boolean(p.plan.audio),
        convKey,
        sizeBytes,
        sourcePath: job.sourcePath
      })
      this.update(job, { status: 'done', progress: 1, mediaId: item.id })
      this.librarySink()
    } catch (err) {
      if (this.isCanceled(job) || err instanceof FfmpegCanceledError) {
        // erst jetzt ist ffmpeg beendet -> Reste sicher löschbar (Windows sperrt offene Dateien)
        this.removeOutputs(job.id)
        if (!this.isCanceled(job)) this.update(job, { status: 'canceled' })
        return
      }
      this.update(job, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  private cleanupReconvertTmp(id: string, ext: string): void {
    for (const name of [`${id}__re${ext}`, `${id}__re_thumb.jpg`]) {
      try {
        const f = mediaFilePath(name)
        if (existsSync(f)) rmSync(f)
      } catch {
        // ignorieren
      }
    }
  }

  // Neu-Konvertierung eines vorhandenen Mediums (gleiche id). In Temp-Dateien
  // konvertieren, dann die alten ersetzen -> die laufende Wiedergabe bricht nicht ab.
  private async runReconvert(job: ConvertJob, spec: Spec, id: string): Promise<void> {
    const ext = storedExtFor(job.kind ?? kindOf(job.sourcePath))
    try {
      const convKey = convKeyFor(
        job.sourcePath,
        spec.fit,
        spec.width,
        spec.height,
        blurVariant(spec)
      )
      const collision = findByConvKey(convKey)
      if (collision && collision.id === id) {
        this.update(job, { status: 'done', progress: 1, mediaId: id }) // bereits in dieser Auflösung
        return
      }
      if (collision && collision.id !== id) deleteMedia(collision.id) // Duplikat -> UNIQUE frei

      const tmpStored = mediaFilePath(`${id}__re${ext}`)
      const tmpThumb = mediaFilePath(`${id}__re_thumb.jpg`)

      this.update(job, { status: 'probing' })
      // Art der gespeicherten Datei bleibt (sonst passte die Endung nicht mehr)
      const p = await prepare(job.sourcePath, job.kind ?? kindOf(job.sourcePath), spec)
      if (this.isCanceled(job)) return this.cleanupReconvertTmp(id, ext)
      // z.B. früher als Video übernommenes Einzelbild-GIF, das jetzt als Standbild gilt
      if (storedExtFor(p.kind) !== ext) {
        throw new Error(
          'Art des Mediums hat sich geändert – bitte aus der Bibliothek entfernen und neu importieren'
        )
      }
      const reTitle = titleWithSuffix(basename(job.sourcePath, extname(job.sourcePath)), p.suffix)

      await this.convert(job, p, tmpStored)
      if (this.isCanceled(job)) return this.cleanupReconvertTmp(id, ext)
      const thumbOk = await this.thumbnail(job, tmpStored, tmpThumb, p)
      if (this.isCanceled(job)) return this.cleanupReconvertTmp(id, ext)

      // Dateien tauschen
      const finalStored = mediaFilePath(`${id}${ext}`)
      const finalThumb = mediaFilePath(`${id}_thumb.jpg`)
      try {
        if (existsSync(finalStored)) rmSync(finalStored)
      } catch {
        // ignorieren
      }
      renameSync(tmpStored, finalStored)
      if (thumbOk) {
        try {
          if (existsSync(finalThumb)) rmSync(finalThumb)
        } catch {
          // ignorieren
        }
        renameSync(tmpThumb, finalThumb)
      }

      const sizeBytes = (() => {
        try {
          return statSync(finalStored).size
        } catch {
          return 0
        }
      })()

      updateMediaConversion(id, {
        width: spec.width,
        height: spec.height,
        durationSec: p.durationSec,
        fitMode: spec.fit,
        hasAudio: p.kind !== 'image' && Boolean(p.plan.audio),
        convKey,
        sizeBytes,
        thumbName: existsSync(finalThumb) ? `${id}_thumb.jpg` : null,
        // Namens-Zusatz an das tatsächliche Ergebnis anpassen (Original/Scale/Fit).
        title: reTitle
      })
      this.update(job, { status: 'done', progress: 1, mediaId: id })
      this.librarySink()
    } catch (err) {
      this.cleanupReconvertTmp(id, ext)
      if (this.isCanceled(job) || err instanceof FfmpegCanceledError) {
        if (!this.isCanceled(job)) this.update(job, { status: 'canceled' })
        return
      }
      this.update(job, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') return
    convertQueue.remove(id)
    this.update(job, { status: 'canceled' })
    this.aborts.get(id)?.abort()
    // unfertige Ausgaben aufräumen (ein noch laufender Import räumt nach Prozessende nach)
    this.removeOutputs(id)
  }

  private removeOutputs(id: string): void {
    for (const name of [`${id}.mp4`, `${id}.jpg`, `${id}_thumb.jpg`]) {
      try {
        const f = mediaFilePath(name)
        if (existsSync(f)) rmSync(f)
      } catch {
        // ignorieren (z.B. unter Windows noch geöffnet)
      }
    }
  }

  clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') {
        this.jobs.delete(id)
        this.specs.delete(id)
      }
    }
  }

  /**
   * Eigenes Idle-Medium (Bild/Video) genau wie Bibliotheks-Medien auf die Wand-
   * Auflösung backen (Fit) und nach H.264/MP4 bzw. JPG konvertieren -> spielt auf
   * der Ausgabe sauber und formatfüllend. Legt KEINEN DB-Eintrag an, nur die Datei.
   */
  async convertIdle(sourcePath: string): Promise<{ storedName: string; kind: 'image' | 'video' }> {
    const s = getSettings().player
    const spec: Spec = {
      fit: s.defaultFit,
      width: Math.max(2, Math.round(s.wallWidth)),
      height: Math.max(2, Math.round(s.wallHeight)),
      ...currentBlur()
    }
    const p = await prepare(sourcePath, kindOf(sourcePath), spec)
    const kind = p.kind === 'image' ? 'image' : 'video'
    const storedName = `__idle-${Date.now()}${storedExtFor(p.kind)}`
    const output = mediaFilePath(storedName)
    const encoder =
      kind === 'image' || p.plan.video?.copy ? undefined : await resolveEncoder(s.encoder)
    const run = (enc: string | undefined): Promise<void> =>
      runFfmpeg(buildConvertArgs(p.plan, p.options, { input: sourcePath, output, encoder: enc }))
    if (encoder) await encodeWithFallback(encoder, CPU_ENCODERS.h264, (e) => run(e.id))
    else await run(undefined)
    return { storedName, kind }
  }
}

export const convertManager = new ConvertManager()
