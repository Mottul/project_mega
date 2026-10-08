import { describe, expect, it } from 'vitest'
import {
  buildNumber,
  checksumFor,
  missingFeatures,
  pickCandidate,
  REQUIRED_ENCODERS,
  REQUIRED_FILTERS,
  type ReleaseInfo
} from './ffmpegUpdatePlan'

const BASE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/'
const DAY = 86_400_000
const NOW = Date.parse('2026-10-08T12:00:00Z')

function release(tag: string, daysAgo: number, n: number, hash = 'a25ba44c0c'): ReleaseInfo {
  const url = (name: string): string => `${BASE}${tag}/${name}`
  return {
    tag_name: tag,
    published_at: new Date(NOW - daysAgo * DAY).toISOString(),
    assets: [
      { name: 'checksums.sha256', browser_download_url: url('checksums.sha256'), size: 5000 },
      ...['win64-gpl.zip', 'linux64-gpl.tar.xz', 'win64-gpl-shared.zip'].map((s) => ({
        name: `ffmpeg-N-${n}-g${hash}-${s}`,
        browser_download_url: url(`ffmpeg-N-${n}-g${hash}-${s}`),
        size: 150_000_000
      })),
      // stabiler Zweig: wird nicht genommen (die App ist gegen den Entwicklungszweig geprüft)
      {
        name: 'ffmpeg-n8.0.1-12-gabcdef0123-win64-gpl-8.0.zip',
        browser_download_url: url('ffmpeg-n8.0.1-12-gabcdef0123-win64-gpl-8.0.zip'),
        size: 1
      }
    ]
  }
}

describe('ffmpeg in der fertigen App – Build auswählen', () => {
  const releases = [
    { ...release('autobuild-2026-10-08-13-05', 0, 127252), tag_name: 'latest' },
    release('autobuild-2026-10-08-13-05', 0, 127252),
    release('autobuild-2026-10-02-13-06', 6, 127100),
    release('autobuild-2026-09-30-13-08', 8, 127050),
    release('autobuild-2026-09-29-13-10', 9, 127020)
  ]

  it('neuester Build, der mindestens 7 Tage alt ist; „latest“ und stabile Zweige zählen nicht', () => {
    const c = pickCandidate(releases, 'win', NOW, 7, BASE)
    expect(c).toMatchObject({
      tag: 'autobuild-2026-09-30-13-08',
      build: 'N-127050-ga25ba44c0c',
      number: 127050,
      asset: 'ffmpeg-N-127050-ga25ba44c0c-win64-gpl.zip'
    })
    expect(c?.checksumsUrl).toBe(`${BASE}autobuild-2026-09-30-13-08/checksums.sha256`)
    expect(pickCandidate(releases, 'linux', NOW, 7, BASE)?.asset).toBe(
      'ffmpeg-N-127050-ga25ba44c0c-linux64-gpl.tar.xz'
    )
    expect(pickCandidate(releases, 'win', NOW, 30, BASE)).toBeNull()
  })

  it('Downloads nur von der erlaubten Adresse', () => {
    const foreign = releases.map((r) => ({
      ...r,
      assets: r.assets.map((a) => ({
        ...a,
        browser_download_url: a.browser_download_url.replace('github.com', 'example.org')
      }))
    }))
    expect(pickCandidate(foreign, 'win', NOW, 7, BASE)).toBeNull()
  })

  it('ohne Prüfsummen-Datei kein Kandidat', () => {
    const r = release('autobuild-2026-09-29-13-10', 9, 127020)
    r.assets = r.assets.filter((a) => a.name !== 'checksums.sha256')
    expect(pickCandidate([r], 'win', NOW, 7, BASE)).toBeNull()
  })

  it('Build-Nummer aus Version und Name, Prüfsumme je Datei', () => {
    expect(buildNumber('ffmpeg version N-127252-ga25ba44c0c-20261008 Copyright')).toBe(127252)
    expect(buildNumber('ffmpeg version 9.0.2 Copyright')).toBeNull()
    const sums = `${'a'.repeat(64)}  ffmpeg-N-1-gabcdef0-win64-gpl.zip\n${'B'.repeat(64)} *other.zip\n`
    expect(checksumFor(sums, 'ffmpeg-N-1-gabcdef0-win64-gpl.zip')).toBe('a'.repeat(64))
    expect(checksumFor(sums, 'other.zip')).toBe('b'.repeat(64))
    expect(checksumFor(sums, 'fehlt.zip')).toBeNull()
  })

  it('Selbsttest: was der Mottulbox fehlen würde', () => {
    const enc = new Set(REQUIRED_ENCODERS)
    const fil = new Set(REQUIRED_FILTERS)
    expect(missingFeatures(enc, fil)).toEqual([])
    enc.delete('hap')
    fil.delete('xfade')
    expect(missingFeatures(enc, fil)).toEqual(['hap', 'xfade'])
  })
})
