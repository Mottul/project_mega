import { useEffect, useRef, useState, type RefObject } from 'react'

/** Misst die Breite eines Elements per ResizeObserver. Ermöglicht container-
 *  basiertes Layout, das – anders als Viewport-Breakpoints – auch auf das Ein-/
 *  Ausklappen des Inspector-Panels reagiert (mehr Platz -> Panel neben statt unter
 *  der Vorschau). */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // clientWidth (inkl. Padding) für Erst- UND Folgemessung -> konsistente Schwelle.
    const measure = (): void => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
