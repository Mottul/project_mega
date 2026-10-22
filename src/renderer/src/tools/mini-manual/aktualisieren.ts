// Bausteine und Fehlerfälle „aktualisieren“ (rein, getestet): Eine Anleitung enthält Kopien mit
// Herkunft und Version. Ist die Quelle neuer – mitgelieferte Bibliothek oder eigener Baustein –,
// bietet das Werkzeug an, die Kopie zu ersetzen. Eigene Änderungen an der Kopie gehen dabei
// verloren; das sagt die Rückfrage in der Oberfläche.

import type { EigenerBaustein } from '@shared/types'
import {
  BAUSTEINE,
  FEHLERFAELLE,
  fallMitVerweisen,
  kopiereBaustein,
  type Baustein
} from './bibliothek'
import { uid, type Anleitung, type Block, type Fehlerfall, type KapitelId } from './model'
import { block as pruefeBlock, fehlerfall as pruefeFehlerfall } from './sanitize'

/** Eine Quelle, aus der eine Kopie stammen kann */
export interface Quelle {
  id: string
  version: number
  titel: string
  eigen: boolean
  /** Blöcke als frische Kopie mit Herkunft (nur Bausteine) */
  bloecke?: () => Block[]
  /** der Fall der Quelle (nur Fehlerfälle) */
  fall?: Fehlerfall
}

/** Blöcke eines eigenen Bausteins (geprüft, frische Kennungen) */
export function eigeneBloecke(e: EigenerBaustein): Block[] {
  return (Array.isArray(e.daten) ? e.daten : [])
    .map(pruefeBlock)
    .filter((b): b is Block => !!b)
    .map((b) => ({ ...b, id: uid() }))
}

/** Eigener Baustein als Baustein der Bibliothek (zum Einfügen und Aktualisieren) */
export function alsBaustein(e: EigenerBaustein, kapitel: KapitelId): Baustein {
  return {
    id: e.id,
    version: e.version,
    titel: e.titel,
    kapitel,
    stichworte: [],
    bloecke: eigeneBloecke(e)
  }
}

/** Alle Quellen: die Bibliothek und die eigenen Bausteine (Kennungen überschneiden sich nicht) */
export function quellen(eigene: EigenerBaustein[] = []): Map<string, Quelle> {
  const q = new Map<string, Quelle>()
  for (const b of BAUSTEINE)
    q.set(b.id, {
      id: b.id,
      version: b.version,
      titel: b.titel,
      eigen: false,
      bloecke: () => kopiereBaustein(b)
    })
  for (const f of FEHLERFAELLE)
    q.set(f.id, {
      id: f.id,
      version: f.herkunft?.version ?? 1,
      titel: f.titel,
      eigen: false,
      fall: f
    })
  for (const e of eigene) {
    if (e.art === 'fall') {
      const f = pruefeFehlerfall(e.daten)
      if (f) q.set(e.id, { id: e.id, version: e.version, titel: e.titel, eigen: true, fall: f })
    } else {
      q.set(e.id, {
        id: e.id,
        version: e.version,
        titel: e.titel,
        eigen: true,
        bloecke: () => kopiereBaustein(alsBaustein(e, e.kapitel as KapitelId))
      })
    }
  }
  return q
}

export interface NeuereFassung {
  art: 'bloecke' | 'fall'
  baustein: string
  titel: string
  /** Version der Kopie in der Anleitung */
  von: number
  /** Version der Quelle */
  auf: number
  eigen: boolean
  /** Blöcke: in diesem Kapitel; Fall: die Kennung des Falls in der Anleitung */
  kapitel?: KapitelId
  fallId?: string
}

const herkunftVon = (b: Block): { baustein: string; version: number } | undefined =>
  'herkunft' in b ? b.herkunft : undefined

/** Kopien, deren Quelle neuer ist – je Kapitel und Baustein bzw. je Fall einmal */
export function neuereFassungen(a: Anleitung, q: Map<string, Quelle>): NeuereFassung[] {
  const out: NeuereFassung[] = []
  for (const k of a.kapitel) {
    const gesehen = new Map<string, number>()
    for (const b of k.bloecke) {
      const h = herkunftVon(b)
      if (!h) continue
      gesehen.set(h.baustein, Math.min(gesehen.get(h.baustein) ?? Infinity, h.version))
    }
    for (const [id, von] of gesehen) {
      const s = q.get(id)
      if (s?.bloecke && s.version > von)
        out.push({
          art: 'bloecke',
          baustein: id,
          titel: s.titel,
          von,
          auf: s.version,
          eigen: s.eigen,
          kapitel: k.id
        })
    }
  }
  for (const f of a.fehlerfaelle) {
    const h = f.herkunft
    const s = h ? q.get(h.baustein) : undefined
    if (h && s?.fall && s.version > h.version)
      out.push({
        art: 'fall',
        baustein: h.baustein,
        titel: s.titel,
        von: h.version,
        auf: s.version,
        eigen: s.eigen,
        fallId: f.id
      })
  }
  return out
}

/** Kopie durch die neue Fassung ersetzen (Blöcke an ihrer Stelle, ein Fall unter seiner Kennung) */
export function aktualisiere(a: Anleitung, n: NeuereFassung, q: Map<string, Quelle>): Anleitung {
  const s = q.get(n.baustein)
  if (!s) return a
  if (n.art === 'bloecke' && s.bloecke) {
    const neu = s.bloecke
    return {
      ...a,
      kapitel: a.kapitel.map((k) => {
        if (k.id !== n.kapitel) return k
        // jede zusammenhängende Gruppe aus diesem Baustein an ihrer Stelle ersetzen
        const out: Block[] = []
        let inGruppe = false
        for (const b of k.bloecke) {
          if (herkunftVon(b)?.baustein === n.baustein) {
            if (!inGruppe) out.push(...neu())
            inGruppe = true
          } else {
            inGruppe = false
            out.push(b)
          }
        }
        return { ...k, bloecke: out }
      })
    }
  }
  if (n.art === 'fall' && s.fall && n.fallId) {
    const quelle = s.fall
    const ersetzt = a.fehlerfaelle.map((f) =>
      f.id === n.fallId
        ? {
            ...structuredClone(quelle),
            id: f.id,
            herkunft: { baustein: n.baustein, version: s.version }
          }
        : f
    )
    // Fälle der Bibliothek, auf die die neue Fassung verweist und die noch fehlen
    const dazu = s.eigen
      ? []
      : fallMitVerweisen(n.baustein).filter((f) => !ersetzt.some((x) => x.id === f.id))
    return { ...a, fehlerfaelle: [...ersetzt, ...dazu] }
  }
  return a
}
