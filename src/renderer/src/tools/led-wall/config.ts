// LED-Wall-Planung als Daten: Felder, Vorgaben und EINE Prüfung für alles, was von außen kommt –
// gespeicherter Stand (Migration), Vorlagen und Projektdatei. Rein und getestet (config.test.ts);
// der Store (store.ts) und die Projektdatei-Anbindung nutzen dieselben Funktionen.
//
// Version 2 (Oktober 2026) bringt die Felder für den Kabelverlauf mit (Einspeisepunkt, Reihenfolge
// je Kette, Ports, Stromkreise, Backup-Leitungen, Prozessor). Leer heißt „Vorschlag“ – das
// Verhalten bleibt gleich, bis die Bedienung dafür kommt (docs/PLAN-MINI-MANUAL.md, Phase 2).

import { digest } from '@shared/projectFile'
import { CIRCLE_TABLE, DEFAULT_MODULE_KEY, MODULES } from './data'
import type { BuilderSegment } from './math'

export type BuildMode = 'stacked' | 'flying'
export type CurveMode = 'circle' | 'segment' | 'builder' | 'squircle'

/** Ecke im Bereich einer Kette (Start der Schlange) */
export type Corner = 'tl' | 'tr' | 'bl' | 'br'
/**
 * Einspeisepunkt: wo die Zuleitungen vom Prozessor an der Wand ankommen – Mitte der Kante bzw.
 * der Wand. Er wird nicht gezeichnet (Plan bleibt übersichtlich), sondern bestimmt nur die
 * vorgeschlagene Startecke je Kette und die ungefähre Zuleitungslänge.
 */
export type Feed = 'left' | 'right' | 'top' | 'bottom' | 'center'

export interface ChainRoute {
  /** fehlt = Vorschlag: Ecke mit der kürzesten Zuleitung */
  start?: Corner
  /** fehlt = Vorschlag (senkrecht, wenn der Bereich höher als breit ist) */
  axis?: 'row' | 'col'
  /** Handkorrektur: Reihenfolge der Module [Zeile, Spalte] */
  order?: [number, number][]
}
export interface SigChainMeta extends ChainRoute {
  port?: string
  /** Backup-Leitung vom letzten Modul zurück zum Prozessor; null/fehlt = keine */
  backup?: { port?: string } | null
}
export interface PwrChainMeta extends ChainRoute {
  circuit?: string
  phase?: 'L1' | 'L2' | 'L3'
}

export type ProcessorModel = 'novapro-uhd-jr' | 'vx4s' | 'tessera-s8' | 'frei'
export interface ProcessorConfig {
  /** null = Vorbelegung je Modul */
  model: ProcessorModel | null
  bitDepth: 8 | 10 | 12
  hz: number
  /** nur bei „frei“ */
  ports?: number
  portPx?: number
  totalPx?: number
}

/** Reine Konfigurationsfelder (das, was eine gespeicherte Vorlage ausmacht). */
export interface LedWallConfig {
  moduleKey: string
  widthM: string // Eingaben als Text (Komma-tolerant), geparst wird beim Rechnen
  heightM: string
  projectName: string
  customerName: string
  buildMode: BuildMode
  sig: number[][] // -1 = frei, sonst Ketten-Index
  pwr: number[][]
  sigChain: number
  pwrChain: number
  curveMode: CurveMode
  // Curving teilt sich die Wandbreite (widthM = Sehne/Squircle-Breite); nur die
  // kurvenspezifische Tiefe und der gewählte Vollkreis sind eigene Felder.
  segSag: string
  builderSegs: BuilderSegment[]
  sqD: string
  sqCorner: number
  selectedCircle: number // Index in CIRCLE_TABLE
  pdfLandscape: boolean // PDF-Doku im Querformat (Default: ja – Pläne sind breit)
  // ab Version 2: Kabelverlauf (Schlüssel = Ketten-Index als Text)
  sigMeta: Record<string, SigChainMeta>
  pwrMeta: Record<string, PwrChainMeta>
  feed: Feed
  /** Vorgabe für neue Signalketten: mit Backup-Leitung (ab Werk aus) */
  redundancy: boolean
  mains: { voltage: number; breakerA: number }
  processor: ProcessorConfig
}

/** Bedienzustand – gehört in Vorlagen, aber nicht in die Projektdatei (sonst wäre schon das
 *  Umschalten der aktiven Kette oder des PDF-Formats eine „ungespeicherte Änderung“). */
const UI_ONLY = ['sigChain', 'pwrChain', 'pdfLandscape'] as const
export type LedWallSection = Omit<LedWallConfig, (typeof UI_ONLY)[number]>

/** Schema-Version des Abschnitts in der Projektdatei */
export const LED_WALL_SECTION_VERSION = 2

export const DEFAULT_LED_WALL_CONFIG: LedWallConfig = {
  moduleKey: DEFAULT_MODULE_KEY,
  widthM: '4',
  heightM: '2,5',
  projectName: '',
  customerName: '',
  buildMode: 'stacked',
  sig: [],
  pwr: [],
  sigChain: 0,
  pwrChain: 0,
  curveMode: 'circle',
  segSag: '0,5',
  builderSegs: [
    { type: 'straight', count: 3 },
    { type: 'curved', count: 6, angle: 45, dir: 'convex' },
    { type: 'straight', count: 3 }
  ],
  sqD: '2',
  sqCorner: 3,
  selectedCircle: 0,
  pdfLandscape: true,
  sigMeta: {},
  pwrMeta: {},
  feed: 'bottom',
  redundancy: false,
  mains: { voltage: 230, breakerA: 16 },
  processor: { model: null, bitDepth: 8, hz: 60 }
}

export const CONFIG_KEYS = Object.keys(DEFAULT_LED_WALL_CONFIG) as (keyof LedWallConfig)[]

const FEEDS: Feed[] = ['left', 'right', 'top', 'bottom', 'center']
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br']
const PROCESSORS: ProcessorModel[] = ['novapro-uhd-jr', 'vx4s', 'tessera-s8', 'frei']
/**
 * Größtes Raster je Seite (Spalten bzw. Reihen) – auch Obergrenze für Builder-Module. Breite und
 * Höhe sind in der Oberfläche frei, die App erzeugt also selbst große Raster (100 m Wand = 202
 * Spalten); diese Grenze schützt nur die Prüfung. Die Gesamtgröße deckelt die Abschnittsgrenze der
 * Projektdatei (PROJECT_LIMITS.sectionDataBytes).
 */
export const GRID_SIDE_MAX = 1000
const LIMITS = { gridSide: GRID_SIDE_MAX, chains: 999, orderLen: 40_000, meta: 400, label: 40 }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const oneOf = <T>(v: unknown, list: readonly T[]): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined
const int = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined
const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length <= max ? v : undefined

function grid(v: unknown): number[][] | undefined {
  if (!Array.isArray(v) || v.length > LIMITS.gridSide) return undefined
  const out: number[][] = []
  for (const row of v) {
    if (!Array.isArray(row) || row.length > LIMITS.gridSide) return undefined
    const r: number[] = []
    for (const c of row) {
      const n = int(c, -1, LIMITS.chains)
      if (n === undefined) return undefined
      r.push(n)
    }
    out.push(r)
  }
  return out
}

function builderSegs(v: unknown): BuilderSegment[] | undefined {
  // Grenzen wie das, was die App selbst erzeugt („Im Builder weiterbearbeiten“ aus einem großen
  // Kreissegment hat mehr als 50 Module) – sonst fiele beim Öffnen die ganze Form weg
  if (!Array.isArray(v) || v.length === 0 || v.length > LIMITS.gridSide) return undefined
  const out: BuilderSegment[] = []
  for (const s of v) {
    if (!isObj(s)) return undefined
    const count = int(s.count, 1, LIMITS.gridSide)
    if (count === undefined) return undefined
    if (s.type === 'straight') out.push({ type: 'straight', count })
    else if (s.type === 'curved') {
      // über Anzahl × 45° kappen statt verwerfen: so rechnet die App ohnehin (distributeAngles),
      // und ein später verkleinerter Bogen behält seinen alten Winkel
      const raw = num(s.angle, 2.5, LIMITS.gridSide * 45)
      const dir = oneOf(s.dir, ['convex', 'concave'] as const)
      if (raw === undefined || !dir) return undefined
      out.push({ type: 'curved', count, angle: Math.min(raw, count * 45), dir })
    } else return undefined
  }
  return out
}

function route(v: Obj): ChainRoute {
  const r: ChainRoute = {}
  const start = oneOf(v.start, CORNERS)
  if (start) r.start = start
  const axis = oneOf(v.axis, ['row', 'col'] as const)
  if (axis) r.axis = axis
  if (Array.isArray(v.order) && v.order.length <= LIMITS.orderLen) {
    const order: [number, number][] = []
    for (const p of v.order) {
      const row = Array.isArray(p) ? int(p[0], 0, LIMITS.gridSide - 1) : undefined
      const col = Array.isArray(p) ? int(p[1], 0, LIMITS.gridSide - 1) : undefined
      if (row === undefined || col === undefined || p.length !== 2) {
        order.length = 0
        break
      }
      order.push([row, col])
    }
    if (order.length) r.order = order
  }
  return r
}

function metaMap<T>(v: unknown, item: (o: Obj) => T): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isObj(v)) return out
  for (const [k, val] of Object.entries(v).slice(0, LIMITS.meta)) {
    if (/^\d{1,3}$/.test(k) && isObj(val)) out[k] = item(val)
  }
  return out
}

function sigMeta(v: Obj): SigChainMeta {
  const m: SigChainMeta = route(v)
  const port = text(v.port, LIMITS.label)
  if (port !== undefined) m.port = port
  if (v.backup === null) m.backup = null
  else if (isObj(v.backup)) {
    const bport = text(v.backup.port, LIMITS.label)
    m.backup = bport !== undefined ? { port: bport } : {}
  }
  return m
}

function pwrMeta(v: Obj): PwrChainMeta {
  const m: PwrChainMeta = route(v)
  const circuit = text(v.circuit, LIMITS.label)
  if (circuit !== undefined) m.circuit = circuit
  const phase = oneOf(v.phase, ['L1', 'L2', 'L3'] as const)
  if (phase) m.phase = phase
  return m
}

function processor(v: unknown, d: ProcessorConfig): ProcessorConfig {
  if (!isObj(v)) return { ...d }
  const p: ProcessorConfig = {
    model: v.model === null ? null : (oneOf(v.model, PROCESSORS) ?? d.model),
    bitDepth: oneOf(v.bitDepth, [8, 10, 12] as const) ?? d.bitDepth,
    hz: num(v.hz, 1, 1000) ?? d.hz
  }
  const ports = int(v.ports, 1, 64)
  const portPx = int(v.portPx, 1, 100_000_000)
  const totalPx = int(v.totalPx, 1, 1_000_000_000)
  if (ports !== undefined) p.ports = ports
  if (portPx !== undefined) p.portPx = portPx
  if (totalPx !== undefined) p.totalPx = totalPx
  return p
}

/**
 * Planung aus fremder oder älterer Quelle feldweise prüfen: Gültiges bleibt, Ungültiges oder
 * Fehlendes wird zur Vorgabe. So werden Version-1-Stände (ohne Kabelverlauf) und Vorlagen
 * vollständig, und eine Datei vom Kollegen kann nichts Unsinniges in den Store tragen.
 */
export function sanitizeLedWallConfig(
  raw: unknown,
  base: LedWallConfig = DEFAULT_LED_WALL_CONFIG
): LedWallConfig {
  const v: Obj = isObj(raw) ? raw : {}
  const mainsIn = isObj(v.mains) ? v.mains : {}
  const selectedCircle = int(v.selectedCircle, 0, CIRCLE_TABLE.length - 1)
  return {
    // hasOwn: „constructor“ o. Ä. aus einer fremden Datei wäre sonst ein „Modul“ (alles NaN)
    moduleKey:
      typeof v.moduleKey === 'string' && Object.hasOwn(MODULES, v.moduleKey)
        ? v.moduleKey
        : base.moduleKey,
    widthM: text(v.widthM, 20) ?? base.widthM,
    heightM: text(v.heightM, 20) ?? base.heightM,
    projectName: text(v.projectName, 200) ?? base.projectName,
    customerName: text(v.customerName, 200) ?? base.customerName,
    buildMode: oneOf(v.buildMode, ['stacked', 'flying'] as const) ?? base.buildMode,
    sig: grid(v.sig) ?? base.sig.map((r) => [...r]),
    pwr: grid(v.pwr) ?? base.pwr.map((r) => [...r]),
    sigChain: int(v.sigChain, 0, LIMITS.chains) ?? base.sigChain,
    pwrChain: int(v.pwrChain, 0, LIMITS.chains) ?? base.pwrChain,
    curveMode:
      oneOf(v.curveMode, ['circle', 'segment', 'builder', 'squircle'] as const) ?? base.curveMode,
    segSag: text(v.segSag, 20) ?? base.segSag,
    builderSegs: builderSegs(v.builderSegs) ?? base.builderSegs.map((s) => ({ ...s })),
    sqD: text(v.sqD, 20) ?? base.sqD,
    sqCorner: int(v.sqCorner, 2, 36) ?? base.sqCorner,
    selectedCircle: selectedCircle ?? base.selectedCircle,
    pdfLandscape: typeof v.pdfLandscape === 'boolean' ? v.pdfLandscape : base.pdfLandscape,
    sigMeta: 'sigMeta' in v ? metaMap(v.sigMeta, sigMeta) : structuredClone(base.sigMeta),
    pwrMeta: 'pwrMeta' in v ? metaMap(v.pwrMeta, pwrMeta) : structuredClone(base.pwrMeta),
    feed: oneOf(v.feed, FEEDS) ?? base.feed,
    redundancy: typeof v.redundancy === 'boolean' ? v.redundancy : base.redundancy,
    mains: {
      voltage: num(mainsIn.voltage, 100, 400) ?? base.mains.voltage,
      breakerA: num(mainsIn.breakerA, 1, 125) ?? base.mains.breakerA
    },
    processor: processor(v.processor, base.processor)
  }
}

/** Nur die Konfigurationsfelder (ohne Vorlagen, Bindung, Methoden) – tief kopiert. */
export function pickConfig(s: LedWallConfig): LedWallConfig {
  const out = {} as Record<keyof LedWallConfig, unknown>
  for (const k of CONFIG_KEYS) out[k] = s[k]
  return structuredClone(out as LedWallConfig)
}

/** Daten des Abschnitts in der Projektdatei: Konfiguration ohne Bedienzustand. */
export function ledWallSection(s: LedWallConfig): LedWallSection {
  const c = pickConfig(s) as Partial<LedWallConfig>
  for (const k of UI_ONLY) delete c[k]
  return c as LedWallSection
}

/** Leere Raster (alle Module frei) zählen wie „noch nichts verkabelt“. */
function normalizedSection(s: LedWallConfig): LedWallSection {
  const sec = ledWallSection(s)
  const empty = (g: number[][]): boolean => g.every((r) => r.every((c) => c === -1))
  if (empty(sec.sig)) sec.sig = []
  if (empty(sec.pwr)) sec.pwr = []
  return sec
}

/** Steht noch die Vorgabe drin (nichts, was beim Ersetzen verloren ginge)? */
export function isDefaultPlanning(s: LedWallConfig): boolean {
  return digest(normalizedSection(s)) === digest(normalizedSection(DEFAULT_LED_WALL_CONFIG))
}

/** Kurz für Rückfragen: „Messe · Beispiel GmbH, 4 × 2,5 m, 496-2,0“ */
export function describePlanning(data: unknown): string {
  const c = sanitizeLedWallConfig(data)
  const who = [c.projectName.trim(), c.customerName.trim()].filter(Boolean).join(' · ')
  return `${who || 'ohne Projektnamen'}, ${c.widthM} × ${c.heightM} m, ${c.moduleKey}`
}
