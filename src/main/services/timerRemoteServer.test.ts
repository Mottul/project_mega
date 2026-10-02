import { describe, expect, it, vi } from 'vitest'

// remoteHttp loggt über log.ts -> zieht `electron` (app.getPath) herein.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

const { parseTimerCommand } = await import('./timerRemoteServer')
const parse = (v: unknown): ReturnType<typeof parseTimerCommand> =>
  parseTimerCommand(JSON.stringify(v))

describe('Timer-Fernsteuerung – Befehlsprüfung', () => {
  it('lässt Bedienbefehle durch', () => {
    for (const type of ['start', 'pause', 'toggle', 'reset', 'resetAll', 'next', 'prev']) {
      expect(parse({ type, extra: 1 })).toEqual({ type })
    }
    expect(parse({ type: 'goto', index: 2 })).toEqual({ type: 'goto', index: 2 })
    expect(parse({ type: 'setDisplayMode', mode: 'clock' })).toEqual({
      type: 'setDisplayMode',
      mode: 'clock'
    })
    expect(parse({ type: 'clearMessage' })).toEqual({ type: 'clearMessage' })
  })

  it('begrenzt Korrekturen und Nachrichten', () => {
    expect(parse({ type: 'adjust', deltaSec: 60.4 })).toEqual({ type: 'adjust', deltaSec: 60 })
    expect(parse({ type: 'adjust', deltaSec: 1e9 })).toEqual({ type: 'adjust', deltaSec: 3600 })
    expect(parse({ type: 'message', text: '  Hallo  ', flash: 'ja' })).toEqual({
      type: 'message',
      text: 'Hallo',
      flash: false
    })
    const long = parse({ type: 'message', text: 'x'.repeat(500), flash: true })
    expect(long).toEqual({ type: 'message', text: 'x'.repeat(200), flash: true })
  })

  it('verwirft ungültige oder am Handy nicht erlaubte Befehle', () => {
    expect(parseTimerCommand('kein json')).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse({ type: 'goto', index: -1 })).toBeNull()
    expect(parse({ type: 'goto', index: 1.5 })).toBeNull()
    expect(parse({ type: 'adjust', deltaSec: 'viel' })).toBeNull()
    expect(parse({ type: 'message', text: '   ' })).toBeNull()
    expect(parse({ type: 'setDisplayMode', mode: 'disco' })).toBeNull()
    // Abschnitte/Schwellen werden nur am Rechner bearbeitet
    expect(parse({ type: 'setSegments', segments: [] })).toBeNull()
    expect(parse({ type: 'setThresholds', warnSec: 1, alertSec: 1 })).toBeNull()
  })
})
