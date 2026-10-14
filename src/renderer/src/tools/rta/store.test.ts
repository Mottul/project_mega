import { describe, expect, it, vi } from 'vitest'

// der Store hängt sich an localStorage (debouncedStorage) – im Test ein schlichter Ersatz
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
})
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })

const { migrateRta } = await import('./store')

describe('gemerkter Stand des RTA', () => {
  it('Version 1: Spektrogramm an -> Wasserfall, aus -> aus; alles andere bleibt', () => {
    expect(migrateRta({ spectrogram: true, weighting: 'A' }, 1)).toEqual({
      spectrogram: 'waterfall',
      weighting: 'A'
    })
    expect(migrateRta({ spectrogram: false }, 1)).toEqual({ spectrogram: 'off' })
  })

  it('Version 2 bleibt, wie sie ist', () => {
    expect(migrateRta({ spectrogram: 'timeline' }, 2)).toEqual({ spectrogram: 'timeline' })
  })
})
