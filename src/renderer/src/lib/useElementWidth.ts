import { useEffect, useState } from 'react'

/** Misst die Breite eines Elements per ResizeObserver. Ermöglicht container-
 *  basiertes Layout, das – anders als Viewport-Breakpoints – auch auf das Ein-/
 *  Ausklappen des Inspector-Panels reagiert (mehr Platz -> Panel neben statt unter
 *  der Vorschau).
 *
 *  Bewusst ein CALLBACK-Ref statt useRef: Hängt das gemessene Element erst später
 *  im Baum (z. B. hinter einem `if (!state) return <Lade…/>`), liefe ein Effekt mit
 *  []-Deps beim Mount ins Leere und würde nie wieder laufen -> Breite bliebe 0.
 *  Der Callback-Ref stößt den Effekt an, sobald das Element tatsächlich da ist. */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el) return
    // clientWidth (inkl. Padding) für Erst- UND Folgemessung -> konsistente Schwelle.
    const measure = (): void => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, width]
}
