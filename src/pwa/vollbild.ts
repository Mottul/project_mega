// Vollbild in der Rechner-PWA (Menü „Darstellung“) – nur wo der Browser die Fullscreen-API für
// Seiten anbietet: Unter Android (Chrome) verschwinden dann Status- und Navigationsleiste. Am
// iPhone gibt es kein Vollbild für Web-Apps (requestFullscreen fehlt dort, und auch
// `display: fullscreen` im Manifest lässt die Statusleiste stehen) – dort erscheint der Eintrag
// nicht.
import { useEffect, useState } from 'react'

/** Was vom Dokument gebraucht wird – im Test ein Ersatz, Vitest läuft ohne DOM */
export interface VollbildDokument {
  /** fehlt am iPhone ganz, obwohl die DOM-Typen sie immer versprechen */
  readonly fullscreenEnabled?: boolean
  readonly fullscreenElement: Element | null
  exitFullscreen(): Promise<void>
  readonly documentElement: { requestFullscreen(options?: FullscreenOptions): Promise<void> }
}

export function kannVollbild(doc: Pick<VollbildDokument, 'fullscreenEnabled'>): boolean {
  return doc.fullscreenEnabled === true
}

export function istVollbild(doc: Pick<VollbildDokument, 'fullscreenElement'>): boolean {
  return doc.fullscreenElement != null
}

/**
 * Vollbild an oder aus, für die ganze Seite – nur aus einem Tipp heraus, sonst lehnt der Browser
 * ab. `navigationUI: 'hide'` bittet Android, auch die Navigationsleiste auszublenden. Ist es schon
 * so, geschieht nichts: exitFullscreen ohne Vollbild würde abgelehnt.
 */
export function setzeVollbild(doc: VollbildDokument, an: boolean): Promise<void> {
  if (an === istVollbild(doc)) return Promise.resolve()
  return an ? doc.documentElement.requestFullscreen({ navigationUI: 'hide' }) : doc.exitFullscreen()
}

export interface Vollbild {
  /** Bietet der Browser es an? Sonst kein Eintrag im Menü. */
  moeglich: boolean
  an: boolean
  setzen: (an: boolean) => void
}

/**
 * Zustand fürs Menü. `an` kommt nur aus `fullscreenchange` – so folgt es auch dem Verlassen per
 * Wischgeste oder Zurück, und lehnt der Browser ab, zeigt die Wahl weiter, was gilt, statt was
 * getippt wurde.
 */
export function useVollbild(): Vollbild {
  const [moeglich] = useState(() => kannVollbild(document))
  const [an, setAn] = useState(() => istVollbild(document))
  useEffect(() => {
    if (!moeglich) return
    const onChange = (): void => setAn(istVollbild(document))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [moeglich])
  return {
    moeglich,
    an,
    setzen: (v) => {
      setzeVollbild(document, v).catch(() => undefined)
    }
  }
}
