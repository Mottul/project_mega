// Übergangshebel: zeigt, was der Mischer meldet, nur beim Ziehen folgt der Griff der Maus. Die
// Richtung, die Ruhelage und das Zurückziehen rechnet atemHebel.ts. Wer ziehen will, muss den Griff
// nicht treffen: Es zählt die Bewegung ab dem Drücken, ein Klick lässt den Hebel deshalb nicht
// springen.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ATEM_HEBEL_MAX } from '@shared/atem'
import { griffAusWert, hebelZiehen, wertAusGriff, type HebelZug } from '@shared/atemHebel'
import { cn } from '@renderer/lib/utils'

const HOEHE = 200
const GRIFF = 32
/** Pfeiltasten: ein Schritt in Griff-Lage */
const SCHRITT = 0.02

interface Zug extends HebelZug {
  y: number
  griff: number
}

export function Hebel({
  wert,
  oben,
  bedienbar,
  onWert
}: {
  wert: number
  oben: boolean
  bedienbar: boolean
  onWert: (wert: number) => void
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
    zug.current = { y: e.clientY, griff, oben, wert, fertig: false }
    setGezogen(griff)
  }

  function move(e: PointerEvent<HTMLDivElement>): void {
    const z = zug.current
    if (!z) return
    const g = Math.min(1, Math.max(0, z.griff + (z.y - e.clientY) / (HOEHE - GRIFF)))
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
      style={{ height: HOEHE }}
      className={cn(
        'relative w-14 touch-none rounded-md border border-border bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
        bedienbar ? 'cursor-grab active:cursor-grabbing' : 'opacity-50'
      )}
    >
      <div className="absolute inset-y-2 left-1/2 w-1 -translate-x-1/2 rounded bg-border" />
      <div
        data-testid="atem-hebel-griff"
        style={{ height: GRIFF, top: (1 - griff) * (HOEHE - GRIFF) }}
        className="absolute inset-x-1 rounded border border-primary bg-primary/80 shadow-sm"
      />
    </div>
  )
}
