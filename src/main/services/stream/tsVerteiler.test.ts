import { describe, expect, it, vi } from 'vitest'
import { MAX_RUECKSTAU, TsVerteiler, type TsEmpfaenger } from './tsVerteiler'

class Fake implements TsEmpfaenger {
  chunks: Buffer[] = []
  writableLength = 0
  destroyed = false
  private onClose: (() => void) | null = null
  write(chunk: Buffer): boolean {
    this.chunks.push(chunk)
    return true
  }
  destroy(): void {
    this.destroyed = true
    this.onClose?.()
  }
  once(_event: 'close', cb: () => void): void {
    this.onClose = cb
  }
  /** Empfänger trennt selbst (VLC geschlossen) */
  hangUp(): void {
    this.onClose?.()
  }
}

describe('TsVerteiler', () => {
  it('schickt jeden Block an alle Empfänger und zählt die Bytes', () => {
    const v = new TsVerteiler()
    const a = new Fake()
    const b = new Fake()
    v.add(a)
    v.add(b)
    v.push(Buffer.from('ts'))
    expect(a.chunks).toHaveLength(1)
    expect(b.chunks).toHaveLength(1)
    expect(v.bytes).toBe(2)
  })

  it('meldet die Anzahl – auch wenn ein Empfänger von sich aus geht', () => {
    const onCount = vi.fn()
    const v = new TsVerteiler(onCount)
    const a = new Fake()
    v.add(a)
    a.hangUp()
    a.hangUp() // doppeltes close zählt nicht doppelt
    expect(onCount.mock.calls.map((c) => c[0])).toEqual([1, 0])
    expect(v.count).toBe(0)
  })

  it('trennt einen Empfänger mit zu viel Rückstau, die anderen bekommen weiter Bild', () => {
    const onCount = vi.fn()
    const v = new TsVerteiler(onCount)
    const lahm = new Fake()
    const flott = new Fake()
    v.add(lahm)
    v.add(flott)
    lahm.writableLength = MAX_RUECKSTAU + 1
    v.push(Buffer.from('x'))
    expect(lahm.destroyed).toBe(true)
    expect(lahm.chunks).toHaveLength(0)
    expect(flott.chunks).toHaveLength(1)
    expect(v.count).toBe(1)
    expect(onCount).toHaveBeenLastCalledWith(1)
  })

  it('closeAll trennt alle und meldet 0', () => {
    const onCount = vi.fn()
    const v = new TsVerteiler(onCount)
    const a = new Fake()
    v.add(a)
    v.closeAll()
    expect(a.destroyed).toBe(true)
    expect(v.count).toBe(0)
    expect(onCount).toHaveBeenLastCalledWith(0)
  })
})
