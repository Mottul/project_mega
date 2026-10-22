// Leitet Packlisten-Positionen aus der LED-Wall-Planung ab (ohne Angabe: alle Wände aus dem
// Konfigurator-Store). Kabelmengen aus den im Plan gezeichneten Ketten: je Kette 1 Einspeisung +
// (Module−1) Brücken. Mehrere Wände: je Wand eine Kategorie („LED-Wall · Hauptbühne“) – jede
// wird für sich aufgebaut; gleiche Module nennen die Summe über alle Wände.

import { chainStats } from '../led-wall/cabling'
import { computeWall } from '../led-wall/compute'
import type { LedWallConfig, PlannedWall } from '../led-wall/config'
import {
  analyzeProcessors,
  CVT10,
  FASER_LAGER_S,
  faserAusLager,
  type FiberPlan
} from '../led-wall/processors'
import { plannedWalls, useLedWall } from '../led-wall/store'
import type { PackItem } from './store'

type DerivedItem = Omit<PackItem, 'id' | 'checked'>

/** Zerlegt eine Stack-Höhe (m) in 1-m- und 0,75-m-Leitertraversen-Stücke –
 *  kleinste Gesamtlänge, die die Höhe erreicht (Gleichstand: wenige Stücke). */
function ladderPieces(h: number): { ones: number; quarters: number } {
  if (!Number.isFinite(h) || h <= 0) return { ones: 0, quarters: 0 }
  let best: { ones: number; quarters: number; over: number } | null = null
  for (let a = 0; a <= Math.ceil(h) + 1; a++) {
    const b = Math.max(0, Math.ceil((h - a) / 0.75))
    const total = a + 0.75 * b
    if (total + 1e-9 < h) continue
    const over = total - h
    if (
      !best ||
      over < best.over - 1e-9 ||
      (Math.abs(over - best.over) < 1e-9 && a + b < best.ones + best.quarters)
    ) {
      best = { ones: a, quarters: b, over }
    }
  }
  return best ? { ones: best.ones, quarters: best.quarters } : { ones: Math.ceil(h), quarters: 0 }
}

export function deriveFromLedWall(
  walls: PlannedWall[] = plannedWalls(useLedWall.getState())
): DerivedItem[] {
  const cat = (w: PlannedWall): string => (walls.length === 1 ? 'LED-Wall' : `LED-Wall · ${w.name}`)
  // Prozessoren: einer je Gruppe (geteilte nur einmal, bei der Wand mit dem Prozessor);
  // Backup-Leitungen je Wand aus der Port-Vergabe
  const groups = analyzeProcessors(walls)
  const backups = new Map<string, number>()
  const fibers = new Map<string, FiberPlan>()
  const procs = new Map<string, DerivedItem[]>()
  for (const g of groups) {
    for (const w of g.walls) {
      backups.set(w.wallId, w.chains.filter((c) => c.backupPort !== null).length)
      if (g.fiber) fibers.set(w.wallId, g.fiber)
    }
    const first = walls.find((w) => w.id === g.walls[0].wallId)!
    const fuer = g.walls.length > 1 ? `für ${g.walls.map((w) => w.wallName).join(' und ')}` : ''
    procs.set(first.id, [
      {
        category: cat(first),
        name: `Prozessor ${g.processor.name}`,
        qty: 1,
        unit: 'Stk.',
        note: fuer
      },
      ...(g.fiber ? fiberItems(g.fiber, cat(first), fuer) : [])
    ])
  }
  const perWall = walls.map((w) => [
    ...deriveWall(w.config, cat(w), backups.get(w.id) ?? 0, fibers.get(w.id)),
    ...(procs.get(w.id) ?? [])
  ])
  if (walls.length === 1) return perWall[0]
  // gleiche Module über alle Wände zusammenzählen (Kisten werden gemeinsam gepackt)
  const sums = new Map<string, number>()
  const count = new Map<string, number>()
  for (const items of perWall) {
    const m = items[0]
    sums.set(m.name, (sums.get(m.name) ?? 0) + m.qty)
    count.set(m.name, (count.get(m.name) ?? 0) + 1)
  }
  return perWall.flatMap((items) =>
    items.map((it, i) =>
      i === 0 && (count.get(it.name) ?? 0) > 1
        ? { ...it, note: `${it.note} · alle Wände zusammen: ${sums.get(it.name)} Stk.` }
        : it
    )
  )
}

/** Glasfaser-Strecke eines Prozessors: Boxen, Fasern, Stromkabel der Boxen (Festlegung 28) */
/**
 * Fasern einer Strecke: Variante S aus dem Lager (Singlemode LC-LC, feste Längen, über 100 m
 * gestückelt mit Kupplung), sonst wie geplant mit Länge zum Besorgen.
 */
function faserItems(f: FiberPlan, cat: string): DerivedItem[] {
  const ersatz = f.redundancy === 'none' ? '' : 'mit Ersatzfaser je Box'
  const mit = (...t: string[]): string => t.filter(Boolean).join(' · ')
  if (f.variant !== 'S' || !f.lengthM) {
    const lager =
      f.variant === 'S' ? ` (Lager: ${FASER_LAGER_S.filter((l) => l >= 20).join(', ')} m)` : ''
    return [
      {
        category: cat,
        name: `Glasfaser ${CVT10.variants[f.variant].label}, LC-LC`,
        qty: f.fibers,
        unit: 'Stk.',
        note: mit(
          f.lengthM ? `je ${f.lengthM} m` : `Länge eintragen${lager}`,
          f.variant === 'M' ? 'nicht im Lager' : '',
          ersatz
        )
      }
    ]
  }
  const stuecke = faserAusLager(f.lengthM)
  const anzahl = new Map<number, number>()
  for (const l of stuecke) anzahl.set(l, (anzahl.get(l) ?? 0) + 1)
  const strecke = stuecke.length > 1 ? `${f.lengthM} m aus ${stuecke.join(' + ')} m` : ''
  const items: DerivedItem[] = [...anzahl].map(([l, n]) => ({
    category: cat,
    name: `Glasfaser Singlemode LC-LC ${l} m`,
    qty: n * f.fibers,
    unit: 'Stk.',
    note: mit(strecke, ersatz)
  }))
  if (stuecke.length > 1)
    items.push({
      category: cat,
      name: 'LC-LC-Kupplung Singlemode',
      qty: (stuecke.length - 1) * f.fibers,
      unit: 'Stk.',
      note: `je Faser ${stuecke.length - 1}`
    })
  return items
}

function fiberItems(f: FiberPlan, cat: string, fuer: string): DerivedItem[] {
  const boxNote =
    f.redundancy === 'hot-backup'
      ? `je Achtergruppe eine Box plus eine für Hot-Backup${fuer ? ` · ${fuer}` : ''}`
      : `je Achtergruppe eine (Ports 1–8, 9–16)${fuer ? ` · ${fuer}` : ''}`
  return [
    {
      category: cat,
      name: `${CVT10.name}-${f.variant}`,
      qty: f.boxes,
      unit: 'Stk.',
      note: boxNote
    },
    ...faserItems(f, cat),
    { category: cat, name: 'Netzkabel PowerCON (CVT10)', qty: f.boxes, unit: 'Stk.', note: '' }
  ]
}

/** Positionen einer Wand; die erste ist immer das LED-Modul. */
function deriveWall(
  s: LedWallConfig,
  cat: string,
  backupLines = 0,
  fiber?: FiberPlan
): DerivedItem[] {
  const d = computeWall(s)
  const items: DerivedItem[] = []

  items.push({
    category: cat,
    name: `LED-Modul ${d.mod.name}`,
    qty: d.total,
    unit: 'Stk.',
    note: `${d.cols}×${d.rows} · ${d.actualW}×${d.actualH} m · ${d.weightKg} kg`
  })

  if (s.buildMode === 'stacked') {
    items.push({
      category: cat,
      name: 'Ground-Stack-Fuß (LSU)',
      qty: d.baseUnits,
      unit: 'Stk.',
      note: ''
    })
    // Leitertraversen je Base bis zur Wandhöhe (1 m + 0,75 m kombiniert).
    const lp = ladderPieces(parseFloat(d.actualH))
    const ladderNote = `Stack-Höhe ~${d.actualH} m × ${d.baseUnits} Bases`
    if (lp.ones > 0)
      items.push({
        category: cat,
        name: 'Leitertraverse 1 m',
        qty: lp.ones * d.baseUnits,
        unit: 'Stk.',
        note: ladderNote
      })
    if (lp.quarters > 0)
      items.push({
        category: cat,
        name: 'Leitertraverse 0,75 m',
        qty: lp.quarters * d.baseUnits,
        unit: 'Stk.',
        note: ladderNote
      })
    items.push({
      category: cat,
      name: 'Ballast',
      qty: d.totalBallast,
      unit: 'kg',
      note: `${d.baseUnits} × ${d.ballastPerBase} kg`
    })
  } else {
    // Anhängepunkte: gerade Traverse ~1 je 3 m (mind. 2); Rundtraverse braucht
    // mind. 3 (verteilt), grob 1 je 4 m Umfang; andere gebogene Formen mind. 3.
    const flatPoints = Math.max(2, Math.ceil(parseFloat(d.actualW) / 3))
    let points = flatPoints
    let note = `Traverse für ${d.weightKg} kg planen`
    if (d.curve?.mode === 'circle') {
      points = Math.max(3, Math.ceil((d.curve.footprintW * Math.PI) / 4))
      note = `Rundtraverse: mind. 3 Punkte gleichmäßig verteilen · Last/Punkt prüfen (Motor-/Kettenzug-WLL)`
    } else if (d.curve) {
      points = Math.max(3, flatPoints)
      note = `Gebogene Traverse: mind. 3 Punkte · Last/Punkt prüfen`
    }
    items.push({ category: cat, name: 'Rigging-Punkt / Motor', qty: points, unit: 'Stk.', note })
  }

  const sig = chainStats(s.sig)
  const pwr = chainStats(s.pwr)
  if (sig.chains > 0) {
    items.push({
      category: cat,
      name: 'Datenleitung (Einspeisung/Kette)',
      qty: sig.chains,
      unit: 'Stk.',
      note: fiber
        ? 'CVT10 → erste Kachel je Kette (Patchkabel)'
        : 'Processor → erste Kachel je Kette'
    })
    if (sig.jumpers > 0)
      items.push({
        category: cat,
        name: 'Daten-Brücke (Modul→Modul)',
        qty: sig.jumpers,
        unit: 'Stk.',
        note: ''
      })
    if (backupLines > 0)
      items.push({
        category: cat,
        name: 'Datenleitung Backup (letztes Modul → Prozessor)',
        qty: backupLines,
        unit: 'Stk.',
        note:
          fiber?.redundancy === 'hot-backup'
            ? 'Backup-Leitungen der Signalketten, von der zweiten CVT10'
            : 'Backup-Leitungen der Signalketten'
      })
  }
  if (pwr.chains > 0) {
    items.push({
      category: cat,
      name: 'Stromleitung (Einspeisung/Kette)',
      qty: pwr.chains,
      unit: 'Stk.',
      note: `${d.mod.connector}`
    })
    if (pwr.jumpers > 0)
      items.push({
        category: cat,
        name: 'Strom-Brücke (Modul→Modul)',
        qty: pwr.jumpers,
        unit: 'Stk.',
        note: ''
      })
  }
  if (sig.chains === 0 && pwr.chains === 0) {
    items.push({
      category: cat,
      name: 'Daten-/Stromkabel',
      qty: 1,
      unit: 'Satz',
      note: 'Verkabelung im Konfigurator zeichnen für genaue Mengen'
    })
  }

  return items
}
