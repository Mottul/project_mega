import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { YtEnqueueRequest } from '@shared/types'
import {
  buildDownloadArgs,
  buildProbeArgs,
  normalizeUrl,
  numberDigits,
  parseProbeJson,
  safeFolderName,
  sanitizeRequest,
  videoIdInPlaylistUrl,
  ytErrorText
} from './ytRequest'

const BASE: YtEnqueueRequest = {
  url: 'https://www.youtube.com/watch?v=abc123DEF45',
  format: 'video',
  maxHeight: 1080,
  outputDir: '/ziel'
}

describe('Adressen', () => {
  it('lässt nur http(s) zu', () => {
    expect(normalizeUrl('  https://youtu.be/abc  ')).toBe('https://youtu.be/abc')
    expect(() => normalizeUrl('--exec rm -rf /')).toThrow(/gültige Adresse/)
    expect(() => normalizeUrl('file:///etc/passwd')).toThrow(/http/)
    expect(() => normalizeUrl('ytsearch:katzen')).toThrow(/http/)
  })

  it('erkennt das einzelne Video in einer Playlist-Adresse', () => {
    expect(videoIdInPlaylistUrl('https://www.youtube.com/watch?v=abc123DEF45&list=PLx')).toBe(
      'abc123DEF45'
    )
    expect(videoIdInPlaylistUrl('https://youtu.be/abc123DEF45?list=PLx')).toBe('abc123DEF45')
    expect(videoIdInPlaylistUrl('https://music.youtube.com/watch?v=abc123DEF45&list=x')).toBe(
      'abc123DEF45'
    )
    expect(videoIdInPlaylistUrl('https://www.youtube.com/playlist?list=PLx')).toBeNull()
    expect(videoIdInPlaylistUrl('https://www.youtube.com/watch?v=abc123DEF45')).toBeNull()
  })
})

describe('Argumente', () => {
  it('setzt die Adresse hinter --, damit sie nie als Option gilt', () => {
    const args = buildDownloadArgs(BASE, '/ff/ffmpeg')
    expect(args.slice(-2)).toEqual(['--', BASE.url])
    expect(args).toContain('--no-playlist')
    expect(buildProbeArgs('https://x.test/p').slice(-2)).toEqual(['--', 'https://x.test/p'])
  })

  it('legt den Ordner über -P fest, Nummer und Unterordner für Playlists', () => {
    const plain = buildDownloadArgs({ ...BASE, outputDir: '/Musik/100%' }, 'ff')
    expect(plain[plain.indexOf('-P') + 1]).toBe('/Musik/100%')
    expect(plain[plain.indexOf('-o') + 1]).toBe('%(title)s.%(ext)s')

    const list = buildDownloadArgs(
      { ...BASE, subfolder: 'Best of: 2024/25', number: { index: 7, digits: 3 } },
      'ff'
    )
    expect(list[list.indexOf('-P') + 1]).toBe(join('/ziel', 'Best of_ 2024_25'))
    expect(list[list.indexOf('-o') + 1]).toBe('007 - %(title)s.%(ext)s')
  })

  it('baut Audio- und Format-Argumente wie bisher', () => {
    const mp3 = buildDownloadArgs({ ...BASE, format: 'audio-mp3', maxHeight: null }, 'ff')
    expect(mp3).toEqual(expect.arrayContaining(['-x', '--audio-format', 'mp3']))
    const best = buildDownloadArgs({ ...BASE, maxHeight: null }, 'ff')
    expect(best[best.indexOf('-f') + 1]).toBe('bv*+ba/b')
  })

  it('prüft Anfragen aus dem Renderer', () => {
    expect(() => sanitizeRequest({ ...BASE, url: '-o/etc/x' })).toThrow()
    expect(() => sanitizeRequest({ ...BASE, outputDir: ' ' })).toThrow(/Zielordner/)
    const r = sanitizeRequest({
      ...BASE,
      format: 'exe' as never,
      maxHeight: -3,
      subfolder: 'CON',
      number: { index: 0, digits: 9 },
      title: '  Titel  '
    })
    expect(r).toEqual({
      url: BASE.url,
      format: 'video',
      maxHeight: null,
      outputDir: '/ziel',
      subfolder: 'CON_',
      title: 'Titel'
    })
  })
})

describe('Ordnernamen', () => {
  it('macht beliebige Titel dateisystemtauglich', () => {
    expect(safeFolderName('AC/DC: Live <1991>?')).toBe('AC_DC_ Live _1991__')
    expect(safeFolderName('  Ende mit Punkt...  ')).toBe('Ende mit Punkt')
    expect(safeFolderName('nul')).toBe('nul_')
    expect(safeFolderName('')).toBe('Playlist')
    expect(safeFolderName('a\u0007b')).toBe('a_b')
    expect(safeFolderName('x'.repeat(200))).toHaveLength(80)
  })

  it('nummeriert mit passender Stellenzahl', () => {
    expect(numberDigits(9)).toBe(2)
    expect(numberDigits(120)).toBe(3)
    expect(numberDigits(0)).toBe(2)
  })
})

describe('Playlist-Analyse', () => {
  it('erkennt ein einzelnes Video', () => {
    const r = parseProbeJson(
      {
        id: 'abc',
        title: 'Clip',
        duration: 61.5,
        webpage_url: 'https://www.youtube.com/watch?v=abc'
      },
      'https://youtu.be/abc'
    )
    expect(r).toEqual({
      kind: 'video',
      url: 'https://www.youtube.com/watch?v=abc',
      title: 'Clip',
      durationSec: 61.5
    })
  })

  it('liest Einträge einer Playlist samt nicht ladbarer und verschachtelter', () => {
    const r = parseProbeJson(
      {
        _type: 'playlist',
        title: 'Show-Musik',
        uploader: 'Mottul',
        playlist_count: 5,
        webpage_url: 'https://www.youtube.com/playlist?list=PLx',
        entries: [
          {
            _type: 'url',
            ie_key: 'Youtube',
            id: 'aaaaaaaaaa1',
            url: 'https://www.youtube.com/watch?v=aaaaaaaaaa1',
            title: 'Opener',
            duration: 95
          },
          {
            _type: 'url',
            ie_key: 'Youtube',
            id: 'aaaaaaaaaa2',
            title: '[Private video]',
            duration: null
          },
          { _type: 'url', ie_key: 'Youtube', id: 'aaaaaaaaaa3', title: 'Nur ID' },
          {
            _type: 'url',
            ie_key: 'YoutubeTab',
            id: 't',
            url: 'https://www.youtube.com/@x/videos',
            title: 'Videos'
          },
          'kaputt'
        ]
      },
      'https://www.youtube.com/watch?v=aaaaaaaaaa3&list=PLx'
    )
    if (r.kind !== 'playlist') throw new Error('Playlist erwartet')
    expect(r.title).toBe('Show-Musik')
    expect(r.uploader).toBe('Mottul')
    expect(r.total).toBe(5)
    expect(r.truncated).toBe(true)
    expect(r.currentId).toBe('aaaaaaaaaa3')
    expect(r.videoUrl).toBe('https://www.youtube.com/watch?v=aaaaaaaaaa3&list=PLx')
    expect(r.entries.map((e) => [e.index, e.title, e.unavailable, e.nested])).toEqual([
      [1, 'Opener', false, false],
      [2, '[Private video]', true, false],
      [3, 'Nur ID', false, false],
      [4, 'Videos', false, true]
    ])
    expect(r.entries[0].durationSec).toBe(95)
    expect(r.entries[2].url).toBe('https://www.youtube.com/watch?v=aaaaaaaaaa3')
  })

  it('verkraftet leere oder fremde Antworten', () => {
    expect(() => parseProbeJson(null, 'https://x')).toThrow()
    const empty = parseProbeJson({ _type: 'playlist', entries: [] }, 'https://x.test/p')
    expect(empty).toMatchObject({
      videoUrl: null,
      kind: 'playlist',
      title: 'Playlist',
      entries: [],
      truncated: false
    })
  })

  it('liefert die letzte Fehlerzeile von yt-dlp', () => {
    expect(
      ytErrorText('WARNING: x\nERROR: [youtube:tab] PLx: The playlist does not exist.\n')
    ).toBe('[youtube:tab] PLx: The playlist does not exist.')
    expect(ytErrorText('')).toBeNull()
  })
})
