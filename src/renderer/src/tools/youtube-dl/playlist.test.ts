import { describe, expect, it } from 'vitest'
import type { YtPlaylistEntry } from '@shared/types'
import {
  fmtDuration,
  initialSelection,
  numberDigits,
  playlistRequests,
  selectRange,
  urlProblem,
  type YtPlaylist
} from './playlist'

const entry = (index: number, extra: Partial<YtPlaylistEntry> = {}): YtPlaylistEntry => ({
  index,
  id: `vid${index}`,
  url: `https://www.youtube.com/watch?v=vid${index}`,
  title: `Titel ${index}`,
  durationSec: 60 * index,
  unavailable: false,
  nested: false,
  ...extra
})

const list = (over: Partial<YtPlaylist> = {}): YtPlaylist => ({
  kind: 'playlist',
  url: 'https://www.youtube.com/playlist?list=PL1',
  title: 'Show / Musik',
  uploader: null,
  entries: [
    entry(1),
    entry(2, { unavailable: true, url: null }),
    entry(3),
    entry(4, { nested: true })
  ],
  total: 4,
  truncated: false,
  currentId: null,
  videoUrl: null,
  ...over
})

describe('Playlist-Auswahl', () => {
  it('wählt vorab alles Ladbare – oder nur das Video aus der Adresse', () => {
    expect([...initialSelection(list())]).toEqual([1, 3])
    expect([...initialSelection(list({ currentId: 'vid3' }))]).toEqual([3])
    // Video aus der Adresse nicht ladbar oder nicht unter den Einträgen -> nichts vorgewählt
    expect([...initialSelection(list({ currentId: 'vid2' }))]).toEqual([])
    expect([...initialSelection(list({ currentId: 'vid999' }))]).toEqual([])
  })

  it('setzt per Umschalt-Klick einen Bereich, überspringt nicht Ladbares', () => {
    const p = list()
    expect([...selectRange(p.entries, new Set(), 4, 1, true)].sort()).toEqual([1, 3])
    expect([...selectRange(p.entries, new Set([1, 3]), 1, 2, false)]).toEqual([3])
  })

  it('baut einen Auftrag je gewähltem Eintrag in Playlist-Reihenfolge', () => {
    const base = { format: 'audio-mp3' as const, maxHeight: null, outputDir: '/ziel' }
    const reqs = playlistRequests(list({ total: 120 }), new Set([3, 1, 2]), base, {
      folder: true,
      numbers: true
    })
    expect(reqs).toEqual([
      {
        ...base,
        url: 'https://www.youtube.com/watch?v=vid1',
        title: 'Titel 1',
        subfolder: 'Show / Musik',
        number: { index: 1, digits: 3 }
      },
      {
        ...base,
        url: 'https://www.youtube.com/watch?v=vid3',
        title: 'Titel 3',
        subfolder: 'Show / Musik',
        number: { index: 3, digits: 3 }
      }
    ])
    const plain = playlistRequests(list(), new Set([1]), base, { folder: false, numbers: false })
    expect(plain).toEqual([
      { ...base, url: 'https://www.youtube.com/watch?v=vid1', title: 'Titel 1' }
    ])
  })

  it('nummeriert mindestens zweistellig', () => {
    expect(numberDigits(list({ total: null }))).toBe(2)
    expect(numberDigits(list({ total: 1500 }))).toBe(4)
  })
})

describe('Anzeige und Eingabe', () => {
  it('formatiert Dauern', () => {
    expect(fmtDuration(65)).toBe('1:05')
    expect(fmtDuration(3723)).toBe('1:02:03')
    expect(fmtDuration(null)).toBe('')
  })

  it('meldet ungültige Adressen sofort', () => {
    expect(urlProblem('')).toBeNull()
    expect(urlProblem('https://youtu.be/x')).toBeNull()
    expect(urlProblem('youtube.com/watch?v=x')).toMatch(/gültige Adresse/)
    expect(urlProblem('ftp://x.test/a')).toMatch(/http/)
  })
})
