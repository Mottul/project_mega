// Kleines Aufklappmenü: „⋯“ im Kopf eines Felds (Muster 1 im Leitbild von docs/PLAN.md) und
// Knöpfe mit Einträgen. Gezogen aus den Menüs der Leiste (led-wall/WallMenu.tsx,
// ProjectFileMenu.tsx – die stellt Paket E10 um).
//
// Die Liste hängt am <body> (fixed): Ein Feld der Arbeitsfläche schneidet ab, was über seinen Rand
// ragt (overflow-hidden) – in einem niedrigen Feld wäre ein Menü sonst halb verschwunden. Weil sie
// damit nicht mehr hinter dem Knopf in der Tab-Reihenfolge steht, führt das Menü den Fokus selbst:
// Öffnen setzt ihn auf den ersten Eintrag, ↑/↓/Pos1/Ende wandern, Esc, Tab und die Wahl eines
// Eintrags schließen und geben ihn dem Knopf zurück. Ein Klick daneben schließt, beim Scrollen
// läuft die Liste mit (wie das ⓘ). Tasten, die das Menü auswertet, erreichen das Werkzeug nicht –
// im Video-Player wären ↑/↓ sonst die Lautstärke und die Leertaste Play/Pause.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button, type ButtonProps } from './button'

/** Abstand der Liste zum Knopf und kleinster Abstand zum Fensterrand, in px */
const ABSTAND = 4
const RAND = 8

/** Schließen aus einem Eintrag heraus – der Fokus geht zurück an den Knopf */
const SchliessenCtx = createContext<() => void>(() => {})

/** Einträge, die den Fokus nehmen können, in ihrer Reihenfolge */
function eintraege(liste: HTMLElement | null): HTMLElement[] {
  return liste ? [...liste.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')] : []
}

export function Menu({
  knopf,
  label,
  knopfLabel,
  title,
  align = 'start',
  breite = 'w-56',
  variant = 'ghost',
  size = 'sm',
  className,
  disabled,
  children
}: {
  /** Inhalt des Knopfs: ein Symbol („⋯“) oder Text („Importieren ▾“) */
  knopf: ReactNode
  /** Name des Menüs für Screenreader */
  label: string
  /** Name des Knopfs, wenn er nur ein Symbol zeigt */
  knopfLabel?: string
  title?: string
  /** an welcher Kante des Knopfs die Liste ausgerichtet ist */
  align?: 'start' | 'end'
  /** Breite der Liste (Tailwind-Klasse) */
  breite?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  /** Klassen für den Knopf */
  className?: string
  disabled?: boolean
  /** MenuItem, MenuSeparator, MenuLabel */
  children: ReactNode
}): JSX.Element {
  const [offen, setOffen] = useState(false)
  const [lage, setLage] = useState<{ left: number; top: number } | null>(null)
  const knopfRef = useRef<HTMLButtonElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const schliessen = useCallback((fokusZurueck: boolean): void => {
    setOffen(false)
    setLage(null)
    if (fokusZurueck) knopfRef.current?.focus({ preventScroll: true })
  }, [])
  const nachWahl = useCallback(() => schliessen(true), [schliessen])

  const platzieren = useCallback((): void => {
    const k = knopfRef.current
    const l = listeRef.current
    if (!k || !l) return
    const r = k.getBoundingClientRect()
    const w = l.offsetWidth
    const h = l.offsetHeight
    const left = Math.min(
      Math.max(RAND, align === 'end' ? r.right - w : r.left),
      window.innerWidth - w - RAND
    )
    // Passt sie unten nicht hin, oben aber schon, klappt sie nach oben auf
    const unten = r.bottom + ABSTAND
    const top =
      unten + h > window.innerHeight - RAND && r.top - ABSTAND - h >= RAND
        ? r.top - ABSTAND - h
        : unten
    setLage({ left, top })
  }, [align])

  // Vor dem ersten Zeichnen: Lage aus Knopf und Liste, Fokus auf den ersten Eintrag
  useLayoutEffect(() => {
    if (!offen) return
    platzieren()
    eintraege(listeRef.current)[0]?.focus({ preventScroll: true })
  }, [offen, platzieren])

  useEffect(() => {
    if (!offen) return
    const daneben = (e: PointerEvent): void => {
      const t = e.target as Node
      if (knopfRef.current?.contains(t) || listeRef.current?.contains(t)) return
      schliessen(false)
    }
    // Esc schließt zuerst das Menü, nicht zugleich etwas dahinter (darum im Capture, angehalten)
    const esc = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      schliessen(true)
    }
    let frame = 0
    const folgen = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(platzieren)
    }
    document.addEventListener('pointerdown', daneben, true)
    window.addEventListener('keydown', esc, true)
    window.addEventListener('scroll', folgen, true)
    window.addEventListener('resize', folgen)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', daneben, true)
      window.removeEventListener('keydown', esc, true)
      window.removeEventListener('scroll', folgen, true)
      window.removeEventListener('resize', folgen)
    }
  }, [offen, platzieren, schliessen])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const liste = eintraege(listeRef.current)
    const i = liste.indexOf(document.activeElement as HTMLElement)
    const gehe = (j: number): void => liste[(j + liste.length) % liste.length]?.focus()
    switch (e.key) {
      case 'ArrowDown':
        gehe(i + 1)
        break
      case 'ArrowUp':
        gehe(i < 0 ? -1 : i - 1)
        break
      case 'Home':
        gehe(0)
        break
      case 'End':
        gehe(-1)
        break
      case 'Tab':
        schliessen(true)
        break
      case 'Enter':
      case ' ':
        // Der Eintrag löst selbst aus – das Werkzeug soll die Taste nicht auch bekommen
        e.stopPropagation()
        return
      default:
        return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <>
      <Button
        ref={knopfRef}
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        title={title}
        aria-label={knopfLabel}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? id : undefined}
        onClick={() => (offen ? schliessen(false) : setOffen(true))}
        // Leertaste und Enter öffnen das Menü – nicht zugleich ein Kürzel des Werkzeugs
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') e.stopPropagation()
        }}
      >
        {knopf}
      </Button>
      {offen &&
        createPortal(
          <SchliessenCtx.Provider value={nachWahl}>
            <div
              ref={listeRef}
              id={id}
              role="menu"
              aria-label={label}
              onKeyDown={onKeyDown}
              className={cn(
                'fixed z-50 rounded-lg border border-border bg-card p-1.5 shadow-xl',
                breite
              )}
              // Erst durchsichtig messen: anders als mit visibility nimmt sie dabei den Fokus
              style={lage ?? { left: 0, top: 0, opacity: 0 }}
            >
              {children}
            </div>
          </SchliessenCtx.Provider>,
          document.body
        )}
    </>
  )
}

/** Eintrag; mit `checked` eine Auswahl mit Häkchen (z. B. die Ansicht) */
export function MenuItem({
  onSelect,
  disabled,
  title,
  shortcut,
  checked,
  children
}: {
  onSelect: () => void
  disabled?: boolean
  title?: string
  /** Tastenkürzel rechts, nur zur Anzeige */
  shortcut?: string
  checked?: boolean
  children: ReactNode
}): JSX.Element {
  const schliessen = useContext(SchliessenCtx)
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => {
        schliessen()
        onSelect()
      }}
      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      {checked !== undefined && (
        <Check className={cn('size-3.5 shrink-0', !checked && 'invisible')} />
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="shrink-0 text-xs text-muted-foreground">{shortcut}</span>}
    </button>
  )
}

export function MenuSeparator(): JSX.Element {
  return <div role="separator" className="my-1 h-px bg-border" />
}

/** Überschrift eines Abschnitts im Menü („Zuletzt geöffnet“) */
export function MenuLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="px-2.5 pb-1 pt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  )
}
