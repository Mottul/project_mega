// Player-Zustand im main: Wo steht der laufende Eintrag, nachdem die Playlist sich geändert hat?
// Dasselbe Medium darf mehrfach in der Liste stehen – der laufende Platz muss deshalb aus dem
// Befehl folgen, nicht aus der Kennung des Mediums (Paket P6 in docs/PLAN.md). Ebenso der bei
// Zufall vorab gewürfelte Platz für „Danach“ (P7) – und fällt der laufende weg, startet er (P8).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextIndex } from '@shared/player'
import type { MediaItem, PlayerCommand, PlayerState } from '@shared/types'

// Bibliothek und Einstellungen ersetzen: Der Zustand läuft ohne Datenbank und Electron
const bibliothek = new Map<string, MediaItem>()
vi.mock('./mediaLibrary', () => ({ getMedia: (id: string) => bibliothek.get(id) ?? null }))
vi.mock('../store', () => ({
  getSettings: () => ({
    player: {
      imageDurationSec: 10,
      transition: 'cut',
      transitionMs: 500,
      idlePattern: 'off',
      idleMediaUrl: null,
      idleMediaKind: null,
      wallWidth: 1920,
      wallHeight: 1080
    }
  }),
  setSettings: () => {}
}))

function medium(id: string, title = id): MediaItem {
  return {
    id,
    kind: 'video',
    title,
    originalName: `${id}.mp4`,
    url: `media://library/${id}.mp4`,
    thumbUrl: null,
    width: 1920,
    height: 1080,
    durationSec: 10,
    fitMode: 'blur',
    hasAudio: false,
    sizeBytes: 1,
    sourcePath: null,
    addedAt: 0
  }
}

let player: typeof import('./playerState')

// Jeder Fall mit frischem Zustand (der Zustand lebt im Modul)
beforeEach(async () => {
  bibliothek.clear()
  for (const id of ['A', 'B', 'C', 'D', 'X']) bibliothek.set(id, medium(id))
  vi.resetModules()
  player = await import('./playerState')
})

const befehl = (cmd: PlayerCommand): void => player.applyCommand(cmd)
const zustand = (): PlayerState => player.getPlayerState()

/** Kennungen der Playlist in ihrer Reihenfolge, etwa „B A A“ */
function liste(): string {
  const { playlist } = zustand()
  return playlist.map((m) => m.id).join(' ')
}

/** Playlist laden und Platz `laufend` abspielen */
function starte(ids: string, laufend: number): void {
  befehl({ type: 'replace', mediaIds: ids.split(' ') })
  befehl({ type: 'goto', index: laufend })
  expect(zustand().index).toBe(laufend)
}

describe('laufender Eintrag bei doppelten Medien', () => {
  it('verschieben davor: A B A, das zweite A läuft, B nach vorn – Platz 2', () => {
    starte('A B A', 2)
    befehl({ type: 'move', from: 1, to: 0 })
    expect(liste()).toBe('B A A')
    expect(zustand().index).toBe(2)
    // „Danach“ ist wieder der Anfang der Liste, nicht dasselbe A ein zweites Mal
    expect(nextIndex(zustand())).toBe(0)
  })

  it('den laufenden Eintrag selbst verschieben', () => {
    starte('A A B', 1)
    befehl({ type: 'move', from: 1, to: 2 })
    expect(liste()).toBe('A B A')
    expect(zustand().index).toBe(2)
  })

  it('einfügen davor: plus Anzahl', () => {
    starte('A B A', 2)
    befehl({ type: 'add', mediaIds: ['C'], at: 0 })
    expect(liste()).toBe('C A B A')
    expect(zustand().index).toBe(3)
    befehl({ type: 'add', mediaIds: ['C', 'D'], at: 1 })
    expect(liste()).toBe('C C D A B A')
    expect(zustand().index).toBe(5)
  })

  it('einfügen am Platz des laufenden schiebt ihn nach hinten', () => {
    starte('A B A', 2)
    befehl({ type: 'add', mediaIds: ['C'], at: 2 })
    expect(liste()).toBe('A B C A')
    expect(zustand().index).toBe(3)
  })

  it('entfernen davor: minus eins', () => {
    starte('A B A', 2)
    befehl({ type: 'remove', index: 1 })
    expect(liste()).toBe('A A')
    expect(zustand().index).toBe(1)
  })

  it('refreshPlaylist: Eintrag davor fehlt in der Bibliothek', () => {
    starte('A B A', 2)
    bibliothek.delete('B')
    player.refreshPlaylist()
    expect(liste()).toBe('A A')
    expect(zustand().index).toBe(1)
  })

  it('refreshPlaylist: nur ein Eintrag hat sich geändert – der Platz bleibt', () => {
    starte('A B A', 2)
    bibliothek.set('B', medium('B', 'B neu gerechnet'))
    player.refreshPlaylist()
    expect(zustand().playlist[1].title).toBe('B neu gerechnet')
    expect(zustand().index).toBe(2)
  })

  it('dropMediaFromPlaylist: Medium davor aus der Bibliothek gelöscht', () => {
    starte('A B A', 2)
    player.dropMediaFromPlaylist('B')
    expect(liste()).toBe('A A')
    expect(zustand().index).toBe(1)
  })

  it('dropMediaFromPlaylist: das laufende Medium steht auch davor – der folgende rückt nach', () => {
    starte('A X A B C', 2)
    player.dropMediaFromPlaylist('A')
    expect(liste()).toBe('X B C')
    expect(zustand().index).toBe(1)
  })

  it('refreshPlaylist: das laufende Medium fehlt und stand auch davor – der folgende rückt nach', () => {
    starte('A X A B C', 2)
    bibliothek.delete('A')
    player.refreshPlaylist()
    expect(liste()).toBe('X B C')
    expect(zustand().index).toBe(1)
  })
})

describe('laufender Eintrag ohne doppelte Medien', () => {
  it('verschieben von davor nach dahinter und umgekehrt', () => {
    starte('A B C', 1)
    befehl({ type: 'move', from: 0, to: 2 })
    expect(liste()).toBe('B C A')
    expect(zustand().index).toBe(0)
    befehl({ type: 'move', from: 2, to: 0 })
    expect(liste()).toBe('A B C')
    expect(zustand().index).toBe(1)
  })

  it('Änderungen dahinter lassen den Platz stehen', () => {
    starte('A B C D', 1)
    befehl({ type: 'move', from: 3, to: 2 })
    befehl({ type: 'add', mediaIds: ['X'], at: 4 })
    befehl({ type: 'remove', index: 3 })
    expect(liste()).toBe('A B D X')
    expect(zustand().index).toBe(1)
  })

  it('den laufenden entfernen: der folgende rückt nach und startet von vorn', () => {
    starte('A B C', 1)
    const seek = zustand().seekSeq
    befehl({ type: 'remove', index: 1 })
    expect(liste()).toBe('A C')
    expect(zustand().index).toBe(1)
    expect(zustand().seekSeq).toBe(seek + 1)
  })

  it('das laufende Medium als letztes gelöscht: der davor wird gewählt', () => {
    starte('A B C', 2)
    player.dropMediaFromPlaylist('C')
    expect(liste()).toBe('A B')
    expect(zustand().index).toBe(1)
  })

  it('alles gelöscht: der Player steht', () => {
    starte('A A', 1)
    player.dropMediaFromPlaylist('A')
    expect(liste()).toBe('')
    expect(zustand().index).toBe(-1)
    expect(zustand().playing).toBe(false)
  })

  it('ohne laufenden Eintrag bleibt nichts gewählt', () => {
    starte('A B C', 2)
    befehl({ type: 'setLoop', loop: 'none' })
    befehl({ type: 'next' }) // hinter dem letzten: nichts mehr gewählt
    expect(zustand().index).toBe(-1)
    befehl({ type: 'move', from: 0, to: 2 })
    befehl({ type: 'remove', index: 0 })
    player.dropMediaFromPlaylist('C')
    expect(liste()).toBe('A')
    expect(zustand().index).toBe(-1)
  })
})

// Bei Zufall würfelt der main den nächsten Platz vorab, damit die Ausgabe genau dieses Medium
// vorladen kann. Blieb der Platz beim Umsortieren stehen, stand dort ein anderer Eintrag: Die
// Marke „Danach“ sprang, und die Ausgabe lud ein anderes Medium vor als das schon geladene (P7).
describe('Zufall: „Danach“ bleibt derselbe Eintrag', () => {
  // Jeder Wurf nimmt den nächsten festgelegten Wert (Platz = Wert · Anzahl, abgerundet); ein Wurf
  // darüber hinaus scheitert – „Danach“ darf nicht durch neues Würfeln zufällig stimmen.
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('unerwartet gewürfelt')
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function wuerfle(...werte: number[]): void {
    for (const wert of werte) vi.mocked(Math.random).mockReturnValueOnce(wert)
  }

  /** Zufall einschalten, der erste Wurf ergibt „Danach“ */
  function mitZufall(wert: number): void {
    wuerfle(wert)
    befehl({ type: 'setShuffle', shuffle: true })
  }

  /** „Danach“, wie Playlist und Ausgabe es nehmen: Platz und Kennung, etwa „2 D“ */
  function danach(): string {
    const i = nextIndex(zustand())
    return `${i} ${zustand().playlist[i]?.id}`
  }

  it('A läuft, „Danach“ D: D auf Platz 1 ziehen, dann B vorn einfügen – bleibt D', () => {
    starte('A B C D', 0)
    mitZufall(0.8) // 0,8 · 4 → Platz 3
    expect(danach()).toBe('3 D')
    befehl({ type: 'move', from: 3, to: 1 })
    expect(liste()).toBe('A D B C')
    expect(danach()).toBe('1 D')
    befehl({ type: 'add', mediaIds: ['B'], at: 0 })
    expect(liste()).toBe('B A D B C')
    expect(zustand().index).toBe(1)
    expect(danach()).toBe('2 D')
  })

  it('den laufenden hinter den gewürfelten ziehen – „Danach“ rückt eins vor', () => {
    starte('A B C D', 0)
    mitZufall(0.8)
    befehl({ type: 'move', from: 0, to: 3 })
    expect(liste()).toBe('B C D A')
    expect(zustand().index).toBe(3)
    expect(danach()).toBe('2 D')
  })

  it('davor entfernen: minus eins', () => {
    starte('A B C D X', 0)
    mitZufall(0.7) // 0,7 · 5 → Platz 3
    expect(danach()).toBe('3 D')
    befehl({ type: 'remove', index: 1 })
    expect(liste()).toBe('A C D X')
    expect(danach()).toBe('2 D')
  })

  it('den gewürfelten entfernen: neu gewürfelt, nie auf den laufenden Platz', () => {
    starte('A B C D', 2)
    mitZufall(0.1) // 0,1 · 4 → Platz 0
    expect(danach()).toBe('0 A')
    // Der laufende C rückt auf Platz 1: Der erste Wurf träfe ihn und wird verworfen
    wuerfle(0.5, 0.9) // 0,5 · 3 → Platz 1, 0,9 · 3 → Platz 2
    befehl({ type: 'remove', index: 0 })
    expect(liste()).toBe('B C D')
    expect(zustand().index).toBe(1)
    expect(danach()).toBe('2 D')
  })

  it('den laufenden entfernen, der gewürfelte rückt nach und läuft: neu gewürfelt', () => {
    starte('A B C D', 1)
    mitZufall(0.6) // 0,6 · 4 → Platz 2
    expect(danach()).toBe('2 C')
    wuerfle(0.4, 0) // 0,4 · 3 → Platz 1 (jetzt der laufende C, verworfen), dann Platz 0
    befehl({ type: 'remove', index: 1 })
    expect(liste()).toBe('A C D')
    expect(zustand().index).toBe(1)
    expect(danach()).toBe('0 A')
  })

  it('refreshPlaylist: Medium davor fehlt in der Bibliothek – minus die Entfernten davor', () => {
    starte('A B C D X', 0)
    mitZufall(0.7)
    bibliothek.delete('B')
    player.refreshPlaylist()
    expect(liste()).toBe('A C D X')
    expect(danach()).toBe('2 D')
  })

  it('dropMediaFromPlaylist: das gewürfelte Medium gelöscht – neu gewürfelt', () => {
    starte('A B C D X', 0)
    mitZufall(0.5) // 0,5 · 5 → Platz 2
    expect(danach()).toBe('2 C')
    wuerfle(0.1, 0.9) // 0,1 · 4 → Platz 0 (der laufende, verworfen), 0,9 · 4 → Platz 3
    player.dropMediaFromPlaylist('C')
    expect(liste()).toBe('A B D X')
    expect(danach()).toBe('3 X')
  })

  it('Playlist ausgetauscht: neu gewürfelt, nicht der alte Platz', () => {
    starte('A B', 0)
    mitZufall(0.6) // 0,6 · 2 → Platz 1 (bei zwei Einträgen immer)
    expect(danach()).toBe('1 B')
    wuerfle(0.8) // 0,8 · 4 → Platz 3
    befehl({ type: 'replace', mediaIds: ['C', 'D', 'X', 'A'] })
    expect(danach()).toBe('3 A')
  })

  // Fällt der laufende Eintrag weg, geht es mit „Danach“ weiter wie bei ⏭: Die Bühne hat es
  // angekündigt, die Ausgabe hat es schon vorgeladen. Vorher startete der Eintrag, der an den
  // Platz rückte, und die Ausgabe musste ihn neu laden (P8).
  describe('✕ am laufenden Eintrag startet „Danach“', () => {
    it('A läuft, „Danach“ D: ✕ an A startet D, dann wird neu gewürfelt', () => {
      starte('A B C D', 0)
      mitZufall(0.8) // 0,8 · 4 → Platz 3
      expect(danach()).toBe('3 D')
      const seek = zustand().seekSeq
      // D steht danach auf Platz 2 und läuft: Der erste Wurf träfe ihn und wird verworfen
      wuerfle(0.9, 0.1) // 0,9 · 3 → Platz 2, 0,1 · 3 → Platz 0
      befehl({ type: 'remove', index: 0 })
      expect(liste()).toBe('B C D')
      expect(zustand().index).toBe(2)
      expect(zustand().playing).toBe(true)
      expect(zustand().seekSeq).toBe(seek + 1) // die Ausgabe startet D von vorn
      expect(danach()).toBe('0 B')
    })

    it('auch am Ende der Liste: „Danach“ statt des Eintrags davor', () => {
      starte('A B C D', 3)
      mitZufall(0.3) // 0,3 · 4 → Platz 1
      expect(danach()).toBe('1 B')
      wuerfle(0.9) // 0,9 · 3 → Platz 2
      befehl({ type: 'remove', index: 3 })
      expect(liste()).toBe('A B C')
      expect(zustand().index).toBe(1)
      expect(danach()).toBe('2 C')
    })

    it('ohne Zufall startet B, der an den Platz rückt – er ist dort „Danach“', () => {
      starte('A B C D', 0)
      expect(danach()).toBe('1 B')
      befehl({ type: 'remove', index: 0 })
      expect(liste()).toBe('B C D')
      expect(zustand().index).toBe(0)
      expect(danach()).toBe('1 C')
    })

    it('mit Loop „Eines“ wie bisher: B rückt nach', () => {
      starte('A B C D', 0)
      befehl({ type: 'setLoop', loop: 'one' })
      befehl({ type: 'setShuffle', shuffle: true }) // mit Loop „Eines“ wird nicht gewürfelt
      expect(danach()).toBe('0 A')
      befehl({ type: 'remove', index: 0 })
      expect(liste()).toBe('B C D')
      expect(zustand().index).toBe(0)
      expect(danach()).toBe('0 B')
    })

    it('das laufende Medium aus der Bibliothek gelöscht: „Danach“ startet', () => {
      starte('A B C D', 0)
      mitZufall(0.8) // 0,8 · 4 → Platz 3
      expect(danach()).toBe('3 D')
      wuerfle(0.1) // 0,1 · 3 → Platz 0
      player.dropMediaFromPlaylist('A')
      expect(liste()).toBe('B C D')
      expect(zustand().index).toBe(2)
      expect(danach()).toBe('0 B')
    })

    it('refreshPlaylist: das laufende Medium fehlt und stand auch davor – „Danach“ startet', () => {
      starte('A X A B C', 2)
      mitZufall(0.9) // 0,9 · 5 → Platz 4
      expect(danach()).toBe('4 C')
      wuerfle(0) // Platz 0
      bibliothek.delete('A')
      player.refreshPlaylist()
      expect(liste()).toBe('X B C')
      expect(zustand().index).toBe(2)
      expect(danach()).toBe('0 X')
    })

    it('„Danach“ fällt mit weg (dasselbe Medium): der folgende rückt nach wie ohne Zufall', () => {
      starte('A X A B C', 2)
      mitZufall(0.1) // 0,1 · 5 → Platz 0, das erste A
      expect(danach()).toBe('0 A')
      wuerfle(0.9) // 0,9 · 3 → Platz 2
      player.dropMediaFromPlaylist('A')
      expect(liste()).toBe('X B C')
      expect(zustand().index).toBe(1)
      expect(danach()).toBe('2 C')
    })
  })
})
