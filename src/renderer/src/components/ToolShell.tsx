// Einheitliches Werkzeug-Layout (für alle Werkzeuge gleich):
//
//   Kopfleiste (ToolHost)   App-Menü · Start · Werkzeug · [Einstellungen] · Fenster
//   Leiste (bar)            Ausgabe: Monitor, Vollbild, NDI, Handy – rot umrandet, solange live
//                           (Werkzeuge ohne Live-Ausgabe: ihr Auftrag, bernstein, solange er läuft)
//   Schublade | Arbeitsfläche
//
// Die Einstellungen liegen in einer Schublade LINKS. Angeheftet schiebt sie die Arbeitsfläche
// zur Seite (zum Einrichten), gelöst schwebt sie darüber und ist in der Show schnell wieder zu:
// Ein Klick in die Arbeitsfläche schließt sie. In Fenstern unter 1100 px Breite schwebt sie
// immer – angeheftet ließe sie der Arbeitsfläche bei 1024 px nur 664 px, und große Werkzeuge
// scrollten. „Angeheftet“ bleibt dabei gemerkt und gilt wieder, sobald das Fenster breiter ist.
// Offen/angeheftet merkt sich jedes Werkzeug selbst. Der Knopf „Einstellungen“ sitzt in der
// Kopfleiste neben dem Werkzeugnamen – ToolHost stellt dafür einen Platz bereit
// (ToolChromeContext), ToolShell hängt den Knopf per Portal dort ein.
import {
  createContext,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Pin, PinOff, SlidersHorizontal, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { flag, readStored, usePersistentState } from '@renderer/lib/usePersistentState'

/** Was die Kopfleiste (ToolHost) dem Werkzeug bereitstellt. */
export interface ToolChrome {
  /** Platz in der Kopfleiste für den Knopf „Einstellungen“ */
  settingsSlot: HTMLElement | null
  toolName: string
}
export const ToolChromeContext = createContext<ToolChrome>({ settingsSlot: null, toolName: '' })

const ShellCtx = createContext<string>('tool')

/** Unter dieser Fensterbreite (px) schwebt die Schublade immer, auch wenn sie angeheftet ist */
const SCHWEBT_UNTER = 1100
const SCHMALES_FENSTER = `(width < ${SCHWEBT_UNTER}px)`

function fensterbreiteBeobachten(melden: () => void): () => void {
  const mq = window.matchMedia(SCHMALES_FENSTER)
  mq.addEventListener('change', melden)
  return () => mq.removeEventListener('change', melden)
}

/** Ist das Fenster schmaler als SCHWEBT_UNTER? Folgt jeder Größenänderung. */
function useSchmalesFenster(): boolean {
  return useSyncExternalStore(
    fensterbreiteBeobachten,
    () => window.matchMedia(SCHMALES_FENSTER).matches
  )
}

export function ToolShell({
  id,
  bar,
  main,
  aside,
  asideWidth = 360,
  asideOpen = true
}: {
  /** eindeutige Tool-Kennung – Namensraum für gemerkte Panel-Zustände */
  id: string
  /** Leiste unter der Kopfleiste: `ToolBar` mit Ausgabe bzw. Auftrag */
  bar?: ReactNode
  main: ReactNode
  /** Einstellungen (Schublade links); weggelassen -> kein Einstellungs-Knopf */
  aside?: ReactNode
  /** Breite der Schublade in px */
  asideWidth?: number
  /** Schublade offen, solange der Nutzer nichts anderes gewählt hat (Bedienfelder: zu) */
  asideOpen?: boolean
}): JSX.Element {
  const { settingsSlot, toolName } = useContext(ToolChromeContext)
  // Früher hieß der Zustand „Panel eingeklappt“ – wer es zu hatte, findet es wieder zu.
  const [wasOpen] = useState(() => !readStored(`shell:${id}:aside`, !asideOpen, flag))
  const [open, setOpen] = usePersistentState(`shell:${id}:drawer`, wasOpen, flag)
  const [pinned, setPinned] = usePersistentState(`shell:${id}:pin`, true, flag)
  const hasAside = aside != null
  const schmal = useSchmalesFenster()
  // Was gilt: Im schmalen Fenster schwebt sie, der gemerkte Wert (pinned) bleibt unangetastet
  const angeheftet = pinned && !schmal
  const schwebt = hasAside && open && !angeheftet
  const schubladeRef = useRef<HTMLElement>(null)
  const nadelHinweis = schmal
    ? `Im schmalen Fenster schwebt die Schublade, damit die Arbeitsfläche Platz hat – ${
        pinned ? 'angeheftet ist sie wieder' : 'anheften geht'
      }, sobald das Fenster breiter ist (ab ${SCHWEBT_UNTER} px).`
    : angeheftet
      ? 'Lösen: schwebt über der Arbeitsfläche (für die Show)'
      : 'Anheften: schiebt die Arbeitsfläche zur Seite (zum Einrichten)'

  /** Klick in die Arbeitsfläche, während die Schublade schwebt: Sie geht zu, der Klick wirkt. */
  function schliessenDaneben(): void {
    // Erst das Feld verlassen, in dem gerade getippt wird: TextField und NumberField übernehmen
    // beim Verlassen, ein abgebautes Feld meldet das nicht mehr
    const aktiv = document.activeElement
    if (aktiv instanceof HTMLElement && schubladeRef.current?.contains(aktiv)) aktiv.blur()
    setOpen(false)
  }

  return (
    <ShellCtx.Provider value={id}>
      <div className="flex h-full min-h-0 flex-col">
        {bar}
        <div className="relative flex min-h-0 flex-1">
          {hasAside && open && (
            <aside
              ref={schubladeRef}
              data-testid="settings-drawer"
              data-pinned={angeheftet}
              aria-label={toolName ? `Einstellungen ${toolName}` : 'Einstellungen'}
              className={cn(
                'flex max-w-full shrink-0 flex-col border-r border-border bg-card',
                angeheftet
                  ? 'relative'
                  : 'absolute inset-y-0 left-0 z-30 shadow-2xl shadow-black/50'
              )}
              style={{ width: asideWidth }}
            >
              <div className="flex items-center gap-1 border-b border-border py-2 pl-4 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Einstellungen</div>
                  {toolName && (
                    <div className="truncate text-xs text-muted-foreground">{toolName}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-pressed={angeheftet}
                  aria-label={angeheftet ? 'Schublade lösen' : 'Schublade anheften'}
                  // aria-disabled statt disabled: Ein gesperrter Knopf nimmt keine Maus an
                  // (pointer-events-none) – dann erschiene auch der Hinweis nicht, warum
                  aria-disabled={schmal || undefined}
                  title={nadelHinweis}
                  className={cn(
                    angeheftet ? 'text-primary' : 'text-muted-foreground',
                    schmal && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                  )}
                  onClick={() => {
                    if (!schmal) setPinned((p) => !p)
                  }}
                >
                  {angeheftet ? <Pin className="size-4" /> : <PinOff className="size-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Einstellungen schließen"
                  title="Einstellungen schließen"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-3">{aside}</div>
            </aside>
          )}
          {/* capture: auch wenn ein Element darin den Klick selbst abfängt (Griffe, Hebel) */}
          <section
            data-testid="tool-main"
            className="min-w-0 flex-1 overflow-auto"
            onPointerDownCapture={schwebt ? schliessenDaneben : undefined}
          >
            {main}
          </section>
        </div>
      </div>
      {hasAside &&
        settingsSlot &&
        createPortal(
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              open && 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15'
            )}
          >
            <SlidersHorizontal className="size-4" /> Einstellungen
          </Button>,
          settingsSlot
        )}
    </ShellCtx.Provider>
  )
}

/**
 * Ein Bereich der Einstellungen: Symbol, Titel und eine Zusammenfassung der wichtigsten Werte
 * (bleibt auch zugeklappt sichtbar). Auf-/Zu-Zustand wird je Werkzeug gemerkt.
 */
export function PanelSection({
  id,
  title,
  icon: Icon,
  summary,
  right,
  defaultOpen = true,
  children
}: {
  id: string
  title: string
  icon?: LucideIcon
  /** Kurzfassung der Werte, z. B. „Blur-Fill · Blur 50 % · Abdunkeln 0 %“ */
  summary?: ReactNode
  /** kleine, nicht-interaktive Anzeige rechts im Kopf (z. B. Status-Badge) */
  right?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}): JSX.Element {
  const toolId = useContext(ShellCtx)
  const [open, setOpen] = usePersistentState(`panel:${toolId}:${id}`, defaultOpen, flag)

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/70"
      >
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          {summary != null && summary !== '' && (
            <span className="block truncate text-xs text-muted-foreground">{summary}</span>
          )}
        </span>
        {right}
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90'
          )}
        />
      </button>
      {open && <div className="space-y-3 border-t border-border p-3">{children}</div>}
    </section>
  )
}

/**
 * Leiste unter der Kopfleiste, in jedem Werkzeug am selben Platz.
 * - `output`: Ausgabe (Monitor, Vollbild, NDI, Handy). Rot umrandet mit „Live“, solange
 *   etwas auf einem Ausgang läuft – Rot ist dafür reserviert (auch keine rote Akzentfarbe).
 * - `job`: Werkzeuge ohne Live-Ausgabe nutzen den Platz für ihren Auftrag (Ziel, Start);
 *   bernsteinfarben mit „Läuft“, solange er läuft.
 */
export function ToolBar({
  label,
  kind = 'output',
  active = false,
  status,
  children
}: {
  label: string
  kind?: 'output' | 'job'
  active?: boolean
  /** rechts: was gerade läuft (Titel, Restzeit, Fortschritt) */
  status?: ReactNode
  children: ReactNode
}): JSX.Element {
  const live = kind === 'output'
  return (
    <div
      role="region"
      aria-label={label}
      data-testid="tool-bar"
      data-kind={kind}
      data-active={active}
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2 transition-colors',
        !active && 'bg-card/60',
        active && live && 'bg-danger/10 ring-2 ring-inset ring-danger',
        active && !live && 'bg-warning/10 ring-2 ring-inset ring-warning'
      )}
    >
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        {label}
      </span>
      {active && (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            live
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-warning text-warning-foreground'
          )}
        >
          {live ? 'Live' : 'Läuft'}
        </span>
      )}
      {children}
      {status != null && (
        <div className="ml-auto flex min-w-0 items-center gap-2 text-sm tabular-nums">{status}</div>
      )}
    </div>
  )
}

/** Schalter in der Leiste (NDI, Handy …): Punkt grün, solange an. */
export function BarToggle({
  on,
  onClick,
  disabled,
  title,
  children
}: {
  on: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50',
        on
          ? 'border-success/50 bg-success/10 text-foreground'
          : 'border-border bg-background/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className={cn('size-2 rounded-full', on ? 'bg-success' : 'bg-muted-foreground/50')} />
      {children}
    </button>
  )
}

/** Trennstrich zwischen Gruppen in der Leiste */
export function BarDivider(): JSX.Element {
  return <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
}
