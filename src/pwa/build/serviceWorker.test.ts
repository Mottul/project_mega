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

/**
 * Den erzeugten Worker in einer nachgebauten Umgebung ausführen: Cache mit der Fassung „alt“,
 * Netz liefert „neu“ (oder ist weg). Ergebnis: welche Fassung die Antwort trägt.
 */
async function answer(path: string, online: boolean): Promise<string> {
  const BASE = 'https://mottul.github.io/project_mega'
  const handlers: Record<string, (e: unknown) => void> = {}
  const self = {
    location: { origin: 'https://mottul.github.io' },
    addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn)
  }
  const caches = {
    open: async () => ({ match: async () => 'alt' }),
    keys: async () => []
  }
  const fetchFn = async (): Promise<string> => {
    if (!online) throw new TypeError('offline')
    return 'neu'
  }
  const ResponseStub = { error: () => 'fehler' }
  new Function('self', 'caches', 'fetch', 'Response', serviceWorkerSource([], 'v1'))(
    self,
    caches,
    fetchFn,
    ResponseStub
  )
  let reply: Promise<string> = Promise.resolve('keine Antwort')
  handlers.fetch({
    request: { url: `${BASE}${path}`, method: 'GET', mode: 'no-cors' },
    respondWith: (p: Promise<string>) => (reply = p)
  })
  return reply
}

describe('Service Worker: Manifest und Symbole', () => {
  it('holt Manifest und Symbole zuerst aus dem Netz – so sieht Android ein neues Symbol', async () => {
    expect(await answer('/manifest.webmanifest', true)).toBe('neu')
    expect(await answer('/icons/icon-512.png', true)).toBe('neu')
  })

  it('nimmt sie offline aus dem Cache', async () => {
    expect(await answer('/manifest.webmanifest', false)).toBe('alt')
    expect(await answer('/icons/maskable-512.png', false)).toBe('alt')
  })

  it('antwortet für alles mit Hash im Namen weiter zuerst aus dem Cache', async () => {
    expect(await answer('/assets/index-abc.js', true)).toBe('alt')
  })
})
