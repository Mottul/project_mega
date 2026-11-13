// Werkzeug meldet main, dass in diesem Fenster etwas läuft, das main nicht kennt (Ton im
// Fenster) – die Rückfrage beim Beenden nennt es, und der Rechner bleibt wach
// (main/services/beenden). Beim Verlassen des Werkzeugs gilt es als beendet.
// Den Weg nach main setzt die App einmal von außen (main.tsx): Der Ton läuft auch in der
// Rechner-PWA, die keine Programmbrücke hat – dort meldet niemand etwas, und diese Datei darf
// deshalb weder api noch Einstellungen hereinziehen.

import { useEffect } from 'react'

export type AktivKennung = 'testton' | 'jingle'
type Melder = (key: AktivKennung, an: boolean) => void

let melder: Melder | null = null

/** Einmal beim Start der App setzen (main.tsx); ohne Melder bleibt useAktivMelden still */
export function setAktivMelder(fn: Melder | null): void {
  melder = fn
}

/** An main melden – ein Fehler im Melder darf das Werkzeug nicht stören */
export function meldeAktiv(key: AktivKennung, an: boolean): void {
  try {
    melder?.(key, an)
  } catch {
    // Melden ist Beiwerk: Der Ton läuft trotzdem
  }
}

export function useAktivMelden(key: AktivKennung, an: boolean): void {
  useEffect(() => {
    meldeAktiv(key, an)
  }, [key, an])
  useEffect(() => () => meldeAktiv(key, false), [key])
}
