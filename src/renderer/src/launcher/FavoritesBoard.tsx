// Favoriten als eigenes Dashboard: selbst benannte Kategorien in einem 12er-Raster
// (ganze Breite, ½, ⅓, ¼, ⅔, ¾ -> eine bis vier Kategorien nebeneinander). Kacheln und
// Kategorien lassen sich ziehen oder per Pfeil verschieben (auch über Kategoriegrenzen);
// Name per Doppelklick/Stift, Breite, A–Z und Löschen in der Leiste der Überschrift.

import { useRef, useState, type DragEvent } from 'react'
import {
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Pencil,
  Star,
  Trash2
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useDraft } from '@renderer/lib/useDraft'
import { cn } from '@renderer/lib/utils'
import type { ToolModule } from '@renderer/tools/types'
import type { FavoriteGroup, LauncherTileSize } from '@shared/types'
import {
  addGroup,
  canMoveTool,
  dropGroup,
  dropTool,
  moveGroup,
  moveToolBy,
  newGroupId,
  nextGroupName,
  removeGroup,
  renameGroup,
  setSpan,
  sortGroup,
  SPAN_OPTIONS
} from './favoriteGroups'
import { tileGridStyle, type TileDrag, type TileDrop, type TileMove } from './ToolCard'

/** Was gerade gezogen wird – geteilt mit den Kacheln aus „Alle" (Ziehen = Favorit). */
export type DragItem = { kind: 'tool'; id: string } | { kind: 'group'; id: string }

type Mark =
  | { kind: 'tile'; toolId: string; after: boolean }
  | { kind: 'end'; groupId: string }
  | { kind: 'group'; groupId: string; after: boolean }

/** Rechte Hälfte des Elements unter dem Mauszeiger? (vor/hinter einsortieren) */
function afterHalf(e: DragEvent): boolean {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientX > r.left + r.width / 2
}

export function FavoritesBoard({
  groups,
  toolById,
  visible,
  searching,
  size,
  drag,
  setDrag,
  renderTile,
  update,
  announce
}: {
  groups: FavoriteGroup[]
  toolById: (id: string) => ToolModule | undefined
  /** Suchtreffer? */
  visible: (tool: ToolModule) => boolean
  /** Suche aktiv: nicht bearbeitbar (unsichtbare Nachbarn machten Ziele mehrdeutig) */
  searching: boolean
  size: LauncherTileSize
  drag: DragItem | null
  setDrag: (d: DragItem | null) => void
  renderTile: (
    tool: ToolModule,
    extras: { drag?: TileDrag; drop?: TileDrop; move?: TileMove }
  ) => JSX.Element
  update: (fn: (g: FavoriteGroup[]) => FavoriteGroup[]) => void
  announce: (text: string) => void
}): JSX.Element {
  const [mark, setMark] = useState<Mark | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const editable = !searching
  const exists = (id: string): boolean => toolById(id) !== undefined

  function endDrag(): void {
    setDrag(null)
    setMark(null)
  }

  function addCategory(): void {
    const id = newGroupId()
    update((g) => addGroup(g, nextGroupName(g), 6, id).groups)
    setEditId(id)
  }

  // Über einer Kategorie (nicht über einer Kachel): Werkzeug ans Ende bzw. Kategorie
  // davor/dahinter
  function groupDragOver(e: DragEvent, group: FavoriteGroup): void {
    if (!drag || !editable || (drag.kind === 'group' && drag.id === group.id)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (drag.kind === 'tool') {
      if (mark?.kind !== 'end' || mark.groupId !== group.id) {
        setMark({ kind: 'end', groupId: group.id })
      }
      return
    }
    const after = afterHalf(e)
    if (mark?.kind !== 'group' || mark.groupId !== group.id || mark.after !== after) {
      setMark({ kind: 'group', groupId: group.id, after })
    }
  }

  function groupDrop(e: DragEvent, group: FavoriteGroup): void {
    if (!drag || !editable) return
    e.preventDefault()
    if (drag.kind === 'tool') update((g) => dropTool(g, drag.id, group.id))
    else if (drag.id !== group.id) update((g) => dropGroup(g, drag.id, group.id, afterHalf(e)))
    endDrag()
  }

  function tileExtras(
    tool: ToolModule,
    group: FavoriteGroup
  ): { drag?: TileDrag; drop?: TileDrop; move?: TileMove } {
    if (!editable) return {}
    const draggingThis = drag?.kind === 'tool' && drag.id === tool.id
    return {
      drag: {
        dragging: draggingThis,
        onDragStart: (e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', tool.id)
          setDrag({ kind: 'tool', id: tool.id })
        },
        onDragEnd: endDrag
      },
      drop: {
        side:
          mark?.kind === 'tile' && mark.toolId === tool.id && drag && !draggingThis
            ? mark.after
              ? 'after'
              : 'before'
            : null,
        onDragOver: (e) => {
          // Kategorien zieht die Kategorie-Fläche – hier nur Werkzeuge
          if (drag?.kind !== 'tool') return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          const after = afterHalf(e)
          if (mark?.kind !== 'tile' || mark.toolId !== tool.id || mark.after !== after) {
            setMark({ kind: 'tile', toolId: tool.id, after })
          }
        },
        onDrop: (e) => {
          if (drag?.kind !== 'tool') return
          e.preventDefault()
          e.stopPropagation()
          const near = { toolId: tool.id, after: afterHalf(e) }
          update((g) => dropTool(g, drag.id, group.id, near))
          endDrag()
        }
      },
      move: {
        canPrev: canMoveTool(groups, tool.id, -1, exists),
        canNext: canMoveTool(groups, tool.id, 1, exists),
        onMove: (delta) => {
          update((g) => moveToolBy(g, tool.id, delta, exists))
          announce(`${tool.name} ${delta < 0 ? 'nach vorne' : 'nach hinten'} verschoben`)
        }
      }
    }
  }

  return (
    <section aria-label="Favoriten" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Star className="size-3.5 fill-current text-primary" /> Favoriten
        </h2>
        {editable && (
          <>
            <span className="text-xs text-muted-foreground">
              Kacheln und Kategorien ziehen · Name, Breite und Reihenfolge an der Überschrift
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 text-xs"
              onClick={addCategory}
              title="Neue Kategorie anlegen"
            >
              <FolderPlus className="size-3.5" /> Kategorie
            </Button>
          </>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {groups.map((group, gi) => {
          const items = group.toolIds
            .map(toolById)
            .filter((t): t is ToolModule => t != null && visible(t))
          // Beim Suchen nur Kategorien mit Treffern
          if (searching && !items.length) return null
          const span = group.span
          const groupMark = mark?.kind === 'group' && mark.groupId === group.id ? mark : null
          return (
            <div
              key={group.id}
              style={{ gridColumn: `span ${span} / span ${span}` }}
              onDragOver={(e) => groupDragOver(e, group)}
              onDrop={(e) => groupDrop(e, group)}
              className={cn(
                'group/panel relative min-w-0 rounded-lg border border-border/60 bg-muted/15 p-3 transition-colors',
                mark?.kind === 'end' &&
                  mark.groupId === group.id &&
                  'border-primary/60 bg-primary/5',
                drag?.kind === 'group' && drag.id === group.id && 'opacity-40'
              )}
            >
              {groupMark && (
                <span
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute inset-y-2 w-1 rounded-full bg-primary',
                    groupMark.after ? '-right-2.5' : '-left-2.5'
                  )}
                />
              )}
              <GroupHeader
                group={group}
                count={items.length}
                editable={editable}
                editing={editId === group.id}
                setEditing={(on) => setEditId(on ? group.id : null)}
                canPrev={gi > 0}
                canNext={gi < groups.length - 1}
                // die letzte Kategorie nur leer löschbar (sonst gingen Favoriten verloren)
                canRemove={groups.length > 1 || group.toolIds.length === 0}
                onRename={(name) => update((g) => renameGroup(g, group.id, name))}
                onSpan={(s) => update((g) => setSpan(g, group.id, s))}
                onSort={() => update((g) => sortGroup(g, group.id, (id) => toolById(id)?.name))}
                onMove={(delta) => {
                  update((g) => moveGroup(g, group.id, delta))
                  announce(`Kategorie ${group.name} ${delta < 0 ? 'nach vorne' : 'nach hinten'}`)
                }}
                onRemove={() => update((g) => removeGroup(g, group.id))}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', group.id)
                  setDrag({ kind: 'group', id: group.id })
                }}
                onDragEnd={endDrag}
              />
              {items.length > 0 ? (
                <div className="grid gap-3" style={tileGridStyle(size)}>
                  {items.map((tool) => (
                    <div key={tool.id} className="min-w-0">
                      {renderTile(tool, tileExtras(tool, group))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="flex min-h-16 items-center justify-center rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Werkzeuge hierher ziehen – oder in „Alle" den Stern antippen
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function GroupHeader({
  group,
  count,
  editable,
  editing,
  setEditing,
  canPrev,
  canNext,
  canRemove,
  onRename,
  onSpan,
  onSort,
  onMove,
  onRemove,
  onDragStart,
  onDragEnd
}: {
  group: FavoriteGroup
  count: number
  editable: boolean
  editing: boolean
  setEditing: (on: boolean) => void
  canPrev: boolean
  canNext: boolean
  canRemove: boolean
  onRename: (name: string) => void
  onSpan: (span: number) => void
  onSort: () => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
}): JSX.Element {
  const btn =
    'rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30'
  return (
    <div className="mb-2 flex min-h-7 items-center gap-1">
      {editable && (
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Kategorie ziehen"
          className="-ml-1 cursor-grab rounded p-0.5 text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </span>
      )}
      {editing ? (
        <NameInput
          value={group.name}
          onCommit={(name) => {
            onRename(name)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <h3
          className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          onDoubleClick={() => editable && setEditing(true)}
          title={editable ? 'Doppelklick zum Umbenennen' : undefined}
        >
          {group.name}
        </h3>
      )}
      <span className="shrink-0 text-xs text-muted-foreground/60">{count}</span>
      {editable && !editing && (
        // Leiste erscheint beim Überfahren der Kategorie bzw. mit Tastaturfokus
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/panel:opacity-100">
          <button
            type="button"
            className={btn}
            title="Umbenennen"
            aria-label={`Kategorie ${group.name} umbenennen`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" />
          </button>
          <select
            aria-label={`Breite der Kategorie ${group.name}`}
            title="Breite"
            value={group.span}
            onChange={(e) => onSpan(Number(e.target.value))}
            className="h-6 rounded-md border border-border bg-input/40 px-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          >
            {SPAN_OPTIONS.map((o) => (
              <option key={o.span} value={o.span}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btn}
            title="Alphabetisch sortieren"
            aria-label={`Kategorie ${group.name} alphabetisch sortieren`}
            onClick={onSort}
          >
            <ArrowDownAZ className="size-3.5" />
          </button>
          <button
            type="button"
            className={btn}
            disabled={!canPrev}
            title="Kategorie nach vorne"
            aria-label={`Kategorie ${group.name} nach vorne`}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            className={btn}
            disabled={!canNext}
            title="Kategorie nach hinten"
            aria-label={`Kategorie ${group.name} nach hinten`}
            onClick={() => onMove(1)}
          >
            <ChevronRight className="size-3.5" />
          </button>
          <button
            type="button"
            className={btn}
            disabled={!canRemove}
            title={
              canRemove
                ? 'Kategorie löschen (Werkzeuge bleiben Favoriten)'
                : 'Die letzte Kategorie lässt sich nur leer löschen'
            }
            aria-label={`Kategorie ${group.name} löschen`}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function NameInput({
  value,
  onCommit,
  onCancel
}: {
  value: string
  onCommit: (name: string) => void
  onCancel: () => void
}): JSX.Element {
  const { ref, text, setText } = useDraft(value)
  // Enter/Escape beenden genau einmal – ein Blur beim Ausblenden des Felds darf ein
  // Escape nicht nachträglich doch noch übernehmen
  const done = useRef(false)
  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(text)
    else onCancel()
  }
  return (
    <Input
      ref={ref}
      autoFocus
      value={text}
      maxLength={40}
      aria-label="Name der Kategorie"
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      className="h-7 max-w-56 text-sm"
    />
  )
}
