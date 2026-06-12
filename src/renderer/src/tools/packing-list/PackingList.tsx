// Packliste: editierbare Positionen (Menge/Einheit/Notiz), abhakbar, gruppiert
// nach Kategorie. Befüllbar aus der LED-Wall-Konfiguration, Export als PDF.

import { useMemo } from 'react'
import { Check, FileDown, LayoutGrid, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { deriveFromLedWall } from './derive'
import { exportPackingPdf } from './print'
import { usePacking, type PackItem } from './store'

export function PackingList(): JSX.Element {
  const s = usePacking()

  const groups = useMemo(() => {
    const map = new Map<string, PackItem[]>()
    for (const it of s.items) {
      const arr = map.get(it.category) ?? []
      arr.push(it)
      map.set(it.category, arr)
    }
    return [...map.entries()]
  }, [s.items])

  const openCount = s.items.filter((i) => !i.checked).length

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <Input
          className="h-9 max-w-xs flex-1"
          placeholder="Projektname"
          value={s.projectName}
          onChange={(e) => s.set({ projectName: e.target.value })}
        />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => s.mergeItems(deriveFromLedWall())}>
          <LayoutGrid className="size-4" /> Aus LED-Wall übernehmen
        </Button>
        <Button
          size="sm"
          disabled={s.items.length === 0}
          onClick={() => void exportPackingPdf(s.projectName, s.items)}
        >
          <FileDown className="size-4" /> PDF
        </Button>
      </Card>

      {s.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Noch keine Positionen. Mit „Aus LED-Wall übernehmen“ befüllen oder unten eigene Zeilen
          hinzufügen.
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([cat, items]) => (
            <Card key={cat} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{cat}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="divide-y divide-border">
                {items.map((it) => (
                  <Row key={it.id} item={it} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => s.addItem()}>
          <Plus className="size-4" /> Position
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{openCount} offen</span>
        <Button variant="ghost" size="sm" disabled={s.items.every((i) => !i.checked)} onClick={() => s.clearChecked()}>
          <Check className="size-4" /> Abgehakte entfernen
        </Button>
        <Button variant="ghost" size="sm" disabled={s.items.length === 0} onClick={() => s.reset()}>
          <RotateCcw className="size-4" /> Leeren
        </Button>
      </div>
    </div>
  )
}

function Row({ item }: { item: PackItem }): JSX.Element {
  const s = usePacking()
  const up = (patch: Partial<PackItem>): void => s.updateItem(item.id, patch)
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${item.checked ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => up({ checked: e.target.checked })}
        className="size-4 accent-primary"
      />
      <Input
        type="number"
        value={item.qty}
        min={0}
        onChange={(e) => up({ qty: Math.max(0, Number(e.target.value) || 0) })}
        className="h-8 w-16 text-right"
      />
      <Input value={item.unit} onChange={(e) => up({ unit: e.target.value })} className="h-8 w-16" />
      <Input
        value={item.name}
        placeholder="Position"
        onChange={(e) => up({ name: e.target.value })}
        className={`h-8 flex-1 ${item.checked ? 'line-through' : ''}`}
      />
      <Input
        value={item.note}
        placeholder="Notiz"
        onChange={(e) => up({ note: e.target.value })}
        className="h-8 w-40 text-xs"
      />
      <button
        type="button"
        onClick={() => s.removeItem(item.id)}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        title="Entfernen"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
