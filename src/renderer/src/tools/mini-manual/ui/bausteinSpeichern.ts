// Eigenen Baustein speichern – mit Rückfrage, wenn es schon einen mit demselben Namen gibt
// (gleiche Art, gleiches Kapitel): Ersetzen, Beide behalten („… (2)“) oder Abbrechen. Vorher
// legte jedes Speichern still einen zweiten Baustein gleichen Namens an.

import { freierTitel, namensgleiche } from '@shared/bausteine'
import type { EigenerBaustein } from '@shared/types'
import { api } from '@renderer/lib/api'
import { meldeBausteineGeaendert } from './eigeneBausteine'

type Entwurf = Pick<EigenerBaustein, 'id' | 'art' | 'titel' | 'kapitel' | 'daten'>

/** Speichert den Baustein; null = abgebrochen oder fehlgeschlagen (`fehler` sagt welches). */
export async function speichereBaustein(
  e: Entwurf
): Promise<{ baustein: EigenerBaustein | null; fehler: boolean }> {
  const liste = await api.bausteine.list()
  const gleich = namensgleiche(liste, e)[0]
  let entwurf = e
  if (gleich) {
    const frei = freierTitel(liste, e)
    const wahl = await api.choose({
      message: `Es gibt schon einen Baustein „${gleich.titel}“.`,
      detail: `„Ersetzen“ überschreibt ihn (Version ${gleich.version} → ${gleich.version + 1}); Anleitungen, die ihn schon eingefügt haben, behalten ihre Kopie. „Beide behalten“ speichert den neuen als „${frei}“.`,
      buttons: ['Ersetzen', 'Beide behalten', 'Abbrechen'],
      cancelId: 2,
      defaultId: 1
    })
    if (wahl === 0) entwurf = { ...e, id: gleich.id, titel: gleich.titel }
    else if (wahl === 1) entwurf = { ...e, titel: frei }
    else return { baustein: null, fehler: false }
  }
  const baustein = await api.bausteine.save(entwurf)
  if (baustein) meldeBausteineGeaendert()
  return { baustein, fehler: !baustein }
}
