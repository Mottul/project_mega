import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PATTERN_TONE } from '@shared/testton'

// der Store hängt sich an localStorage (debouncedStorage) – im Test ein schlichter Ersatz
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
})
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} })

const { normalizeGenerator, useToneGen } = await import('./store')

describe('gemerkter Stand des Testtongenerators', () => {
  it('Unsinn wird zu sicheren Werten – der Pegel-Deckel hält', () => {
    expect(normalizeGenerator({ levelDb: 0 }).levelDb).toBe(-6)
    expect(normalizeGenerator({ signal: 'laser', channels: 'mitte' })).toEqual(DEFAULT_PATTERN_TONE)
    expect(normalizeGenerator(null)).toEqual(DEFAULT_PATTERN_TONE)
    expect(normalizeGenerator('kaputt')).toEqual(DEFAULT_PATTERN_TONE)
  })

  it('AV-Sync gibt es hier nicht (braucht das Testbild) – dann Sinus', () => {
    expect(normalizeGenerator({ signal: 'avsync' }).signal).toBe('sine')
  })

  it('Änderungen werden begrenzt übernommen', () => {
    useToneGen.getState().set({ bpm: 500, channels: 'antiphase', signal: 'avsync' })
    const t = useToneGen.getState().tone
    expect(t.bpm).toBe(300)
    expect(t.channels).toBe('antiphase')
    expect(t.signal).toBe('sine')
  })
})
