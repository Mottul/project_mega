// Tests der reinen Helfer des yt-dlp-Updaters. Netzzugriff, Dateisystem und
// spawn bleiben aussen vor -- geprueft wird, was ueber die Sicherheit des
// Downloads entscheidet: Tag-Validierung und Pruefsummen-Zuordnung.

import { describe, expect, it } from 'vitest'
import { isValidTag, parseChecksums, tagFromReleaseUrl } from './ytDlp'

describe('isValidTag', () => {
  it('akzeptiert echte Release-Tags', () => {
    expect(isValidTag('2025.01.26')).toBe(true)
    expect(isValidTag('2024.12.13')).toBe(true)
    expect(isValidTag('2025.01.26.1')).toBe(true) // Nachzuegler-Release
  })

  it('weist alles zurueck, was in einer URL Unfug anrichten koennte', () => {
    for (const bad of [
      '',
      'latest',
      '2025.1.26', // ohne fuehrende Null
      '../../../etc/passwd',
      '2025.01.26/../../evil',
      '2025.01.26?x=1',
      'https://example.com/2025.01.26',
      '2025.01.26 ',
      '2025.01.26\n2025.01.27'
    ]) {
      expect(isValidTag(bad), bad).toBe(false)
    }
  })
})

describe('tagFromReleaseUrl', () => {
  it('liest die Version aus der Weiterleitung', () => {
    expect(tagFromReleaseUrl('https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19')).toBe(
      '2026.08.19'
    )
    expect(
      tagFromReleaseUrl('  https://github.com/yt-dlp/yt-dlp/releases/tag/2025.01.26.1  ')
    ).toBe('2025.01.26.1')
  })

  it('verweigert Weiterleitungen, die woanders hinzeigen', () => {
    for (const bad of [
      'https://github.com/boese/yt-dlp/releases/tag/2026.08.19',
      'https://github.com/yt-dlp/yt-dlp-evil/releases/tag/2026.08.19',
      'http://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19', // kein TLS
      'https://evil.example/github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19',
      'https://github.com/yt-dlp/yt-dlp/releases/tag/latest',
      'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19/../../evil',
      'https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19?x=1',
      ''
    ]) {
      expect(tagFromReleaseUrl(bad), bad).toBe(null)
    }
  })
})

describe('parseChecksums', () => {
  const sums = [
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  yt-dlp',
    '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03  yt-dlp.exe',
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592  yt-dlp_macos',
    '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae  yt-dlp_linux'
  ].join('\n')

  it('ordnet Hashes den Dateinamen zu', () => {
    const map = parseChecksums(sums)
    expect(map.get('yt-dlp.exe')).toBe(
      '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03'
    )
    expect(map.get('yt-dlp_macos')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'
    )
    expect(map.size).toBe(4)
  })

  it('vertraegt Leerzeilen, CRLF und die Binaermarkierung', () => {
    const map = parseChecksums(
      '\r\n' +
        '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03 *yt-dlp.exe\r\n' +
        '\r\n'
    )
    expect(map.get('yt-dlp.exe')).toBe(
      '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03'
    )
  })

  it('ignoriert Zeilen ohne gueltigen SHA-256', () => {
    const map = parseChecksums(
      [
        'kurz  yt-dlp.exe',
        'zzzz5b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be0  yt-dlp.exe',
        'Kommentar'
      ].join('\n')
    )
    expect(map.size).toBe(0)
  })

  it('liefert nichts fuer ein leeres Dokument', () => {
    expect(parseChecksums('').size).toBe(0)
  })
})
