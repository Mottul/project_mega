// Eine Verbindung zum Mischer, gehalten im main: Sie läuft weiter, wenn das Werkzeug zugeht, und
// zwei Fenster belegen keinen zweiten Platz am Gerät. Fenster und später das Handy spiegeln nur.
// Die Knöpfe zeigen, was der Mischer meldet, deshalb geht jeder Befehl hier durch und kommt als
// Zustand zurück. Die Verbindung selbst (Gerät oder Probebetrieb) steckt hinter `AtemVerbindung`.

import {
  ATEM_GETRENNT,
  atemCommand,
  atemZiel,
  type AtemCommand,
  type AtemStatus,
  type AtemView,
  type AtemZiel
} from '@shared/atem'
import { atemViewAus, protokollText, type AtemRoh } from '@shared/atemView'
import { HEBEL_START, hebelFolgen, type HebelSpur } from '@shared/atemHebel'
import { logLine } from '../log'
import { simulierteVerbindung } from './atemSimulator'
import { echteVerbindung, type AtemMeldungen, type AtemVerbindung } from './atemVerbindung'

/** Während eines Übergangs meldet der Mischer je Bild: Fenster bekommen höchstens 25 Stände je Sekunde */
const ANSICHT_MS = 40
/** Hebel: rund 30 Werte je Sekunde, immer der neueste, nie eine Warteschlange */
const HEBEL_MS = 33
/** So lange bleibt „verbindet“ ohne Hinweis; die Bibliothek versucht es trotzdem weiter */
const ANTWORT_MS = 5000

let verbindung: AtemVerbindung | null = null
/** Zählt Verbindungen hoch: Meldungen einer ersetzten gehen ins Leere */
let aktuell = 0
let status: AtemStatus = ATEM_GETRENNT
let view: AtemView | null = null
let roh: AtemRoh | null = null
let spuren: HebelSpur[] = []
let statusSink: (s: AtemStatus) => void = () => {}
let viewSink: (v: AtemView) => void = () => {}
let ansichtTimer: ReturnType<typeof setTimeout> | null = null
let letzteAnsicht = 0
let antwortTimer: ReturnType<typeof setTimeout> | null = null
/** Start und Stopp nacheinander: Nie zwei Verbindungen zugleich, auch nicht bei schnellem Wechsel */
let reihe: Promise<unknown> = Promise.resolve()
const hebelWunsch = new Map<number, number>()
const hebelLaeuft = new Set<number>()

export function setAtemSinks(sinks: {
  status: (s: AtemStatus) => void
  view: (v: AtemView) => void
}): void {
  statusSink = sinks.status
  viewSink = sinks.view
}

export const getAtemStatus = (): AtemStatus => status
export const getAtemView = (): AtemView | null => view

function setStatus(patch: Partial<AtemStatus>): AtemStatus {
  const neu = { ...status, ...patch }
  if (JSON.stringify(neu) !== JSON.stringify(status)) {
    status = neu
    statusSink(status)
  }
  return status
}

function ansichtSenden(): void {
  if (ansichtTimer) clearTimeout(ansichtTimer)
  ansichtTimer = null
  if (!roh) return
  letzteAnsicht = Date.now()
  spuren = roh.video.mixEffects
    .filter((me) => me !== undefined)
    .map((me, i) =>
      hebelFolgen(
        spuren[i] ?? HEBEL_START,
        me.transitionPosition.inTransition,
        me.transitionPosition.handlePosition
      )
    )
  view = atemViewAus(
    roh,
    spuren.map((s) => s.oben)
  )
  viewSink(view)
  const version = roh.info.apiVersion
  if (version) {
    setStatus({
      modell: roh.info.productIdentifier ?? null,
      protokoll: protokollText(version),
      protokollBekannt: verbindung?.protokollBekannt(version) ?? true
    })
  }
}

function ansichtPlanen(): void {
  if (ansichtTimer) return
  ansichtTimer = setTimeout(ansichtSenden, Math.max(0, letzteAnsicht + ANSICHT_MS - Date.now()))
}

function timerLoeschen(): void {
  if (ansichtTimer) clearTimeout(ansichtTimer)
  if (antwortTimer) clearTimeout(antwortTimer)
  ansichtTimer = null
  antwortTimer = null
}

async function abbauen(): Promise<void> {
  const v = verbindung
  verbindung = null
  aktuell++
  timerLoeschen()
  hebelWunsch.clear()
  roh = null
  view = null
  spuren = []
  try {
    await v?.stopp()
  } catch (e) {
    logLine('[atem] Fehler beim Trennen:', String(e))
  }
}

function meldungenFuer(nummer: number, name: string): AtemMeldungen {
  const veraltet = (): boolean => nummer !== aktuell
  return {
    verbunden() {
      if (veraltet()) return
      if (antwortTimer) clearTimeout(antwortTimer)
      antwortTimer = null
      logLine('[atem] verbunden mit', name)
      setStatus({ phase: 'verbunden', fehler: null })
      ansichtSenden()
    },
    verloren() {
      if (veraltet() || status.phase !== 'verbunden') return
      logLine('[atem] Verbindung verloren:', name)
      setStatus({ phase: 'verloren' })
    },
    zustand(neu) {
      if (veraltet()) return
      roh = neu
      ansichtPlanen()
    },
    fehler(text) {
      if (veraltet()) return
      logLine('[atem] Fehler:', text)
    }
  }
}

async function verbinden(ziel: AtemZiel): Promise<void> {
  await abbauen()
  const host = 'host' in ziel ? ziel.host : ''
  setStatus({
    ...ATEM_GETRENNT,
    phase: 'verbindet',
    host,
    simulator: 'simulator' in ziel ? ziel.simulator : null
  })
  const v =
    'simulator' in ziel
      ? simulierteVerbindung(ziel.simulator, meldungenFuer(aktuell, 'Probebetrieb'))
      : echteVerbindung(ziel.host, meldungenFuer(aktuell, ziel.host))
  verbindung = v
  antwortTimer = setTimeout(() => {
    setStatus({ fehler: `Keine Antwort von ${host}: Adresse und Netzwerk prüfen` })
  }, ANTWORT_MS)
  try {
    await v.start()
  } catch (e) {
    // etwa das native Modul fehlt: Das Werkzeug meldet es, die App läuft weiter
    logLine('[atem] Verbinden fehlgeschlagen:', String(e))
    if (verbindung === v) {
      await abbauen()
      setStatus({ ...ATEM_GETRENNT, host, fehler: 'Verbindung konnte nicht gestartet werden' })
    }
  }
}

/** Mit Mischer oder Probebetrieb verbinden; eine bestehende Verbindung wird vorher getrennt. */
export function atemVerbinden(rohZiel: unknown): Promise<AtemStatus> {
  const ziel = atemZiel(rohZiel)
  if (!ziel) return Promise.resolve(setStatus({ fehler: 'Ungültige Adresse' }))
  reihe = reihe.then(() => verbinden(ziel))
  return reihe.then(() => status)
}

export function atemTrennen(): Promise<AtemStatus> {
  reihe = reihe.then(async () => {
    await abbauen()
    setStatus(ATEM_GETRENNT)
  })
  return reihe.then(() => status)
}

async function hebelSenden(v: AtemVerbindung, me: number): Promise<void> {
  if (hebelLaeuft.has(me)) return
  hebelLaeuft.add(me)
  try {
    for (;;) {
      const wert = hebelWunsch.get(me)
      if (wert === undefined || verbindung !== v) break
      hebelWunsch.delete(me)
      const pause = new Promise((resolve) => setTimeout(resolve, HEBEL_MS))
      await Promise.all([v.befehl({ type: 'hebel', me, wert }), pause])
    }
  } finally {
    hebelLaeuft.delete(me)
  }
}

function senden(v: AtemVerbindung, cmd: AtemCommand): Promise<void> {
  if (cmd.type !== 'hebel') return v.befehl(cmd)
  hebelWunsch.set(cmd.me, cmd.wert)
  return hebelSenden(v, cmd.me)
}

/** Prüft und sendet. Ohne Verbindung oder bei ungültigem Befehl geht nichts zum Mischer. */
export async function atemBefehl(rohBefehl: unknown): Promise<void> {
  const v = verbindung
  if (!v || !view || status.phase !== 'verbunden') return
  const cmd = atemCommand(rohBefehl, view)
  if (!cmd) {
    logLine('[atem] Befehl abgelehnt:', rohBefehl)
    return
  }
  try {
    await senden(v, cmd)
  } catch (e) {
    logLine('[atem] Befehl fehlgeschlagen:', String(e))
  }
}

/** Beim Beenden: Die App wartet nicht darauf, die Verbindung stirbt ohnehin mit dem Prozess. */
export function disposeAtem(): void {
  void abbauen()
}
