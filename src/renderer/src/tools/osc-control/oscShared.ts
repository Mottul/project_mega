// Gemeinsames der OSC-Steuerung: Rastermaße, Geräte-Vorschau, Zahl- und Farbhilfen,
// OSC-Nachrichten, der Video-Kontext für die Meter und die Typen der Sende-Rückrufe.

import { createContext } from 'react'
import type { OscArg, OscMessage } from '@shared/types'
import type { OscWidget } from './store'

/** Höhe einer Rasterzeile (px) und Abstand zwischen den Kacheln (px). Bewusst
 *  fein -> Fader/Buttons lassen sich klein und trotzdem bedienbar legen. */
export const ROW_H = 38
export const GAP = 8

/** Geräte-Vorschau: logische Auflösung (CSS-Pixel) gängiger Geräte, Hochformat. */
export type DeviceKey = 'off' | 'phone' | 'tablet'
export const DEVICES: Record<Exclude<DeviceKey, 'off'>, { w: number; h: number; label: string }> = {
  phone: { w: 390, h: 844, label: 'Handy' },
  tablet: { w: 834, h: 1112, label: 'Tablet' }
}

/* ------------------------------- Hilfen --------------------------------- */

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
export const clamp = (n: number, a: number, b: number): number => (n < a ? a : n > b ? b : n)
export const clampInt = (n: number, a: number, b: number): number =>
  Math.min(b, Math.max(a, Math.round(Number.isFinite(n) ? n : a)))

export function rgb01ToHex(r: number, g: number, b: number): string {
  const h = (x: number): string =>
    Math.round(clamp01(x) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1], 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}
export function rgb2hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = 0
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: mx === 0 ? 0 : d / mx, v: mx }
}
export function hsv2rgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r: number
  let g: number
  let b: number
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: r + m, g: g + m, b: b + m }
}
export function argVal(a: OscArg): number | string | boolean {
  return a.type === 'T' ? true : a.type === 'F' ? false : a.value
}
export function fmsg(address: string, value: number): OscMessage {
  return { address, args: [{ type: 'f', value }] }
}
export function fmtArgs(args: (number | string | boolean)[]): string {
  return args
    .map((v) =>
      typeof v === 'number'
        ? Number.isInteger(v)
          ? String(v)
          : v.toFixed(3)
        : typeof v === 'boolean'
          ? v
            ? 'T'
            : 'F'
          : JSON.stringify(v)
    )
    .join('  ')
}

export const HAS_EYEDROPPER = typeof window !== 'undefined' && 'EyeDropper' in window
export const HUE_GRADIENT =
  'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'

// Restzeit eines laufenden Videos (für die Anzeige/Meter-Quelle „Video"). Wird
// von OscControl aus dem Video-Player gespeist und von den Meter-Kacheln gelesen.
export interface VideoInfo {
  playing: boolean
  remainingSec: number | null
  durationSec: number
}
export const VideoCtx = createContext<VideoInfo>({
  playing: false,
  remainingSec: null,
  durationSec: 0
})

/** Sekunden als m:ss bzw. h:mm:ss. */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}
// Schachbrett-Hintergrund (zeigt Transparenz hinter dem Alpha-Regler).
export const CHECKER = 'repeating-conic-gradient(#0006 0% 25%, #fff3 0% 50%) 50% / 10px 10px'

export interface LogEntry {
  id: number
  dir: 'out' | 'in'
  address: string
  args: (number | string | boolean)[]
  at: number
}

export type SendFn = (msg: OscMessage) => void
export type SendMany = (msgs: OscMessage[]) => void
// NovaStar-Widget ausführen. `arg`: Fader=Helligkeit 0..100, Schalter=0/1,
// Taster=1 (Druck), Auswahl=Preset-Nummer.
export type Nova = (w: OscWidget, arg: number) => void
