// Video-Generator: Vorgaben, erlaubte Werte und die feldweise Prüfung eines Projekts, das
// per IPC aus dem Renderer kommt (nie ungeprüft an ffmpeg). Rein und getestet; der Renderer
// nutzt dieselben Listen für die Auswahlfelder.

import { CONVERT_FORMATS } from './convertPlan'
import type {
  ConvertFormat,
  ConvertQuality,
  VgenDefaults,
  VgenElement,
  VgenElementKind,
  VgenFit,
  VgenKenBurns,
  VgenKenBurnsMode,
  VgenKenBurnsStrength,
  VgenMusic,
  VgenOutput,
  VgenProject,
  VgenTransition
} from './types'
import { VGEN_TRANSITION_KINDS } from './videoGenPlan'

/** Formate der Ausgabe (Transparenz kommt später: ohne HAP Alpha und ProRes 4444). */
export const VGEN_FORMATS: ConvertFormat[] = [
  'h264',
  'hevc',
  'prores_proxy',
  'prores_lt',
  'prores_422',
  'prores_hq',
  'hap',
  'hap_q'
]

/** Bildraten der Ausgabe (NTSC-Raten exakt als Bruch). */
export const VGEN_FPS: { value: number; label: string }[] = [
  { value: 25, label: '25' },
  { value: 30, label: '30' },
  { value: 50, label: '50' },
  { value: 60, label: '60' },
  { value: 24000 / 1001, label: '23,976' },
  { value: 24, label: '24' },
  { value: 30000 / 1001, label: '29,97' },
  { value: 60000 / 1001, label: '59,94' }
]

export const VGEN_FITS: { id: VgenFit; label: string }[] = [
  { id: 'crop', label: 'Füllen' },
  { id: 'bars', label: 'Ränder' },
  { id: 'blur', label: 'Blur-Rand' }
]

export const VGEN_KEN_BURNS_MODES: { id: VgenKenBurnsMode; label: string }[] = [
  { id: 'off', label: 'Aus' },
  { id: 'auto', label: 'Automatisch' },
  { id: 'zoom-in', label: 'Zoom rein' },
  { id: 'zoom-out', label: 'Zoom raus' },
  { id: 'pan-left', label: 'Schwenk ←' },
  { id: 'pan-right', label: 'Schwenk →' },
  { id: 'pan-up', label: 'Schwenk ↑' },
  { id: 'pan-down', label: 'Schwenk ↓' }
]

export const VGEN_KEN_BURNS_STRENGTHS: { id: VgenKenBurnsStrength; label: string }[] = [
  { id: 'soft', label: 'Sanft' },
  { id: 'medium', label: 'Mittel' },
  { id: 'strong', label: 'Stark' }
]

export const DEFAULT_VGEN_DEFAULTS: VgenDefaults = {
  imageSec: 5,
  transition: { kind: 'fade', durationSec: 1 },
  kenBurns: { mode: 'auto', strength: 'medium' },
  fit: 'crop'
}

export const DEFAULT_VGEN_OUTPUT: VgenOutput = {
  width: 1920,
  height: 1080,
  fps: 25,
  format: 'h264',
  quality: 'high',
  loop: false,
  background: '#000000'
}

export const DEFAULT_VGEN_PROJECT: VgenProject = {
  elements: [],
  output: DEFAULT_VGEN_OUTPUT,
  defaults: DEFAULT_VGEN_DEFAULTS,
  music: null,
  loudnorm: null
}

/** Grenzen: genug für jede Show, aber kein Spielraum für absurde Eingaben. */
export const VGEN_LIMITS = {
  elements: 2000,
  pathLength: 4096,
  sizeMin: 16,
  sizeMax: 8192,
  imageSecMin: 0.1,
  imageSecMax: 3600,
  transitionSecMax: 10,
  mediaSecMax: 24 * 3600
}

/* --------------------------------- Prüfung --------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function finite(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[] | Set<T>): T | null {
  const ok = Array.isArray(allowed) ? allowed.includes(v as T) : (allowed as Set<T>).has(v as T)
  return typeof v === 'string' && ok ? (v as T) : null
}

/** Absoluter Pfad (Windows „C:\…“, UNC „\\…“ oder „/…“), ohne Steuerzeichen und Protokolle. */
export function isSafeAbsolutePath(v: unknown): v is string {
  if (typeof v !== 'string' || !v || v.length > VGEN_LIMITS.pathLength) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(v)) return false
  // ffmpeg öffnet sonst auch Protokolle („concat:“, „http:“, „subfile,,…“)
  return /^([a-zA-Z]:[\\/]|\\\\[^\\]|\/)/.test(v)
}

function transition(v: unknown): VgenTransition | null {
  if (!isObj(v)) return null
  const kind = oneOf(v.kind, VGEN_TRANSITION_KINDS)
  const durationSec = finite(v.durationSec, 0, VGEN_LIMITS.transitionSecMax)
  return kind && durationSec !== null ? { kind, durationSec } : null
}

function kenBurns(v: unknown): VgenKenBurns | null {
  if (!isObj(v)) return null
  const mode = oneOf(
    v.mode,
    VGEN_KEN_BURNS_MODES.map((m) => m.id)
  )
  const strength = oneOf(
    v.strength,
    VGEN_KEN_BURNS_STRENGTHS.map((s) => s.id)
  )
  return mode && strength ? { mode, strength } : null
}

const FIT_IDS = VGEN_FITS.map((f) => f.id)
const KINDS: VgenElementKind[] = ['image', 'video', 'gif']

function element(v: unknown): VgenElement | null {
  if (!isObj(v)) return null
  const id = typeof v.id === 'string' && /^[\w-]{1,64}$/.test(v.id) ? v.id : null
  const kind = oneOf(v.kind, KINDS)
  if (!id || !kind || !isSafeAbsolutePath(v.path)) return null
  const opt = (x: unknown, min: number, max: number): number | null =>
    x === null || x === undefined ? null : finite(x, min, max)
  const inSec = opt(v.inSec, 0, VGEN_LIMITS.mediaSecMax)
  const outSec = opt(v.outSec, 0, VGEN_LIMITS.mediaSecMax)
  return {
    id,
    path: v.path,
    kind,
    durationSec: opt(v.durationSec, VGEN_LIMITS.imageSecMin, VGEN_LIMITS.imageSecMax),
    inSec,
    outSec: outSec !== null && inSec !== null && outSec < inSec ? inSec : outSec,
    kenBurns: v.kenBurns === null ? null : kenBurns(v.kenBurns),
    fit: v.fit === null ? null : oneOf(v.fit, FIT_IDS),
    transition: v.transition === null ? null : transition(v.transition),
    audio: v.audio !== false
  }
}

function output(v: unknown): VgenOutput | null {
  if (!isObj(v)) return null
  const size = (x: unknown): number | null => {
    const n = finite(x, VGEN_LIMITS.sizeMin, VGEN_LIMITS.sizeMax)
    return n === null ? null : Math.floor(n / 2) * 2
  }
  const width = size(v.width)
  const height = size(v.height)
  const fps = VGEN_FPS.find((f) => typeof v.fps === 'number' && Math.abs(f.value - v.fps) < 1e-6)
  const format = oneOf(v.format, VGEN_FORMATS)
  const quality = oneOf<ConvertQuality>(v.quality, ['high', 'standard', 'small'])
  const background =
    typeof v.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.background)
      ? v.background
      : '#000000'
  if (!width || !height || !fps || !format || !quality) return null
  return {
    width,
    height,
    fps: fps.value,
    format,
    quality,
    loop: v.loop === true,
    background
  }
}

function defaultsOf(v: unknown): VgenDefaults | null {
  if (!isObj(v)) return null
  const imageSec = finite(v.imageSec, VGEN_LIMITS.imageSecMin, VGEN_LIMITS.imageSecMax)
  const t = transition(v.transition)
  const kb = kenBurns(v.kenBurns)
  const fit = oneOf(v.fit, FIT_IDS)
  return imageSec !== null && t && kb && fit ? { imageSec, transition: t, kenBurns: kb, fit } : null
}

function music(v: unknown): VgenMusic | null {
  if (!isObj(v) || !isSafeAbsolutePath(v.path)) return null
  return {
    path: v.path,
    gainDb: finite(v.gainDb, -40, 12) ?? 0,
    fadeInSec: finite(v.fadeInSec, 0, 30) ?? 0,
    fadeOutSec: finite(v.fadeOutSec, 0, 30) ?? 0
  }
}

/**
 * Projekt aus fremder Quelle (IPC) feldweise prüfen. Ungültige Elemente fallen weg; fehlt
 * Wesentliches (Ausgabe, Vorgaben), ist das Ergebnis null.
 */
export function sanitizeVgenProject(input: unknown): VgenProject | null {
  if (!isObj(input) || !Array.isArray(input.elements)) return null
  if (input.elements.length > VGEN_LIMITS.elements) return null
  const out = output(input.output)
  const defaults = defaultsOf(input.defaults)
  if (!out || !defaults) return null
  const elements = input.elements.map(element).filter((e): e is VgenElement => e !== null)
  const ids = new Set(elements.map((e) => e.id))
  if (ids.size !== elements.length) return null
  const ln = isObj(input.loudnorm)
    ? {
        i: finite(input.loudnorm.i, -40, -5),
        tp: finite(input.loudnorm.tp, -9, 0),
        lra: finite(input.loudnorm.lra, 1, 20)
      }
    : null
  return {
    elements,
    output: out,
    defaults,
    music: input.music === null || input.music === undefined ? null : music(input.music),
    loudnorm:
      ln && ln.i !== null && ln.tp !== null && ln.lra !== null
        ? { i: ln.i, tp: ln.tp, lra: ln.lra }
        : null
  }
}

/** Zieldatei: absolut und mit der Endung des Formats (mp4 bzw. mov). */
export function validOutputPath(path: unknown, format: ConvertFormat): path is string {
  if (!isSafeAbsolutePath(path)) return false
  return path.toLowerCase().endsWith(CONVERT_FORMATS[format].ext)
}
