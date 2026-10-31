import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AtemCommand, AtemStatus, AtemView } from '@shared/atem'
import type { AtemRoh, AtemRohMe } from '@shared/atemView'
import type { AtemMeldungen, AtemVerbindung } from './atemVerbindung'

/** Nachbau der echten Verbindung: Der Test entscheidet, wann der Mischer etwas meldet */
class Geraet implements AtemVerbindung {
  befehle: AtemCommand[] = []
  gestoppt = false
  stopZeit = 0
  startZeit = 0
  /** Befehle hängen, bis der Mischer sie bestätigt */
  bestaetigungen: (() => void)[] = []
  haltend = false
  startFehler: Error | null = null

  constructor(public m: AtemMeldungen) {}

  async start(): Promise<void> {
    if (this.startFehler) throw this.startFehler
    this.startZeit = ++uhr
  }

  async stopp(): Promise<void> {
    await Promise.resolve()
    this.gestoppt = true
    this.stopZeit = ++uhr
  }

  befehl(cmd: AtemCommand): Promise<void> {
    this.befehle.push(cmd)
    if (!this.haltend) return Promise.resolve()
    return new Promise((resolve) => this.bestaetigungen.push(resolve))
  }

  protokollBekannt = (version: number): boolean => version === 131104
}

let uhr = 0
const geraete: Geraet[] = []
let naechsterFehler: Error | null = null

vi.mock('electron', () => ({ app: { getPath: () => '' } }))
vi.mock('../log', () => ({ logLine: () => {} }))
vi.mock('./atemVerbindung', () => ({
  echteVerbindung: (_host: string, m: AtemMeldungen) => {
    const g = new Geraet(m)
    g.startFehler = naechsterFehler
    geraete.push(g)
    return g
  }
}))

const { atemBefehl, atemTrennen, atemVerbinden, getAtemStatus, getAtemView, setAtemSinks } =
  await import('./atemService')

function me(p: Partial<AtemRohMe> = {}): AtemRohMe {
  return {
    programInput: 1,
    previewInput: 2,
    transitionPosition: { inTransition: false, remainingFrames: 0, handlePosition: 0 },
    transitionProperties: { nextStyle: 0 },
    transitionSettings: { mix: { rate: 25 } },
    ...p
  }
}

function roh(p: Partial<AtemRoh> = {}): AtemRoh {
  return {
    info: {
      apiVersion: 131104,
      productIdentifier: 'ATEM Mini',
      capabilities: { DVEs: 1, stingers: 0 }
    },
    video: { mixEffects: [me()] },
    inputs: {
      1: { inputId: 1, longName: 'K1', shortName: 'K1', internalPortType: 0, meAvailability: 1 },
      2: { inputId: 2, longName: 'K2', shortName: 'K2', internalPortType: 0, meAvailability: 1 }
    },
    settings: { videoMode: 12 },
    ...p
  }
}

let stati: AtemStatus[] = []
let ansichten: AtemView[] = []

/** Verbinden und den Mischer antworten lassen */
async function verbunden(r = roh()): Promise<Geraet> {
  await atemVerbinden({ host: '10.0.0.1' })
  const g = geraete[geraete.length - 1]
  g.m.zustand(r)
  g.m.verbunden()
  return g
}

beforeEach(() => {
  vi.useFakeTimers()
  stati = []
  ansichten = []
  geraete.length = 0
  naechsterFehler = null
  setAtemSinks({ status: (s) => stati.push(s), view: (v) => ansichten.push(v) })
})

afterEach(async () => {
  await atemTrennen()
  vi.useRealTimers()
})

describe('Verbinden', () => {
  it('geht von „verbindet“ zu „verbunden“ und nennt Modell und Protokoll', async () => {
    await verbunden()
    expect(stati.map((s) => s.phase)).toEqual(['verbindet', 'verbunden', 'verbunden'])
    expect(getAtemStatus()).toMatchObject({
      phase: 'verbunden',
      host: '10.0.0.1',
      modell: 'ATEM Mini',
      protokoll: '2.32',
      protokollBekannt: true
    })
    expect(getAtemView()?.mes[0].programm).toBe(1)
  })

  it('warnt bei einer unbekannten Protokollversion', async () => {
    const r = roh()
    r.info.apiVersion = 131200
    await verbunden(r)
    expect(getAtemStatus()).toMatchObject({ protokoll: '2.128', protokollBekannt: false })
  })

  it('lehnt eine ungültige Adresse ab, ohne die Verbindung anzufassen', async () => {
    const s = await atemVerbinden({ host: 'http://x' })
    expect(s.fehler).toBe('Ungültige Adresse')
    expect(geraete).toHaveLength(0)
  })

  it('startet eine neue Verbindung erst, wenn die alte weg ist, auch bei schnellem Wechsel', async () => {
    await Promise.all([
      atemVerbinden({ host: '10.0.0.1' }),
      atemVerbinden({ host: '10.0.0.2' }),
      atemVerbinden({ host: '10.0.0.3' })
    ])
    expect(geraete).toHaveLength(3)
    expect(geraete[0].stopZeit).toBeLessThan(geraete[1].startZeit)
    expect(geraete[1].stopZeit).toBeLessThan(geraete[2].startZeit)
    expect(geraete[2].gestoppt).toBe(false)
    expect(getAtemStatus().host).toBe('10.0.0.3')
  })

  it('überhört Meldungen einer ersetzten Verbindung', async () => {
    const alt = await verbunden()
    await verbunden()
    const vorher = ansichten.length
    alt.m.zustand(roh())
    alt.m.verloren()
    await vi.advanceTimersByTimeAsync(100)
    expect(ansichten).toHaveLength(vorher)
    expect(getAtemStatus().phase).toBe('verbunden')
  })

  it('sagt nach 5 s ohne Antwort Bescheid und bleibt dran', async () => {
    await atemVerbinden({ host: '10.0.0.1' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(getAtemStatus()).toMatchObject({ phase: 'verbindet' })
    expect(getAtemStatus().fehler).toContain('10.0.0.1')
    geraete[0].m.zustand(roh())
    geraete[0].m.verbunden()
    expect(getAtemStatus()).toMatchObject({ phase: 'verbunden', fehler: null })
  })

  it('meldet einen gescheiterten Start, die App läuft weiter', async () => {
    naechsterFehler = new Error('Modul fehlt')
    const s = await atemVerbinden({ host: '10.0.0.1' })
    expect(s).toMatchObject({ phase: 'getrennt', host: '10.0.0.1' })
    expect(s.fehler).toBeTruthy()
    expect(geraete[0].gestoppt).toBe(true)
  })

  it('kennt den Probebetrieb', async () => {
    const s = await atemVerbinden({ simulator: 'mini' })
    expect(s).toMatchObject({ phase: 'verbindet', simulator: 'mini', host: '' })
    expect(geraete).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(getAtemStatus()).toMatchObject({ phase: 'verbunden', modell: 'ATEM Mini' })
  })
})

describe('Verlust', () => {
  it('sperrt Befehle und behält den letzten Stand, bis der Mischer wieder da ist', async () => {
    const g = await verbunden()
    g.m.verloren()
    expect(getAtemStatus().phase).toBe('verloren')
    expect(getAtemView()).not.toBeNull()
    await atemBefehl({ type: 'cut', me: 0 })
    expect(g.befehle).toEqual([])
    g.m.zustand(roh())
    g.m.verbunden()
    expect(getAtemStatus().phase).toBe('verbunden')
    await atemBefehl({ type: 'cut', me: 0 })
    expect(g.befehle).toEqual([{ type: 'cut', me: 0 }])
  })

  it('zählt das Trennen beim ersten Aufbau nicht als Verlust', async () => {
    await atemVerbinden({ host: '10.0.0.1' })
    geraete[0].m.verloren()
    expect(getAtemStatus().phase).toBe('verbindet')
  })
})

describe('Befehle', () => {
  it('schickt nur Geprüftes zum Mischer', async () => {
    const g = await verbunden()
    await atemBefehl({ type: 'programm', me: 0, quelle: 2 })
    await atemBefehl({ type: 'programm', me: 0, quelle: 99 })
    await atemBefehl({ type: 'macroRun', me: 0 })
    await atemBefehl('cut')
    expect(g.befehle).toEqual([{ type: 'programm', me: 0, quelle: 2 }])
  })

  it('ändert die Ansicht nicht selbst: Sie folgt nur der Meldung des Mischers', async () => {
    const g = await verbunden()
    await atemBefehl({ type: 'programm', me: 0, quelle: 2 })
    await vi.advanceTimersByTimeAsync(100)
    expect(getAtemView()?.mes[0].programm).toBe(1)
    g.m.zustand(roh({ video: { mixEffects: [me({ programInput: 2 })] } }))
    await vi.advanceTimersByTimeAsync(100)
    expect(getAtemView()?.mes[0].programm).toBe(2)
  })

  it('schickt ohne Verbindung nichts', async () => {
    await atemBefehl({ type: 'cut', me: 0 })
    expect(geraete).toHaveLength(0)
  })
})

describe('Hebel', () => {
  it('sendet höchstens alle 33 ms, immer den neuesten Wert, und vergisst das Ende nicht', async () => {
    const g = await verbunden()
    for (let wert = 100; wert <= 9000; wert += 100) void atemBefehl({ type: 'hebel', me: 0, wert })
    void atemBefehl({ type: 'hebel', me: 0, wert: 10000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(g.befehle).toEqual([{ type: 'hebel', me: 0, wert: 100 }])
    await vi.advanceTimersByTimeAsync(40)
    expect(g.befehle).toHaveLength(2)
    expect(g.befehle[1]).toEqual({ type: 'hebel', me: 0, wert: 10000 })
    await vi.advanceTimersByTimeAsync(200)
    expect(g.befehle).toHaveLength(2)
  })

  it('staut bei einem langsamen Mischer nichts auf', async () => {
    const g = await verbunden()
    g.haltend = true
    void atemBefehl({ type: 'hebel', me: 0, wert: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    for (const wert of [2000, 3000, 4000]) void atemBefehl({ type: 'hebel', me: 0, wert })
    await vi.advanceTimersByTimeAsync(500)
    expect(g.befehle).toHaveLength(1)
    g.bestaetigungen[0]()
    await vi.advanceTimersByTimeAsync(0)
    expect(g.befehle.map((c) => (c.type === 'hebel' ? c.wert : 0))).toEqual([1000, 4000])
  })

  it('merkt sich die Ruhelage: Nach einem fertigen Übergang steht sie am anderen Ende', async () => {
    const g = await verbunden()
    const lauf = (handlePosition: number, inTransition = true): AtemRoh =>
      roh({
        video: {
          mixEffects: [
            me({ transitionPosition: { inTransition, remainingFrames: 3, handlePosition } })
          ]
        }
      })
    g.m.zustand(lauf(9000))
    await vi.advanceTimersByTimeAsync(100)
    g.m.zustand(lauf(0, false))
    await vi.advanceTimersByTimeAsync(100)
    expect(getAtemView()?.mes[0].hebelOben).toBe(true)
  })
})

describe('Drosselung', () => {
  it('fasst die Meldungen je Bild zusammen und schickt den neuesten Stand', async () => {
    const g = await verbunden()
    await vi.advanceTimersByTimeAsync(100)
    const vorher = ansichten.length
    for (let i = 0; i < 50; i++) {
      g.m.zustand(roh({ video: { mixEffects: [me({ programInput: i })] } }))
      await vi.advanceTimersByTimeAsync(4)
    }
    await vi.advanceTimersByTimeAsync(100)
    const neu = ansichten.slice(vorher)
    // 200 ms Meldungen bei 40 ms Abstand, dazu der letzte Stand
    expect(neu.length).toBeLessThanOrEqual(7)
    expect(neu[neu.length - 1].mes[0].programm).toBe(49)
  })
})
