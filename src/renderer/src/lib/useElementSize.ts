import { useLayoutEffect, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/**
 * Misst Breite UND Höhe eines Elements per ResizeObserver (wie useElementWidth): für
 * Zeichenflächen, die den verfügbaren Platz in beide Richtungen füllen sollen – auch wenn die
 * Schublade auf- oder zugeht. Callback-Ref aus demselben Grund wie dort. Gemessen wird vor dem
 * Zeichnen (Layout-Effekt): Sonst erschiene die Zeichnung ein Bild lang in der Ersatzgröße.
 */
export function useElementSize<T extends HTMLElement>(): [(el: T | null) => void, ElementSize] {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    if (!el) return
    const measure = (): void =>
      setSize((prev) =>
        prev.width === el.clientWidth && prev.height === el.clientHeight
          ? prev
          : { width: el.clientWidth, height: el.clientHeight }
      )
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, size]
}
