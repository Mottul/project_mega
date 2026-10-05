// Encoder für den gemeinsamen Konvertierungs-Kern (Video-Konverter und Player-Import).
// H.264 und H.265 können statt auf der CPU auf der GPU laufen (NVIDIA NVENC, Intel Quick
// Sync, AMD AMF, Apple VideoToolbox), ProRes auf dem Mac über VideoToolbox. GPU-Encoder
// werden erkannt UND per Mini-Probelauf VALIDIERT – im Build vorhanden heißt nicht, dass die
// passende Hardware da ist. Ohne GPU geht alles auf der CPU weiter; scheitert eine GPU erst
// mitten im Auftrag (Treiber, Sitzungslimit), wiederholt encodeWithFallback ihn auf der CPU.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  ConvertQuality,
  ConverterEncoderStatus,
  EncoderInfo,
  PlayerEncoderStatus
} from '@shared/types'
import { CPU_ENCODERS, PRORES_FAST, pickEncoder, type EncoderFamily } from '@shared/encoderChoice'
import { logLine } from '../log'
import { ffmpegBinPath } from '../ffmpeg/ffmpegPath'
import { FfmpegCanceledError } from './runFfmpeg'

export { CPU_ENCODERS, PRORES_FAST, pickEncoder, type EncoderFamily }

const pexecFile = promisify(execFile)

/** Hardware-Kandidaten je Plattform, bester zuerst. */
export function hardwareCandidates(
  family: EncoderFamily,
  platform: NodeJS.Platform = process.platform
): EncoderInfo[] {
  if (family === 'prores') {
    return platform === 'darwin'
      ? [{ id: 'prores_videotoolbox', label: 'Apple VideoToolbox (Hardware)', hardware: true }]
      : []
  }
  const gpu = (suffix: string, label: string): EncoderInfo => ({
    id: `${family}_${suffix}`,
    label,
    hardware: true
  })
  const nvenc = gpu('nvenc', 'NVIDIA NVENC (GPU)')
  const qsv = gpu('qsv', 'Intel Quick Sync (GPU)')
  const amf = gpu('amf', 'AMD AMF (GPU)')
  const vt = gpu('videotoolbox', 'Apple VideoToolbox (GPU)')
  if (platform === 'darwin') return [vt]
  if (platform === 'win32') return [nvenc, amf, qsv]
  return [nvenc, qsv] // Linux (VAAPI bewusst nicht: braucht Geräte-Setup)
}

/** H.264 für USB-/LED-Player: festes Level und Bitraten-Deckel. */
export interface H264Compat {
  level: string // '4.1' … '5.2'
  maxrate: string // '60M'
  bufsize: string // '120M'
}

/** nv12 für Quick Sync (interner Hardware-Pixelpfad), sonst das Format des Plans. */
export function encoderPixFmt(encoder: string, planned: string): string {
  return encoder.endsWith('_qsv') ? 'nv12' : planned
}

// Qualitätsstufen der GPU-Encoder; „standard“ = die bewährten Werte des Player-Imports.
// NVENC/QSV/AMF: kleiner = besser (H.265 je 2 Stufen höher, wie bei x264/x265);
// VideoToolbox: 0–100, größer = besser.
const GPU_QUALITY: Record<'nvenc' | 'qsv' | 'amf' | 'vt', Record<ConvertQuality, number>> = {
  nvenc: { high: 19, standard: 23, small: 28 },
  qsv: { high: 19, standard: 23, small: 28 },
  amf: { high: 18, standard: 22, small: 27 },
  vt: { high: 65, standard: 55, small: 45 }
}

function halfRate(rate: string): string {
  const m = /^(\d+(?:\.\d+)?)([kKmM]?)$/.exec(rate)
  return m ? `${Math.max(1, Math.round(Number(m[1]) / 2))}${m[2]}` : rate
}

/**
 * Ausgabe-Argumente eines Hardware-Encoders. Mit `compat` (nur H.264): festes Level und
 * Bitraten-Deckel für USB-/LED-Player – qualitätsbasierte Modi kennen keinen Deckel,
 * deshalb dort ein Spitzen-begrenzter VBR-Modus.
 */
export function hardwareEncoderArgs(
  encoder: string,
  quality: ConvertQuality = 'standard',
  compat?: H264Compat
): string[] {
  const hevc = encoder.startsWith('hevc_')
  const off = hevc ? 2 : 0
  if (encoder === 'prores_videotoolbox') return ['-c:v', encoder]
  if (encoder.endsWith('_nvenc')) {
    const q = GPU_QUALITY.nvenc[quality] + off
    const args = ['-c:v', encoder, '-preset', 'p5', '-rc', 'vbr', '-cq', String(q), '-b:v', '0']
    if (compat) {
      args.push('-maxrate', compat.maxrate, '-bufsize', compat.bufsize)
      args.push('-profile:v', 'high', '-level:v', compat.level)
    }
    return args
  }
  if (encoder.endsWith('_qsv')) {
    if (compat) {
      return [
        '-c:v',
        encoder,
        '-profile:v',
        'high',
        '-level',
        compat.level.replace('.', ''),
        '-b:v',
        halfRate(compat.maxrate),
        '-maxrate',
        compat.maxrate,
        '-bufsize',
        compat.bufsize
      ]
    }
    return ['-c:v', encoder, '-global_quality', String(GPU_QUALITY.qsv[quality] + off)]
  }
  if (encoder.endsWith('_amf')) {
    if (compat) {
      return [
        '-c:v',
        encoder,
        '-quality',
        'balanced',
        '-rc',
        'vbr_peak',
        '-b:v',
        halfRate(compat.maxrate),
        '-maxrate',
        compat.maxrate,
        '-bufsize',
        compat.bufsize,
        '-profile:v',
        'high',
        '-level',
        compat.level
      ]
    }
    const q = String(GPU_QUALITY.amf[quality] + off)
    return ['-c:v', encoder, '-quality', 'balanced', '-rc', 'cqp', '-qp_i', q, '-qp_p', q]
  }
  if (encoder.endsWith('_videotoolbox')) {
    // ohne Level-/Deckel-Variante: USB-/LED-Player bekommen hier die CPU (compat=false)
    return ['-c:v', encoder, '-q:v', String(GPU_QUALITY.vt[quality])]
  }
  return ['-c:v', encoder]
}

/* ----------------------------- Probelauf + Cache ----------------------------- */

const TEST_COMPAT: H264Compat = { level: '4.2', maxrate: '60M', bufsize: '120M' }
const TEST_PIXFMT: Record<EncoderFamily, string> = {
  h264: 'yuv420p',
  hevc: 'yuv420p',
  prores: 'yuv422p10le'
}

function runOk(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBinPath('ffmpeg'), args, { windowsHide: true })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
  })
}

/** Mini-Probelauf (1 Bild, 256×256) -> läuft der Encoder auf DIESER Hardware wirklich? */
function testEncode(
  enc: EncoderInfo,
  family: EncoderFamily,
  compat?: H264Compat
): Promise<boolean> {
  const pf = encoderPixFmt(enc.id, TEST_PIXFMT[family])
  const encArgs =
    family === 'prores'
      ? [...hardwareEncoderArgs(enc.id), '-profile:v', '2']
      : hardwareEncoderArgs(enc.id, 'standard', compat)
  return runOk([
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=256x256:r=25',
    '-frames:v',
    '1',
    '-vf',
    `format=${pf}`,
    ...encArgs,
    '-f',
    'null',
    '-'
  ])
}

interface Listing {
  ok: boolean
  version: string | null
  error?: string
  present: (id: string) => boolean
}

let listingPromise: Promise<Listing> | null = null
function encoderListing(force: boolean): Promise<Listing> {
  if (!listingPromise || force) {
    listingPromise = (async () => {
      const ffmpeg = ffmpegBinPath('ffmpeg')
      try {
        const { stdout } = await pexecFile(ffmpeg, ['-hide_banner', '-encoders'], {
          maxBuffer: 8 * 1024 * 1024
        })
        let version: string | null = null
        try {
          const v = await pexecFile(ffmpeg, ['-version'], { maxBuffer: 1024 * 1024 })
          version = v.stdout.split('\n')[0]?.trim() ?? null
        } catch {
          // Version optional
        }
        const present = (id: string): boolean =>
          new RegExp(`^\\s*[A-Z.]{6}\\s+${id}\\b`, 'm').test(stdout)
        return { ok: true, version, present }
      } catch (err) {
        listingPromise = null // ffmpeg kann nachträglich bereitgestellt werden
        return {
          ok: false,
          version: null,
          error: err instanceof Error ? err.message : String(err),
          present: () => false
        }
      }
    })()
  }
  return listingPromise
}

const familyCache = new Map<EncoderFamily, Promise<EncoderInfo[]>>()

/** Geprüfte Encoder einer Familie: funktionierende GPU-Encoder zuerst, dann CPU. */
function detectFamily(family: EncoderFamily, force = false): Promise<EncoderInfo[]> {
  const cached = familyCache.get(family)
  if (cached && !force) return cached
  const p = (async () => {
    const listing = await encoderListing(force)
    const out: EncoderInfo[] = []
    for (const cand of hardwareCandidates(family)) {
      if (!listing.present(cand.id)) continue
      const ok = await testEncode(cand, family)
      const compat =
        ok && family === 'h264' && !cand.id.endsWith('_videotoolbox')
          ? await testEncode(cand, family, TEST_COMPAT)
          : false
      logLine(
        `[encoder] Probelauf ${cand.id}: ${ok ? 'OK' : 'nicht nutzbar'}${ok && family === 'h264' ? ` (USB-/LED-Grenzen: ${compat ? 'ja' : 'nein'})` : ''}`
      )
      if (ok) out.push(family === 'h264' ? { ...cand, compat } : cand)
    }
    if (family === 'prores') out.push(PRORES_FAST)
    out.push(CPU_ENCODERS[family])
    if (!listing.ok) familyCache.delete(family)
    return out
  })()
  familyCache.set(family, p)
  return p
}

/** Alle Familien für den Video-Konverter (gecacht; der erste Aufruf macht die Probeläufe). */
export async function detectConverterEncoders(force = false): Promise<ConverterEncoderStatus> {
  return {
    h264: await detectFamily('h264', force),
    hevc: await detectFamily('hevc', force),
    prores: await detectFamily('prores', force)
  }
}

export async function resolveConverterEncoder(
  family: EncoderFamily,
  mode: 'auto' | 'cpu',
  need: { alpha?: boolean; compat?: boolean } = {}
): Promise<EncoderInfo> {
  return pickEncoder(await detectFamily(family), family, mode, need)
}

/**
 * Mit dem gewählten Encoder kodieren; scheitert ein Hardware-Encoder (Treiber, Sitzungslimit
 * der GPU bei mehreren parallelen Aufträgen …), EINMAL mit dem CPU-Encoder wiederholen.
 * Abbrechen durch den Nutzer wird durchgereicht. Liefert den tatsächlich genutzten Encoder.
 */
export async function encodeWithFallback(
  primary: EncoderInfo,
  cpu: EncoderInfo,
  run: (encoder: EncoderInfo) => Promise<void>,
  onFallback?: (err: unknown) => void
): Promise<EncoderInfo> {
  try {
    await run(primary)
    return primary
  } catch (err) {
    if (err instanceof FfmpegCanceledError || !primary.hardware || primary.id === cpu.id) throw err
    logLine(
      `[encoder] ${primary.id} fehlgeschlagen, wiederhole auf der CPU:`,
      err instanceof Error ? err.message : String(err)
    )
    onFallback?.(err)
    await run(cpu)
    return cpu
  }
}

/* ------------------------------ Player (H.264) ------------------------------ */

/** Erkennt + validiert die H.264-Encoder (Player-Einstellung „Encoder“). */
export async function detectEncoders(force = false): Promise<PlayerEncoderStatus> {
  const listing = await encoderListing(force)
  if (!listing.ok) {
    return {
      ffmpegFound: false,
      version: null,
      available: [],
      recommended: CPU_ENCODERS.h264.id,
      error: listing.error
    }
  }
  const available = await detectFamily('h264', force)
  return {
    ffmpegFound: true,
    version: listing.version,
    available,
    recommended: available[0]?.id ?? CPU_ENCODERS.h264.id
  }
}

/** Player-Einstellung ('auto'|'cpu'|konkret) -> tatsächlich zu nutzender, geprüfter Encoder. */
export async function resolveEncoder(setting: string): Promise<EncoderInfo> {
  const status = await detectEncoders()
  if (setting === 'cpu') return CPU_ENCODERS.h264
  const chosen =
    setting && setting !== 'auto' ? status.available.find((e) => e.id === setting) : null
  return chosen ?? status.available[0] ?? CPU_ENCODERS.h264
}
