// Video-Generator (Diashow & Montage): Zeitachse, Ken Burns, Filter und ffmpeg-Befehle – rein
// (kein Node/Electron) und getestet. Der main-Prozess führt die Befehle aus
// (services/convert/videoGen*.ts), der Renderer nutzt dieselben Funktionen für Gesamtdauer,
// Lineal, Hinweise und (Phase 2) die Vorschau.
//
// Verfahren, Messwerte und Stolpersteine: docs/PLAN-VIDEO-GENERATOR.md. Kurz:
// - Gerechnet wird in Stücken: je Element eine Intra-Zwischendatei (jedes Bild ein Keyframe,
//   daher bildgenau schneidbar) plus Ton als WAV, je Übergang ein kurzes xfade-Stück aus den
//   beiden Nachbarn; der concat-Demuxer setzt das Bild zusammen, der Ton läuft getrennt
//   (über den Demuxer driftet er).
// - Alle Positionen in ganzen Bildern; Ton-Samples werden aus der aufsummierten Zeitachse
//   gerundet, nie je Stück (bei 29,97 fps ist ein Bild 1601,6 Samples lang).
// - Schnitte laufen über concat, nie über xfade/acrossfade mit Dauer 0 (beides geht schief).

import {
  CONVERT_FORMATS,
  rateArg,
  rateRational,
  setparamsFor,
  sourceMatrix,
  SQUARE_PIXELS,
  tagsFor,
  TONEMAP_HEAD
} from './convertPlan'
import type {
  ConvertFormat,
  MediaInfo,
  MediaVideoTrack,
  VgenElementKind,
  VgenFit,
  VgenHint,
  VgenKenBurns,
  VgenKenBurnsFrame,
  VgenKenBurnsMode,
  VgenKenBurnsStrength,
  VgenMusic,
  VgenProject,
  VgenTransitionKind
} from './types'

/** Ändert sich, wenn sich die Bedeutung zwischengespeicherter Stücke ändert (Cache-Schlüssel). */
export const VGEN_PLAN_VERSION = 1
export const VGEN_SAMPLE_RATE = 48000

/* ------------------------------ Auswahllisten ------------------------------ */

export const VGEN_TRANSITIONS: { kind: VgenTransitionKind; label: string }[] = [
  { kind: 'cut', label: 'Schnitt' },
  { kind: 'fade', label: 'Überblenden' },
  { kind: 'fadeblack', label: 'Über Schwarz' },
  { kind: 'fadewhite', label: 'Über Weiß' },
  { kind: 'dissolve', label: 'Auflösen' },
  { kind: 'wipeleft', label: 'Wischen ←' },
  { kind: 'wiperight', label: 'Wischen →' },
  { kind: 'slideleft', label: 'Schieben ←' },
  { kind: 'slideright', label: 'Schieben →' },
  { kind: 'slideup', label: 'Schieben ↑' },
  { kind: 'slidedown', label: 'Schieben ↓' },
  { kind: 'circleopen', label: 'Kreis' },
  { kind: 'smoothleft', label: 'Weiches Wischen ←' },
  { kind: 'smoothright', label: 'Weiches Wischen →' },
  { kind: 'zoomin', label: 'Zoom' }
]
export const VGEN_TRANSITION_KINDS = new Set(VGEN_TRANSITIONS.map((t) => t.kind))

export const KEN_BURNS_STRENGTH: Record<VgenKenBurnsStrength, number> = {
  soft: 1.1,
  medium: 1.2,
  strong: 1.35
}

/** Eigener Rahmen: stärker als 4× vergrößert wird es auch bei 50-MP-Fotos weich. */
export const KEN_BURNS_ZOOM_MAX = 4

/** Absenken der Musik: Rampe hinein und heraus (s). */
export const DUCK_RAMP_SEC = 0.5

/** Höchstzahl Musik-Eingänge (wiederholte Titel) – jeder ist ein Dekoder im Ton-Lauf. */
export const MUSIC_ENTRIES_MAX = 200

/* --------------------------------- Typen ---------------------------------- */

export interface VgenCaps {
  /** HDR -> SDR (zscale + tonemap) */
  tonemap: boolean
  /** libvpx-Decoder (Alpha aus VP8/VP9-WebM) */
  vpxAlpha: boolean
  xfade: boolean
  perspective: boolean
}

/** Ken-Burns-Bahn in Koordinaten der Zeichenfläche (0..1): Zoom exponentiell, Mitte linear. */
export interface KenBurnsPath {
  mode: Exclude<VgenKenBurnsMode, 'off' | 'auto'>
  z0: number
  z1: number
  cx0: number
  cx1: number
  cy0: number
  cy1: number
  /** Grundfenster (größtes Rechteck im Seitenverhältnis der Ausgabe), Anteil der Fläche */
  bw: number
  bh: number
}

/** Ein Titel der Musik, so oft er in der Abspielfolge vorkommt (je Vorkommen ein Eingang). */
export interface VgenMusicEntry {
  path: string
  /** Länge laut Analyse (Samples bei 48 kHz) */
  samples: number
  /** Überblendung mit dem nächsten Eintrag (Samples, 0 = direkt) */
  crossfade: number
}

export interface VgenMusicPlan {
  entries: VgenMusicEntry[]
  /** Länge der Abspielfolge nach den Überblendungen (Samples) */
  samples: number
  gainDb: number
  fadeInSec: number
  fadeOutSec: number
  /** Schleife: Ende der Musik in ihren Anfang blenden (Samples) */
  loopCrossfade: number
  /** Absenken: Faktor (0..1) und Bereiche der Ausgabe in Sekunden; null = aus */
  duck: { gain: number; rampSec: number; ranges: [number, number][] } | null
}

/** Was die Quelle braucht, bevor sie ins Raster passt (aus der Medien-Info abgeleitet). */
export interface VgenNormalize {
  /** gekoppelte Maße nach Drehung (für die Hintergrundfläche beim Alpha-Abflachen) */
  codedWidth: number
  codedHeight: number
  /** Anzeigemaße (Drehung + quadratische Pixel) */
  width: number
  height: number
  deinterlace: 'tff' | 'bff' | null
  squarePixels: boolean
  tonemap: boolean
  alpha: boolean
  decoder: string | null
  /** null = RGB-Quelle */
  inMatrix: 'bt709' | 'bt601' | 'bt2020' | null
  inRange: 'tv' | 'pc'
}

export interface VgenTransitionPlan {
  kind: VgenTransitionKind
  /** tatsächliche Länge in Bildern (0 = Schnitt) */
  frames: number
  /** gewünscht (vor dem Kürzen) */
  requestedFrames: number
  /** Überlappung im Ton (Samples) */
  samples: number
}

export interface VgenElementPlan {
  id: string
  index: number
  path: string
  kind: VgenElementKind
  /** Quell-Signatur für den Cache */
  sizeBytes: number | null
  modifiedMs: number | null
  frames: number
  /** erstes Bild auf der Ausgabe-Zeitachse (Element 0 bei Schleife: negativ) */
  start: number
  /** Länge der Ton-WAV in Samples */
  samples: number
  /** nur Element 0 bei Schleife: Kopf (Samples), der am Ende überblendet wird */
  headSamples: number
  /** Video: Ausschnitt in s */
  inSec: number
  fit: VgenFit
  kenBurns: KenBurnsPath | null
  /** Zeichenfläche vor Ken Burns (Ausgabe oder bei „Füllen“ die Deckfläche) */
  canvas: { width: number; height: number }
  norm: VgenNormalize
  /** Originalton: Spur-Index; null = Stille */
  audioStream: number | null
  /** zum nächsten Element (beim letzten: Schleifen-Übergang); null = keiner */
  transition: VgenTransitionPlan | null
}

export interface VgenPlan {
  ok: boolean
  width: number
  height: number
  fps: number
  rate: [number, number]
  outMatrix: 'bt709' | 'bt601'
  /** ffmpeg-Farbe „0xRRGGBB“ */
  background: string
  loop: boolean
  elements: VgenElementPlan[]
  totalFrames: number
  totalSamples: number
  durationSec: number
  music: VgenMusicPlan | null
  hints: VgenHint[]
}

/* --------------------------------- Helfer --------------------------------- */

/** Stabiler 53-bit-Hash (cyrb53) als Hex – für Cache-Schlüssel und „automatisch“. */
export function hash53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** Zahl für ffmpeg-Ausdrücke: ohne Exponent, höchstens 8 Nachkommastellen. */
function num(n: number): string {
  const s = n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
  return s === '-0' ? '0' : s
}

const even = (n: number): number => Math.max(2, 2 * Math.round(n / 2))

/** Bilder -> Sekunden-Text für -ss/-t/inpoint (6 Stellen). */
export function frameTime(frames: number, rate: [number, number]): string {
  return ((frames * rate[1]) / rate[0]).toFixed(6)
}

/** Bilder -> „1,5“ (Sekunden, deutsch, höchstens 2 Stellen). */
export function secText(frames: number, rate: [number, number]): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(
    (frames * rate[1]) / rate[0]
  )
}

/** Sample-Position eines Bildes auf der Ausgabe-Zeitachse (gerundet, auch negativ). */
export function sampleAt(frame: number, rate: [number, number]): number {
  return Math.round((frame * VGEN_SAMPLE_RATE * rate[1]) / rate[0])
}

/** „#1a2b3c“ -> „0x1a2b3c“; Ungültiges -> Schwarz. */
export function ffColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  return `0x${m ? m[1].toLowerCase() : '000000'}`
}

/* -------------------------------- Ken Burns -------------------------------- */

/** Deckfläche: Bild so skaliert, dass es die Ausgabe ganz füllt (gerade Maße). */
export function coverSize(
  srcW: number,
  srcH: number,
  W: number,
  H: number
): { width: number; height: number } {
  const s = Math.max(W / srcW, H / srcH)
  return { width: Math.max(W, even(srcW * s)), height: Math.max(H, even(srcH * s)) }
}

/**
 * Grundfenster: größtes Rechteck im Seitenverhältnis der Ausgabe, mittig auf der Fläche
 * (Anteile 0..1) – ohne Ken Burns der sichtbare Ausschnitt.
 */
export function baseWindow(
  canvas: { width: number; height: number },
  out: { width: number; height: number }
): { x: number; y: number; w: number; h: number } {
  const cAspect = canvas.width / canvas.height
  const oAspect = out.width / out.height
  const w = cAspect >= oAspect ? oAspect / cAspect : 1
  const h = cAspect >= oAspect ? 1 : cAspect / oAspect
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/**
 * Eigenen Rahmen in die Fläche zwingen: Zoom 1..4, Mitte so, dass der Ausschnitt ganz auf der
 * Zeichenfläche liegt. Liegen Start und Ende drin, gilt das für die ganze Bahn (Mitte linear,
 * halbe Breite konvex in der Zeit).
 */
export function clampKenBurnsFrame(
  f: VgenKenBurnsFrame,
  bw: number,
  bh: number
): VgenKenBurnsFrame {
  const zoom = Math.min(KEN_BURNS_ZOOM_MAX, Math.max(1, Number.isFinite(f.zoom) ? f.zoom : 1))
  const c = (v: number, half: number): number =>
    Math.min(1 - half, Math.max(half, Number.isFinite(v) ? v : 0.5))
  return { cx: c(f.cx, bw / zoom / 2), cy: c(f.cy, bh / zoom / 2), zoom }
}

/** Start und Ende einer Bahn als eigener Rahmen – Ausgangspunkt fürs Ziehen im Editor. */
export function kenBurnsFrames(p: KenBurnsPath): {
  from: VgenKenBurnsFrame
  to: VgenKenBurnsFrame
} {
  return {
    from: { cx: p.cx0, cy: p.cy0, zoom: p.z0 },
    to: { cx: p.cx1, cy: p.cy1, zoom: p.z1 }
  }
}

const CENTER_FRAME: VgenKenBurnsFrame = { cx: 0.5, cy: 0.5, zoom: 1 }

/**
 * Bahn eines Bildes. `auto` wählt deterministisch aus der Element-id: Hochkant (beim Füllen)
 * schwenkt senkrecht, Panorama (deutlich breiter als die Ausgabe) waagerecht, sonst
 * wechselnd Zoom rein/raus/Schwenk. Schwenks nutzen vorhandenen Überstand ohne Zoom, sonst
 * zoomen sie um die Stärke, um Platz zu bekommen. `custom` nimmt Start- und Endausschnitt
 * aus `frames` (in die Fläche gezwungen).
 */
export function kenBurnsPath(
  id: string,
  mode: VgenKenBurnsMode,
  strength: VgenKenBurnsStrength,
  canvas: { width: number; height: number },
  out: { width: number; height: number },
  fit: VgenFit,
  frames?: Pick<VgenKenBurns, 'from' | 'to'>
): KenBurnsPath | null {
  if (mode === 'off') return null
  const Z = KEN_BURNS_STRENGTH[strength]
  const cAspect = canvas.width / canvas.height
  const oAspect = out.width / out.height
  const { w: bw, h: bh } = baseWindow(canvas, out)
  let m: KenBurnsPath['mode']
  if (mode !== 'auto') m = mode
  else {
    const h = parseInt(hash53(id).slice(-6), 16)
    if (fit === 'crop' && canvas.height > canvas.width) m = h % 2 ? 'pan-down' : 'pan-up'
    else if (fit === 'crop' && cAspect > oAspect * 1.3) m = h % 2 ? 'pan-right' : 'pan-left'
    else if (fit === 'crop') m = (['zoom-in', 'zoom-out', 'pan-left', 'pan-right'] as const)[h % 4]
    else m = h % 2 ? 'zoom-out' : 'zoom-in'
  }
  switch (m) {
    case 'custom': {
      const a = clampKenBurnsFrame(frames?.from ?? CENTER_FRAME, bw, bh)
      const b = clampKenBurnsFrame(frames?.to ?? frames?.from ?? CENTER_FRAME, bw, bh)
      return { mode: m, z0: a.zoom, z1: b.zoom, cx0: a.cx, cx1: b.cx, cy0: a.cy, cy1: b.cy, bw, bh }
    }
    case 'zoom-in':
      return { mode: m, z0: 1, z1: Z, cx0: 0.5, cx1: 0.5, cy0: 0.5, cy1: 0.5, bw, bh }
    case 'zoom-out':
      return { mode: m, z0: Z, z1: 1, cx0: 0.5, cx1: 0.5, cy0: 0.5, cy1: 0.5, bw, bh }
    case 'pan-left':
    case 'pan-right': {
      // genug Überstand für eine Fahrt wie beim Zoom? Dann ohne Zoom schwenken
      const z = 1 - bw >= 1 - 1 / Z ? 1 : Z
      const half = bw / z / 2
      const [a, b] = m === 'pan-left' ? [1 - half, half] : [half, 1 - half]
      return { mode: m, z0: z, z1: z, cx0: a, cx1: b, cy0: 0.5, cy1: 0.5, bw, bh }
    }
    case 'pan-up':
    case 'pan-down': {
      const z = 1 - bh >= 1 - 1 / Z ? 1 : Z
      const half = bh / z / 2
      const [a, b] = m === 'pan-up' ? [1 - half, half] : [half, 1 - half]
      return { mode: m, z0: z, z1: z, cx0: 0.5, cx1: 0.5, cy0: a, cy1: b, bw, bh }
    }
  }
}

/** Ausschnitt zur Zeit t (0..1) in Anteilen der Zeichenfläche – Grundlage für Datei und Vorschau. */
export function kenBurnsRect(
  p: KenBurnsPath,
  t: number
): { x: number; y: number; w: number; h: number } {
  const z = p.z0 * Math.pow(p.z1 / p.z0, t)
  const w = p.bw / z
  const h = p.bh / z
  const cx = p.cx0 + (p.cx1 - p.cx0) * t
  const cy = p.cy0 + (p.cy1 - p.cy0) * t
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/**
 * perspective-Filter (Subpixel, kubisch) für die Bahn über `frames` Bilder: Die vier
 * Ecken des Ausschnitts (Quelle) werden auf die Ecken des Bildes abgebildet. Gemessen
 * praktisch ruckelfrei (0,009 px Unruhe je Bild) – zoompan zittert sichtbar.
 */
export function perspectiveFilter(p: KenBurnsPath, frames: number): string {
  const d = Math.max(1, frames - 1)
  const t = `in/${d}`
  const r = p.z1 / p.z0
  const zoom = Math.abs(r - 1) < 1e-9 ? '1' : `pow(${num(r)},${t})`
  const w = `(${num(p.bw / p.z0)}*W/${zoom})`
  const h = `(${num(p.bh / p.z0)}*H/${zoom})`
  const lin = (a: number, b: number): string =>
    Math.abs(b - a) < 1e-12 ? num(a) : `(${num(a)}+${num(b - a)}*${t})`
  const x0 = `(${lin(p.cx0, p.cx1)}*W-${w}/2)`
  const y0 = `(${lin(p.cy0, p.cy1)}*H-${h}/2)`
  const x1 = `(${x0}+${w})`
  const y2 = `(${y0}+${h})`
  return (
    `perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y0}':` +
    `x2='${x0}':y2='${y2}':x3='${x1}':y3='${y2}':interpolation=cubic:eval=frame`
  )
}

/* ---------------------------------- Plan ---------------------------------- */

function elementKind(info: MediaInfo): VgenElementKind {
  if (info.isStill) return 'image'
  return info.video[0]?.codecName === 'gif' ? 'gif' : 'video'
}

function normalizeFor(
  v: MediaVideoTrack,
  kind: VgenElementKind,
  caps: VgenCaps,
  hints: VgenHint[],
  id: string
): VgenNormalize {
  const rot = (((v.rotation ?? 0) % 360) + 360) % 360
  const turned = rot === 90 || rot === 270
  const srcYuv = Boolean(v.chroma?.includes(':'))
  const tonemap = Boolean(v.hdr) && caps.tonemap
  if (v.hdr && !caps.tonemap) {
    hints.push({
      id: 'hdr-kept',
      level: 'warning',
      elementId: id,
      text: 'HDR-Video: Das gebündelte ffmpeg kann kein HDR → SDR, die Farben wirken flau.'
    })
  }
  const vpx = v.alpha && (v.codecName === 'vp9' || v.codecName === 'vp8')
  const matrix = sourceMatrix(v)
  return {
    codedWidth: turned ? v.height : v.width,
    codedHeight: turned ? v.width : v.height,
    width: v.displayWidth || v.width,
    height: v.displayHeight || v.height,
    deinterlace: kind === 'video' && (v.scan === 'tff' || v.scan === 'bff') ? v.scan : null,
    squarePixels: Boolean(v.sar) && v.sar !== '1:1',
    tonemap,
    alpha: v.alpha && (!vpx || caps.vpxAlpha),
    decoder: vpx && caps.vpxAlpha ? (v.codecName === 'vp9' ? 'libvpx-vp9' : 'libvpx') : null,
    inMatrix: tonemap
      ? 'bt709'
      : !srcYuv
        ? null
        : (matrix ?? (kind === 'image' ? 'bt601' : v.height >= 720 ? 'bt709' : 'bt601')),
    inRange: tonemap ? 'tv' : v.colorRange === 'pc' ? 'pc' : 'tv'
  }
}

/**
 * Plan für ein Projekt. `media` liefert die Analyse je Pfad (probeMediaInfo, mit
 * Tiefenanalyse für die EXIF-Drehung von Fotos). Fehler stehen als Hinweise mit level
 * 'error' drin; ok = keine Fehler.
 */
export function planVideoGen(
  project: VgenProject,
  media: (path: string) => MediaInfo | null | undefined,
  caps: VgenCaps
): VgenPlan {
  const out = project.output
  const W = Math.max(2, Math.floor(out.width / 2) * 2)
  const H = Math.max(2, Math.floor(out.height / 2) * 2)
  const rate = rateRational(out.fps)
  const frames = (sec: number): number => Math.round((sec * rate[0]) / rate[1])
  const hints: VgenHint[] = []
  const defaults = project.defaults
  const outMatrix: 'bt709' | 'bt601' = H >= 720 ? 'bt709' : 'bt601'

  if (!project.elements.length) {
    hints.push({ id: 'empty', level: 'error', text: 'Noch keine Bilder oder Videos.' })
  }

  // 1. Elemente: Art, Dauer in Bildern, Normalisierung, Ken Burns
  const elements: VgenElementPlan[] = []
  project.elements.forEach((el, index) => {
    const info = media(el.path)
    const v = info?.video[0] ?? null
    if (!info || !v || !v.width || !v.height) {
      hints.push({
        id: 'unreadable',
        level: 'error',
        elementId: el.id,
        text: info
          ? `${info.name}: keine lesbare Bildspur.`
          : `${el.path.split(/[\\/]/).pop()}: Datei fehlt oder ist nicht analysiert.`
      })
      return
    }
    const kind = elementKind(info)
    const norm = normalizeFor(v, kind, caps, hints, el.id)
    let n: number
    let inSec = 0
    if (kind === 'video') {
      const dur = info.durationSec ?? v.durationSec
      if (!dur) {
        hints.push({
          id: 'no-duration',
          level: 'error',
          elementId: el.id,
          text: `${info.name}: Dauer unbekannt.`
        })
        return
      }
      inSec = Math.min(Math.max(0, el.inSec ?? 0), dur)
      const outSec = Math.min(Math.max(inSec, el.outSec ?? dur), dur)
      if ((el.inSec ?? 0) > dur || (el.outSec ?? 0) > dur + 0.05) {
        hints.push({
          id: 'range-clamped',
          level: 'warning',
          elementId: el.id,
          text: `${info.name}: Ausschnitt reicht über das Videoende hinaus – gekürzt.`
        })
      }
      n = frames(outSec - inSec)
    } else {
      n = frames(Math.max(0, el.durationSec ?? defaults.imageSec))
    }
    if (n < 1) {
      hints.push({
        id: 'too-short',
        level: 'warning',
        elementId: el.id,
        text: `${info.name}: kürzer als ein Bild – auf ein Bild verlängert.`
      })
      n = 1
    }
    const fit = el.fit ?? defaults.fit
    const kb = kind === 'image' ? (el.kenBurns ?? defaults.kenBurns) : null
    const canvas =
      fit === 'crop' && kind === 'image'
        ? coverSize(norm.width, norm.height, W, H)
        : { width: W, height: H }
    let path =
      kb && caps.perspective
        ? kenBurnsPath(el.id, kb.mode, kb.strength, canvas, { width: W, height: H }, fit, kb)
        : null
    if (kb && kb.mode !== 'off' && !caps.perspective) {
      hints.push({
        id: 'no-perspective',
        level: 'warning',
        elementId: el.id,
        text: 'Ken Burns ist aus: Dem gebündelten ffmpeg fehlt der Filter „perspective“.'
      })
      path = null
    }
    const upscale = Math.min(norm.width / W, norm.height / H)
    if (upscale < 0.5) {
      hints.push({
        id: 'upscale',
        level: 'info',
        elementId: el.id,
        text: `${info.name}: ${norm.width}×${norm.height} wird stark vergrößert und wirkt weich.`
      })
    }
    const a = info.audio[0] ?? null
    elements.push({
      id: el.id,
      index,
      path: el.path,
      kind,
      sizeBytes: info.sizeBytes,
      modifiedMs: info.modifiedMs,
      frames: n,
      start: 0,
      samples: 0,
      headSamples: 0,
      inSec,
      fit,
      kenBurns: path,
      canvas,
      norm,
      audioStream: kind === 'video' && el.audio && a ? a.index : null,
      transition: null
    })
  })

  // 2. Übergänge: gewünschte Länge, höchstens die Hälfte des kürzeren Nachbarn
  let loop = out.loop
  if (loop && elements.length < 2) {
    if (elements.length === 1) {
      hints.push({
        id: 'loop-single',
        level: 'warning',
        text: 'Nahtlose Schleife braucht mindestens zwei Elemente – ohne Schleife gerechnet.'
      })
    }
    loop = false
  }
  const count = elements.length
  const pairs = loop ? count : Math.max(0, count - 1)
  let xfadeNeeded = false
  for (let i = 0; i < pairs; i++) {
    const a = elements[i]
    const b = elements[(i + 1) % count]
    const src = project.elements[a.index]
    const t = src.transition ?? defaults.transition
    const requested = t.kind === 'cut' ? 0 : Math.max(0, frames(t.durationSec))
    const max = Math.floor(Math.min(a.frames, b.frames) / 2)
    const f = Math.min(requested, max)
    if (f < requested) {
      hints.push({
        id: 'transition-short',
        level: 'info',
        elementId: a.id,
        text: `Übergang nach „${a.path.split(/[\\/]/).pop()}“ auf ${secText(f, rate)} s gekürzt (höchstens die Hälfte des kürzeren Nachbarn).`
      })
    }
    if (f > 0) xfadeNeeded = true
    a.transition = {
      kind: f > 0 ? t.kind : 'cut',
      frames: f,
      requestedFrames: requested,
      samples: 0
    }
  }
  if (xfadeNeeded && !caps.xfade) {
    hints.push({
      id: 'no-xfade',
      level: 'error',
      text: 'Dem gebündelten ffmpeg fehlt der Filter „xfade“ – nur harte Schnitte möglich.'
    })
  }

  // 3. Zeitachse: Starts in Bildern, Ton-Längen aus der aufsummierten Achse
  const loopT = loop ? (elements[count - 1].transition?.frames ?? 0) : 0
  let pos = loopT > 0 ? -loopT : 0
  for (let i = 0; i < count; i++) {
    const e = elements[i]
    e.start = pos
    pos += e.frames - (i < count - 1 ? (e.transition?.frames ?? 0) : 0)
  }
  // pos = Ende des letzten Elements = Σn − ΣÜbergänge (bei Schleife inkl. Schleifen-Übergang)
  const total = count ? pos : 0
  for (let i = 0; i < count; i++) {
    const e = elements[i]
    const startS = Math.max(e.start, 0)
    e.samples = sampleAt(e.start + e.frames, rate) - sampleAt(startS, rate)
    const tr = e.transition
    if (tr && (i < count - 1 || loop)) {
      const endA = e.start + e.frames
      tr.samples = sampleAt(endA, rate) - sampleAt(endA - tr.frames, rate)
    }
  }
  if (loop && count) {
    // Kopf von Element 0 liegt am Ende der Ausgabe: genau so lang wie die Überlappung dort
    const head = elements[count - 1].transition?.samples ?? 0
    elements[0].headSamples = head
    elements[0].samples += head
  }

  // 4. Musik: Abspielfolge der Titel, Absenken unter Originalton
  const totalSamples = sampleAt(total, rate)
  const music =
    project.music && project.music.tracks.length && count
      ? planMusic(project.music, media, { total, totalSamples, loop, rate, elements }, hints)
      : null

  return {
    ok: !hints.some((h) => h.level === 'error'),
    width: W,
    height: H,
    fps: out.fps,
    rate,
    outMatrix,
    background: ffColor(out.background),
    loop,
    elements,
    totalFrames: total,
    totalSamples,
    durationSec: (total * rate[1]) / rate[0],
    music,
    hints
  }
}

/** Überblendung der Musik an der Schleifen-Naht: 2 s, bei kurzen Loops höchstens ein Viertel. */
export function musicLoopCrossfade(totalSamples: number): number {
  return Math.min(2 * VGEN_SAMPLE_RATE, Math.floor(totalSamples / 4))
}

/**
 * Abspielfolge: Titel nacheinander (Überblendung höchstens die Hälfte des kürzeren), die Liste
 * von vorn, bis die Länge reicht – je Vorkommen ein eigener Eingang (der Ton-Lauf liest jeden
 * Titel einmal linear). Eine Sekunde Reserve: Die Dauer aus der Analyse kann bei MP3 ein wenig
 * zu lang sein, an der Schleifen-Naht fehlte dann Ton.
 */
function planMusic(
  m: VgenMusic,
  media: (path: string) => MediaInfo | null | undefined,
  t: {
    total: number
    totalSamples: number
    loop: boolean
    rate: [number, number]
    elements: VgenElementPlan[]
  },
  hints: VgenHint[]
): VgenMusicPlan | null {
  const tracks: { path: string; samples: number }[] = []
  for (const path of m.tracks) {
    const info = media(path)
    const sec = info ? (info.durationSec ?? info.audio[0]?.durationSec ?? null) : null
    if (!info || !info.audio.length || !sec || sec <= 0) {
      hints.push({
        id: 'music-unreadable',
        level: 'error',
        text: `Musik „${path.split(/[\\/]/).pop()}“: ${info ? 'kein lesbarer Ton' : 'Datei fehlt oder ist nicht analysiert'}.`
      })
      continue
    }
    tracks.push({ path, samples: Math.floor(sec * VGEN_SAMPLE_RATE) })
  }
  if (!tracks.length) return null

  const loopCrossfade = t.loop ? musicLoopCrossfade(t.totalSamples) : 0
  const need = t.totalSamples + loopCrossfade + VGEN_SAMPLE_RATE
  const X = Math.max(0, Math.round(m.crossfadeSec * VGEN_SAMPLE_RATE))
  const entries: VgenMusicEntry[] = []
  let len = 0
  for (let k = 0; len < need && entries.length < MUSIC_ENTRIES_MAX; k++) {
    const tr = tracks[k % tracks.length]
    const prev = entries[entries.length - 1]
    if (prev) {
      prev.crossfade = Math.min(X, Math.floor(prev.samples / 2), Math.floor(tr.samples / 2))
      len -= prev.crossfade
    }
    entries.push({ path: tr.path, samples: tr.samples, crossfade: 0 })
    len += tr.samples
  }
  if (len < t.totalSamples + loopCrossfade) {
    hints.push({
      id: 'music-short',
      level: 'warning',
      text: 'Die Musik reicht nicht für die ganze Länge – am Ende ist Stille.'
    })
  }

  // Absenken: wo Videos mit Originalton laufen (samt ihren Übergängen); nahe Bereiche
  // zusammengefasst, sonst käme die Musik zwischen zwei Clips kurz hoch
  let duck: VgenMusicPlan['duck'] = null
  if (m.duckDb < 0) {
    const sec = (f: number): number => (f * t.rate[1]) / t.rate[0]
    const totalSec = sec(t.total)
    const raw: [number, number][] = []
    for (const e of t.elements) {
      if (e.audioStream === null) continue
      const a = sec(e.start)
      const b = sec(e.start + e.frames)
      raw.push([a, b])
      // Schleife: der Kopf von Element 0 liegt am Ende der Datei
      if (t.loop && a < 0) raw.push([a + totalSec, b + totalSec])
    }
    raw.sort((x, y) => x[0] - y[0])
    const ranges: [number, number][] = []
    for (const r of raw) {
      const last = ranges[ranges.length - 1]
      if (last && r[0] <= last[1] + 2 * DUCK_RAMP_SEC) last[1] = Math.max(last[1], r[1])
      else ranges.push([r[0], r[1]])
    }
    if (ranges.length) {
      duck = { gain: Math.pow(10, m.duckDb / 20), rampSec: DUCK_RAMP_SEC, ranges }
    } else {
      hints.push({
        id: 'duck-none',
        level: 'info',
        text: 'Absenken der Musik: Kein Video mit Originalton im Projekt.'
      })
    }
  }

  return {
    entries,
    samples: len,
    gainDb: m.gainDb,
    fadeInSec: m.fadeInSec,
    fadeOutSec: m.fadeOutSec,
    loopCrossfade,
    duck
  }
}

/* ------------------------------- Musik-Hüllkurve --------------------------- */

const clip01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Rampe eines Bereichs: kurze Bereiche (unter zwei Rampen) erreichen die volle Absenkung nicht. */
const rampOf = (d: NonNullable<VgenMusicPlan['duck']>, a: number, b: number): number =>
  Math.max(0.01, Math.min(d.rampSec, (b - a) / 2))

/** Faktor des Absenkens zur Ausgabezeit t (s): 1 = unverändert. Gleiche Formel wie duckExpr. */
export function duckFactor(d: NonNullable<VgenMusicPlan['duck']>, t: number): number {
  let s = 0
  for (const [a, b] of d.ranges) {
    const r = rampOf(d, a, b)
    s += clip01((t - a) / r) * clip01((b - t) / r)
  }
  return 1 - (1 - d.gain) * Math.min(1, s)
}

/** Dieselbe Hüllkurve als ffmpeg-Ausdruck für `volume=…:eval=frame` (t = Zeit des Ton-Blocks). */
export function duckExpr(d: NonNullable<VgenMusicPlan['duck']>): string {
  const terms = d.ranges.map(([a, b]) => {
    const r = num(rampOf(d, a, b))
    return `clip((t-${num(a)})/${r},0,1)*clip((${num(b)}-t)/${r},0,1)`
  })
  return `1-${num(1 - d.gain)}*min(1,${terms.join('+')})`
}

/**
 * Was die Musik zur Ausgabezeit t (s) spielt – für die Live-Vorschau: Einträge mit Position im
 * Titel (s) und Gewicht (in Überblendungen zwei), dazu der Gesamtfaktor aus Pegel, Blenden und
 * Absenken. Die Datei rechnet dasselbe in ffmpeg (audioGraph).
 */
export function musicAt(
  plan: VgenPlan,
  t: number
): { gain: number; parts: { entry: number; path: string; offsetSec: number; weight: number }[] } {
  const mp = plan.music
  if (!mp) return { gain: 0, parts: [] }
  const SR = VGEN_SAMPLE_RATE
  const total = plan.totalSamples
  const pos = Math.round(t * SR)
  // Position im Musikstrom (bei Schleife: ab C, das Ende blendet in den Anfang)
  const stream: { s: number; w: number }[] = []
  if (plan.loop && mp.loopCrossfade > 0) {
    const C = mp.loopCrossfade
    if (pos < total - C) stream.push({ s: pos + C, w: 1 })
    else {
      const w = clip01((pos - (total - C)) / C)
      stream.push({ s: pos + C, w: 1 - w }, { s: pos - (total - C), w })
    }
  } else stream.push({ s: pos, w: 1 })
  const parts: { entry: number; path: string; offsetSec: number; weight: number }[] = []
  for (const { s, w } of stream) {
    let start = 0
    for (let k = 0; k < mp.entries.length; k++) {
      const e = mp.entries[k]
      const end = start + e.samples
      if (s >= start && s < end) {
        const prevX = k > 0 ? mp.entries[k - 1].crossfade : 0
        // in die Überblendung mit dem Vorgänger (linear wie acrossfade c=tri)
        const fadeIn = prevX > 0 && s < start + prevX ? (s - start) / prevX : 1
        const fadeOut = e.crossfade > 0 && s >= end - e.crossfade ? (end - s) / e.crossfade : 1
        parts.push({
          entry: k,
          path: e.path,
          offsetSec: (s - start) / SR,
          weight: w * Math.min(fadeIn, fadeOut)
        })
      }
      start = end - e.crossfade
    }
  }
  let gain = Math.pow(10, mp.gainDb / 20)
  if (!plan.loop) {
    const sec = total / SR
    const fi = Math.max(0, Math.min(mp.fadeInSec, sec / 2))
    const fo = Math.max(0, Math.min(mp.fadeOutSec, sec / 2))
    if (fi > 0) gain *= clip01(t / fi)
    if (fo > 0) gain *= clip01((sec - t) / fo)
  }
  if (mp.duck) gain *= duckFactor(mp.duck, t)
  return { gain, parts }
}

/**
 * Länge eines Durchlaufs der Musik (alle Titel einmal, mit den Überblendungen dazwischen) in
 * Samples – Ziel für „Standzeit an Musik anpassen“. null = Titel fehlen oder sind unlesbar.
 */
export function musicPassSamples(
  music: VgenMusic,
  media: (path: string) => MediaInfo | null | undefined
): number | null {
  if (!music.tracks.length) return null
  const lens: number[] = []
  for (const path of music.tracks) {
    const info = media(path)
    const sec = info ? (info.durationSec ?? info.audio[0]?.durationSec ?? null) : null
    if (!info || !info.audio.length || !sec || sec <= 0) return null
    lens.push(Math.floor(sec * VGEN_SAMPLE_RATE))
  }
  const X = Math.max(0, Math.round(music.crossfadeSec * VGEN_SAMPLE_RATE))
  let len = lens[0]
  for (let k = 1; k < lens.length; k++) {
    len += lens[k] - Math.min(X, Math.floor(lens[k - 1] / 2), Math.floor(lens[k] / 2))
  }
  return len
}

/**
 * Standzeit der Bilder (Vorgabe), mit der das Video so lang wird wie ein Durchlauf der Musik
 * (bei Schleife: Musik genau einmal je Durchlauf, die Naht-Überblendung abgezogen). Gesucht in
 * ganzen Bildern; Bilder mit eigener Standzeit und Videos bleiben, wie sie sind.
 */
export function imageSecForMusic(
  project: VgenProject,
  media: (path: string) => MediaInfo | null | undefined,
  caps: VgenCaps
): { ok: true; imageSec: number; durationSec: number } | { ok: false; error: string } {
  if (!project.music) return { ok: false, error: 'Keine Musik gewählt.' }
  const target = musicPassSamples(project.music, media)
  if (target === null) return { ok: false, error: 'Die Musik ist noch nicht analysiert.' }
  if (!project.elements.some((e) => e.kind !== 'video' && e.durationSec === null)) {
    return { ok: false, error: 'Kein Bild nutzt die Vorgabe-Standzeit.' }
  }
  const rate = rateRational(project.output.fps)
  const fps = rate[0] / rate[1]
  const lengthFor = (frames: number): { samples: number; durationSec: number } => {
    const sec = Math.round((frames / fps) * 1000) / 1000
    const plan = planVideoGen(
      { ...project, music: null, defaults: { ...project.defaults, imageSec: sec } },
      media,
      caps
    )
    const loopX = plan.loop ? musicLoopCrossfade(plan.totalSamples) : 0
    return { samples: plan.totalSamples + loopX, durationSec: plan.durationSec }
  }
  // kleinste Bildzahl, ab der die Länge reicht (die Länge wächst nie, wenn Bilder länger werden)
  let lo = Math.max(1, Math.ceil(0.1 * fps))
  let hi = Math.floor(3600 * fps)
  if (lengthFor(lo).samples >= target) {
    return { ok: false, error: 'Schon bei kürzester Standzeit ist das Video länger als die Musik.' }
  }
  if (lengthFor(hi).samples < target) {
    return { ok: false, error: 'Die Musik ist länger als eine Stunde je Bild erlaubt.' }
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (lengthFor(mid).samples >= target) hi = mid
    else lo = mid
  }
  // der nähere der beiden Nachbarn
  const a = lengthFor(lo)
  const b = lengthFor(hi)
  const best = target - a.samples <= b.samples - target ? lo : hi
  return {
    ok: true,
    imageSec: Math.round((best / fps) * 1000) / 1000,
    durationSec: (best === lo ? a : b).durationSec
  }
}

/* ----------------------------- Element-Stücke ------------------------------ */

/** Zwischenformat: H.264 nur Einzelbilder (sichtbar verlustfrei, 52 dB; ProRes 18× langsamer). */
export const INTRA_ARGS = [
  '-c:v',
  'libx264',
  '-preset',
  'ultrafast',
  '-crf',
  '12',
  '-g',
  '1',
  '-pix_fmt',
  'yuv420p'
]

function colorArgs(plan: VgenPlan, n: VgenNormalize): string {
  // nach dem Abflachen (overlay in RGB) ist die Quelle RGB
  const inPart =
    n.inMatrix && !n.alpha ? `:in_color_matrix=${n.inMatrix}:in_range=${n.inRange}` : ''
  return `${inPart}:out_color_matrix=${plan.outMatrix}:out_range=tv`
}

/**
 * Einpassen inkl. Farbumrechnung (Quelle -> Rec. 709 bzw. 601 der Ausgabe, Limited Range).
 * Liefert Graph-Teile; `from` ist das Eingangs-Label, Ergebnis-Label `fit`.
 */
function fitGraph(
  plan: VgenPlan,
  e: VgenElementPlan,
  from: string,
  withKenBurns: boolean
): string[] {
  const { width: W, height: H } = plan
  const color = colorArgs(plan, e.norm)
  switch (e.fit) {
    case 'crop':
      if (e.kind === 'image') {
        const c = e.canvas
        const scale = `scale=${c.width}:${c.height}:flags=lanczos${color},format=yuv420p`
        return [
          `[${from}]${scale}${withKenBurns || (c.width === W && c.height === H) ? '' : `,crop=${W}:${H}`}[fit]`
        ]
      }
      return [
        `[${from}]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos${color},format=yuv420p,crop=${W}:${H}[fit]`
      ]
    case 'bars':
      return [
        `[${from}]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos${color},format=yuv420p,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${plan.background}[fit]`
      ]
    case 'blur': {
      // unscharfer Hintergrund klein gerechnet (W/8) und hochskaliert – gleiche Wirkung,
      // ein Bruchteil der Rechenzeit eines boxblur in voller Größe
      const bw = even(W / 8)
      const bh = even(H / 8)
      // boxblur verlangt einen Radius unter der halben Kantenlänge der (halb so großen)
      // Farbebene; bei 1080p bleibt es bei 8
      const r = Math.max(1, Math.min(8, Math.floor(Math.min(bw, bh) / 4) - 1))
      return [
        `[${from}]scale=iw:ih${color},format=yuv420p,split=2[bg0][fg0]`,
        `[bg0]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=${r}:2,scale=${W}:${H}:flags=bicubic[bg1]`,
        `[fg0]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos[fg1]`,
        `[bg1][fg1]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[fit]`
      ]
    }
  }
}

/** Transparenz auf die Hintergrundfarbe (vor dem Einpassen, in Quellgröße). */
function flattenGraph(plan: VgenPlan, e: VgenElementPlan, from: string, to: string): string[] {
  const n = e.norm
  return [
    `color=c=${plan.background}:s=${n.codedWidth}x${n.codedHeight}:r=${rateArg(plan.fps)}[bgc]`,
    `[bgc][${from}]overlay=shortest=1:format=rgb[${to}]`
  ]
}

export interface ElementIo {
  input: string
  video: string
  audio: string
}

/**
 * ffmpeg-Argumente für das Stück eines Elements: genau `frames` Bilder in Zielgröße, -rate,
 * yuv420p, SAR 1, Farbe gekennzeichnet; dazu der Ton als WAV (48 kHz Stereo, genau `samples`).
 */
export function elementPieceArgs(plan: VgenPlan, e: VgenElementPlan, io: ElementIo): string[] {
  const N = e.frames
  const [rn, rd] = plan.rate
  const tags = setparamsFor(tagsFor(plan.outMatrix, plan.height))
  const g: string[] = []
  const input: string[] = []
  if (e.kind === 'video') {
    if (e.norm.decoder) input.push('-c:v', e.norm.decoder)
    if (e.inSec > 0) input.push('-ss', e.inSec.toFixed(6))
    // halbes Bild Zugabe: -t schneidet sonst durch Rundung das letzte Bild ab
    input.push('-t', frameTime(N + 0.5, plan.rate))
  } else if (e.kind === 'gif') {
    input.push('-ignore_loop', '0', '-t', frameTime(N + 0.5, plan.rate))
  }
  input.push('-i', io.input)

  // Bild
  const pre: string[] = []
  if (e.kind !== 'image') {
    if (e.norm.deinterlace) pre.push(`bwdif=mode=send_field:parity=${e.norm.deinterlace}:deint=all`)
    pre.push(`fps=${rateArg(plan.fps)}`)
  }
  if (e.norm.squarePixels) pre.push(SQUARE_PIXELS)
  if (e.norm.tonemap) pre.push(`${TONEMAP_HEAD},zscale=t=bt709:m=bt709:r=tv,format=yuv420p`)
  g.push(`[0:v]${pre.length ? pre.join(',') : 'null'}[pre]`)
  let from = 'pre'
  if (e.norm.alpha) {
    g.push(...flattenGraph(plan, e, from, 'flat'))
    from = 'flat'
  }
  const kb = e.kenBurns
  g.push(...fitGraph(plan, e, from, Boolean(kb)))
  const post: string[] = []
  if (e.kind === 'image') {
    // Bild EINMAL dekodieren und wiederholen (-loop 1 am Eingang dekodierte es je Bild neu).
    // Erst die Zeitbasis auf die Bildrate, dann setpts=N: in der Zeitbasis des Bild-Eingangs
    // (1/25) runden die Zeitstempel bei 29,97 fps aufeinander, und fps verwirft Bilder.
    post.push(`setsar=1,loop=loop=${N - 1}:size=1:start=0,settb=${rd}/${rn},setpts=N`)
    if (kb) {
      post.push(perspectiveFilter(kb, N))
      if (e.canvas.width !== plan.width || e.canvas.height !== plan.height) {
        post.push(`scale=${plan.width}:${plan.height}:flags=bicubic`)
      }
    }
    post.push(`fps=${rateArg(plan.fps)}`)
  } else {
    // zu kurze Clips mit dem letzten Bild auffüllen, dann exakt schneiden
    post.push(`tpad=stop_mode=clone:stop_duration=${frameTime(N + 2, plan.rate)}`)
  }
  post.push(`setsar=1,${tags},trim=end_frame=${N},setpts=PTS-STARTPTS`)
  g.push(`[fit]${post.join(',')}[v]`)

  // Ton (immer eine WAV, auch Stille – der Ton-Lauf liest nur diese)
  if (e.audioStream !== null) {
    g.push(
      `[0:${e.audioStream}]aresample=${VGEN_SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=stereo,` +
        `apad,atrim=end_sample=${e.samples},asetpts=N/SR/TB[a]`
    )
  } else {
    g.push(
      `anullsrc=r=${VGEN_SAMPLE_RATE}:cl=stereo,atrim=end_sample=${e.samples},aformat=sample_fmts=s16[a]`
    )
  }

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    ...input,
    '-filter_complex',
    g.join(';'),
    '-map',
    '[v]',
    ...INTRA_ARGS,
    io.video,
    '-map',
    '[a]',
    '-c:a',
    'pcm_s16le',
    io.audio,
    '-progress',
    'pipe:1',
    '-nostats'
  ]
}

/* ---------------------------- Übergangs-Stücke ----------------------------- */

/** Paare (a -> b) mit Übergang; bei Schleife auch letztes -> erstes. */
export function transitionPairs(plan: VgenPlan): { index: number; next: number }[] {
  const n = plan.elements.length
  const out: { index: number; next: number }[] = []
  for (let i = 0; i < n; i++) {
    const tr = plan.elements[i].transition
    if (!tr || tr.frames <= 0) continue
    if (i === n - 1 && !plan.loop) continue
    out.push({ index: i, next: (i + 1) % n })
  }
  return out
}

/**
 * Übergang als eigenes kurzes Stück, nur aus den Nachbarn: Ende von a und Anfang von b
 * (Einzelbild-Zwischendateien -> -ss springt bildgenau; ein halbes Bild Versatz, damit
 * Rundung nie das falsche Bild trifft). Nur Bild – der Ton kommt aus dem eigenen Lauf.
 */
export function transitionPieceArgs(
  plan: VgenPlan,
  index: number,
  io: { a: string; b: string; out: string }
): string[] {
  const a = plan.elements[index]
  const tr = a.transition
  if (!tr || tr.frames <= 0) throw new Error('Kein Übergang an dieser Stelle')
  const T = tr.frames
  const dur = frameTime(T, plan.rate)
  const g =
    `[0:v]trim=end_frame=${T},setpts=PTS-STARTPTS[a];` +
    `[1:v]trim=end_frame=${T},setpts=PTS-STARTPTS[b];` +
    `[a][b]xfade=transition=${tr.kind}:duration=${dur}:offset=0,trim=end_frame=${T}[v]`
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-ss',
    frameTime(a.frames - T - 0.5, plan.rate),
    '-i',
    io.a,
    '-t',
    frameTime(T + 0.5, plan.rate),
    '-i',
    io.b,
    '-filter_complex',
    g,
    '-map',
    '[v]',
    ...INTRA_ARGS,
    io.out,
    '-progress',
    'pipe:1',
    '-nostats'
  ]
}

/* ------------------------------- Bildliste --------------------------------- */

/** Pfad für ffconcat: „/“ statt „\“, „'“ maskiert. */
function concatPath(p: string): string {
  return `'${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`
}

/** Bereich der Ausgabe in Bildern: [von, bis). */
export type VgenRange = [number, number]

/** Abschnitt der Ausgabe: Mittelteil eines Elements oder ein Übergangs-Stück. */
export interface VgenSegment {
  kind: 'element' | 'transition'
  /** Element (beim Übergang: das Element davor) */
  index: number
  /** erstes Bild auf der Ausgabe-Zeitachse */
  at: number
  /** erstes Bild im Stück */
  from: number
  frames: number
  /** Länge des ganzen Stücks */
  pieceFrames: number
}

/**
 * Die Ausgabe in Abspielreihenfolge: je Element der Teil ohne Überlappungen, dazwischen die
 * Übergangs-Stücke; bei Schleife steht der Schleifen-Übergang am Ende, und Element 0 beginnt
 * hinter seinem Kopf. Grundlage für Bildliste, Vorschau-Ausschnitt und Live-Vorschau.
 */
export function outputSegments(plan: VgenPlan): VgenSegment[] {
  const n = plan.elements.length
  const out: VgenSegment[] = []
  let at = 0
  for (let i = 0; i < n; i++) {
    const e = plan.elements[i]
    const before =
      i > 0
        ? (plan.elements[i - 1].transition?.frames ?? 0)
        : plan.loop
          ? (plan.elements[n - 1].transition?.frames ?? 0)
          : 0
    const after = i < n - 1 || plan.loop ? (e.transition?.frames ?? 0) : 0
    const body = e.frames - before - after
    // ganz von Übergängen verbraucht (zwei halbe Längen): kein eigener Teil
    if (body > 0) {
      out.push({ kind: 'element', index: i, at, from: before, frames: body, pieceFrames: e.frames })
      at += body
    }
    if (after > 0) {
      out.push({ kind: 'transition', index: i, at, from: 0, frames: after, pieceFrames: after })
      at += after
    }
  }
  return out
}

/**
 * Bildliste für den concat-Demuxer: die Abschnitte der Ausgabe (inpoint/outpoint nur, wo ein
 * Stück nicht ganz gebraucht wird); `transitions[i]` = Stück nach Element i. Mit `ranges` nur
 * diese Bereiche nacheinander (Vorschau; bei Schleife auch über die Naht).
 * Exakte Bildzeiten, KEIN Versatz: Der Demuxer springt zum Schlüsselbild vor dem inpoint und
 * gibt es mit aus (anders als -ss, das verwirft) – ein halbes Bild früher brächte je inpoint
 * ein Bild zu viel. Die 6 Nachkommastellen runden beim Umrechnen in die Zeitbasis der
 * Stücke wieder exakt auf den Bildtakt (gemessen bei 29,97 fps). Alle Stücke sind
 * Einzelbild-Material, jeder Punkt ist also ein Schlüsselbild.
 */
export function concatList(
  plan: VgenPlan,
  files: { elements: (string | null)[]; transitions: (string | null)[] },
  ranges: VgenRange[] = [[0, plan.totalFrames]]
): string {
  const segs = outputSegments(plan)
  const lines = ['ffconcat version 1.0']
  for (const [a, b] of ranges) {
    for (const s of segs) {
      const s0 = Math.max(a, s.at)
      const s1 = Math.min(b, s.at + s.frames)
      if (s1 <= s0) continue
      const file = s.kind === 'element' ? files.elements[s.index] : files.transitions[s.index]
      if (!file) {
        throw new Error(
          s.kind === 'element'
            ? `Stück von Element ${s.index + 1} fehlt`
            : `Übergangs-Stück nach Element ${s.index + 1} fehlt`
        )
      }
      const pin = s.from + (s0 - s.at)
      const pout = s.from + (s1 - s.at)
      lines.push(`file ${concatPath(file)}`)
      if (pin > 0) lines.push(`inpoint ${frameTime(pin, plan.rate)}`)
      if (pout < s.pieceFrames) lines.push(`outpoint ${frameTime(pout, plan.rate)}`)
    }
  }
  return lines.join('\n') + '\n'
}

/**
 * Bereich um ein Element für „Vorschau rechnen“: das Element mit `margin` Bildern davor und
 * danach – bei Schleife über die Naht hinweg (zwei Bereiche), sonst an den Enden gekappt.
 */
export function previewRanges(plan: VgenPlan, index: number, margin: number): VgenRange[] {
  const total = plan.totalFrames
  const e = plan.elements[index]
  if (!e || total <= 0) return []
  const a = e.start - margin
  const b = e.start + e.frames + margin
  if (b - a >= total) return [[0, total]]
  if (!plan.loop) return [[Math.max(0, a), Math.min(total, b)]]
  if (a < 0) {
    return [
      [a + total, total],
      [0, b]
    ]
  }
  if (b > total) {
    return [
      [a, total],
      [0, b - total]
    ]
  }
  return [[a, b]]
}

/**
 * Wo das Ausgabebild `f` im aneinandergehängten Ausschnitt liegt (Bilder ab Anfang der
 * Vorschau); bei Schleife zählt auch f ± Gesamtlänge. null = nicht enthalten.
 */
export function rangeOffset(ranges: VgenRange[], f: number, total: number): number | null {
  let offset = 0
  for (const [a, b] of ranges) {
    for (const x of [f, f + total, f - total]) if (x >= a && x < b) return offset + (x - a)
    offset += b - a
  }
  return null
}

/** Welche Stücke ein Ausschnitt braucht (Übergänge brauchen beide Nachbarn als Eingang). */
export function piecesForRanges(
  plan: VgenPlan,
  ranges: VgenRange[]
): { elements: number[]; transitions: number[] } {
  const n = plan.elements.length
  const els = new Set<number>()
  const trs = new Set<number>()
  const segs = outputSegments(plan)
  for (const [a, b] of ranges) {
    for (const s of segs) {
      if (Math.min(b, s.at + s.frames) <= Math.max(a, s.at)) continue
      els.add(s.index)
      if (s.kind === 'transition') {
        trs.add(s.index)
        els.add((s.index + 1) % n)
      }
    }
  }
  const sorted = (x: Set<number>): number[] => [...x].sort((p, q) => p - q)
  return { elements: sorted(els), transitions: sorted(trs) }
}

/** Ebenen eines Ausgabebildes – für die Live-Vorschau (dieselbe Zeitachse wie die Datei). */
export interface VgenFrameState {
  /** ein Element, im Übergang zwei (a, dann b); local = Bild im Element */
  layers: { index: number; local: number }[]
  /** progress 0..1 wie in xfade (Bild k von T: k/T) */
  transition: { kind: VgenTransitionKind; progress: number } | null
}

/** Was das Ausgabebild `f` zeigt; bei Schleife läuft f im Kreis. */
export function frameAt(
  plan: VgenPlan,
  f: number,
  segs: VgenSegment[] = outputSegments(plan)
): VgenFrameState {
  const n = plan.elements.length
  const total = plan.totalFrames
  if (!n || total <= 0) return { layers: [], transition: null }
  const fr = plan.loop
    ? ((Math.floor(f) % total) + total) % total
    : Math.min(Math.max(0, Math.floor(f)), total - 1)
  // binäre Suche: Abschnitte liegen lückenlos hintereinander
  let lo = 0
  let hi = segs.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segs[mid].at <= fr) lo = mid
    else hi = mid - 1
  }
  const s = segs[lo]
  if (!s) return { layers: [], transition: null }
  const k = fr - s.at
  if (s.kind === 'element') {
    return { layers: [{ index: s.index, local: s.from + k }], transition: null }
  }
  const a = plan.elements[s.index]
  return {
    layers: [
      { index: s.index, local: a.frames - s.frames + k },
      { index: (s.index + 1) % n, local: k }
    ],
    transition: { kind: a.transition?.kind ?? 'fade', progress: k / s.frames }
  }
}

/* ---------------------------------- Ton ------------------------------------ */

/**
 * Ton-Graph über die WAVs der Elemente: acrossfade mit der exakten Überlappung in Samples,
 * concat bei Schnitten; bei Schleife wird der Kopf von Element 0 ans Ende geblendet. Musik:
 * Titel nacheinander (Überblendung), auf Gesamtlänge geschnitten, Blenden, Pegel, Absenken
 * unter Originalton – bei Schleife blendet ihr Ende in ihren Anfang. Ausgang: [out].
 *
 * Eingänge: die WAVs aller Elemente außer `silent` in Reihenfolge, danach die Musik-Einträge.
 * `silent` (Vorschau: nicht gerechnete Elemente) wird durch Stille exakt gleicher Länge
 * ersetzt – der Graph bleibt derselbe, der Ton im Ausschnitt also exakt der des Ergebnisses.
 * `ranges`: nur diese Bereiche nacheinander ausgeben.
 */
export function audioGraph(
  plan: VgenPlan,
  opts: { silent?: ReadonlySet<number>; ranges?: VgenRange[] } = {}
): string {
  const n = plan.elements.length
  const g: string[] = []
  const total = plan.totalSamples
  const silent = opts.silent ?? new Set<number>()
  const inputOf: string[] = []
  let k = 0
  for (let i = 0; i < n; i++) {
    if (silent.has(i)) {
      g.push(
        `anullsrc=r=${VGEN_SAMPLE_RATE}:cl=stereo,atrim=end_sample=${plan.elements[i].samples},aformat=sample_fmts=s16[s${i}]`
      )
      inputOf.push(`s${i}`)
    } else inputOf.push(`${k++}:a`)
  }
  let cur = inputOf[0]
  if (plan.loop) {
    const head = plan.elements[0].headSamples
    if (head > 0) {
      g.push(`[${inputOf[0]}]asplit=2[h0][b0]`)
      g.push(`[h0]atrim=end_sample=${head},asetpts=N/SR/TB[head]`)
      g.push(`[b0]atrim=start_sample=${head},asetpts=N/SR/TB[x0]`)
      cur = 'x0'
    }
  }
  for (let i = 1; i < n; i++) {
    const o = plan.elements[i - 1].transition?.samples ?? 0
    const next = `x${i}`
    g.push(
      o > 0
        ? `[${cur}][${inputOf[i]}]acrossfade=ns=${o}:c1=tri:c2=tri[${next}]`
        : `[${cur}][${inputOf[i]}]concat=n=2:v=0:a=1[${next}]`
    )
    cur = next
  }
  if (plan.loop && plan.elements[0].headSamples > 0) {
    g.push(`[${cur}][head]acrossfade=ns=${plan.elements[0].headSamples}:c1=tri:c2=tri[xl]`)
    cur = 'xl'
  }
  g.push(`[${cur}]aformat=sample_fmts=fltp:channel_layouts=stereo[mix]`)
  const full = opts.ranges ? 'full' : 'out'
  const mp = plan.music
  if (mp) {
    const norm = `aresample=${VGEN_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB`
    // Titel nacheinander: ein Eingang je Vorkommen
    mp.entries.forEach((_, j) => g.push(`[${k + j}:a]${norm}[m${j}]`))
    let mc = 'm0'
    for (let j = 1; j < mp.entries.length; j++) {
      const x = mp.entries[j - 1].crossfade
      g.push(
        x > 0
          ? `[${mc}][m${j}]acrossfade=ns=${x}:c1=tri:c2=tri[mc${j}]`
          : `[${mc}][m${j}]concat=n=2:v=0:a=1[mc${j}]`
      )
      mc = `mc${j}`
    }
    const after = [`volume=${num(mp.gainDb)}dB`]
    // Absenken in 10-ms-Blöcken (eval=frame rechnet je Block; 1024er-Blöcke stufen hörbar)
    if (mp.duck) after.push(`asetnsamples=n=480:p=0,volume='${duckExpr(mp.duck)}':eval=frame`)
    if (plan.loop) {
      // Ende der Musik in ihren Anfang blenden: A = Musik ab C, B = die ersten C Samples
      const C = mp.loopCrossfade
      g.push(`[${mc}]asplit=2[ma][mb]`)
      g.push(`[ma]atrim=start_sample=${C}:end_sample=${total + C},asetpts=N/SR/TB[mA]`)
      g.push(`[mb]atrim=end_sample=${C},asetpts=N/SR/TB[mB]`)
      g.push(
        C > 0
          ? `[mA][mB]acrossfade=ns=${C}:c1=tri:c2=tri,asetpts=N/SR/TB,${after.join(',')}[mus]`
          : `[mA]${after.join(',')}[mus]`
      )
    } else {
      const sec = total / VGEN_SAMPLE_RATE
      const fi = Math.max(0, Math.min(mp.fadeInSec, sec / 2))
      const fo = Math.max(0, Math.min(mp.fadeOutSec, sec / 2))
      const fades = [
        fi > 0 ? `afade=t=in:d=${num(fi)}` : null,
        fo > 0 ? `afade=t=out:st=${num(sec - fo)}:d=${num(fo)}` : null
      ].filter((f): f is string => f !== null)
      g.push(
        `[${mc}]atrim=end_sample=${total},asetpts=N/SR/TB,${[...fades, ...after].join(',')}[mus]`
      )
    }
    g.push(`[mix][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]`)
    g.push(`[mixed]apad,atrim=end_sample=${total},asetpts=N/SR/TB[${full}]`)
  } else {
    g.push(`[mix]apad,atrim=end_sample=${total},asetpts=N/SR/TB[${full}]`)
  }
  if (opts.ranges) {
    const r = opts.ranges
    const trim = (i: number, from: string): string =>
      `[${from}]atrim=start_sample=${sampleAt(r[i][0], plan.rate)}:end_sample=${sampleAt(r[i][1], plan.rate)},asetpts=N/SR/TB`
    if (r.length === 1) g.push(`${trim(0, 'full')}[out]`)
    else {
      g.push(`[full]asplit=${r.length}${r.map((_, i) => `[f${i}]`).join('')}`)
      r.forEach((_, i) => g.push(`${trim(i, `f${i}`)}[r${i}]`))
      g.push(`${r.map((_, i) => `[r${i}]`).join('')}concat=n=${r.length}:v=0:a=1[out]`)
    }
  }
  return g.join(';\n')
}

/**
 * Ton-Lauf: liest nur die kleinen WAVs (null = nicht gerechnet, im Graph Stille) und die
 * Musik-Einträge und schreibt den Mix als 32-bit-float-WAV (Summen können über 0 dBFS gehen,
 * die Lautheit regelt danach). Der Graph steht in einer Datei (`-/filter_complex`): bei vielen
 * Elementen sprengt er sonst die Windows-Kommandozeile (32.767 Zeichen).
 */
export function audioRun(
  plan: VgenPlan,
  io: { wavs: (string | null)[]; graphFile: string; out: string },
  ranges?: VgenRange[]
): { args: string[]; graph: string } {
  const silent = new Set<number>()
  const args = ['-hide_banner', '-nostdin', '-y']
  io.wavs.forEach((w, i) => {
    if (w) args.push('-i', w)
    else silent.add(i)
  })
  for (const e of plan.music?.entries ?? []) args.push('-i', e.path)
  args.push(
    ...['-/filter_complex', io.graphFile, '-map', '[out]', '-c:a', 'pcm_f32le', io.out],
    ...['-progress', 'pipe:1', '-nostats']
  )
  return { args, graph: audioGraph(plan, { silent, ranges }) }
}

/* ------------------------------- Cache & Platz ----------------------------- */

/** Schlüssel eines Element-Stücks: Quelle (Pfad, Größe, Änderungszeit) + genau der Befehl. */
export function elementCacheKey(plan: VgenPlan, e: VgenElementPlan): string {
  const args = elementPieceArgs(plan, e, { input: 'IN', video: 'V', audio: 'A' })
  return hash53(
    JSON.stringify({
      v: VGEN_PLAN_VERSION,
      src: [e.path.toLowerCase(), e.sizeBytes, e.modifiedMs],
      args
    })
  )
}

/** Schlüssel eines Übergangs-Stücks: beide Element-Stücke + Befehl. */
export function transitionCacheKey(plan: VgenPlan, index: number, next: number): string {
  const args = transitionPieceArgs(plan, index, { a: 'A', b: 'B', out: 'O' })
  return hash53(
    JSON.stringify({
      v: VGEN_PLAN_VERSION,
      a: elementCacheKey(plan, plan.elements[index]),
      b: elementCacheKey(plan, plan.elements[next]),
      args
    })
  )
}

/** Platzbedarf der Zwischendateien (gemessen ≈ 43 Mbit/s bei 1080p25 → je Bild ≈ 215 kB). */
export function estimateCacheBytes(plan: VgenPlan): number {
  const perFrame = 215_000 * ((plan.width * plan.height) / (1920 * 1080))
  const frames =
    plan.elements.reduce((s, e) => s + e.frames, 0) +
    transitionPairs(plan).reduce((s, p) => s + (plan.elements[p.index].transition?.frames ?? 0), 0)
  const audio = plan.elements.reduce((s, e) => s + e.samples * 4, 0) + plan.totalSamples * 8
  return Math.round(frames * perFrame + audio)
}

/* -------------------------------- Endlauf ---------------------------------- */

/**
 * Bildfilter des Endlaufs: vom Zwischenformat (yuv420p, Farbe gekennzeichnet) ins Pixelformat
 * des Ziels – HAP rechnet nach RGB (Matrix der Ausgabe ausdrücklich, sonst nähme swscale
 * Rec. 601), ProRes 4:2:2 10 bit, H.264/H.265 bleiben 4:2:0.
 */
export function finalVideoFilter(plan: VgenPlan, format: ConvertFormat): string {
  const family = CONVERT_FORMATS[format].family
  const tags = setparamsFor(tagsFor(plan.outMatrix, plan.height))
  if (family === 'hap') return `scale=in_color_matrix=${plan.outMatrix}:in_range=tv,format=rgba`
  if (family === 'prores') return `format=yuv422p10le,${tags}`
  return `format=yuv420p,${tags}`
}

/** Ton der Ausgabe: AAC im MP4, PCM 16 bit im MOV (ProRes/HAP). */
export function finalAudioArgs(format: ConvertFormat): string[] {
  return CONVERT_FORMATS[format].container === 'mp4'
    ? ['-c:a', 'aac', '-b:a', '192k']
    : ['-c:a', 'pcm_s16le']
}

/* ----------------------------- Vorschau rechnen ---------------------------- */

/** Größe für „Vorschau rechnen“: längere Seite höchstens `max` px, gerade Maße. */
export function previewSize(
  width: number,
  height: number,
  max = 640
): { width: number; height: number } {
  const s = Math.min(1, max / Math.max(width, height))
  return { width: even(width * s), height: even(height * s) }
}

/**
 * Endlauf der Vorschau: Bildliste des Ausschnitts + Ton-Mix -> kleines H.264/AAC-MP4, das
 * <video> direkt abspielt (faststart: Kopf vorn, Springen ohne ganze Datei).
 */
export function previewFinalArgs(plan: VgenPlan, list: string, mix: string, out: string): string[] {
  return [
    ...['-hide_banner', '-nostdin', '-f', 'concat', '-safe', '0', '-i', list, '-i', mix],
    ...['-map', '0:v', '-map', '1:a', '-vf', finalVideoFilter(plan, 'h264')],
    ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', String(Math.round(plan.fps))],
    ...['-fps_mode', 'cfr', '-r', rateArg(plan.fps)],
    ...['-c:a', 'aac', '-b:a', '128k', '-ar', String(VGEN_SAMPLE_RATE), '-ac', '2'],
    ...['-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', out]
  ]
}
