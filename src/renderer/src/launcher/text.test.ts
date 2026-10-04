import { describe, expect, it } from 'vitest'
import { softHyphenate } from './text'

describe('weiche Trennstellen', () => {
  it('lange Komposita an Wortgrenzen, kurze/zusammengesetzte Namen unverändert', () => {
    expect(softHyphenate('Testbildgenerator')).toBe('Testbild­generator')
    expect(softHyphenate('Projektionsverhältnis')).toBe('Projektions­verhältnis')
    expect(softHyphenate('Kameraobjektiv')).toBe('Kamera­objektiv')
    expect(softHyphenate('Video-Player')).toBe('Video-Player')
    expect(softHyphenate('Stage-Timer & Uhr')).toBe('Stage-Timer & Uhr')
  })
})
