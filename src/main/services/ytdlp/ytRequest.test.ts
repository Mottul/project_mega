import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { YtEnqueueRequest } from '@shared/types'
import {
  alreadyDownloaded,
  authArgs,
  buildDownloadArgs,
  buildProbeArgs,
  explainYtError,
  finishedFile,
  needsImpersonation,
  normalizeUrl,
  numberDigits,
  parseProbeJson,
  safeFolderName,
  sameLength,
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
    expect(plain[plain.indexOf('-o') + 1]).toBe('%(title)s%(alt_title& - {}|)s.%(ext)s')

    const list = buildDownloadArgs(
      { ...BASE, subfolder: 'Best of: 2024/25', number: { index: 7, digits: 3 } },
      'ff'
    )
    expect(list[list.indexOf('-P') + 1]).toBe(join('/ziel', 'Best of_ 2024_25'))
    expect(list[list.indexOf('-o') + 1]).toBe('007 - %(title)s%(alt_title& - {}|)s.%(ext)s')
  })

  it('nimmt die Kennung nur auf Wunsch in den Namen', () => {
    const args = buildDownloadArgs({ ...BASE, number: { index: 7, digits: 3 } }, 'ff', [], true)
    expect(args[args.indexOf('-o') + 1]).toBe(
      '007 - %(title)s%(alt_title& - {}|)s [%(id)s].%(ext)s'
    )
  })

  it('verlangt UTF-8 und behält trotz --print den Fortschritt', () => {
    const dl = buildDownloadArgs(BASE, 'ff')
    expect(dl[dl.indexOf('--encoding') + 1]).toBe('utf-8')
    expect(dl).toContain('--no-quiet')
    const probe = buildProbeArgs('https://x.test/p')
    expect(probe[probe.indexOf('--encoding') + 1]).toBe('utf-8')
  })

  it('liest die fertige Datei aus genau der Zeile, die --print erzeugt', () => {
    const args = buildDownloadArgs(BASE, 'ff')
    const print = args[args.indexOf('--print') + 1].replace(/^after_move:/, '')
    const line = (sec: string, path: string): string =>
      print.replace('%(duration)s', sec).replace('%(filepath)s', path)
    expect(finishedFile(`${line('662', 'C:\\Ziel\\Grüße：Köln am Rhein.mp4')}\r`)).toEqual({
      path: 'C:\\Ziel\\Grüße：Köln am Rhein.mp4',
      durationSec: 662
    })
    // eine Seite ohne Längenangabe
    expect(finishedFile(line('NA', '/ziel/clip.mp4'))).toEqual({
      path: '/ziel/clip.mp4',
      durationSec: null
    })
    expect(finishedFile('[download] Destination: C:\\Ziel\\Grüße.mp4')).toBeNull()
    expect(finishedFile(line('662', ''))).toBeNull()
  })

  it('hält nur bekannte, fast gleiche Längen für dasselbe Video', () => {
    expect(sameLength(662, 662.006)).toBe(true)
    expect(sameLength(662, 664)).toBe(true)
    expect(sameLength(662, 640)).toBe(false)
    expect(sameLength(null, 662)).toBe(false)
    expect(sameLength(662, null)).toBe(false)
    expect(sameLength(null, null)).toBe(false)
  })

  it('erkennt, dass yt-dlp eine vorhandene Datei überspringt', () => {
    expect(alreadyDownloaded('[download] C:\\Ziel\\Tracks.mp4 has already been downloaded')).toBe(
      true
    )
    expect(alreadyDownloaded('[download] C:\\Ziel\\Tracks.mp4 has already been downloaded\r')).toBe(
      true
    )
    expect(
      alreadyDownloaded('[download] Destination: C:\\Ziel\\has already been downloaded.mp4')
    ).toBe(false)
    expect(alreadyDownloaded('[download]  12.3% of 1.00MiB at 1.00MiB/s ETA 00:01')).toBe(false)
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

  it('nimmt den zweiten Titel mit, wie der Dateiname (Arte: Sendung + Beitrag)', () => {
    const r = parseProbeJson(
      { id: '126484-053-A', title: 'Tracks', alt_title: 'Fcukers' },
      'https://www.arte.tv/x'
    )
    expect(r.title).toBe('Tracks - Fcukers')
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

describe('Anmeldung und Seitenschutz', () => {
  const ok = (): boolean => true
  it('Cookies: nur bekannte Browser, eine Datei nur, wenn sie geprüft ist', () => {
    expect(authArgs({ cookies: 'none', cookiesFile: '' })).toEqual([])
    expect(authArgs({ cookies: 'firefox', cookiesFile: '' })).toEqual([
      '--cookies-from-browser',
      'firefox'
    ])
    // fremder Wert aus settings.json: nie an yt-dlp
    expect(authArgs({ cookies: 'firefox; rm' as never, cookiesFile: '' })).toEqual([])
    expect(authArgs({ cookies: 'file', cookiesFile: ' /k/cookies.txt ' }, { fileOk: ok })).toEqual([
      '--cookies',
      '/k/cookies.txt'
    ])
    expect(authArgs({ cookies: 'file', cookiesFile: '/k/cookies.txt' })).toEqual([])
    expect(authArgs({ cookies: 'file', cookiesFile: '' }, { fileOk: ok })).toEqual([])
    expect(authArgs({ cookies: 'edge', cookiesFile: '' }, { impersonate: true })).toEqual([
      '--cookies-from-browser',
      'edge',
      '--impersonate',
      'chrome'
    ])
  })

  it('Zusatz-Argumente stehen vor dem „--“ der Adresse', () => {
    const extra = ['--cookies-from-browser', 'firefox']
    const dl = buildDownloadArgs(BASE, 'ffmpeg', extra)
    expect(dl.slice(-4)).toEqual([...extra, '--', BASE.url])
    const probe = buildProbeArgs('https://x.test/p', extra)
    expect(probe.slice(-4)).toEqual([...extra, '--', 'https://x.test/p'])
  })

  it('Cloudflare-Sperre erkennen (zweiter Versuch als Browser)', () => {
    const cf =
      'ERROR: [generic] Got HTTP Error 403 caused by Cloudflare anti-bot challenge; try again with  --extractor-args "generic:impersonate"'
    expect(needsImpersonation(cf)).toBe(true)
    expect(needsImpersonation('ERROR: HTTP Error 404: Not Found')).toBe(false)
    expect(explainYtError(cf, { cookies: 'none', impersonated: true })).toMatch(/Cloudflare/)
    expect(
      explainYtError('ERROR: unable to download video data: HTTP Error 403: Forbidden', {
        cookies: 'none',
        impersonated: true
      })
    ).toMatch(/HTTP 403\), auch mit Browser-Nachahmung/)
    expect(
      explainYtError('ERROR: Impersonate target "chrome" is not available', {
        cookies: 'none',
        impersonated: true
      })
    ).toMatch(/eigenständige yt-dlp/)
  })

  it('Anmeldung nötig: Hinweis je nachdem, ob Cookies eingestellt sind', () => {
    const age =
      'ERROR: [youtube] AqNFJUihSHg: Sign in to confirm your age. Use --cookies-from-browser or --cookies for the authentication.'
    expect(explainYtError(age, { cookies: 'none', impersonated: false })).toMatch(
      /^Anmeldung nötig .*„Anmeldung“/
    )
    expect(explainYtError(age, { cookies: 'firefox', impersonated: false })).toMatch(
      /trotz Cookies/
    )
    const bot = "ERROR: [youtube] x: Sign in to confirm you're not a bot."
    expect(explainYtError(bot, { cookies: 'none', impersonated: false })).toMatch(/Bot-Prüfung/)
  })

  it('Cookie-Probleme verständlich: Chrome-Verschlüsselung, gesperrte Datenbank, kein Profil', () => {
    const ctx = { cookies: 'chrome' as const, impersonated: false }
    expect(
      explainYtError(
        'ERROR: Failed to decrypt with DPAPI. See https://github.com/yt-dlp/yt-dlp/issues/10927',
        ctx
      )
    ).toMatch(/Firefox wählen oder eine cookies.txt/)
    expect(explainYtError('ERROR: Could not copy Chrome cookie database. See …', ctx)).toMatch(
      /Browser schließen/
    )
    expect(
      explainYtError('ERROR: could not find firefox cookies database in "/home/a/.mozilla"', {
        ...ctx,
        cookies: 'firefox'
      })
    ).toMatch(/keine Cookies gefunden/)
    // Unbekanntes bleibt die Zeile von yt-dlp
    expect(explainYtError('ERROR: Video unavailable', ctx)).toBe('Video unavailable')
  })
})
