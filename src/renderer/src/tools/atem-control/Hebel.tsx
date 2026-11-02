// Übergangshebel: zeigt, was der Mischer meldet, nur beim Ziehen folgt der Griff der Maus. Die
// Richtung, die Ruhelage und das Zurückziehen rechnet atemHebel.ts. Wer ziehen will, muss den Griff
// nicht treffen: Es zählt die Bewegung ab dem Drücken, ein Klick lässt den Hebel deshalb nicht
// springen. Die Höhe gibt die Spalte vor (sie folgt dem Fenster), gerechnet wird beim Drücken.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ATEM_HEBEL_MAX } from '@shared/atem'
import { griffAusWert, hebelZiehen, wertAusGriff, type HebelZug } from '@shared/atemHebel'
import { cn } from '@renderer/lib/utils'

/** Griff in px: groß genug für den Finger */
const GRIFF = 44
/** Pfeiltasten: ein Schritt in Griff-Lage */
const SCHRITT = 0.02

interface Zug extends HebelZug {
  y: number
  griff: number
  /** Weg des Griffs in px, vom einen Ende zum anderen */
  weg: number
}

export function Hebel({
  wert,
  oben,
  bedienbar,
  onWert,
  className
}: {
  wert: number
  oben: boolean
  bedienbar: boolean
  onWert: (wert: number) => void
  className?: string
}): JSX.Element {
  const zug = useRef<Zug | null>(null)
  const [gezogen, setGezogen] = useState<number | null>(null)
  const griff = gezogen ?? griffAusWert(wert, oben)

  function down(e: PointerEvent<HTMLDivElement>): void {
    if (!bedienbar) return
    // Liegt der Hebel in einer Textauswahl (Strg+A), zöge Chromium den Text: dragstart, dann
    // pointercancel. Der Griff bliebe nach ein, zwei Werten mit dem Verbotszeichen stehen.
    getSelection()?.removeAllRanges()
    e.currentTarget.setPointerCapture(e.pointerId)
    const weg = Math.max(1, e.currentTarget.clientHeight - GRIFF)
    zug.current = { y: e.clientY, griff, weg, oben, wert, fertig: false }
    setGezogen(griff)
  }

  function move(e: PointerEvent<HTMLDivElement>): void {
    const z = zug.current
    if (!z) return
    const g = Math.min(1, Math.max(0, z.griff + (z.y - e.clientY) / z.weg))
    setGezogen(g)
    const schritt = hebelZiehen(z, g, oben)
    zug.current = { ...z, ...schritt.zug }
    if (schritt.senden !== null) onWert(schritt.senden)
  }

  function up(): void {
    zug.current = null
    setGezogen(null)
  }

  function taste(e: KeyboardEvent<HTMLDivElement>): void {
    if (!bedienbar || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    onWert(wertAusGriff(griff + (e.key === 'ArrowUp' ? SCHRITT : -SCHRITT), oben))
  }

  return (
    <div
      role="slider"
      tabIndex={bedienbar ? 0 : -1}
      aria-label="Übergangshebel"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={ATEM_HEBEL_MAX}
      aria-valuenow={wert}
      aria-disabled={!bedienbar}
      data-testid="atem-hebel"
      data-oben={oben}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={taste}
      className={cn(
        'relative w-24 touch-none rounded-lg border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
        bedienbar ? 'cursor-grab active:cursor-grabbing' : 'opacity-50',
        className
      )}
    >
      <div className="absolute inset-y-3 left-1/2 w-1 -translate-x-1/2 rounded bg-border" />
      <div
        data-testid="atem-hebel-griff"
        style={{ height: GRIFF, top: `calc((100% - ${GRIFF}px) * ${1 - griff})` }}
        // Massiv wie Cut und Auto, denn auch er löst aus. Nicht in der Akzentfarbe: Die ist ab Werk
        // fast das Gelb von „gewählt“
        className="absolute inset-x-1.5 flex flex-col items-center justify-center gap-1 rounded-md border border-foreground bg-foreground shadow-sm"
      >
        {/* Rillen: Der Griff soll aussehen, als ließe er sich packen */}
        <span className="h-0.5 w-8 rounded bg-background/50" />
        <span className="h-0.5 w-8 rounded bg-background/50" />
        <span className="h-0.5 w-8 rounded bg-background/50" />
      </div>
    </div>
  )
}
