import { describe, expect, it } from 'vitest'
import { DEFAULT_FIRMENPROFIL } from '@shared/types'
import { BAUSTEINE, FEHLERFAELLE, fallById, fallMitVerweisen } from './bibliothek'
import { faelleFuerStufe, pruefeFall, wirksam } from './fehlersuche'
import { inline, markup } from './markup'
import { fotosIn, leereAnleitung, type Fehlerfall } from './model'
import { platzhalterIn, platzhalterWerte } from './platzhalter'
import { ANLEITUNG_VERSION, kurzname, sanitizeAnleitung } from './sanitize'
import { neueAnleitung } from './vorlage'

const werte = new Map([
  ['pc.name', 'Laptop <Bühne>'],
  ['wand.aufloesung', '1920 × 1080']
])
const vorschau = { werte, modus: 'vorschau' as const }
const druck = { werte, modus: 'druck' as const }

describe('Auszeichnung', () => {
  it('escapt zuerst, dann fett und Platzhalter', () => {
    expect(inline('<b>x</b> **fett** {pc.name}', druck)).toBe(
      '&lt;b&gt;x&lt;/b&gt; <strong>fett</strong> Laptop &lt;Bühne&gt;'
    )
  })
  it('leere Platzhalter: in der Vorschau sichtbar, im Druck eine Linie', () => {
    expect(inline('{prozessor.name}', vorschau)).toContain('class="ph-leer"')
    expect(inline('{prozessor.name}', druck)).toBe('<span class="ph-linie"></span>')
  })
  it('Absätze, Listen und Hinweis', () => {
    const html = markup('Erste Zeile\nzweite\n\n- a\n- b\n1. eins\n2. zwei\n> Achtung', druck)
    expect(html).toBe(
      '<p>Erste Zeile<br>zweite</p><ul><li>a</li><li>b</li></ul><ol><li>eins</li><li>zwei</li></ol><div class="hinweis">Achtung</div>'
    )
  })
  it('Platzhalter-Namen im Text', () => {
    expect(platzhalterIn('{pc.name} und {pc.name}, {wand.aufloesung} {Gross.x}')).toEqual([
      'pc.name',
      'wand.aufloesung'
    ])
  })
})

describe('Platzhalter-Werte', () => {
  it('aus Deckblatt, Geräten, Kontakten und Firmenprofil; Leeres fehlt', () => {
    const a = leereAnleitung()
    a.deckblatt.projekt = 'Messe Dornbirn'
    a.geraete.push({
      id: 'g1',
      rolle: 'prozessor',
      kurzname: 'prozessor',
      name: 'NovaPro UHD Jr',
      modell: '',
      standort: 'Rack',
      ip: '192.168.0.10',
      foto: null,
      notiz: ''
    })
    a.kontakte.push({
      id: 'k',
      name: 'Matthias',
      funktion: '',
      mobil: '+43 664 1',
      buero: '',
      mail: '',
      erreichbarkeit: '',
      whatsapp: true
    })
    const w = platzhalterWerte(a, { ...DEFAULT_FIRMENPROFIL, name: 'Megasound' })
    expect(w.get('projekt.name')).toBe('Messe Dornbirn')
    expect(w.get('prozessor.ip')).toBe('192.168.0.10')
    expect(w.get('prozessor.rolle')).toBe('Prozessor')
    expect(w.has('prozessor.modell')).toBe(false)
    expect(w.get('kontakt.mobil')).toBe('+43 664 1')
    expect(w.get('firma.name')).toBe('Megasound')
  })
  it('Kurznamen werden zu Platzhalter-Namen', () => {
    expect(kurzname('Laptop Bühne!')).toBe('laptopbuehne')
    expect(kurzname('PC_1')).toBe('pc_1')
  })
})

describe('Bibliothek', () => {
  it('jeder mitgelieferte Fehlerfall besteht die Prüfung ohne Fehler (keine toten Enden)', () => {
    for (const f of FEHLERFAELLE) {
      const probleme = pruefeFall(f, FEHLERFAELLE).filter((p) => p.schwere === 'fehler')
      expect(probleme, f.id).toEqual([])
      // ohne Warnung: jeder Schritt erreichbar, keine Schleife, ein Ausgang „Anrufen“
      expect(pruefeFall(f, FEHLERFAELLE), f.id).toEqual([])
    }
  })
  it('Kennungen sind eindeutig; Verweise auf Fälle zeigen auf vorhandene Fälle', () => {
    const ids = FEHLERFAELLE.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(BAUSTEINE.map((b) => b.id)).size).toBe(BAUSTEINE.length)
    for (const f of FEHLERFAELLE) {
      expect(new Set(f.schritte.map((s) => s.id)).size, f.id).toBe(f.schritte.length)
    }
  })
  it('ein Fall bringt die Fälle mit, auf die er verweist', () => {
    const ids = fallMitVerweisen('lib-teil-dunkel').map((f) => f.id)
    expect(ids).toEqual(
      expect.arrayContaining(['lib-teil-dunkel', 'lib-wand-dunkel', 'lib-prozessor-aus'])
    )
  })
  it('was die App selbst erzeugt, übersteht die Prüfung unverändert', () => {
    const a = neueAnleitung()
    expect(sanitizeAnleitung(structuredClone(a))).toEqual(a)
    expect(neueAnleitung()).toEqual(a) // „Neu“ ergibt immer dieselben Daten
    expect(ANLEITUNG_VERSION).toBe(1)
  })
})

describe('Fehlersuche je Stufe – Beispiel aus dem Plan', () => {
  const faelle = fallMitVerweisen('lib-teil-dunkel')
  const teil = (stufe: 1 | 2 | 3, modul: string | null) =>
    faelleFuerStufe(faelle, stufe, modul).find((f) => f.fall.id === 'lib-teil-dunkel')!

  it('Bedienung: Schritte 1, 2, 5, 8 und – beim 496-2,0 mit Rücksprache – 9', () => {
    const f = teil(1, '496-2,0')
    expect(f.schritte.map((s) => s.schritt.id)).toEqual(['t1', 't2', 't5', 't8', 't9'])
    expect(f.schritte.map((s) => s.nr)).toEqual([1, 2, 3, 4, 5])
    // 2 → Ja führte zu Schritt 3 (Betreuung): jetzt „Ab hier bitte anrufen“
    expect(f.schritte[1].ja).toEqual({ art: 'anrufen', grund: 'stufe' })
    expect(f.schritte[1].nein).toEqual({ art: 'schritt', nr: 3 })
    const im = f.schritte[4]
    expect([im.stufe, im.ruecksprache]).toEqual([1, true])
    // Schritt 1 Ja: Fall „Ganze Wand dunkel“
    expect(f.schritte[0].ja).toMatchObject({ art: 'fall', id: 'lib-wand-dunkel' })
  })

  it('uS2+: IM-Tausch nur Technik, auf Bedienung wird Schritt 8 Ja zu „anrufen“', () => {
    const f = teil(1, 'uS2+')
    expect(f.schritte.map((s) => s.schritt.id)).toEqual(['t1', 't2', 't5', 't8'])
    expect(f.schritte[3].ja).toEqual({ art: 'anrufen', grund: 'stufe' })
    expect(teil(3, 'uS2+').schritte.find((s) => s.schritt.id === 't9')?.stufe).toBe(3)
  })

  it('Betreuung: dazu 3 und 6', () => {
    expect(teil(2, '496-2,0').schritte.map((s) => s.schritt.id)).toEqual([
      't1',
      't2',
      't3',
      't5',
      't6',
      't8',
      't9'
    ])
  })

  it('ohne bekannte Wand gilt der IM-Tausch als Technik', () => {
    const t9 = fallById('lib-teil-dunkel')!.schritte.find((s) => s.id === 't9')!
    expect(wirksam(t9, null).stufe).toBe(3)
    expect(wirksam(t9, 'constructor').stufe).toBe(3)
  })

  it('Fall über der Stufe fehlt ganz; erster Schritt zu hoch = nur anrufen', () => {
    const f: Fehlerfall = {
      ...structuredClone(fallById('lib-modul-farbe')!),
      stufe: 1
    }
    const out = faelleFuerStufe([f], 1, null)
    expect(out[0].nurAnrufen).toBe(true)
    expect(faelleFuerStufe([fallById('lib-modul-farbe')!], 1, null)).toEqual([])
  })
})

describe('Prüfung eines Falls', () => {
  it('meldet fehlende Ziele, leere Lösung, unerreichbare Schritte und Schleifen', () => {
    const f: Fehlerfall = {
      id: 'x',
      titel: 'Test',
      symptom: '',
      bereich: 'signal',
      stufe: 1,
      schritte: [
        {
          id: 'a',
          stufe: 1,
          text: 'A?',
          hinweis: '',
          foto: null,
          ruecksprache: false,
          stufeAus: null,
          ja: { art: 'schritt', id: 'b' },
          nein: { art: 'schritt', id: 'weg' }
        },
        {
          id: 'b',
          stufe: 1,
          text: 'B?',
          hinweis: '',
          foto: null,
          ruecksprache: false,
          stufeAus: null,
          ja: { art: 'schritt', id: 'a' },
          nein: { art: 'loesung', text: ' ' }
        },
        {
          id: 'c',
          stufe: 1,
          text: '',
          hinweis: '',
          foto: null,
          ruecksprache: false,
          stufeAus: null,
          ja: { art: 'geloest' },
          nein: null
        }
      ]
    }
    const texte = pruefeFall(f, [f]).map((p) => `${p.schwere}: ${p.text}`)
    expect(texte).toEqual([
      'fehler: Schritt 1, Nein: Ziel-Schritt fehlt.',
      'fehler: Schritt 2, Nein: Lösung ohne Text.',
      'fehler: Schritt 3: Text fehlt.',
      'warnung: Schritt 3 wird nie erreicht.',
      'warnung: Schleife: Schritt 1 kommt wieder.',
      'warnung: Kein Ausgang „Anrufen“ – wer nicht weiterkommt, braucht den Kontakt.'
    ])
  })
})

describe('Prüfung der gespeicherten Daten', () => {
  it('fremde Werte fallen auf Vorgaben, Fotos nur als Hash, Kapitel vollständig', () => {
    const a = sanitizeAnleitung({
      titel: 42,
      deckblatt: { projekt: 'P', foto: '../../etc/passwd' },
      kapitel: [{ id: 'fehlersuche', an: false }, { id: 'unbekannt' }, { id: 'fehlersuche' }],
      geraete: [{ rolle: 'rakete', kurzname: 'PC 1', foto: 'a'.repeat(64) }],
      fehlerfaelle: [{ schritte: [{ ja: { art: 'quatsch' }, nein: null, stufe: 7 }] }],
      ausgabe: { passwoerter: 'überall' }
    })
    expect(a.titel).toBe('So bedienst du deine LED-Wall')
    expect(a.deckblatt).toMatchObject({ projekt: 'P', foto: null })
    expect(a.kapitel[0]).toMatchObject({ id: 'fehlersuche', an: false })
    expect(a.kapitel.map((k) => k.id)).toHaveLength(14)
    expect(a.geraete[0]).toMatchObject({ rolle: 'sonstiges', kurzname: 'pc1' })
    expect(a.fehlerfaelle[0].schritte[0]).toMatchObject({
      stufe: 1,
      ja: { art: 'anrufen' },
      nein: null
    })
    expect(a.ausgabe.passwoerter).toBe('separat')
    expect(fotosIn(a)).toEqual(['a'.repeat(64)])
  })

  it('Blöcke nur in Kapiteln, die welche haben (frei und LED-Wall)', () => {
    const b = { id: 'b', typ: 'text', stufe: 1, text: 'x' }
    const a = sanitizeAnleitung({
      kapitel: [
        { id: 'ledWall', an: true, bloecke: [b] },
        { id: 'fehlersuche', an: true, bloecke: [b] },
        { id: 'pflege', an: true, bloecke: [b] }
      ]
    })
    const bl = (id: string): number => a.kapitel.find((k) => k.id === id)!.bloecke.length
    expect([bl('ledWall'), bl('fehlersuche'), bl('pflege')]).toEqual([1, 0, 1])
  })
})
