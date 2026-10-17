// Fehlersuche: Prüfung eines Fehlerfalls und seine Ausgabe für eine Kenntnisstufe (rein, getestet).
//
// Ausgabe: Schritte über der Stufe fallen weg; ein Sprung dorthin wird zu „Ab hier bitte
// anrufen“ – die Eskalationsgrenze ergibt sich so von selbst. Übrig bleibt nur, was vom ersten
// Schritt aus erreichbar ist; die Nummern zählen neu von 1.

import type { Fehlerfall, FSchritt, Stufe, Ziel } from './model'

/**
 * Stufe des IM-Tauschs je Modul (Festlegungen 13/14). Bis Phase 2 die IMs in die Stammdaten des
 * LED-Wall-Konfigurators bringt, steht die Tabelle hier. Ohne bekannte Wand: nur Technik.
 */
export const IM_TAUSCH: Record<string, { stufe: Stufe; ruecksprache: boolean; hinweis: string }> = {
  '496-2,0': {
    stufe: 1,
    ruecksprache: true,
    hinweis: '4 IMs je Modul, werkzeuglos von vorne oder hinten.'
  },
  rX3ioBF: {
    stufe: 1,
    ruecksprache: true,
    hinweis: '4 IMs je Modul, werkzeuglos von vorne oder hinten.'
  },
  'uS2+': {
    stufe: 3,
    ruecksprache: false,
    hinweis: '2 IMs je Modul (übereinander), je 8 Schrauben – nur Technik.'
  }
}

const IM_UNBEKANNT = { stufe: 3 as Stufe, ruecksprache: false, hinweis: '' }

/**
 * IM-Tausch für die Module der Planung. Mehrere Wände mit verschiedenen Modulen: die strengere
 * Regel (höchste Stufe, Rücksprache, wenn eines sie verlangt), Hinweise je Modul.
 */
function imRegel(module: string[]): { stufe: Stufe; ruecksprache: boolean; hinweis: string } {
  const regeln = module.map((k) => (Object.hasOwn(IM_TAUSCH, k) ? IM_TAUSCH[k] : IM_UNBEKANNT))
  if (!regeln.length) return IM_UNBEKANNT
  if (regeln.length === 1) return regeln[0]
  return {
    stufe: Math.max(...regeln.map((r) => r.stufe)) as Stufe,
    ruecksprache: regeln.some((r) => r.ruecksprache),
    hinweis: module
      .map((k, i) => (regeln[i].hinweis ? `${k}: ${regeln[i].hinweis}` : ''))
      .filter(Boolean)
      .join(' ')
  }
}

/** Stufe, Rücksprache und Hinweis eines Schritts – mit Stammdaten der Module (alle Wände) */
export function wirksam(
  s: FSchritt,
  module: string[]
): { stufe: Stufe; ruecksprache: boolean; hinweis: string } {
  if (s.stufeAus !== 'im-tausch')
    return { stufe: s.stufe, ruecksprache: s.ruecksprache, hinweis: s.hinweis }
  const im = imRegel(module)
  return {
    stufe: im.stufe,
    ruecksprache: s.ruecksprache || im.ruecksprache,
    hinweis: [s.hinweis, im.hinweis].filter(Boolean).join(' ')
  }
}

export interface FallProblem {
  schwere: 'fehler' | 'warnung'
  text: string
}

const zielText = (z: 'Ja' | 'Nein' | 'Weiter', nr: number): string => `Schritt ${nr}, ${z}`

/** Prüfung eines Falls: fehlende Ziele, unerreichbare Schritte, Schleifen, kein „Anrufen“. */
export function pruefeFall(f: Fehlerfall, faelle: Fehlerfall[]): FallProblem[] {
  const out: FallProblem[] = []
  if (!f.titel.trim()) out.push({ schwere: 'fehler', text: 'Der Fall hat keinen Titel.' })
  if (!f.schritte.length) {
    out.push({ schwere: 'fehler', text: 'Der Fall hat noch keine Schritte.' })
    return out
  }
  const index = new Map(f.schritte.map((s, i) => [s.id, i]))
  const fallIds = new Set(faelle.map((x) => x.id))
  let anrufen = false

  const pruefeZiel = (z: Ziel, wo: string, selbst: string): void => {
    if (z.art === 'schritt') {
      if (!index.has(z.id)) out.push({ schwere: 'fehler', text: `${wo}: Ziel-Schritt fehlt.` })
      else if (z.id === selbst)
        out.push({ schwere: 'warnung', text: `${wo}: führt auf denselben Schritt.` })
    } else if (z.art === 'fall') {
      if (!fallIds.has(z.id) || z.id === f.id)
        out.push({ schwere: 'fehler', text: `${wo}: Ziel-Fall fehlt.` })
    } else if (z.art === 'loesung') {
      if (!z.text.trim()) out.push({ schwere: 'fehler', text: `${wo}: Lösung ohne Text.` })
    } else if (z.art === 'anrufen') anrufen = true
  }

  f.schritte.forEach((s, i) => {
    const nr = i + 1
    if (!s.text.trim()) out.push({ schwere: 'fehler', text: `Schritt ${nr}: Text fehlt.` })
    pruefeZiel(s.ja, zielText(s.nein ? 'Ja' : 'Weiter', nr), s.id)
    if (s.nein) pruefeZiel(s.nein, zielText('Nein', nr), s.id)
  })

  // erreichbar vom ersten Schritt
  const next = (s: FSchritt): string[] =>
    [s.ja, s.nein]
      .filter((z): z is Ziel => !!z && z.art === 'schritt' && index.has(z.id))
      .map((z) => (z as { id: string }).id)
  const seen = new Set<string>()
  const queue = [f.schritte[0].id]
  while (queue.length) {
    const cur = queue.shift()!
    if (seen.has(cur)) continue
    seen.add(cur)
    queue.push(...next(f.schritte[index.get(cur)!]))
  }
  f.schritte.forEach((s, i) => {
    if (!seen.has(s.id))
      out.push({ schwere: 'warnung', text: `Schritt ${i + 1} wird nie erreicht.` })
  })

  // Schleifen („nochmal prüfen“ kann gewollt sein – daher nur Warnung)
  const state = new Map<string, 1 | 2>()
  let schleife: number | null = null
  const dfs = (cur: string): void => {
    state.set(cur, 1)
    for (const n of next(f.schritte[index.get(cur)!])) {
      if (state.get(n) === 1) schleife ??= index.get(n)! + 1
      else if (!state.has(n)) dfs(n)
    }
    state.set(cur, 2)
  }
  dfs(f.schritte[0].id)
  if (schleife !== null)
    out.push({ schwere: 'warnung', text: `Schleife: Schritt ${schleife} kommt wieder.` })

  if (!anrufen)
    out.push({
      schwere: 'warnung',
      text: 'Kein Ausgang „Anrufen“ – wer nicht weiterkommt, braucht den Kontakt.'
    })
  return out
}

export type AusgabeZiel =
  | { art: 'schritt'; nr: number }
  | { art: 'loesung'; text: string }
  | { art: 'geloest' }
  /** `stufe`: der nächste Schritt gehört einer höheren Stufe */
  | { art: 'anrufen'; grund: 'ende' | 'stufe' }
  | { art: 'fall'; id: string; titel: string; nr: number }

export interface AusgabeSchritt {
  nr: number
  schritt: FSchritt
  stufe: Stufe
  ruecksprache: boolean
  hinweis: string
  ja: AusgabeZiel
  nein: AusgabeZiel | null
}

export interface AusgabeFall {
  fall: Fehlerfall
  nr: number
  /** schon der erste Schritt liegt über der Stufe */
  nurAnrufen: boolean
  schritte: AusgabeSchritt[]
}

/**
 * Fälle für eine Stufe: Fälle über der Stufe fallen ganz weg, ihre Schritte wie oben.
 * `alle` (Lernausgabe): jede Stufe, Kennzeichen macht der Seitenbauer.
 */
export function faelleFuerStufe(
  faelle: Fehlerfall[],
  stufe: Stufe,
  module: string[]
): AusgabeFall[] {
  const sichtbar = faelle.filter((f) => f.stufe <= stufe && f.schritte.length)
  const fallNr = new Map(sichtbar.map((f, i) => [f.id, i + 1]))

  return sichtbar.map((f, fi) => {
    const index = new Map(f.schritte.map((s, i) => [s.id, i]))
    const w = f.schritte.map((s) => wirksam(s, module))
    const zeigt = (i: number): boolean => w[i].stufe <= stufe

    if (!zeigt(0)) return { fall: f, nr: fi + 1, nurAnrufen: true, schritte: [] }

    // erreichbare, sichtbare Schritte in Originalreihenfolge
    const seen = new Set<number>()
    const queue = [0]
    while (queue.length) {
      const i = queue.shift()!
      if (seen.has(i) || !zeigt(i)) continue
      seen.add(i)
      for (const z of [f.schritte[i].ja, f.schritte[i].nein]) {
        if (z?.art === 'schritt' && index.has(z.id)) queue.push(index.get(z.id)!)
      }
    }
    const order = [...seen].sort((a, b) => a - b)
    const nrOf = new Map(order.map((i, n) => [i, n + 1]))

    const map = (z: Ziel): AusgabeZiel => {
      switch (z.art) {
        case 'schritt': {
          const i = index.get(z.id)
          if (i === undefined) return { art: 'anrufen', grund: 'ende' }
          const nr = nrOf.get(i)
          return nr ? { art: 'schritt', nr } : { art: 'anrufen', grund: 'stufe' }
        }
        case 'fall': {
          const ziel = sichtbar.find((x) => x.id === z.id)
          return ziel
            ? { art: 'fall', id: ziel.id, titel: ziel.titel, nr: fallNr.get(ziel.id)! }
            : { art: 'anrufen', grund: 'stufe' }
        }
        case 'loesung':
          return { art: 'loesung', text: z.text }
        case 'geloest':
          return { art: 'geloest' }
        default:
          return { art: 'anrufen', grund: 'ende' }
      }
    }

    return {
      fall: f,
      nr: fi + 1,
      nurAnrufen: false,
      schritte: order.map((i) => {
        const s = f.schritte[i]
        return {
          nr: nrOf.get(i)!,
          schritt: s,
          ...w[i],
          ja: map(s.ja),
          nein: s.nein ? map(s.nein) : null
        }
      })
    }
  })
}
