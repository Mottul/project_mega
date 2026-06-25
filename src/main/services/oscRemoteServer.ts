// Eingebetteter Fernsteuer-Server für die OSC-Steuerung (Handy/Tablet). Nutzt das
// gemeinsame Snapshot-Push-Muster (siehe remoteHttp): die Oberfläche lebt im
// RENDERER – der OSC-Tab veröffentlicht einen Schnappschuss (publishOscSnapshot),
// hereinkommende Steuerbefehle werden über den Command-Sink an den Renderer
// gereicht (der wendet sie an und sendet OSC).

import type { OscRemoteCommand, OscRemoteSnapshot } from '@shared/types'
import { createSnapshotServer } from './remoteHttp'
import { OSC_MOBILE_PAGE } from './oscRemotePage'

const EMPTY: OscRemoteSnapshot = {
  connected: false,
  setName: '',
  columns: 24,
  widgets: [],
  sets: [],
  currentSetId: ''
}

/** Plausibilitätsprüfung eingehender Steuerbefehle (fremde Eingaben). */
function parseCommand(body: string): OscRemoteCommand | null {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string') return null
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  switch (c.kind) {
    case 'fader':
      return { kind: 'fader', id: c.id, value: num(c.value) }
    case 'toggle':
      return { kind: 'toggle', id: c.id, on: !!c.on }
    case 'button':
      return { kind: 'button', id: c.id, down: !!c.down }
    case 'xy':
      return { kind: 'xy', id: c.id, x: num(c.x), y: num(c.y) }
    case 'color':
      return {
        kind: 'color',
        id: c.id,
        r: num(c.r),
        g: num(c.g),
        b: num(c.b),
        a: typeof c.a === 'number' ? num(c.a) : 1
      }
    case 'selectSet':
      return { kind: 'selectSet', id: c.id }
    case 'select':
      return { kind: 'select', id: c.id, index: Math.max(0, Math.round(num(c.index))) }
    case 'bank':
      return { kind: 'bank', id: c.id, index: Math.max(0, Math.round(num(c.index))), value: num(c.value) }
    case 'knob':
      return { kind: 'knob', id: c.id, value: num(c.value) }
    case 'knobStep':
      return { kind: 'knobStep', id: c.id, delta: num(c.delta) }
    default:
      return null
  }
}

const srv = createSnapshotServer<OscRemoteSnapshot, OscRemoteCommand>({
  logTag: 'osc-remote',
  page: OSC_MOBILE_PAGE,
  empty: EMPTY,
  defaultPort: 8091,
  parseCommand
})

export const setOscCommandSink = srv.setCommandSink
export const getOscRemoteStatus = srv.getStatus
export const publishOscSnapshot = srv.publish
export const startOscRemote = srv.start
export const stopOscRemote = srv.stop
