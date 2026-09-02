import { describe, expect, it } from 'vitest'
import { displayLap, isFinished, lapDelta } from '../src/game/progress'

describe('Rundenzählung', () => {
  const count = 100

  it('zählt eine Zieldurchfahrt vorwärts', () => {
    expect(lapDelta(96, 3, count)).toBe(1)
  })

  it('zieht eine Runde ab, wenn man rückwärts über die Linie fährt', () => {
    expect(lapDelta(3, 96, count)).toBe(-1)
  })

  it('ignoriert normale Fahrt ohne Zieldurchfahrt', () => {
    expect(lapDelta(40, 44, count)).toBe(0)
    expect(lapDelta(96, 97, count)).toBe(0)
    expect(lapDelta(3, 2, count)).toBe(0)
  })

  it('zeigt auf dem Startfeld bereits Runde 1', () => {
    expect(displayLap(0, 3)).toBe(1)
    expect(displayLap(1, 3)).toBe(1)
    expect(displayLap(2, 3)).toBe(2)
    expect(displayLap(3, 3)).toBe(3)
  })

  it('deckelt die Anzeige bei der letzten Runde', () => {
    expect(displayLap(4, 3)).toBe(3)
  })

  it('beendet das Rennen nach einer Durchfahrt mehr als Runden', () => {
    expect(isFinished(3, 3)).toBe(false)
    expect(isFinished(4, 3)).toBe(true)
  })
})
