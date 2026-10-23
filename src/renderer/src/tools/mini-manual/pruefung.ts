// Prüfung vor dem Export (Schublade, Zahl in der Leiste): Was fehlt oder heikel ist, bevor eine
// Anleitung an den Kunden geht. Keine Sperre – nur Hinweise mit dem Kapitel, in dem es steht.

import { analyzePower } from '../led-wall/power'
import { analyzeProcessors } from '../led-wall/processors'
import { neuereFassungen, quellen } from './aktualisieren'
import { geraetDef } from './bedienfeld'
import { pruefeFall } from './fehlersuche'
import { geplanteWaende } from './ledWallKopie'
import { kapitelDef, type Anleitung, type KapitelId } from './model'
import { platzhalterIn, platzhalterWerte } from './platzhalter'
import { sichtbareKapitel, type SeitenKontext } from './seiten'
import { pruefeSignalwege } from './signalwege'

export interface PruefPunkt {
  schwere: 'fehler' | 'warnung' | 'info'
  text: string
  kapitel: KapitelId | 'deckblatt'
}

export interface PruefExtra {
  /** LED-Wall-Abschnitt derselben Datei ist neuer als die Kopie */
  ledWallNeuer: { von: number; bis: number } | null
}

/** alle Texte eines Kapitels, die in dieser Ausgabe erscheinen */
function texteImKapitel(a: Anleitung, id: KapitelId, c: SeitenKontext): string[] {
  const g = c.lern ? 3 : c.stufe
  const k = a.kapitel.find((x) => x.id === id)
  const out: string[] = []
  for (const b of k?.bloecke ?? []) {
    if (b.stufe > g) continue
    if (b.typ === 'schritte') {
      out.push(b.titel, ...b.schritte.filter((s) => s.stufe <= g).map((s) => s.text))
    } else out.push(b.text)
  }
  if (id === 'fehlersuche') {
    for (const f of a.fehlerfaelle.filter((x) => x.stufe <= g)) {
      out.push(f.titel, f.symptom)
      for (const s of f.schritte) {
        out.push(s.text, s.hinweis)
        for (const z of [s.ja, s.nein]) if (z?.art === 'loesung') out.push(z.text)
      }
    }
  }
  if (id === 'geraete') out.push(...a.geraete.map((x) => x.notiz))
  if (id === 'bedienfeld')
    for (const b of a.bedienfelder.filter((x) => x.stufe <= g)) {
      out.push(b.notiz)
      for (const s of b.seiten)
        for (const t of s.tasten.filter((x) => x.stufe <= g)) out.push(t.funktion, t.notiz)
    }
  if (id === 'aufEinenBlick') return texteImKapitel(a, 'einAus', { ...c, stufe: 1, lern: false })
  return out
}

/** Die Bibliothek ändert sich nur mit einer neuen App-Version – einmal aufbauen reicht */
let bibliothek: ReturnType<typeof quellen> | null = null

export function pruefung(a: Anleitung, c: SeitenKontext, extra: PruefExtra): PruefPunkt[] {
  const out: PruefPunkt[] = []
  const sichtbar = sichtbareKapitel(a, c)
  const zeigt = (id: KapitelId): boolean => sichtbar.some((k) => k.id === id)
  const werte = platzhalterWerte(a, c.firma)

  if (!a.deckblatt.projekt.trim())
    out.push({ schwere: 'info', text: 'Deckblatt: Projekt ohne Namen.', kapitel: 'deckblatt' })

  // leere Platzhalter, je Kapitel einmal
  for (const k of sichtbar) {
    const leer = new Set<string>()
    for (const t of texteImKapitel(a, k.id, c))
      for (const p of platzhalterIn(t)) if (!werte.has(p)) leer.add(p)
    for (const p of leer)
      out.push({
        schwere: 'warnung',
        text: `${kapitelDef(k.id).titel}: Platzhalter {${p}} ohne Wert.`,
        kapitel: k.id
      })
  }

  if ((zeigt('kontakt') || zeigt('aufEinenBlick') || zeigt('fehlersuche')) && !a.kontakte.length)
    out.push({
      schwere: 'fehler',
      text: 'Kein Kontakt gewählt – wer im Fehlerfall anrufen soll, fehlt.',
      kapitel: 'kontakt'
    })

  if (
    zeigt('zugang') &&
    a.ausgabe.passwoerter === 'drucken' &&
    a.zugaenge.some((z) => z.passwort && z.stufe <= (c.lern ? 3 : c.stufe))
  )
    out.push({ schwere: 'warnung', text: 'Passwörter werden mitgedruckt.', kapitel: 'zugang' })

  if (zeigt('ledWall') || zeigt('system') || zeigt('verkabelung')) {
    if (!a.ledWall)
      out.push({
        schwere: 'warnung',
        text: 'Keine LED-Wall-Planung übernommen.',
        kapitel: 'ledWall'
      })
    else if (extra.ledWallNeuer)
      out.push({
        schwere: 'warnung',
        text: `Planung geändert (Stand ${extra.ledWallNeuer.von} → ${extra.ledWallNeuer.bis}) – Kopie veraltet.`,
        kapitel: 'ledWall'
      })
  }

  // Verkabelung nach Plan, der nicht trägt (Port oder Kreis überlastet …): vor dem Export sehen,
  // nicht erst beim Aufbau – behoben wird im Konfigurator, dann neu übernehmen
  if (zeigt('verkabelung') && a.ledWall) {
    const walls = geplanteWaende(a.ledWall)
    const ernst = (w: { level: string }): boolean => w.level === 'danger'
    for (const g of analyzeProcessors(walls))
      for (const w of g.warnings.filter(ernst))
        out.push({ schwere: 'warnung', text: `Verkabelung: ${w.text}`, kapitel: 'verkabelung' })
    for (const wall of walls)
      for (const w of analyzePower(wall.config).warnings.filter(ernst))
        out.push({
          schwere: 'warnung',
          text: `Verkabelung: ${walls.length > 1 ? `${wall.name}: ` : ''}${w.text}`,
          kapitel: 'verkabelung'
        })
  }

  // Signalwege: bei mehreren Wänden bzw. Prozessoren muss in der Geräteliste stehen, was wohin geht
  if (zeigt('system') || zeigt('geraete'))
    for (const p of pruefeSignalwege(a))
      out.push({ schwere: p.schwere, text: `Signalweg: ${p.text}`, kapitel: 'geraete' })

  if (zeigt('fehlersuche')) {
    const g = c.lern ? 3 : c.stufe
    for (const f of a.fehlerfaelle.filter((x) => x.stufe <= g)) {
      for (const p of pruefeFall(f, a.fehlerfaelle))
        out.push({
          schwere: p.schwere,
          text: `„${f.titel || 'ohne Titel'}“: ${p.text}`,
          kapitel: 'fehlersuche'
        })
    }
  }

  const g = c.lern ? 3 : c.stufe
  for (const k of sichtbar) {
    const art = kapitelDef(k.id).art
    const leer =
      (art === 'bloecke' || art === 'bedienfeld') &&
      !k.bloecke.some((b) => b.stufe <= g) &&
      (art !== 'bedienfeld' || !a.bedienfelder.some((b) => b.stufe <= g))
    if (leer)
      out.push({ schwere: 'info', text: `${kapitelDef(k.id).titel}: noch leer.`, kapitel: k.id })
  }

  // Tasten ohne Aufschrift zeigen im Raster nur ihre Nummer – nach einem Import häufig
  if (zeigt('bedienfeld'))
    for (const b of a.bedienfelder.filter((x) => x.stufe <= g)) {
      const n = b.seiten.reduce(
        (m, s) =>
          m + s.tasten.filter((t) => t.stufe <= g && !t.titel.trim() && !t.nav && !t.bild).length,
        0
      )
      if (n)
        out.push({
          schwere: 'info',
          text: `Bedienfeld „${b.name.trim() || geraetDef(b.geraet).label}“: ${n === 1 ? 'eine Taste' : `${n} Tasten`} ohne Aufschrift (nur die Nummer).`,
          kapitel: 'bedienfeld'
        })
    }

  // Eigene Bausteine meldet der Editor (Ablage über IPC); hier nur die mitgelieferte Bibliothek
  bibliothek ??= quellen()
  for (const n of neuereFassungen(a, bibliothek))
    out.push({
      schwere: 'info',
      text: `„${n.titel}“: neuere Fassung in der Bibliothek (Version ${n.von} → ${n.auf}).`,
      kapitel: n.kapitel ?? 'fehlersuche'
    })
  return out
}
