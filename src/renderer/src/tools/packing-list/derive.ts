// Leitet Packlisten-Positionen aus der aktuellen LED-Wall-Konfiguration ab
// (liest den persistierten Konfigurator-Store). Kabelmengen aus den im Plan
// gezeichneten Ketten: je Kette 1 Einspeisung + (Module−1) Brücken.

import { computeWall } from '../led-wall/compute'
import { useLedWall } from '../led-wall/store'
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
    if (!best || over < best.over - 1e-9 || (Math.abs(over - best.over) < 1e-9 && a + b < best.ones + best.quarters)) {
      best = { ones: a, quarters: b, over }
    }
  }
  return best ? { ones: best.ones, quarters: best.quarters } : { ones: Math.ceil(h), quarters: 0 }
}

function chainStats(grid: number[][]): { chains: number; jumpers: number } {
  const counts = new Map<number, number>()
  for (const row of grid) for (const v of row) if (v >= 0) counts.set(v, (counts.get(v) ?? 0) + 1)
  let jumpers = 0
  for (const n of counts.values()) jumpers += Math.max(0, n - 1)
  return { chains: counts.size, jumpers }
}

export function deriveFromLedWall(): DerivedItem[] {
  const s = useLedWall.getState()
  const d = computeWall(s)
  const cat = 'LED-Wall'
  const items: DerivedItem[] = []

  items.push({
    category: cat,
    name: `LED-Modul ${d.mod.name}`,
    qty: d.total,
    unit: 'Stk.',
    note: `${d.cols}×${d.rows} · ${d.actualW}×${d.actualH} m · ${d.weightKg} kg`
  })

  if (s.buildMode === 'stacked') {
    items.push({ category: cat, name: 'Ground-Stack-Fuß (LSU)', qty: d.baseUnits, unit: 'Stk.', note: '' })
    // Leitertraversen je Base bis zur Wandhöhe (1 m + 0,75 m kombiniert).
    const lp = ladderPieces(parseFloat(d.actualH))
    const ladderNote = `Stack-Höhe ~${d.actualH} m × ${d.baseUnits} Bases`
    if (lp.ones > 0)
      items.push({ category: cat, name: 'Leitertraverse 1 m', qty: lp.ones * d.baseUnits, unit: 'Stk.', note: ladderNote })
    if (lp.quarters > 0)
      items.push({ category: cat, name: 'Leitertraverse 0,75 m', qty: lp.quarters * d.baseUnits, unit: 'Stk.', note: ladderNote })
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
    items.push({ category: cat, name: 'Datenleitung (Einspeisung/Kette)', qty: sig.chains, unit: 'Stk.', note: 'Processor → erste Kachel je Kette' })
    if (sig.jumpers > 0) items.push({ category: cat, name: 'Daten-Brücke (Modul→Modul)', qty: sig.jumpers, unit: 'Stk.', note: '' })
  }
  if (pwr.chains > 0) {
    items.push({ category: cat, name: 'Stromleitung (Einspeisung/Kette)', qty: pwr.chains, unit: 'Stk.', note: `${d.mod.connector}` })
    if (pwr.jumpers > 0) items.push({ category: cat, name: 'Strom-Brücke (Modul→Modul)', qty: pwr.jumpers, unit: 'Stk.', note: '' })
  }
  if (sig.chains === 0 && pwr.chains === 0) {
    items.push({ category: cat, name: 'Daten-/Stromkabel', qty: 1, unit: 'Satz', note: 'Verkabelung im Konfigurator zeichnen für genaue Mengen' })
  }

  return items
}
