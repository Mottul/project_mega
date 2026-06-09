// Einheitliches Tool-Layout: großer Inhaltsbereich (Mitte) + rechtes Inspector-
// Panel mit ausklappbaren Kategorien (PanelSection). Damit sehen alle Werkzeuge
// gleich aus: links/mittig wird gearbeitet, rechts wird eingestellt. Der
// Aufklapp-Zustand jeder Kategorie wird pro Tool im localStorage gemerkt.
import { createContext, useContext, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

const ShellCtx = createContext<string>('tool')

export function ToolShell({
  id,
  main,
  aside,
  asideWidth = 360
}: {
  /** eindeutige Tool-Kennung – Namensraum für gemerkte Panel-Zustände */
  id: string
  main: ReactNode
  aside: ReactNode
  asideWidth?: number
}): JSX.Element {
  return (
    <ShellCtx.Provider value={id}>
      <div className="flex h-full min-h-0">
        <section className="min-w-0 flex-1 overflow-auto">{main}</section>
        <aside
          className="flex shrink-0 flex-col overflow-y-auto border-l border-border bg-card/40"
          style={{ width: asideWidth }}
        >
          {aside}
        </aside>
      </div>
    </ShellCtx.Provider>
  )
}

export function PanelSection({
  id,
  title,
  icon: Icon,
  right,
  defaultOpen = true,
  children
}: {
  id: string
  title: string
  icon?: LucideIcon
  /** kleine, nicht-interaktive Anzeige rechts im Kopf (z. B. Status-Badge) */
  right?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}): JSX.Element {
  const toolId = useContext(ShellCtx)
  const key = `panel:${toolId}:${id}`
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key)
      return v === null ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })

  function toggle(): void {
    setOpen((o) => {
      const next = !o
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // localStorage nicht verfügbar -> Zustand nur für diese Sitzung
      }
      return next
    })
  }

  return (
    <section className="border-b border-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40"
      >
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90'
          )}
        />
        {Icon && <Icon className="size-4 shrink-0 text-primary" />}
        <span className="flex-1 truncate text-sm font-medium">{title}</span>
        {right}
      </button>
      {open && <div className="space-y-3 px-4 pb-4 pt-1">{children}</div>}
    </section>
  )
}
