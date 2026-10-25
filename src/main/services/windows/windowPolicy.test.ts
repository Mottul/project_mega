import { describe, expect, it } from 'vitest'
import {
  appRoute,
  devServerUrl,
  isAppPage,
  isWebUrl,
  permissionAllowed,
  shellTarget
} from './windowPolicy'

const built = { indexFile: 'file:///E:/Mottulbox/out/renderer/index.html', devOrigin: null }
const dev = { indexFile: built.indexFile, devOrigin: 'http://localhost:5173' }

describe('devServerUrl', () => {
  it('nutzt den Vite-Server nur beim Entwickeln und nur lokal', () => {
    expect(devServerUrl(false, 'http://localhost:5173')).toBe('http://localhost:5173')
    expect(devServerUrl(false, 'http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173/')
  })

  it('folgt der Umgebungsvariable in der fertigen App nie', () => {
    expect(devServerUrl(true, 'http://localhost:5173')).toBeNull()
  })

  it('lädt keine fremden Adressen', () => {
    expect(devServerUrl(false, 'https://example.com')).toBeNull()
    expect(devServerUrl(false, 'file:///C:/fremd/index.html')).toBeNull()
    expect(devServerUrl(false, 'kein url')).toBeNull()
    expect(devServerUrl(false, undefined)).toBeNull()
  })
})

describe('isAppPage', () => {
  it('erkennt die gebaute Seite mit jeder Route', () => {
    expect(isAppPage('file:///E:/Mottulbox/out/renderer/index.html#/tool/timecode', built)).toBe(
      true
    )
    expect(isAppPage('file:///e:/mottulbox/out/renderer/index.html', built)).toBe(true)
  })

  it('lehnt andere Dateien, Protokolle und Server ab', () => {
    expect(isAppPage('file:///E:/Mottulbox/out/renderer/andere.html', built)).toBe(false)
    expect(isAppPage('file:///C:/Users/x/Downloads/boese.html', built)).toBe(false)
    expect(isAppPage('https://example.com/', built)).toBe(false)
    expect(isAppPage('data:text/html,<p>x</p>', built)).toBe(false)
    expect(isAppPage(undefined, built)).toBe(false)
  })

  it('wirft nie, auch nicht bei kaputter %-Kodierung (sonst ginge die Navigation durch)', () => {
    expect(() => isAppPage('file:///C:/x%E0.html', built)).not.toThrow()
    expect(isAppPage('file:///C:/x%E0.html', built)).toBe(false)
    expect(isAppPage('file:///E:/Mottulbox/out/renderer/index.html%', built)).toBe(false)
  })

  it('erkennt beim Entwickeln nur den Vite-Server', () => {
    expect(isAppPage('http://localhost:5173/#/output', dev)).toBe(true)
    expect(isAppPage('http://localhost:5174/', dev)).toBe(false)
    expect(isAppPage(built.indexFile, dev)).toBe(false)
  })
})

describe('permissionAllowed', () => {
  it('erlaubt der App nur das Nötige', () => {
    expect(permissionAllowed('request', 'fullscreen', true)).toBe(true)
    expect(permissionAllowed('check', 'speaker-selection', true)).toBe(true)
  })

  it('verweigert Kamera, Mikrofon und alles Übrige', () => {
    // auch nicht als Abfrage: sonst sähe eine Seite die Namen aller Mikrofone
    expect(permissionAllowed('request', 'media', true)).toBe(false)
    expect(permissionAllowed('check', 'media', true)).toBe(false)
    for (const p of [
      'geolocation',
      'notifications',
      'midiSysex',
      'hid',
      'usb',
      'display-capture'
    ]) {
      expect(permissionAllowed('request', p, true)).toBe(false)
      expect(permissionAllowed('check', p, true)).toBe(false)
    }
  })

  it('verweigert fremden Seiten alles', () => {
    expect(permissionAllowed('request', 'fullscreen', false)).toBe(false)
    expect(permissionAllowed('check', 'speaker-selection', false)).toBe(false)
  })

  it('Mikrofon nur für den RTA: nur auf seiner Route, nur Ton', () => {
    const rta = 'file:///C:/app/out/renderer/index.html#/tool/rta?fenster=1'
    expect(appRoute(rta)).toBe('/tool/rta')
    expect(
      permissionAllowed('request', 'media', true, { pageUrl: rta, mediaTypes: ['audio'] })
    ).toBe(true)
    expect(permissionAllowed('check', 'media', true, { pageUrl: rta, mediaType: 'audio' })).toBe(
      true
    )
    // Kamera nie, auch nicht zusammen mit dem Ton
    expect(
      permissionAllowed('request', 'media', true, { pageUrl: rta, mediaTypes: ['video'] })
    ).toBe(false)
    expect(
      permissionAllowed('request', 'media', true, { pageUrl: rta, mediaTypes: ['audio', 'video'] })
    ).toBe(false)
    expect(permissionAllowed('request', 'media', true, { pageUrl: rta, mediaTypes: [] })).toBe(
      false
    )
    expect(permissionAllowed('check', 'media', true, { pageUrl: rta, mediaType: 'video' })).toBe(
      false
    )
    // andere Seiten der App und fremde Seiten nie
    for (const page of [
      'file:///C:/app/out/renderer/index.html#/',
      'file:///C:/app/out/renderer/index.html#/tool/jingle-player',
      'file:///C:/app/out/renderer/index.html#/tool/rta-falsch'
    ]) {
      expect(
        permissionAllowed('request', 'media', true, { pageUrl: page, mediaTypes: ['audio'] }),
        page
      ).toBe(false)
      expect(
        permissionAllowed('check', 'media', true, { pageUrl: page, mediaType: 'audio' }),
        page
      ).toBe(false)
    }
    expect(
      permissionAllowed('request', 'media', false, { pageUrl: rta, mediaTypes: ['audio'] })
    ).toBe(false)
  })
})

describe('shellTarget', () => {
  it('nimmt absolute Pfade', () => {
    expect(shellTarget('C:\\Users\\x\\Videos', { network: false })).toBe('C:\\Users\\x\\Videos')
    expect(shellTarget('/home/x/Videos', { network: false })).toBe('/home/x/Videos')
  })

  it('lehnt relative Pfade, Protokolle und Unsinn ab', () => {
    for (const bad of [
      'Videos',
      'C:Videos',
      'file:///C:/x',
      'https://x',
      '',
      42,
      null,
      'C:\\x\0.exe'
    ]) {
      expect(shellTarget(bad, { network: false })).toBeNull()
    }
  })

  it('lässt Netzwerkpfade nur zu, wenn erlaubt', () => {
    expect(shellTarget('\\\\server\\show\\clip.mp4', { network: false })).toBeNull()
    expect(shellTarget('//server/show/clip.mp4', { network: false })).toBeNull()
    expect(shellTarget('\\\\server\\show\\clip.mp4', { network: true })).toBe(
      '\\\\server\\show\\clip.mp4'
    )
  })
})

describe('isWebUrl', () => {
  it('gibt nur http(s) an den Browser', () => {
    expect(isWebUrl('https://192.168.1.20/')).toBe(true)
    expect(isWebUrl('http://x')).toBe(true)
    expect(isWebUrl('file:///C:/x.exe')).toBe(false)
    expect(isWebUrl('javascript:alert(1)')).toBe(false)
    expect(isWebUrl('ms-settings:')).toBe(false)
  })
})
