import { describe, expect, it, vi } from 'vitest'

// remoteHttp loggt über log.ts -> zieht `electron` (app.getPath) herein.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', isPackaged: false }
}))

const { parseTimerCommand, handleTimerRemote } = await import('./timerRemoteServer')
import type { IncomingMessage, ServerResponse } from 'node:http'
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

// Minimaler Request/Response-Ersatz: hält Status, Kopf und Inhalt fest
function call(url: string): { status: number; type: string; body: string } {
  const out = { status: 0, type: '', body: '' }
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      out.status = status
      out.type = headers?.['Content-Type'] ?? ''
      return res
    },
    setHeader(name: string, value: string) {
      if (name.toLowerCase() === 'content-type') out.type = value
    },
    end(body?: string) {
      out.body = body ?? ''
      if (!out.status) out.status = 200
    }
  }
  handleTimerRemote(
    { url, method: 'GET', headers: {} } as unknown as IncomingMessage,
    res as unknown as ServerResponse
  )
  return out
}

describe('Timer-Fernsteuerung – Bühnen-Anzeige im Browser', () => {
  it('liefert die Anzeigeseite mit relativen API-Pfaden (läuft auch unter /timer/)', () => {
    const r = call('/anzeige')
    expect(r.status).toBe(200)
    expect(r.type).toContain('text/html')
    expect(r.body).toContain("EventSource('api/events')")
    expect(r.body).toContain("'api/time'")
    expect(r.body).not.toMatch(/['"]\/api\//) // nie absolut
    // reine Anzeige: schickt keine Befehle
    expect(r.body).not.toContain('api/command')
  })

  it('nennt die Uhrzeit des Rechners', () => {
    const before = Date.now()
    const r = call('/api/time')
    const now = (JSON.parse(r.body) as { now: number }).now
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(Date.now())
  })
})
