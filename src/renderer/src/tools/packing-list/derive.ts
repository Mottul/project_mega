// Leitet Packlisten-Positionen aus der aktuellen LED-Wall-Konfiguration ab
// (liest den persistierten Konfigurator-Store). Kabelmengen aus den im Plan
// gezeichneten Ketten: je Kette 1 Einspeisung + (Module−1) Brücken.

import { computeWall } from '../led-wall/compute'
import { useLedWall } from '../led-wall/store'
import type { PackItem } from './store'

type DerivedItem = Omit<PackItem, 'id' | 'checked'>

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
    items.push({
      category: cat,
      name: 'Ballast',
      qty: d.totalBallast,
      unit: 'kg',
      note: `${d.baseUnits} × ${d.ballastPerBase} kg`
    })
  } else {
    items.push({
      category: cat,
      name: 'Rigging-Punkt / Motor',
      qty: Math.max(2, Math.ceil(parseFloat(d.actualW) / 3)),
      unit: 'Stk.',
      note: `Traverse für ${d.weightKg} kg planen`
    })
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
