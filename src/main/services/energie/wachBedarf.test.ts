import { describe, expect, it } from 'vitest'
import { laufendesAus, type LaufendStand } from '../beenden/laufendText'
import { wachBedarf } from './wachBedarf'

const ruhig: LaufendStand = {
  player: { ausgabe: false, spielt: false, ndi: false },
  timer: { ausgabe: false, laeuft: false, ndi: false },
  testbild: false,
  auftraege: 0,
  vorschau: false,
  fernsteuerung: {},
  renderer: []
}

describe('Wachhalten – wann darf der Rechner nicht einschlafen?', () => {
  it('nichts läuft: Energiesparen wie vom System eingestellt', () => {
    expect(wachBedarf(ruhig)).toBeNull()
    // eine eingeschaltete Fernsteuerung ohne verbundenes Gerät hält niemanden wach
    expect(wachBedarf({ ...ruhig, fernsteuerung: { remote: 0, 'timer-remote': 0 } })).toBeNull()
  })

  it('ein Bild auf einem Ausgang hält auch den Bildschirm an – Timer, Testbild, pausierter Player', () => {
    const ausgaben: Partial<LaufendStand>[] = [
      { timer: { ausgabe: true, laeuft: false, ndi: false } },
      { testbild: true },
      // pausiert: Chromium hielte den Bildschirm hier nicht selbst wach
      { player: { ausgabe: true, spielt: false, ndi: false } }
    ]
    for (const a of ausgaben)
      expect(wachBedarf({ ...ruhig, ...a }), JSON.stringify(a)).toBe('bildschirm')
  })

  it('ohne Ausgabefenster reicht der wache Rechner, der Bildschirm darf ausgehen', () => {
    const laeuft: Partial<LaufendStand>[] = [
      { auftraege: 1 }, // Konvertierung über Nacht
      { vorschau: true },
      { timer: { ausgabe: false, laeuft: true, ndi: false } }, // Anzeige im Browser, am Handy
      { timer: { ausgabe: false, laeuft: false, ndi: true } },
      { player: { ausgabe: false, spielt: false, ndi: true } },
      { player: { ausgabe: false, spielt: true, ndi: false } },
      { fernsteuerung: { 'jingle-remote': 1 } }, // Jingles vom Handy, dazwischen läuft nichts
      { renderer: ['jingle'] },
      { renderer: ['testton'] }
    ]
    for (const l of laeuft)
      expect(wachBedarf({ ...ruhig, ...l }), JSON.stringify(l)).toBe('rechner')
  })

  it('die Ausgabe gewinnt, wenn beides zutrifft', () => {
    expect(wachBedarf({ ...ruhig, auftraege: 3, testbild: true })).toBe('bildschirm')
  })

  it('dieselbe Regel wie die Rückfrage beim Beenden: Was sie nennt, hält wach – und nur das', () => {
    const faelle: LaufendStand[] = [
      ruhig,
      { ...ruhig, fernsteuerung: { remote: 0 } },
      { ...ruhig, auftraege: 2 },
      { ...ruhig, fernsteuerung: { unbekannt: 1 } },
      { ...ruhig, renderer: ['jingle', 'testton'] },
      { ...ruhig, timer: { ausgabe: true, laeuft: true, ndi: true } }
    ]
    for (const s of faelle) {
      expect(wachBedarf(s) !== null, JSON.stringify(s)).toBe(laufendesAus(s).length > 0)
    }
  })
})
