// Kopfzeile der OSC-Steuerung: Projekte (Set-Sammlungen) und darunter die Sets des Projekts mit
// Name, Spaltenraster, „+ Widget“, Geräte-Vorschau und Edit/Live.

import {
  Monitor as MonitorIcon,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Smartphone,
  Star,
  Tablet,
  Trash2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { NumberField } from '@renderer/components/ui/number-field'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import {
  MAX_COLS,
  MIN_COLS,
  useOscSurface,
  type OscMode,
  type OscProject,
  type OscSet
} from './store'
import type { DeviceKey } from './oscShared'
import { DeviceBtn } from './Surface'

export function ProjectSetBar({
  projects,
  project,
  defaultProjectId,
  sets,
  set,
  columns,
  device,
  landscape,
  previewing,
  mode,
  live,
  setStore,
  setPicker
}: {
  projects: OscProject[]
  project: OscProject
  defaultProjectId: string | null
  sets: OscSet[]
  set: OscSet
  columns: number
  device: DeviceKey
  landscape: boolean
  previewing: boolean
  mode: OscMode
  live: boolean
  setStore: (patch: { mode: OscMode }) => void
  /** Einfüge-Menü an dieser Stelle öffnen (seitlich einreihen) */
  setPicker: (at: { x: number; y: number }) => void
}): JSX.Element {
  return (
    <div className="border-b border-border px-5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Projekt
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => useOscSurface.getState().selectProject(p.id)}
              className={cn(
                'flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm transition-colors',
                p.id === project.id
                  ? 'border-primary/60 bg-primary/10 font-semibold text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {p.id === defaultProjectId && <Star className="size-3 fill-current opacity-70" />}
              {p.name || '—'}
            </button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            title="Projekt hinzufügen (übernimmt das Default-Projekt, falls gesetzt)"
            onClick={() => useOscSurface.getState().addProject()}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="h-5 w-px bg-border" />
        <Input
          value={project.name}
          onChange={(e) => useOscSurface.getState().renameProject(project.id, e.target.value)}
          placeholder="Projekt-Titel"
          title="Titel = erstes OSC-Adresssegment neuer Widgets (z. B. „mottl“ → /mottl/fader)"
          className="h-8 w-40"
        />
        <Button
          variant="outline"
          size="sm"
          title="Aktuelles Projekt als Default-Projekt speichern (Vorlage für neue Projekte)"
          onClick={() => useOscSurface.getState().saveAsDefaultProject()}
        >
          <Star
            className={cn(
              'size-3.5',
              defaultProjectId === project.id && 'fill-current text-primary'
            )}
          />{' '}
          Default
        </Button>
        {projects.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            title="Projekt löschen"
            onClick={() => {
              void api
                .confirm({
                  message: `Projekt „${project.name}“ mit allen Sets löschen?`,
                  confirmLabel: 'Löschen',
                  danger: true
                })
                .then((ok) => {
                  if (ok) useOscSurface.getState().deleteProject(project.id)
                })
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      {/* deutliche Trennung Projekt <-> Sets */}
      <div className="-mx-5 my-2 h-px bg-border" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Set
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {sets.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => useOscSurface.getState().selectSet(b.id)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                b.id === set.id
                  ? 'border-primary/60 bg-primary/10 font-semibold text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {b.name}
            </button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            title="Set hinzufügen"
            onClick={() => useOscSurface.getState().addSet()}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* Aktives Set: Name + Spaltenraster direkt im Header. */}
        <div className="h-5 w-px bg-border" />
        <Input
          value={set.name}
          onChange={(e) => useOscSurface.getState().renameSet(set.id, e.target.value)}
          placeholder="Set-Name"
          className="h-8 w-36"
        />
        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          Spalten
          <NumberField
            value={columns}
            min={MIN_COLS}
            max={MAX_COLS}
            onCommit={(v) => useOscSurface.getState().setColumns(v)}
            className="h-8 w-16"
          />
        </label>
        {sets.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            title="Set löschen"
            onClick={() => {
              void api
                .confirm({
                  message: `Set „${set.name}“ wirklich löschen?`,
                  confirmLabel: 'Löschen',
                  danger: true
                })
                .then((ok) => {
                  if (ok) useOscSurface.getState().deleteSet(set.id)
                })
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            if (mode !== 'edit') setStore({ mode: 'edit' })
            setPicker({ x: Math.max(8, r.left - 140), y: r.bottom + 4 })
          }}
        >
          <Plus className="size-4" /> Widget
        </Button>

        {/* Geräte-Vorschau */}
        <div className="flex overflow-hidden rounded-md border border-border">
          <DeviceBtn
            active={!previewing}
            title="Normale Ansicht"
            onClick={() => useOscSurface.getState().setDevice('off')}
          >
            <MonitorIcon className="size-4" />
          </DeviceBtn>
          <DeviceBtn
            active={device === 'phone'}
            title="Handy-Vorschau"
            onClick={() => useOscSurface.getState().setDevice('phone')}
          >
            <Smartphone className="size-4" />
          </DeviceBtn>
          <DeviceBtn
            active={device === 'tablet'}
            title="Tablet-Vorschau"
            onClick={() => useOscSurface.getState().setDevice('tablet')}
          >
            <Tablet className="size-4" />
          </DeviceBtn>
        </div>
        {previewing && (
          <Button
            variant="ghost"
            size="icon"
            title="Hoch-/Querformat"
            onClick={() => useOscSurface.getState().setLandscape(!landscape)}
          >
            <RotateCw className="size-4" />
          </Button>
        )}

        {/* Edit / Live */}
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            onClick={() => setStore({ mode: 'edit' })}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-sm transition-colors',
              !live
                ? 'bg-primary/15 font-semibold text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Pencil className="size-4" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setStore({ mode: 'live' })}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-sm transition-colors',
              live
                ? 'bg-success/20 font-semibold text-success'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Play className="size-4" /> Live
          </button>
        </div>
      </div>
    </div>
  )
}
