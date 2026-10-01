import { describe, expect, it } from 'vitest'
import { JINGLE_MOBILE_PAGE } from './jingleRemotePage'
import { OSC_MOBILE_PAGE } from './oscRemotePage'
import { MOBILE_PAGE } from './player/remotePage'
import { REMOTE_APP_PAGE } from './remoteAppPage'
import { pwaManifest } from './remotePwa'

const PAGES = {
  jingle: JINGLE_MOBILE_PAGE,
  osc: OSC_MOBILE_PAGE,
  player: MOBILE_PAGE,
  app: REMOTE_APP_PAGE
}

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
}

describe('Steuerseiten als Web-App', () => {
  for (const [name, html] of Object.entries(PAGES)) {
    describe(name, () => {
      it('bindet Manifest, Home-Bildschirm-Icon und Vollbild-Start ein', () => {
        expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">')
        expect(html).toContain('<link rel="apple-touch-icon" href="/icon-180.png">')
        expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">')
        expect(html).toContain('data-fs=')
      })

      it('spricht die API relativ an (läuft so auch unter /<id>/)', () => {
        expect(html).not.toMatch(/['"]\/api\//)
        expect(html).not.toMatch(/['"]\/media\//)
      })

      it('enthält nur syntaktisch gültige Skripte', () => {
        // Template-Literale verschlucken Backslashes still – hier fiele das auf.
        const scripts = inlineScripts(html)
        expect(scripts.length).toBeGreaterThanOrEqual(2)
        for (const js of scripts) expect(() => new Function(js)).not.toThrow()
      })
    })
  }

  it('Steuerseiten bieten den Weg zurück zur Startseite', () => {
    for (const html of [JINGLE_MOBILE_PAGE, OSC_MOBILE_PAGE, MOBILE_PAGE]) {
      expect(html).toMatch(/<a href="\.\.\/" [^>]*data-home/)
    }
  })

  it('Manifest startet die gemeinsame Startseite im Vollbild', () => {
    const m = JSON.parse(pwaManifest()) as Record<string, unknown>
    expect(m).toMatchObject({ start_url: '/', scope: '/', display: 'fullscreen' })
    expect(m.icons).toEqual([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512' })
    ])
  })
})
