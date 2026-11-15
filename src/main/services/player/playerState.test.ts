// Player-Zustand im main: Wo steht der laufende Eintrag, nachdem die Playlist sich geändert hat?
// Dasselbe Medium darf mehrfach in der Liste stehen – der laufende Platz muss deshalb aus dem
// Befehl folgen, nicht aus der Kennung des Mediums (Paket P6 in docs/PLAN.md).
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
