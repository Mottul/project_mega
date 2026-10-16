// Datei-Menü und Dateichip für die Leiste eines Werkzeugs mit Projektdateien (lib/projectFile):
// „Datei ▾“ mit Neu, Öffnen, Zuletzt geöffnet, Speichern, Speichern unter, Im Ordner zeigen –
// daneben, woran man gerade arbeitet: Dateiname mit Punkt für „ungespeichert“ oder „ohne Datei“.
// Aktionen gehören in die Leiste, nie in die Schublade (CLAUDE.md).

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'
import { projectDisplayName } from '@shared/projectFile'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import type { ProjectFileControls } from '@renderer/lib/projectFile'
import { useSettings } from '@renderer/lib/settings'
import { cn } from '@renderer/lib/utils'

const isMac = navigator.platform.toLowerCase().includes('mac')
const MOD = isMac ? '⌘' : 'Strg+'

function Item({
  onClick,
  disabled,
  shortcut,
  title,
  children
}: {
  onClick: () => void
  disabled?: boolean
  shortcut?: string
  title?: string
  children: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="truncate">{children}</span>
      {shortcut && <span className="shrink-0 text-xs text-muted-foreground">{shortcut}</span>}
    </button>
  )
}

export function ProjectFileMenu({ file }: { file: ProjectFileControls }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const recent = useSettings((s) => s.projects.recent) ?? []

  // Klick außerhalb / Escape schließt das Menü
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
  const b = file.binding

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div ref={ref} className="relative">
        <Button
          size="sm"
          variant="outline"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={file.busy}
          onClick={() => setOpen((v) => !v)}
        >
          <FileText className="size-4" /> Datei
          <ChevronDown className="size-3.5" />
        </Button>
        {open && (
          <div
            role="menu"
            aria-label="Datei"
            className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-border bg-card p-1.5 shadow-xl"
          >
            <Item onClick={() => run(file.newFile)}>Neu</Item>
            <Item onClick={() => run(() => file.open())} shortcut={`${MOD}O`}>
              Öffnen …
            </Item>
            <Item onClick={() => run(file.save)} shortcut={`${MOD}S`}>
              Speichern
            </Item>
            <Item onClick={() => run(file.saveAs)} shortcut={`${MOD}${isMac ? '⇧' : 'Umschalt+'}S`}>
              Speichern unter …
            </Item>
            <Item
              disabled={!b}
              onClick={() => run(() => b && api.showItemInFolder(b.path))}
              title={b?.path}
            >
              Im Ordner zeigen
            </Item>
            {recent.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <p className="px-2.5 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Zuletzt geöffnet
                </p>
                {recent.map((p) => (
                  <Item key={p} title={p} onClick={() => run(() => file.open(p))}>
                    {projectDisplayName(p)}
                  </Item>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <span
        data-testid="project-file-chip"
        title={
          b
            ? `${b.path}${file.dirty ? ' – ungespeichert' : ''}`
            : 'Nicht in einer Projektdatei gespeichert'
        }
        className={cn('flex min-w-0 items-center gap-1.5 text-sm', !b && 'text-muted-foreground')}
      >
        {b && file.dirty && (
          <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="ungespeichert" />
        )}
        <span className="truncate">{b ? b.name : 'ohne Datei'}</span>
      </span>
    </div>
  )
}
