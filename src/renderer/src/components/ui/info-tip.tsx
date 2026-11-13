// Kurze Erklärung hinter einem ⓘ statt eines Absatzes unter jeder Option – so bleiben die
// Einstellungen ruhig. Maus: Darüberfahren zeigt die Blase, ein Klick hält sie offen. Finger: ein
// Tipp öffnet, ein zweiter oder einer daneben schließt (auf dem Handy kommt beim Tippen daneben
// oft kein blur, die Blase blieb sonst stehen). Die Blase hängt am <body> (fixed) – im
// scrollenden Einstellungs-Panel würde sie sonst abgeschnitten – und läuft beim Scrollen und bei
// einer neuen Fenstergröße mit. Schließen beim Scrollen ging nicht: Ein Klick auf ein ⓘ weiter
// unten scrollt es erst ins Bild, und die Blase ging gleich wieder zu (e2e/layout.mjs).
// Zeilenumbrüche im Text bleiben stehen (Listen wie die Tastenkürzel des Players).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@renderer/lib/utils'

const WIDTH = 256
const GAP = 6

/** Fokus per Tastatur? (Safari vor 15.4 kennt :focus-visible nicht – dann wie bisher: ja) */
function keyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

export function InfoTip({
  text,
  label = 'Erklärung',
  className
}: {
  text: string
  /** Name für Screenreader, z. B. „Erklärung zu Chunks“ */
  label?: string
  className?: string
}): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const open = hover || pinned

  const place = useCallback((): void => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - 8
    )
    setPos({ left, top: r.bottom + GAP })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  // Offen: Tippen oder Klicken daneben schließt; Scrollen (auch eines Bereichs, daher capture)
  // und eine neue Fenstergröße rücken die Blase nach – einmal je Bild
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent): void => {
      if (ref.current?.contains(e.target as Node)) return
      setHover(false)
      setPinned(false)
    }
    let frame = 0
    const follow = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [open, place])

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={pinned}
        // Werkzeuge, die nach Mausklicks den Fokus wegräumen (Tastenkürzel), lassen das ⓘ aus:
        // Es schlösse sonst gleich wieder
        data-infotip=""
        // In einem <label> (Checkbox) darf der Klick die Option nicht umschalten.
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setPinned((p) => !p)
        }}
        // Darüberfahren nur mit der Maus: Ein Finger „fährt“ beim Tippen auch darüber und bliebe
        // dann darauf stehen – die Blase ginge nicht mehr zu
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
        // nur Fokus per Tastatur zeigt die Blase; den nach einem Tipp (Android) zählt der Tipp
        onFocus={(e) => keyboardFocus(e.currentTarget) && setHover(true)}
        onBlur={() => {
          setHover(false)
          setPinned(false)
        }}
        className={cn(
          'relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold leading-none text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
          // Finger: unsichtbar größere Tippfläche (32 px), das Zeichen bleibt klein
          '[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-2',
          className
        )}
      >
        i
      </button>
      {open &&
        pos &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[100] whitespace-pre-line rounded-md border border-border bg-card p-2.5 text-xs font-normal leading-relaxed text-foreground shadow-lg"
            style={{ left: pos.left, top: pos.top, width: WIDTH }}
          >
            {text}
          </span>,
          document.body
        )}
    </>
  )
}
