// Stammdaten des LED-Wall-Konfigurators: Modultypen des Bestands, Ballast-Tabelle
// (kg pro LSU-Standfuß nach Wandhöhe) und die Farbpaletten der Verkabelungs-Ketten.
// Quelle: bestehender Konfigurator (LEDWall-Konfigurator-v2) – Werte unverändert.

export interface LedModule {
  name: string
  pitch: number // Pixelpitch in mm
  brightness: number // nit (typischer Wert)
  brightnessMax?: number // nit (max. mit Spezial-Konfiguration)
  weight: number // kg pro Modul
  powerTyp: number // W typisch
  powerMax: number // W max
  resX: number // px pro Modul
  resY: number
  dimW: number // mm
  dimH: number
  dimD: number
  ip: string
  contrast: string
  connector: string
  viewAngle: string
  refresh: number // Hz
  tag: string
  canCurve: boolean
  maxAngle?: number // Grad pro Modul
  minRadius?: number // m
}

export const MODULES: Record<string, LedModule> = {
  '496-2,0': {
    name: '496-2,0',
    pitch: 2.06,
    brightness: 800,
    brightnessMax: 1000,
    weight: 7.5,
    powerTyp: 80,
    powerMax: 180,
    resX: 240,
    resY: 240,
    dimW: 496,
    dimH: 496,
    dimD: 55,
    ip: 'IP40',
    contrast: '6.000:1',
    connector: 'Seetronic TR1',
    viewAngle: '170°',
    refresh: 3840,
    tag: 'Indoor Fine-Pitch',
    canCurve: false
  },
  'uS2+': {
    name: 'uS2+',
    pitch: 2.6,
    brightness: 1200,
    weight: 8.5,
    powerTyp: 60,
    powerMax: 180,
    resX: 192,
    resY: 192,
    dimW: 500,
    dimH: 500,
    dimD: 80,
    ip: 'IP20',
    contrast: '5.500:1',
    connector: 'Neutrik powerCON TRUE1 TOP',
    viewAngle: '140°',
    refresh: 3840,
    tag: 'Indoor Curved',
    canCurve: true,
    maxAngle: 45,
    minRadius: 0.637
  },
  rX3ioBF: {
    name: 'rX3ioBF',
    pitch: 3.906,
    brightness: 5000,
    weight: 9.7,
    powerTyp: 80,
    powerMax: 190,
    resX: 128,
    resY: 128,
    dimW: 500,
    dimH: 500,
    dimD: 100,
    ip: 'IP65',
    contrast: '4.500:1',
    connector: 'Neutrik powerCON TRUE1',
    viewAngle: '85°',
    refresh: 3840,
    tag: 'Outdoor IP65',
    canCurve: false
  }
}

export const DEFAULT_MODULE_KEY = '496-2,0'

/** Ballast (kg) pro LSU-Standfuß, gestaffelt nach Wandhöhe (m). */
export const BALLAST: { h: number; kg: number }[] = [
  { h: 2, kg: 17 },
  { h: 2.5, kg: 38 },
  { h: 3, kg: 64 },
  { h: 3.5, kg: 95 },
  { h: 4, kg: 131 },
  { h: 4.5, kg: 151 },
  { h: 5, kg: 173 },
  { h: 5.5, kg: 198 },
  { h: 6, kg: 226 }
]

/** Kettenfarben Signal / Strom (kontraststark auf hell und dunkel). */
export const SIG_COLORS = ['#4ecdc4', '#ffce2e', '#a78bfa', '#ff6b6b', '#34d399', '#f472b6', '#60a5fa', '#fb923c', '#e879f9', '#2dd4bf', '#fbbf24', '#c084fc', '#38bdf8', '#f87171', '#a3e635', '#818cf8']
export const PWR_COLORS = ['#ff6b6b', '#fb923c', '#ffce2e', '#34d399', '#4ecdc4', '#60a5fa', '#a78bfa', '#f472b6', '#e879f9', '#2dd4bf', '#fbbf24', '#c084fc', '#38bdf8', '#f87171', '#a3e635', '#818cf8']

/** Mögliche uS2+-Vollkreise (gleicher Winkel je Modul, 0,5 m Modulbreite). */
export const CIRCLE_TABLE: { angle: number; mods: number; circ: number; r: number }[] = [
  { angle: 45, mods: 8, circ: 4, r: 0.637 },
  { angle: 40, mods: 9, circ: 4.5, r: 0.716 },
  { angle: 30, mods: 12, circ: 6, r: 0.955 },
  { angle: 22.5, mods: 16, circ: 8, r: 1.273 },
  { angle: 20, mods: 18, circ: 9, r: 1.432 },
  { angle: 15, mods: 24, circ: 12, r: 1.91 },
  { angle: 10, mods: 36, circ: 18, r: 2.865 },
  { angle: 7.5, mods: 48, circ: 24, r: 3.82 }
]

/** Modulbreite uS2+ (m) und Modultiefe (m) für die Draufsicht-Geometrie. */
export const MODULE_W = 0.5
export const MODULE_D = 0.08
