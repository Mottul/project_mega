import { describe, expect, it } from 'vitest'
import { laufendesAus, type LaufendStand } from './laufendText'

const ruhig: LaufendStand = {
  player: { ausgabe: false, spielt: false, ndi: false },
  timer: { ausgabe: false, laeuft: false, ndi: false },
  testbild: false,
  auftraege: 0,
  vorschau: false,
  fernsteuerung: {},
  renderer: []
}

describe('Was läuft? (Rückfrage beim Beenden)', () => {
  it('nichts läuft – keine Zeile, also keine Rückfrage', () => {
    expect(laufendesAus(ruhig)).toEqual([])
    // ein Fernsteuer-Server ohne verbundenes Gerät zählt nicht
    expect(laufendesAus({ ...ruhig, fernsteuerung: { remote: 0 } })).toEqual([])
  })

  it('nennt jede Ausgabe, Aufträge, verbundene Geräte und Ton im Fenster', () => {
    expect(
      laufendesAus({
        player: { ausgabe: true, spielt: true, ndi: true },
        timer: { ausgabe: false, laeuft: true, ndi: false },
        testbild: true,
        auftraege: 3,
        vorschau: true,
        fernsteuerung: { remote: 2, 'timer-remote': 1, unbekannt: 1 },
        renderer: ['jingle', 'testton']
      })
    ).toEqual([
      'Video-Player: Ausgabe offen, spielt',
      'Video-Player: NDI-Ausgabe',
      'Stage-Timer läuft',
      'Testbild-Ausgabe offen',
      '3 Aufträge (Konvertierung, Import, Download oder Video-Generator)',
      'Video-Generator rechnet die Vorschau',
      'Fernsteuerung verbunden: Video-Player (2 Geräte), Stage-Timer (1 Gerät), unbekannt (1 Gerät)',
      'Testton läuft',
      'Jingle-Player spielt'
    ])
  })

  it('Einzahl und Ausgabe ohne Wiedergabe', () => {
    expect(
      laufendesAus({
        ...ruhig,
        timer: { ausgabe: true, laeuft: false, ndi: true },
        auftraege: 1
      })
    ).toEqual([
      'Stage-Timer: Ausgabe offen',
      'Stage-Timer: NDI-Ausgabe',
      '1 Auftrag (Konvertierung, Import, Download oder Video-Generator)'
    ])
  })
})
