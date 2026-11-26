// Feld „Storyboard“ des Video-Generators (Arbeitsfläche, components/WorkArea.tsx). Im Kopf Anzahl
// und Gesamtdauer, „Hinzufügen“ (Bilder & Videos, Ordner), die Ansicht und das Menü „⋯“ mit
// Sortieren, Mischen und „Alle entfernen …“; darin die Elemente (Storyboard.tsx), die in sich
// scrollen; im Fuß das Zeitlineal und die Hinweise des Plans – beide bleiben beim Scrollen stehen,
// die Hinweise scrollen ab der vierten Zeile in sich. Dateien nimmt das ganze Feld an
// (useDateiAblage, gestrichelter Rahmen); über einer Kachel losgelassen, landen sie an dieser
// Stelle (das Storyboard nimmt sie dann selbst).
//
// Freigegeben am 25. November 2026 (Skizzen docs/bilder/video-generator-layout-breit.svg und
// …-mittel.svg): das Zeitlineal im Fuß bei den Hinweisen statt unter der letzten Kachel,
// Sortieren, Mischen und „Alle entfernen …“ im Menü „⋯“ wie „Bibliothek leeren“ im Player.

import { ChevronDown, Ellipsis, FolderInput, LayoutGrid, List, Loader2, Plus } from 'lucide-react'
import { Pane } from '@renderer/components/WorkArea'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@renderer/components/ui/menu'
import { Segmented } from '@renderer/components/ui/segmented'
import { STATUS } from '@renderer/components/ui/status'
import { api } from '@renderer/lib/api'
import { useDateiAblage } from '@renderer/lib/useDateiAblage'
import { cn } from '@renderer/lib/utils'
import { rateText } from '@shared/convertPlan'
import type { VgenElement, VgenHint, VgenProject } from '@shared/types'
import type { VgenPlan } from '@shared/videoGenPlan'
import { storyboardZahl } from './layout'
import type { Meta } from './meta'
import type { SortKey } from './order'
import { Ruler, Storyboard } from './Storyboard'

const LEVEL_STYLE = { error: STATUS.danger, warning: STATUS.warning, info: STATUS.info }

export function StoryboardFeld({
  elements,
  plan,
  meta,
  selected,
  view,
  onView,
  output,
  loading,
  hinweise,
  adding,
  busy,
  onAddFiles,
  onAddFolder,
  onAddPaths,
  onSort,
  onShuffle,
  onClear,
  onSelect,
  onMove,
  onRemove,
  onNudge
}: {
  elements: VgenElement[]
  plan: VgenPlan
  meta: Record<string, Meta>
  selected: string[]
  view: 'tiles' | 'list'
  onView: (view: 'tiles' | 'list') => void
  output: VgenProject['output']
  /** so viele Elemente werden noch analysiert – bis dahin keine Gesamtdauer */
  loading: number
  /** die Hinweise des Plans, die angezeigt werden */
  hinweise: VgenHint[]
  /** Dateien werden gerade eingelesen */
  adding: boolean
  /** Hinzufügen gesperrt: Es wird eingelesen oder ein Auftrag gestartet */
  busy: boolean
  onAddFiles: () => void
  onAddFolder: () => void
  /** Dateien oder Ordner einfügen; at = Platz, null = ans Ende */
  onAddPaths: (paths: string[], at: number | null) => void
  onSort: (key: SortKey) => void
  onShuffle: () => void
  /** alle entfernen (fragt nach) */
  onClear: () => void
  onSelect: (ids: string[]) => void
  onMove: (ids: string[], beforeId: string | null) => void
  onRemove: (ids: string[]) => void
  onNudge: (dir: -1 | 1) => void
}): JSX.Element {
  const leer = elements.length === 0
  const zeitlineal = plan.totalFrames > 0
  const ablage = useDateiAblage((dateien) => {
    const paths = dateien.map((f) => api.pathForFile(f)).filter(Boolean)
    if (paths.length) onAddPaths(paths, null)
  })
  const fuss = zeitlineal || adding || loading > 0 || hinweise.length > 0

  return (
    <Pane
      area="storyboard"
      testId="feld-storyboard"
      title="Storyboard"
      count={storyboardZahl(
        elements.length,
        loading === 0 && plan.totalFrames > 0 ? plan.durationSec : null
      )}
      ablage={ablage}
      actions={
        <>
          {/* h-6: Der Kopf bleibt 40 px hoch, wie in Playlist und Bibliothek des Players */}
          <Menu
            label="Hinzufügen"
            knopf={
              <>
                <Plus className="size-3.5" /> Hinzufügen
                <ChevronDown className="size-3 text-muted-foreground" />
              </>
            }
            variant="secondary"
            align="end"
            breite="w-48"
            className="h-6 gap-1 px-2"
            disabled={busy}
          >
            <MenuItem onSelect={onAddFiles}>Bilder &amp; Videos …</MenuItem>
            <MenuItem onSelect={onAddFolder}>Ordner …</MenuItem>
          </Menu>
          {!leer && (
            <Segmented
              size="sm"
              label="Ansicht"
              value={view}
              onChange={onView}
              options={[
                { value: 'tiles', label: 'Kacheln', Icon: LayoutGrid, iconOnly: true },
                { value: 'list', label: 'Liste', Icon: List, iconOnly: true }
              ]}
            />
          )}
          <Menu
            label="Storyboard"
            knopf={<Ellipsis className="size-4" />}
            knopfLabel="Mehr zum Storyboard"
            title="Mehr"
            align="end"
            className="size-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <MenuLabel>Sortieren</MenuLabel>
            <MenuItem disabled={elements.length < 2} onSelect={() => onSort('name')}>
              nach Name
            </MenuItem>
            <MenuItem disabled={elements.length < 2} onSelect={() => onSort('date')}>
              nach Aufnahmedatum
            </MenuItem>
            <MenuItem disabled={elements.length < 2} onSelect={() => onSort('type')}>
              nach Typ
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              disabled={elements.length < 2}
              title="Würfelt die Liste einmal sichtbar um – gerendert wird, was man sieht"
              onSelect={onShuffle}
            >
              Mischen
            </MenuItem>
            <MenuSeparator />
            <MenuItem disabled={leer} onSelect={onClear}>
              Alle entfernen …
            </MenuItem>
          </Menu>
        </>
      }
      footer={
        fuss ? (
          <div className="flex min-h-0 flex-col gap-2">
            {zeitlineal && (
              <div className="shrink-0">
                <Ruler plan={plan} selected={selected} onSelect={(id) => onSelect([id])} />
              </div>
            )}
            {adding && (
              <p className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Dateien werden eingelesen …
              </p>
            )}
            {loading > 0 && (
              <p className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Analyse läuft ({loading} offen) …
              </p>
            )}
            {hinweise.length > 0 && (
              // höchstens drei Zeilen (3 × 16 px + 2 × 4 px), mehr scrollen in sich
              <ul
                data-testid="vgen-hinweise"
                aria-label="Hinweise"
                className="max-h-14 min-h-0 space-y-1 overflow-y-auto"
              >
                {hinweise.map((h, i) => {
                  const st = LEVEL_STYLE[h.level]
                  return (
                    <li
                      key={`${h.id}-${i}`}
                      className={cn('flex items-start gap-2 text-xs', st.className)}
                    >
                      <st.icon className="mt-0.5 size-3.5 shrink-0" />
                      <button
                        type="button"
                        className="text-left hover:underline disabled:no-underline"
                        disabled={!h.elementId}
                        onClick={() => h.elementId && onSelect([h.elementId])}
                      >
                        {h.text}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : undefined
      }
    >
      {leer ? (
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
          <FolderInput className="size-5" />
          <p>Bilder, Videos oder Ordner hierher ziehen – oder über „Hinzufügen“.</p>
          <p className="text-xs">
            Ziel: {output.width} × {output.height}, {rateText(output.fps)} fps
          </p>
        </div>
      ) : (
        <Storyboard
          elements={elements}
          plan={plan}
          meta={meta}
          selected={selected}
          view={view}
          loop={plan.loop}
          onSelect={onSelect}
          onMove={onMove}
          onInsertFiles={onAddPaths}
          onRemove={onRemove}
          onNudge={onNudge}
        />
      )}
    </Pane>
  )
}
