// Kurze Erklärung hinter einem ⓘ statt eines Absatzes unter jeder Option – so bleiben die
// Einstellungen ruhig. Hover oder Fokus zeigt die Blase, ein Klick hält sie offen.
// Die Blase hängt am <body> (fixed): Im scrollenden Einstellungs-Panel würde sie sonst
// abgeschnitten.
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@renderer/lib/utils'

const WIDTH = 256
const GAP = 6

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

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - WIDTH / 2),
      window.innerWidth - WIDTH - 8
    )
    setPos({ left, top: r.bottom + GAP })
  }, [open])

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={pinned}
        // In einem <label> (Checkbox) darf der Klick die Option nicht umschalten.
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setPinned((p) => !p)
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => {
          setHover(false)
          setPinned(false)
        }}
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold leading-none text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
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
            className="pointer-events-none fixed z-[100] rounded-md border border-border bg-card p-2.5 text-xs font-normal leading-relaxed text-foreground shadow-lg"
            style={{ left: pos.left, top: pos.top, width: WIDTH }}
          >
            {text}
          </span>,
          document.body
        )}
    </>
  )
}
