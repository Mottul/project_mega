// Wand-Wahl in der Leiste des Konfigurators: „Wand: Hauptbühne ▾“ mit allen Wänden der Planung,
// dazu Neue Wand, Duplizieren, Entfernen. Umbenennen geht in der Schublade (Bereich „Wand“) – ein
// Name ist ein Feld, keine Aktion. Muster wie das Datei-Menü (components/ProjectFileMenu.tsx).

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LayoutGrid } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { WALLS_MAX } from './config'
import { useLedWall } from './store'

function Item({
  onClick,
  disabled,
  checked,
  children
}: {
  onClick: () => void
  disabled?: boolean
  /** gesetzt = Auswahl-Eintrag (Wand) */
  checked?: boolean
  children: string
}): JSX.Element {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      {checked !== undefined && (
        <Check className={cn('size-3.5 shrink-0', !checked && 'invisible')} />
      )}
      <span className="truncate">{children}</span>
    </button>
  )
}

export function WallMenu(): JSX.Element {
  const walls = useLedWall((s) => s.walls)
  const wallId = useLedWall((s) => s.wallId)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = walls.find((w) => w.id === wallId) ?? walls[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (fn: () => unknown): void => {
    setOpen(false)
    void fn()
  }

  async function remove(): Promise<void> {
    const s = useLedWall.getState()
    const w = s.walls.find((x) => x.id === s.wallId)
    if (!w || s.walls.length <= 1) return
    const ok = await api.confirm({
      message: `Wand „${w.name}“ entfernen?`,
      detail: 'Maße, Modul und Verkabelung dieser Wand gehen verloren.',
      confirmLabel: 'Entfernen',
      danger: true
    })
    // Rückfragen sperren nur dieses Fenster: entfernt wird die Wand, nach der gefragt wurde
    if (ok) useLedWall.getState().removeWall(w.id)
  }

  const full = walls.length >= WALLS_MAX
  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Wand wählen, neu anlegen oder entfernen"
        onClick={() => setOpen((v) => !v)}
      >
        <LayoutGrid className="size-4" />
        <span className="max-w-[12rem] truncate">{current?.name}</span>
        {walls.length > 1 && (
          <span className="text-xs text-muted-foreground">
            {walls.findIndex((w) => w.id === wallId) + 1}/{walls.length}
          </span>
        )}
        <ChevronDown className="size-3.5" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Wand"
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1.5 shadow-xl"
        >
          {walls.map((w) => (
            <Item
              key={w.id}
              checked={w.id === wallId}
              onClick={() => run(() => useLedWall.getState().selectWall(w.id))}
            >
              {w.name}
            </Item>
          ))}
          <div className="my-1 h-px bg-border" />
          <Item disabled={full} onClick={() => run(() => useLedWall.getState().addWall())}>
            Neue Wand
          </Item>
          <Item disabled={full} onClick={() => run(() => useLedWall.getState().addWall(true))}>
            Wand duplizieren
          </Item>
          <Item disabled={walls.length <= 1} onClick={() => run(remove)}>
            Wand entfernen …
          </Item>
        </div>
      )}
    </div>
  )
}
