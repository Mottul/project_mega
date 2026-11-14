import { describe, expect, it } from 'vitest'
import { balancedRows } from './segmented'

describe('balancedRows', () => {
  it('füllt die Reihen gleichmäßig, die längeren oben', () => {
    // Testtongenerator: sieben Signale, vier passen -> 4 + 3
    expect(balancedRows(7, 4)).toEqual([4, 3])
    // fünf Kanäle, vier passen -> 3 + 2 statt 4 + 1
    expect(balancedRows(5, 4)).toEqual([3, 2])
    expect(balancedRows(5, 3)).toEqual([3, 2])
    // sieben, drei passen -> 3 + 2 + 2 statt 3 + 3 + 1
    expect(balancedRows(7, 3)).toEqual([3, 2, 2])
  })

  it('alles in einer Reihe, wenn es passt', () => {
    expect(balancedRows(5, 5)).toEqual([5])
    expect(balancedRows(3, 8)).toEqual([3])
  })

  it('hält Grenzfälle aus', () => {
    expect(balancedRows(0, 4)).toEqual([])
    expect(balancedRows(3, 0)).toEqual([1, 1, 1])
    expect(balancedRows(4, 1.5)).toEqual([1, 1, 1, 1])
  })
})
