import { useEffect } from 'react'
import { api } from '@renderer/lib/api'

/**
 * Kleines Werkzeugfenster: Die Höhe folgt dem Inhalt (main passt das Fenster an, höchstens bis
 * zur Bildschirmhöhe). Gemessen wird die natürliche Höhe von Kopfleiste und Seite, nicht der
 * Scrollbereich – so meldet sich nur eine echte Änderung (Umbruch nach Breitenänderung,
 * Kompaktmodus, eingeblendeter Hinweis), nie das Ziehen an der Fensterhöhe selbst.
 */
export function useFitToolWindow(
  enabled: boolean,
  header: HTMLElement | null,
  page: HTMLElement | null
): void {
  useEffect(() => {
    if (!enabled || !header || !page) return
    let last = 0
    let frame = 0
    const measure = (): void => {
      const height = Math.ceil(
        header.getBoundingClientRect().height + page.getBoundingClientRect().height
      )
      if (height === last) return
      last = height
      void api.fitToolWindow(height)
    }
    // Die erste Messung SOFORT: Solange das Fenster versteckt ist (main zeigt es erst mit
    // passender Höhe), laufen weder requestAnimationFrame noch ResizeObserver – das Fenster
    // erschiene sonst erst nach der Notfall-Frist und spränge dann.
    measure()
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(header)
    observer.observe(page)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [enabled, header, page])
}
