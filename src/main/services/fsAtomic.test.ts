import { fsyncSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./log', () => ({ logLine: vi.fn() }))
vi.mock('node:fs', async (importOriginal) => {
  const m = await importOriginal<typeof import('node:fs')>()
  return { ...m, fsyncSync: vi.fn(m.fsyncSync) }
})
vi.mock('node:fs/promises', async (importOriginal) => {
  const m = await importOriginal<typeof import('node:fs/promises')>()
  return { ...m, rename: vi.fn(m.rename), writeFile: vi.fn(m.writeFile) }
})

const { writeFileAtomic, writeFileAtomicAsync } = await import('./fsAtomic')

const fail = (code: string): Error => Object.assign(new Error(`${code}: simuliert`), { code })
let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fsatomic-'))
})
afterEach(() => {
  vi.clearAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('atomar schreiben', () => {
  it('scheitert das Schreiben, bleibt die alte Datei und keine Nachbardatei liegen', () => {
    const file = join(dir, 'settings.json')
    writeFileSync(file, '{"a":1}')
    vi.mocked(fsyncSync).mockImplementationOnce(() => {
      throw fail('EIO')
    })
    expect(() => writeFileAtomic(file, '{"a":2}')).toThrow('EIO')
    expect(readFileSync(file, 'utf8')).toBe('{"a":1}')
    expect(readdirSync(dir)).toEqual(['settings.json'])
  })

  it('kurz gesperrt (Virenscanner): Umbenennen wird wiederholt statt direkt zu schreiben', async () => {
    const file = join(dir, 'Messe.mottul')
    writeFileSync(file, 'alt')
    vi.mocked(rename).mockRejectedValueOnce(fail('EPERM')).mockRejectedValueOnce(fail('EBUSY'))
    await writeFileAtomicAsync(file, Buffer.from('neu'))
    expect(readFileSync(file, 'utf8')).toBe('neu')
    expect(vi.mocked(writeFile)).not.toHaveBeenCalled()
    expect(readdirSync(dir)).toEqual(['Messe.mottul'])
  })

  it('bleibt die Sperre, greift der Notweg und räumt die Nachbardatei weg', async () => {
    const file = join(dir, 'Messe.mottul')
    writeFileSync(file, 'alt')
    vi.mocked(rename).mockRejectedValue(fail('EPERM'))
    await writeFileAtomicAsync(file, Buffer.from('neu'))
    vi.mocked(rename).mockReset()
    expect(readFileSync(file, 'utf8')).toBe('neu')
    expect(readdirSync(dir)).toEqual(['Messe.mottul'])
  })
})
