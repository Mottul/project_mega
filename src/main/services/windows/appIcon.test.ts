import { describe, expect, it, vi } from 'vitest'

// appIcon nutzt Electron (Pfad/nativeImage) nur in den übrigen Funktionen.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false },
  nativeImage: {}
}))

const { fillTransparent } = await import('./appIcon')

/** 4×4-Bitmap: Hintergrund (10,20,30) deckend, Ecke oben links transparent. */
function bitmap(): Buffer {
  const b = Buffer.alloc(4 * 4 * 4)
  for (let i = 0; i < b.length; i += 4) b.set([10, 20, 30, 255], i)
  b.set([0, 0, 0, 0], 0) // voll transparent
  b.set([100, 50, 0, 128], 4) // halbtransparent, vormultipliziert
  return b
}

describe('fillTransparent', () => {
  it('füllt Transparenz mit der Icon-Hintergrundfarbe und macht alles deckend', () => {
    const out = fillTransparent(bitmap(), 4, 4)
    expect([...out.subarray(0, 4)]).toEqual([10, 20, 30, 255])
    // vormultipliziert: Farbe + (1 - Alpha) · Hintergrund
    expect([...out.subarray(4, 8)]).toEqual([105, 60, 15, 255])
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255)
  })

  it('lässt deckende Pixel unverändert', () => {
    const out = fillTransparent(bitmap(), 4, 4)
    expect([...out.subarray(8, 12)]).toEqual([10, 20, 30, 255])
  })
})
