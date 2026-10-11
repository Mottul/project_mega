import { describe, expect, it } from 'vitest'
import { CACHE_PREFIX, serviceWorkerSource } from './serviceWorker'

describe('Service Worker der Rechner-PWA', () => {
  const src = serviceWorkerSource(['index.html', 'assets/index-abc.js', 'icons/icon-192.png'], 'v1')

  it('lädt alle Dateien relativ zum eigenen Ordner vor (läuft auch unter /<repo>/)', () => {
    expect(src).toContain(
      JSON.stringify(['./', './index.html', './assets/index-abc.js', './icons/icon-192.png'])
    )
  })

  it('trägt die Version im Cache-Namen (neue Version = neuer Cache)', () => {
    expect(src).toContain(JSON.stringify(`${CACHE_PREFIX}v1`))
  })

  it('ist gültiges JavaScript', () => {
    expect(() => new Function(src)).not.toThrow()
  })
})
