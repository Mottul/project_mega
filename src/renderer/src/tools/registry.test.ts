import { describe, expect, it } from 'vitest'
import { matches } from '@renderer/launcher/suche'
import { tools } from './registry'

// Die mittlere Kachel des Startbildschirms (Vorgabe) zeigt die Beschreibung in zwei Zeilen zu
// knapp 30 Zeichen (1366 × 768, Paket B6) – was länger ist, endet mitten im Satz mit „…“.
const BESCHREIBUNG_MAX = 50

const treffer = (q: string): string[] => tools.filter((t) => matches(t, q)).map((t) => t.id)

describe('Werkzeuge auf dem Startbildschirm', () => {
  it(`Beschreibungen haben höchstens ${BESCHREIBUNG_MAX} Zeichen`, () => {
    const zuLang = tools
      .filter((t) => [...t.description].length > BESCHREIBUNG_MAX)
      .map((t) => `${t.id} (${[...t.description].length})`)
    expect(zuLang).toEqual([])
  })

  // Begriffe aus den früheren, langen Beschreibungen stehen jetzt in den Stichworten – die Suche
  // liest beides. Je Werkzeug mindestens einer, dazu die fünf aus dem Plan.
  it.each([
    ['prores', 'hap-converter'],
    ['hap', 'hap-converter'],
    ['madmapper', 'osc-control'],
    ['ptz', 'camera-lens'],
    ['ptz', 'netscan'],
    ['handbuch', 'manuals'],
    ['einbacken', 'video-player'],
    ['shuffle', 'video-player'],
    ['fade', 'jingle-player'],
    ['farbwarnung', 'stage-timer'],
    ['png', 'test-patterns'],
    ['taster', 'osc-control'],
    ['vorabversion', 'novastar'],
    ['probebetrieb', 'atem-control'],
    ['projektoren', 'netscan'],
    ['startadresse', 'dmx-address'],
    ['curving', 'led-wall'],
    ['throw ratio', 'throw-ratio'],
    ['person', 'camera-lens'],
    ['umgebungslicht', 'projector-lumen'],
    ['hdr', 'hap-converter'],
    ['ken burns', 'video-generator'],
    ['ampel', 'media-info'],
    ['volltextsuche', 'manuals'],
    ['m4a', 'youtube-dl'],
    ['mengen', 'packing-list'],
    ['kurzkarte', 'mini-manual'],
    ['63 a', 'power-load'],
    ['strangkräfte', 'rigging'],
    ['radius', 'circle-calc'],
    ['schalldruck', 'audio-delay'],
    ['feedback', 'rta'],
    ['handy', 'tone-generator'],
    ['drop-frame', 'timecode']
  ])('Suche „%s“ findet %s', (q, id) => {
    expect(treffer(q)).toContain(id)
  })
})
