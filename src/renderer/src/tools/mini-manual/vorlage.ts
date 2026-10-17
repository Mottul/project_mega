// Neue Anleitung: leer plus die wichtigsten Bausteine und Fehlerfälle der Bibliothek. Feste
// Kennungen (keine Zufallswerte), damit „Neu“ immer dieselben Daten ergibt – sonst gälte eine
// unberührte neue Anleitung als „etwas zu verlieren“.

import {
  bausteinById,
  fallMitVerweisen,
  kopiereBaustein,
  START_BAUSTEINE,
  START_FAELLE
} from './bibliothek'
import { leereAnleitung, type Anleitung, type Fehlerfall } from './model'

export function neueAnleitung(): Anleitung {
  const a = leereAnleitung()
  a.kapitel = a.kapitel.map((k) =>
    k.id === 'einAus'
      ? {
          ...k,
          bloecke: START_BAUSTEINE.flatMap((id) => {
            const b = bausteinById(id)
            return b ? kopiereBaustein(b, false) : []
          })
        }
      : k
  )
  const faelle: Fehlerfall[] = []
  for (const f of START_FAELLE.flatMap(fallMitVerweisen)) {
    if (!faelle.some((x) => x.id === f.id)) faelle.push(f)
  }
  a.fehlerfaelle = faelle
  return a
}
