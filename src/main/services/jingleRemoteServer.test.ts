import { describe, expect, it, vi } from 'vitest'

// remoteHttp loggt über log.ts -> zieht `electron` (app.getPath) herein.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

const { parseJingleCommand } = await import('./jingleRemoteServer')
const parse = (v: unknown): ReturnType<typeof parseJingleCommand> =>
  parseJingleCommand(JSON.stringify(v))

describe('Jingle-Fernsteuerung – Befehlsprüfung', () => {
  it('lässt Trigger und Stopp-Alle durch, nur mit den erwarteten Feldern', () => {
    const padId = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
    expect(parse({ type: 'trigger', padId, extra: '<script>' })).toEqual({
      type: 'trigger',
      padId
    })
    expect(parse({ type: 'stopAll', padId })).toEqual({ type: 'stopAll' })
  })

  it('verwirft ungültige Pad-Kennungen', () => {
    expect(parse({ type: 'trigger' })).toBeNull()
    expect(parse({ type: 'trigger', padId: 42 })).toBeNull()
    expect(parse({ type: 'trigger', padId: '' })).toBeNull()
    expect(parse({ type: 'trigger', padId: 'x'.repeat(65) })).toBeNull()
    expect(parse({ type: 'trigger', padId: '../../etc' })).toBeNull()
    expect(parse({ type: 'trigger', padId: { toString: 'a' } })).toBeNull()
  })

  it('verwirft unbekannte Befehle und kaputtes JSON', () => {
    expect(parseJingleCommand('kein json')).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse([])).toBeNull()
    expect(parse('trigger')).toBeNull()
    expect(parse({ type: 'deleteAll' })).toBeNull()
  })
})
