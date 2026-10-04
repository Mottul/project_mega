import { describe, expect, it } from 'vitest'
import { parsePlayerRemoteCommand } from './remoteCommand'

const parse = (v: unknown): ReturnType<typeof parsePlayerRemoteCommand> =>
  parsePlayerRemoteCommand(JSON.stringify(v))
const ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'

describe('Player-Fernsteuerung – Befehlsprüfung', () => {
  it('lässt die Befehle der Steuerseite durch, nur mit erwarteten Feldern', () => {
    for (const type of ['play', 'pause', 'toggle', 'next', 'prev']) {
      expect(parse({ type, extra: 1 })).toEqual({ type })
    }
    expect(parse({ type: 'goto', index: 3 })).toEqual({ type: 'goto', index: 3 })
    expect(parse({ type: 'remove', index: 0 })).toEqual({ type: 'remove', index: 0 })
    expect(parse({ type: 'move', from: 2, to: 0 })).toEqual({ type: 'move', from: 2, to: 0 })
    expect(parse({ type: 'add', mediaIds: [ID] })).toEqual({ type: 'add', mediaIds: [ID] })
    expect(parse({ type: 'add', mediaIds: [ID], at: 1 })).toEqual({
      type: 'add',
      mediaIds: [ID],
      at: 1
    })
    expect(parse({ type: 'replace', mediaIds: [] })).toEqual({ type: 'replace', mediaIds: [] })
    expect(parse({ type: 'setLoop', loop: 'all' })).toEqual({ type: 'setLoop', loop: 'all' })
    expect(parse({ type: 'setShuffle', shuffle: true })).toEqual({
      type: 'setShuffle',
      shuffle: true
    })
    expect(parse({ type: 'setMuted', muted: false })).toEqual({ type: 'setMuted', muted: false })
    expect(parse({ type: 'setDefaultFit', fit: 'bars' })).toEqual({
      type: 'setDefaultFit',
      fit: 'bars'
    })
    expect(parse({ type: 'setTransition', transition: 'cut' })).toEqual({
      type: 'setTransition',
      transition: 'cut'
    })
  })

  it('begrenzt Zahlenwerte auf sinnvolle Bereiche', () => {
    expect(parse({ type: 'seek', positionSec: -5 })).toEqual({ type: 'seek', positionSec: 0 })
    expect(parse({ type: 'seek', positionSec: 1e12 })).toEqual({
      type: 'seek',
      positionSec: 86_400
    })
    expect(parse({ type: 'setVolume', volume: 7 })).toEqual({ type: 'setVolume', volume: 1 })
    expect(parse({ type: 'setImageDuration', seconds: 0.2 })).toEqual({
      type: 'setImageDuration',
      seconds: 1
    })
    expect(parse({ type: 'setTransition', transition: 'crossfade', transitionMs: 99999 })).toEqual({
      type: 'setTransition',
      transition: 'crossfade',
      transitionMs: 5000
    })
  })

  it('verwirft falsche Typen und unbekannte Werte', () => {
    expect(parse({ type: 'goto', index: -1 })).toBeNull()
    expect(parse({ type: 'goto', index: 1.5 })).toBeNull()
    expect(parse({ type: 'goto', index: '2' })).toBeNull()
    expect(parse({ type: 'seek', positionSec: 'NaN' })).toBeNull()
    expect(parse({ type: 'move', from: 1 })).toBeNull()
    expect(parse({ type: 'add', mediaIds: 'abc' })).toBeNull()
    expect(parse({ type: 'add', mediaIds: ['../../etc/passwd'] })).toBeNull()
    expect(parse({ type: 'add', mediaIds: Array(1001).fill(ID) })).toBeNull()
    expect(parse({ type: 'setLoop', loop: 'forever' })).toBeNull()
    expect(parse({ type: 'setDefaultFit', fit: 'zoom' })).toBeNull()
    expect(parse({ type: 'setShuffle', shuffle: 'yes' })).toBeNull()
    expect(parse({ type: 'setTransition', transition: 'wipe' })).toBeNull()
  })

  it('behält Desktop-Befehle dem Rechner vor', () => {
    expect(parse({ type: 'setIdleMedia', url: 'file:///etc/hosts', kind: 'image' })).toBeNull()
    expect(parse({ type: 'setIdlePattern', pattern: 'off' })).toBeNull()
    expect(parse({ type: 'ended' })).toBeNull()
    expect(parse({ type: 'clear' })).toBeNull()
    expect(parsePlayerRemoteCommand('kein json')).toBeNull()
    expect(parse(null)).toBeNull()
    expect(parse([{ type: 'play' }])).toBeNull()
  })
})
