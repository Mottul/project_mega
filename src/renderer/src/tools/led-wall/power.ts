// Strom je Wand (rein, getestet): Last je Stromkette bei Maximalleistung, Stromkreise (mehrere
// Ketten an einem Kreis zählen zusammen), Phasenbilanz und Warnungen. Phasen ohne Angabe
// verteilt die Rechnung als Vorschlag – immer auf die gerade schwächste Phase, in
// Kettenreihenfolge, ein Kreis bleibt auf einer Phase. Gespeichert wird nur, was jemand festlegt
// (wie die Ports in processors.ts): So verschiebt eine neue Kette keine festgelegte Phase.

import { chainCells } from './cabling'
import type { LedWallConfig, PwrChainMeta } from './config'
import { MODULES } from './data'
import type { LoadWarning } from './processors'

export type Phase = 'L1' | 'L2' | 'L3'
export const PHASES: readonly Phase[] = ['L1', 'L2', 'L3']

export interface PowerChainLoad {
  chain: number
  modules: number
  /** Maximalleistung der Kette (W) */
  watts: number
  /** Strom bei Maximalleistung (A) */
  amps: number
  /** Stromkreis wie eingetragen; leer = keiner */
  circuit: string
  phase: Phase
  /** Phase nur vorgeschlagen, nicht festgelegt */
  phaseAuto: boolean
  /** Kette allein schon über der Absicherung */
  over: boolean
}

export interface CircuitLoad {
  name: string
  chains: number[]
  amps: number
  over: boolean
}

export interface PowerAnalysis {
  voltage: number
  breakerA: number
  /** so viele Module trägt ein Kreis bei Maximalleistung (0 = Modul unbekannt) */
  maxModules: number
  chains: PowerChainLoad[]
  /** eingetragene Kreise (auch mit nur einer Kette) */
  circuits: CircuitLoad[]
  /** Strom je Phase bei Maximalleistung (A) */
  phases: Record<Phase, number>
  warnings: LoadWarning[]
}

/** Strom wie im Rest des Werkzeugs: eine Nachkommastelle, Komma */
export const amps = (a: number): string =>
  a.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Kurzform für Liste und Plan: „F3 · L2“ (vorgeschlagene Phase in Klammern) */
export function circuitLabel(l: Pick<PowerChainLoad, 'circuit' | 'phase' | 'phaseAuto'>): string {
  const phase = l.phaseAuto ? `(${l.phase})` : l.phase
  return l.circuit ? `${l.circuit} · ${phase}` : phase
}

const key = (circuit: string): string => circuit.trim().toLowerCase()

/** Phase mit der kleinsten Last (bei Gleichstand die erste) */
function weakest(loads: Record<Phase, number>): Phase {
  return PHASES.reduce((best, p) => (loads[p] < loads[best] - 1e-9 ? p : best), PHASES[0])
}

const spread = (loads: Record<Phase, number>): number =>
  Math.max(...PHASES.map((p) => loads[p])) - Math.min(...PHASES.map((p) => loads[p]))

type Mains = { voltage: number; breakerA: number }

export function analyzePower(
  c: Pick<LedWallConfig, 'moduleKey' | 'pwr' | 'pwrMeta'> & { mains: Mains }
): PowerAnalysis {
  const mod = Object.hasOwn(MODULES, c.moduleKey) ? MODULES[c.moduleKey] : undefined
  const { voltage, breakerA } = c.mains
  const perModule = mod?.powerMax ?? 0
  const maxModules = perModule > 0 ? Math.floor((breakerA * voltage) / perModule) : 0
  const warnings: LoadWarning[] = []

  // festgelegte Phase je Kette (die Liste trägt nachher die wirksame)
  const fixed = new Map<number, Phase>()
  const chains: PowerChainLoad[] = [...chainCells(c.pwr)]
    .sort((a, b) => a[0] - b[0])
    .map(([chain, cells]) => {
      const meta: PwrChainMeta | undefined = Object.hasOwn(c.pwrMeta, String(chain))
        ? c.pwrMeta[String(chain)]
        : undefined
      const watts = cells.length * perModule
      const a = watts / voltage
      if (meta?.phase) fixed.set(chain, meta.phase)
      return {
        chain,
        modules: cells.length,
        watts,
        amps: a,
        circuit: meta?.circuit?.trim() ?? '',
        phase: meta?.phase ?? 'L1',
        phaseAuto: !meta?.phase,
        over: a > breakerA + 1e-9
      }
    })

  // Einheiten für die Verteilung: ein eingetragener Kreis oder eine Kette ohne Kreis
  const units = new Map<string, typeof chains>()
  for (const l of chains) {
    const k = l.circuit ? `k:${key(l.circuit)}` : `p:${l.chain}`
    units.set(k, [...(units.get(k) ?? []), l])
  }

  const loads: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 }
  // erst Festgelegtes, dann der Rest in Kettenreihenfolge auf die schwächste Phase
  const open: (typeof chains)[] = []
  for (const u of units.values()) {
    const first = u.map((l) => fixed.get(l.chain)).find(Boolean)
    if (!first) {
      open.push(u)
      continue
    }
    for (const l of u) {
      l.phase = fixed.get(l.chain) ?? first
      loads[l.phase] += l.amps
    }
    const set = [...new Set(u.map((l) => l.phase))]
    if (set.length > 1)
      warnings.push({
        level: 'warning',
        text: `Kreis ${u[0].circuit}: Ketten auf ${set.join(' und ')} – ein Stromkreis hängt an einer Phase.`
      })
  }
  for (const u of open) {
    const p = weakest(loads)
    for (const l of u) {
      l.phase = p
      loads[p] += l.amps
    }
  }

  const circuits: CircuitLoad[] = [...units.values()]
    .filter((u) => u[0].circuit)
    .map((u) => {
      const a = u.reduce((n, l) => n + l.amps, 0)
      return {
        name: u[0].circuit,
        chains: u.map((l) => l.chain),
        amps: a,
        over: a > breakerA + 1e-9
      }
    })

  const name = (chain: number): string => `P${chain + 1}`
  for (const l of chains) {
    // mehrere Ketten an einem Kreis meldet der Kreis
    if (l.circuit && units.get(`k:${key(l.circuit)}`)!.length > 1) continue
    if (l.over)
      warnings.push({
        level: 'danger',
        text: `${name(l.chain)}: ${l.modules} Module = ${amps(l.amps)} A – über der Absicherung (${breakerA} A). Kette teilen${maxModules ? `, höchstens ${maxModules} Module je Kreis` : ''}.`
      })
  }
  for (const k of circuits)
    if (k.chains.length > 1 && k.over)
      warnings.push({
        level: 'danger',
        text: `Kreis ${k.name} (${k.chains.map(name).join(' + ')}): ${amps(k.amps)} A – über der Absicherung (${breakerA} A).`
      })

  // Schieflage nur melden, wenn es merklich besser ginge (größte Einheit zuerst verteilen)
  const sums = [...units.values()].map((u) => u.reduce((n, l) => n + l.amps, 0))
  if (sums.length > 1) {
    const best: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 }
    for (const a of [...sums].sort((x, y) => y - x)) best[weakest(best)] += a
    const top = Math.max(...PHASES.map((p) => loads[p]))
    if (spread(loads) > spread(best) + Math.max(2, 0.15 * top))
      warnings.push({
        level: 'warning',
        text: `Phasen ungleich belastet: ${PHASES.map((p) => `${p} ${amps(loads[p])} A`).join(' · ')} – Kreise gleichmäßiger verteilen.`
      })
  }

  // Einschaltstrom: bei vollen Kreisen löst ein B-Automat beim gleichzeitigen Einschalten aus
  const full = [...units.values()].some((u) => u.reduce((n, l) => n + l.amps, 0) >= 0.75 * breakerA)
  if (full && !warnings.some((w) => w.level === 'danger'))
    warnings.push({
      level: 'info',
      text: 'Kreise nah an der Absicherung: Die Netzteile ziehen beim Einschalten kurz ein Vielfaches – Kreise nacheinander einschalten.'
    })

  return {
    voltage,
    breakerA,
    maxModules,
    chains,
    circuits,
    phases: loads,
    warnings
  }
}
