// Dateien aus Explorer oder Finder in ein Feld ziehen (`Pane` mit `ablage`, zuerst die Bibliothek
// des Video-Players): Das ganze Feld nimmt sie an, der gestrichelte Rahmen steht nur, solange
// Dateien darüber schweben. Was innerhalb der App gezogen wird – Medien aus der Bibliothek tragen
// nur ihre Kennung –, zeigt keinen Rahmen und wird nicht angenommen.
//
// Betreten und Verlassen werden gezählt: Jedes Kind im Feld meldet beides, und beim Wechsel von
// einem Kind zum nächsten kommt erst das Betreten, dann das Verlassen – so flackert der Rahmen
// nicht. Verschwindet ein Element unter dem Zeiger, fehlt sein Verlassen; dann gilt das Ziehen als
// beendet, sobald `dragover` ausbleibt (Chromium meldet es laufend, auch ohne Bewegung).
//
// Ein Ziel im Feld darf die Dateien selbst nehmen (das Storyboard des Video-Generators fügt sie an
// der Stelle ein, über der sie losgelassen werden): Es ruft `preventDefault()` und lässt das
// Ereignis weiterlaufen – das Feld räumt dann nur den Rahmen weg und nimmt sie nicht zum zweiten
// Mal. Hielte das Ziel das Ereignis an, bliebe der Rahmen stehen, bis `dragover` ausbleibt.

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'

/** Ereignisse fürs ganze Feld und ob gerade Dateien darüber schweben */
export interface DateiAblage {
  /** Dateien schweben über dem Feld */
  aktiv: boolean
  onDragEnter: (e: DragEvent<HTMLElement>) => void
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDragLeave: (e: DragEvent<HTMLElement>) => void
  onDrop: (e: DragEvent<HTMLElement>) => void
}

/** So lange ohne `dragover`, dann ist das Ziehen vorbei */
const RUHE_MS = 1000

function hatDateien(e: DragEvent): boolean {
  return e.dataTransfer.types.includes('Files')
}

/** `annehmen` bekommt die losgelassenen Dateien (Pfade über `api.pathForFile`) */
export function useDateiAblage(annehmen: (dateien: File[]) => void): DateiAblage {
  const [aktiv, setAktiv] = useState(false)
  const tiefe = useRef(0)
  const timer = useRef(0)

  const aus = useCallback((): void => {
    tiefe.current = 0
    window.clearTimeout(timer.current)
    setAktiv(false)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return {
    aktiv,
    onDragEnter: (e) => {
      if (!hatDateien(e)) return
      e.preventDefault()
      tiefe.current += 1
      setAktiv(true)
    },
    onDragOver: (e) => {
      if (!hatDateien(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      // Die Dateien sind über dem Feld, auch wenn kein Betreten mitgezählt ist (nach RUHE_MS ohne
      // dragover oder einem Neuaufbau) – sonst ließe das nächste Verlassen eines Kindes den
      // Rahmen kurz verschwinden
      tiefe.current = Math.max(tiefe.current, 1)
      setAktiv(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(aus, RUHE_MS)
    },
    onDragLeave: (e) => {
      if (!hatDateien(e)) return
      tiefe.current -= 1
      if (tiefe.current <= 0) aus()
    },
    onDrop: (e) => {
      if (!hatDateien(e)) return
      const schonGenommen = e.defaultPrevented
      e.preventDefault()
      aus()
      if (!schonGenommen) annehmen(Array.from(e.dataTransfer.files))
    }
  }
}
