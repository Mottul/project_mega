// Bearbeiten der Anleitung als reine Funktionen (alter Stand rein, neuer Stand raus) – die
// Oberfläche ruft sie über `useMiniManual.getState().update(fn)`. Einträge werden über ihre
// Kennung angesprochen, nie über die Position: Ziele der Fehlersuche zeigen auf Kennungen, und
// zwei Fenster können gleichzeitig sortieren.

import { fallMitVerweisen, kopiereBaustein, type Baustein } from './bibliothek'
import {
  kapitelDef,
  uid,
  type Anleitung,
  type Block,
  type BlockTyp,
  type Fehlerfall,
  type FSchritt,
  type KapitelEintrag,
  type KapitelId,
  type Stufe
} from './model'

/** Eintrag mit Kennung in einer Liste ersetzen */
export function ersetze<T extends { id: string }>(list: T[], id: string, fn: (x: T) => T): T[] {
  return list.map((x) => (x.id === id ? fn(x) : x))
}

export function entferne<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id)
}

/** Eintrag um eine Stelle nach vorne (-1) oder hinten (+1) schieben */
export function verschiebe<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const i = list.findIndex((x) => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** Eintrag an eine andere Stelle ziehen (vor `vorId`; null = ans Ende) */
export function ziehe<T extends { id: string }>(list: T[], id: string, vorId: string | null): T[] {
  const item = list.find((x) => x.id === id)
  if (!item || id === vorId) return list
  const rest = list.filter((x) => x.id !== id)
  const at = vorId === null ? rest.length : rest.findIndex((x) => x.id === vorId)
  return [
    ...rest.slice(0, at < 0 ? rest.length : at),
    item,
    ...rest.slice(at < 0 ? rest.length : at)
  ]
}

/** Ziehen zum Sortieren: `id` vor bzw. hinter `zielId` setzen (components/ui/sortable) */
export function zieheNach<T extends { id: string }>(
  list: T[],
  id: string,
  zielId: string,
  hinter: boolean
): T[] {
  if (!hinter) return ziehe(list, id, zielId)
  const i = list.findIndex((x) => x.id === zielId)
  if (i < 0) return list
  const danach = list.slice(i + 1).find((x) => x.id !== id)
  return ziehe(list, id, danach ? danach.id : null)
}

export function kapitel(
  a: Anleitung,
  id: KapitelId,
  fn: (k: KapitelEintrag) => KapitelEintrag
): Anleitung {
  return { ...a, kapitel: a.kapitel.map((k) => (k.id === id ? fn(k) : k)) }
}

export function bloecke(a: Anleitung, id: KapitelId, fn: (b: Block[]) => Block[]): Anleitung {
  return kapitel(a, id, (k) => ({ ...k, bloecke: fn(k.bloecke) }))
}

export function neuerBlock(typ: BlockTyp, stufe: Stufe): Block {
  const id = uid()
  switch (typ) {
    case 'schritte':
      return { id, typ, stufe, titel: '', schritte: [{ id: uid(), text: '', stufe, foto: null }] }
    case 'hinweis':
      return { id, typ, stufe, art: 'info', text: '' }
    case 'foto':
      return { id, typ, stufe, foto: null, text: '' }
    default:
      return { id, typ: 'text', stufe, text: '' }
  }
}

/** Baustein in ein Kapitel einfügen (Kopie mit Herkunft, frische Kennungen) */
export function bausteinEinfuegen(a: Anleitung, b: Baustein, ziel?: KapitelId): Anleitung {
  return bloecke(a, ziel ?? b.kapitel, (bs) => [...bs, ...kopiereBaustein(b)])
}

/** Ist ein Baustein der Bibliothek schon im Kapitel? (Herkunft) */
export function hatBaustein(a: Anleitung, id: string): boolean {
  return a.kapitel.some((k) =>
    k.bloecke.some((b) => 'herkunft' in b && b.herkunft?.baustein === id)
  )
}

export function neuerSchritt(stufe: Stufe): FSchritt {
  return {
    id: uid(),
    stufe,
    text: '',
    hinweis: '',
    foto: null,
    ruecksprache: false,
    stufeAus: null,
    antwortAus: null,
    ja: { art: 'geloest' },
    nein: { art: 'anrufen' }
  }
}

export function neuerFall(): Fehlerfall {
  return {
    id: uid(),
    titel: '',
    symptom: '',
    bereich: 'signal',
    stufe: 1,
    schritte: [neuerSchritt(1)]
  }
}

/** Fall der Bibliothek einfügen – samt der Fälle, auf die er verweist (ohne Doppelte) */
export function bibliotheksFallEinfuegen(a: Anleitung, id: string): Anleitung {
  const neu = fallMitVerweisen(id).filter((f) => !a.fehlerfaelle.some((x) => x.id === f.id))
  return neu.length ? { ...a, fehlerfaelle: [...a.fehlerfaelle, ...neu] } : a
}

/**
 * Fall entfernen. Verweise anderer Fälle darauf werden zu „Anrufen“ – sonst meldete die Prüfung
 * tote Ziele, und die Ausgabe wüsste nicht weiter.
 */
export function fallEntfernen(a: Anleitung, id: string): Anleitung {
  return {
    ...a,
    fehlerfaelle: a.fehlerfaelle
      .filter((f) => f.id !== id)
      .map((f) => ({
        ...f,
        schritte: f.schritte.map((s) => ({
          ...s,
          ja: s.ja.art === 'fall' && s.ja.id === id ? { art: 'anrufen' as const } : s.ja,
          nein: s.nein?.art === 'fall' && s.nein.id === id ? { art: 'anrufen' as const } : s.nein
        }))
      }))
  }
}

/** Schritt entfernen; Ziele, die auf ihn zeigten, werden zu „Anrufen“. */
export function schrittEntfernen(f: Fehlerfall, id: string): Fehlerfall {
  const fix = (z: FSchritt['ja']): FSchritt['ja'] =>
    z.art === 'schritt' && z.id === id ? { art: 'anrufen' } : z
  return {
    ...f,
    schritte: f.schritte
      .filter((s) => s.id !== id)
      .map((s) => ({ ...s, ja: fix(s.ja), nein: s.nein ? fix(s.nein) : null }))
  }
}

/** Zahl der Einträge eines Kapitels für die Liste in der Schublade */
export function eintraege(a: Anleitung, id: KapitelId): number | null {
  switch (kapitelDef(id).art) {
    case 'geraete':
      return a.geraete.length
    case 'zugang':
      return a.zugaenge.length
    case 'fehlersuche':
      return a.fehlerfaelle.length
    case 'auto':
    case 'verkabelung':
      return null
    default: {
      const k = a.kapitel.find((x) => x.id === id)
      return k ? k.bloecke.length : 0
    }
  }
}
