import { describe, expect, it } from 'vitest'
import { KeyedLock } from './keyedLock'

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

describe('Sperre je Schlüssel', () => {
  it('gleicher Schlüssel nacheinander, andere Schlüssel parallel', async () => {
    const lock = new KeyedLock()
    const log: string[] = []
    const work = async (key: string, name: string): Promise<void> => {
      const release = await lock.acquire(key)
      log.push(`${name} an`)
      await tick()
      log.push(`${name} aus`)
      release()
    }
    await Promise.all([work('a', 'A1'), work('a', 'A2'), work('b', 'B')])
    // A2 startet erst nach A1; B läuft parallel zu A1
    expect(log.indexOf('A2 an')).toBeGreaterThan(log.indexOf('A1 aus'))
    expect(log.indexOf('B an')).toBeLessThan(log.indexOf('A1 aus'))
    expect(lock.isHeld('a')).toBe(false)
  })

  it('drei Wartende auf denselben Schlüssel: nie zwei gleichzeitig', async () => {
    const lock = new KeyedLock()
    let inside = 0
    let max = 0
    await Promise.all(
      [1, 2, 3].map(async () => {
        const release = await lock.acquire('x')
        inside++
        max = Math.max(max, inside)
        await tick()
        inside--
        release()
      })
    )
    expect(max).toBe(1)
  })
})
