// Prozessoren und Kapazität der Signalketten – rein und getestet (processors.test.ts).
// Werte nur aus den Handbüchern (Quelle je Prozessor), ausgewertet im Plan
// (docs/PLAN-MINI-MANUAL.md, „Kabelverlauf“, Festlegungen 31–34):
//   Grenze je Port = kleinerer Wert aus Prozessor und Empfangskarte.
// Zwei Wände desselben Moduls können sich einen Prozessor teilen („wie Wand 1“): Ports werden
// dann fortlaufend vergeben, Port- und Gesamtkapazität zählen gemeinsam.

import { chainCells } from './cabling'
import type { LedWallConfig, PlannedWall, ProcessorModel, SigChainMeta } from './config'
import { MODULES } from './data'

type Bit = 8 | 10 | 12

export interface ProcessorSpec {
  name: string
  ports: number
  bitDepths: Bit[]
  /** Grenze je Port laut Prozessor */
  portPx: (bit: Bit, hz: number) => number
  totalPx: (bit: Bit, hz: number) => number
  maxW?: number
  maxH?: number
  /** NovaStar: Backup auf einem beliebigen freien Port; Tessera: geschlossene Schleife über Portpaare */
  backup: 'port' | 'pairs'
  source: string
}

/** Tessera: Pixel × Bildrate je 1G-Port (Tabelle „Output Capacity“) */
const TESSERA_K: Record<Bit, number> = { 8: 31_500_000, 10: 25_200_000, 12: 21_000_000 }

export const PROCESSORS: Record<Exclude<ProcessorModel, 'frei'>, ProcessorSpec> = {
  'novapro-uhd-jr': {
    name: 'NovaPro UHD Jr',
    ports: 16,
    bitDepths: [8, 10, 12],
    portPx: (bit) => (bit === 8 ? 650_000 : 320_000),
    totalPx: () => 10_400_000,
    maxW: 16384,
    maxH: 8192,
    backup: 'port',
    source: 'Handbuch NovaPro UHD Jr V1.5.2'
  },
  vx4s: {
    name: 'VX4S',
    ports: 4,
    bitDepths: [8],
    portPx: () => 650_000,
    totalPx: () => 2_300_000,
    maxW: 3840,
    maxH: 1920,
    backup: 'port',
    source: 'Handbuch VX4/VX4S Rev 1.1.2 (Ports, Breite, Höhe); je Port und gesamt Richtwerte'
  },
  'tessera-s8': {
    name: 'Tessera S8',
    ports: 8,
    bitDepths: [8, 10, 12],
    portPx: (bit, hz) => Math.round(TESSERA_K[bit] / hz),
    // nominal 4,5 Mio. px; höhere Bildraten senken sie wie beim SX40
    totalPx: (_bit, hz) => Math.round(4_500_000 * Math.min(1, 60 / hz)),
    backup: 'pairs',
    source: 'Handbuch Tessera V3.5 Rev D'
  }
}

export const PROCESSOR_LABELS: Record<ProcessorModel, string> = {
  'novapro-uhd-jr': PROCESSORS['novapro-uhd-jr'].name,
  vx4s: PROCESSORS.vx4s.name,
  'tessera-s8': PROCESSORS['tessera-s8'].name,
  frei: 'eigener Prozessor'
}

/** Vorbelegung je Modul (Festlegung 16) */
export const DEFAULT_PROCESSOR: Record<string, Exclude<ProcessorModel, 'frei'>> = {
  '496-2,0': 'novapro-uhd-jr',
  rX3ioBF: 'novapro-uhd-jr',
  'uS2+': 'tessera-s8'
}

/** Bits je Pixel im Netzwerk (NovaStar A10s Pro: 10 bit belegt 32, 12 bit 48) */
const CARD_BITS: Record<Bit, number> = { 8: 24, 10: 32, 12: 48 }

/** Empfangskarte je Modul, soweit ihre Grenze bekannt ist (rX3ioBF: offen, Frage 13 im Plan) */
export const CARDS: Record<string, { name: string; portPx: (bit: Bit, hz: number) => number }> = {
  '496-2,0': {
    name: 'NovaStar A10s Pro',
    portPx: (bit, hz) => Math.round(0.95e9 / (CARD_BITS[bit] * hz))
  }
}

export interface ResolvedProcessor {
  model: ProcessorModel
  name: string
  ports: number
  bitDepth: Bit
  hz: number
  /** 0 = unbekannt (eigener Prozessor ohne Angabe) – dann keine Warnung */
  portPx: number
  totalPx: number
  maxW?: number
  maxH?: number
  backup: 'port' | 'pairs'
  /** woher die Grenze je Port kommt */
  limitBy: 'prozessor' | 'karte' | 'eigene'
  card?: string
}

const has = <T extends object>(o: T, k: string): k is Extract<keyof T, string> =>
  Object.hasOwn(o, k)

/** Prozessor einer Wand (eigene Wahl oder Vorbelegung je Modul) mit ihren Grenzen */
export function resolveProcessor(c: LedWallConfig): ResolvedProcessor {
  const p = c.processor
  const model: ProcessorModel =
    p.model ??
    (has(DEFAULT_PROCESSOR, c.moduleKey) ? DEFAULT_PROCESSOR[c.moduleKey] : 'novapro-uhd-jr')
  const hz = p.hz > 0 ? p.hz : 60
  if (model === 'frei')
    return {
      model,
      name: PROCESSOR_LABELS.frei,
      ports: p.ports ?? 0,
      bitDepth: p.bitDepth,
      hz,
      portPx: p.portPx ?? 0,
      totalPx: p.totalPx ?? 0,
      backup: 'port',
      limitBy: 'eigene'
    }
  const spec = PROCESSORS[model]
  const bit = spec.bitDepths.includes(p.bitDepth) ? p.bitDepth : spec.bitDepths[0]
  const own = spec.portPx(bit, hz)
  const card = has(CARDS, c.moduleKey) ? CARDS[c.moduleKey] : undefined
  const cardPx = card ? card.portPx(bit, hz) : Infinity
  return {
    model,
    name: spec.name,
    ports: spec.ports,
    bitDepth: bit,
    hz,
    portPx: Math.min(own, cardPx),
    totalPx: spec.totalPx(bit, hz),
    maxW: spec.maxW,
    maxH: spec.maxH,
    backup: spec.backup,
    limitBy: cardPx < own ? 'karte' : 'prozessor',
    card: card?.name
  }
}

/**
 * Gruppen von Wänden, die sich einen Prozessor teilen: Eine Wand mit `shareWith` gehört zur
 * Gruppe der genannten (über Ketten von Verweisen hinweg; Kreise und fehlende Wände zählen als
 * eigener Prozessor). Erste Wand der Gruppe = die mit dem Prozessor.
 */
export function processorGroups(walls: PlannedWall[]): PlannedWall[][] {
  const byId = new Map(walls.map((w) => [w.id, w]))
  const root = (w: PlannedWall): PlannedWall => {
    const seen = new Set<string>([w.id])
    let cur = w
    while (cur.config.processor.shareWith) {
      const next = byId.get(cur.config.processor.shareWith)
      if (!next || seen.has(next.id)) break
      seen.add(next.id)
      cur = next
    }
    return cur
  }
  const groups = new Map<string, PlannedWall[]>()
  for (const w of walls) {
    const r = root(w)
    const g = groups.get(r.id) ?? []
    if (!groups.has(r.id)) groups.set(r.id, g)
    g.push(w)
  }
  // die Wand mit dem Prozessor zuerst, die übrigen in ihrer Reihenfolge
  return [...groups.entries()].map(([rid, g]) => [
    ...g.filter((w) => w.id === rid),
    ...g.filter((w) => w.id !== rid)
  ])
}

export interface ChainLoad {
  chain: number
  modules: number
  px: number
  port: number | null
  backupPort: number | null
  /** über der Grenze je Port */
  over: boolean
}

export interface WallLoad {
  wallId: string
  wallName: string
  chains: ChainLoad[]
}

export interface LoadWarning {
  level: 'danger' | 'warning' | 'info'
  text: string
}

export interface GroupLoad {
  processor: ResolvedProcessor
  walls: WallLoad[]
  portsUsed: number
  /** Last des Prozessors (Tessera mit Redundanz: doppelt) */
  totalPx: number
  warnings: LoadWarning[]
}

/** Hat die Kette eine Backup-Leitung? Ohne eigene Angabe gilt die Vorgabe der Wand. */
export function hasBackup(meta: SigChainMeta | undefined, redundancy: boolean): boolean {
  return meta && 'backup' in meta ? !!meta.backup : redundancy
}

const portNr = (v: string | undefined): number | null => {
  const n = v ? parseInt(v, 10) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 64 ? n : null
}

const fmt = (n: number): string => n.toLocaleString('de-DE')
const mio = (n: number): string =>
  `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} Mio.`

/** Lasten, Ports und Warnungen je Prozessor (geteilte Prozessoren zusammen). */
export function analyzeProcessors(walls: PlannedWall[]): GroupLoad[] {
  return processorGroups(walls).map((group) => {
    const proc = resolveProcessor(group[0].config)
    const several = group.length > 1
    const warnings: LoadWarning[] = []
    const used = new Map<number, string>()
    const nameOf = (w: PlannedWall, chain: number): string =>
      `${several ? `${w.name} ` : ''}S${chain + 1}`
    // erst alle festen Ports, dann die übrigen fortlaufend
    type Slot = {
      w: PlannedWall
      chain: number
      cells: number
      meta?: SigChainMeta
      load: ChainLoad
    }
    const slots: Slot[] = []
    for (const w of group) {
      const mod = MODULES[w.config.moduleKey]
      const pxPerModule = mod ? mod.resX * mod.resY : 0
      for (const [chain, cells] of [...chainCells(w.config.sig)].sort((a, b) => a[0] - b[0])) {
        const meta = Object.hasOwn(w.config.sigMeta, String(chain))
          ? w.config.sigMeta[String(chain)]
          : undefined
        const px = cells.length * pxPerModule
        slots.push({
          w,
          chain,
          cells: cells.length,
          meta,
          load: {
            chain,
            modules: cells.length,
            px,
            port: null,
            backupPort: null,
            over: proc.portPx > 0 && px > proc.portPx
          }
        })
      }
    }
    const take = (p: number, who: string): void => {
      const other = used.get(p)
      if (other && other !== who)
        warnings.push({ level: 'warning', text: `Port ${p} doppelt belegt (${other} und ${who}).` })
      used.set(p, who)
    }
    for (const s of slots) {
      const who = nameOf(s.w, s.chain)
      const p = portNr(s.meta?.port)
      if (p) {
        s.load.port = p
        take(p, who)
      }
      if (hasBackup(s.meta, s.w.config.redundancy)) {
        const b = portNr(s.meta?.backup?.port)
        if (b) {
          s.load.backupPort = b
          take(b, `${who} (Backup)`)
        }
      }
    }
    const free = (from = 1, step = 1): number => {
      let p = from
      while (used.has(p)) p += step
      return p
    }
    for (const s of slots) {
      const who = nameOf(s.w, s.chain)
      const backup = hasBackup(s.meta, s.w.config.redundancy)
      if (s.load.port === null) {
        // Tessera: Haupt-Port ungerade, damit der Partner frei bleibt (1→2, 3→4)
        let p = free()
        if (backup && proc.backup === 'pairs') {
          p = free(1, 2)
          while (used.has(p + 1)) p = free(p + 2, 2)
        }
        s.load.port = p
        used.set(p, who)
      }
      if (backup && s.load.backupPort === null) {
        const b = proc.backup === 'pairs' ? s.load.port + 1 : free()
        s.load.backupPort = b
        take(b, `${who} (Backup)`)
      }
    }

    let total = 0
    for (const s of slots) {
      const who = nameOf(s.w, s.chain)
      const backup = s.load.backupPort !== null
      total += s.load.px * (backup && proc.backup === 'pairs' ? 2 : 1)
      if (s.load.over)
        warnings.push({
          level: 'danger',
          text: `${who}: ${s.cells} Module = ${fmt(s.load.px)} px – über der Grenze je Port (${fmt(proc.portPx)} px${proc.limitBy === 'karte' ? `, Empfangskarte ${proc.card}` : ''}).`
        })
      if (backup && proc.backup === 'pairs') {
        const p = s.load.port!
        if (s.load.backupPort !== p + 1 || p % 2 === 0)
          warnings.push({
            level: 'warning',
            text: `${who}: Die Backup-Leitung muss am Partner-Port liegen (Paar ${p % 2 ? p : p - 1} → ${p % 2 ? p + 1 : p}).`
          })
        else if (p > 4)
          warnings.push({
            level: 'info',
            text: `${who}: Paar ${p} → ${p + 1} – das Handbuch nennt nur 1 → 2 und 3 → 4; am Gerät prüfen.`
          })
        if (s.cells > 50)
          warnings.push({
            level: 'warning',
            text: `${who}: ${s.cells} Module – mit Redundanz höchstens 50 je Kette.`
          })
      }
    }
    const ports = used.size
    if (proc.ports > 0 && ports > proc.ports)
      warnings.push({
        level: 'danger',
        text: `${ports} Ports belegt (Haupt- und Backup-Leitungen), ${proc.name} hat ${proc.ports}.`
      })
    const maxPort = Math.max(0, ...used.keys())
    if (proc.ports > 0 && ports <= proc.ports && maxPort > proc.ports)
      warnings.push({ level: 'warning', text: `Port ${maxPort} gibt es am ${proc.name} nicht.` })
    if (proc.totalPx > 0 && total > proc.totalPx)
      warnings.push({
        level: 'danger',
        text: `Zusammen ${mio(total)} px – mehr, als ${proc.name} schafft (${mio(proc.totalPx)}).`
      })
    for (const w of group) {
      const mod = MODULES[w.config.moduleKey]
      if (!mod) continue
      const g = w.config.sig
      const cols = g[0]?.length ?? 0
      const wpx = cols * mod.resX
      const hpx = g.length * mod.resY
      if ((proc.maxW && wpx > proc.maxW) || (proc.maxH && hpx > proc.maxH))
        warnings.push({
          level: 'warning',
          text: `${several ? `${w.name}: ` : ''}${fmt(wpx)} × ${fmt(hpx)} px – ${proc.name} schafft höchstens ${fmt(proc.maxW ?? 0)} × ${fmt(proc.maxH ?? 0)} px.`
        })
    }
    if (several && new Set(group.map((w) => w.config.moduleKey)).size > 1)
      warnings.push({
        level: 'warning',
        text: 'Wände mit verschiedenen Modulen teilen sich einen Prozessor – das geht nur bei gleichem Typ.'
      })
    return {
      processor: proc,
      walls: group.map((w) => ({
        wallId: w.id,
        wallName: w.name,
        chains: slots.filter((s) => s.w.id === w.id).map((s) => s.load)
      })),
      portsUsed: ports,
      totalPx: total,
      warnings
    }
  })
}
