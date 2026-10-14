// RTA (Echtzeit-Analysator): Spektrum des Mikrofons in Terzen bis 1/12 Oktave mit feiner Kurve,
// Bewertung Z/A/C, Mittelung, Spitzen, Pegelmesser (LAF, Leq, Max), Spektrogramm, Referenzkurven
// mit Differenzansicht, Kalibrierung (Offset, Kalibrator, Korrekturdatei) und Feedback-Finder.
// Kleines Werkzeug: läuft im eigenen Fenster und in der Handy-PWA – nur Web-APIs, kein `api`.
// Gemessen wird pro Bild über Refs (ohne React); die Zahlen gehen ~5× je Sekunde in den Zustand.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { AlertTriangle, Mic, Pause, Play, RotateCcw, Snowflake, Square } from 'lucide-react'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Segmented } from '@renderer/components/ui/segmented'
import { cn } from '@renderer/lib/utils'
import { CalcPage, fmt, Readout, ReadoutGrid } from '../_calc/ui'
import { RtaProcessor } from './analysis'
import {
  bandPowers,
  bandsFor,
  dbToMs,
  levelAt,
  freqText,
  msToDb,
  SUB_BANDS,
  subPosition,
  weightingGains,
  type Resolution,
  type Weighting
} from './bands'
import {
  drawGraph,
  heatLut,
  PAD,
  drawSpectroAxes,
  pushSpectro,
  renderSpectro,
  ROW_MS,
  spectroFreq,
  spectroRow,
  readTheme,
  xToFreq,
  type GraphData,
  type Theme
} from './draw'
import {
  isOvertaken,
  listInputs,
  RtaEngine,
  startErrorText,
  unsupportedReason,
  type EngineInfo
} from './engine'
import {
  FeedbackTracker,
  findPeaks,
  noteOf,
  SENSITIVITY,
  type FeedbackLogEntry,
  type FeedbackTrack
} from './feedback'
import { DisplayCard, FeedbackCard, InputCard, ReferenceCard } from './RtaCards'
import { useRta } from './store'

export interface Readings {
  level: number
  levelZ: number
  leq: number
  lmax: number
  peak: number
  clip: boolean
  feedback: FeedbackTrack[]
  log: FeedbackLogEntry[]
}

const EMPTY: Readings = {
  level: -Infinity,
  levelZ: -Infinity,
  leq: -Infinity,
  lmax: -Infinity,
  peak: -Infinity,
  clip: false,
  feedback: [],
  log: []
}

/** Übersteuert ab dieser Abtastspitze (dBFS); die Warnung bleibt 2 s stehen */
const CLIP_DB = -0.5
const READ_EVERY_MS = 200
/** Messtakt (ms): unabhängig vom Bildtakt, der in verdeckten Fenstern ausbleibt */
const MEASURE_MS = 20

/** Ein berechnetes Bild: Spektrum ohne Fadenkreuz und die Pegelachse (auch fürs Spektrogramm) */
interface FrameData {
  graph: Omit<GraphData, 'hoverX'>
  absTop: number
}

/** Zeiger über Spektrum oder Spektrogramm (CSS-Pixel in dessen Fläche) */
interface Pointer {
  x: number
  y: number
  area: 'graph' | 'spectro'
}

/** Verlauf des Spektrogramms: so viele Zeilen (ROW_MS) – mehr, als eine Fläche zeigt */
const HISTORY_ROWS = 1200
/** Pegelumfang des Spektrogramms (dB): enger als das Spektrum, sonst fehlt der Kontrast. Oben
 *  10 dB unter dem Spektrum – die 1/24-Bänder liegen rund 9 dB unter den Terzen. */
const SPECTROGRAM_RANGE = 60

/** Pegelanzeige: eine Nachkommastelle, Stille als „–“ */
export function dbText(v: number): string {
  return Number.isFinite(v) && v > -150 ? fmt(v, 1) : ''
}

/** Referenz (1/24, unbewertet) in Bandpegel einer Auflösung mit Bewertung umrechnen */
function refBands(curve: number[], w: Weighting, res: Resolution): number[] {
  const g = weightingGains(w)
  const sub = curve.map((v, i) => (v > -199 ? dbToMs(v) * g[i] : 0))
  return Array.from(bandPowers(sub, bandsFor(res)), msToDb)
}

export function Rta(): JSX.Element {
  const p = useRta()
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<EngineInfo | null>(null)
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([])
  const [frozen, setFrozen] = useState(false)
  const [read, setRead] = useState<Readings>(EMPTY)
  const [hover, setHover] = useState<Pointer | null>(null)
  const unsupported = unsupportedReason()

  const engine = useRef(new RtaEngine())
  const proc = useRef(
    new RtaProcessor({
      weighting: p.weighting,
      averaging: p.averaging,
      peak: p.peak,
      meter: p.meter,
      resolution: p.resolution
    })
  )
  const tracker = useRef(new FeedbackTracker(p.sensitivity))
  const graphBox = useRef<HTMLDivElement>(null)
  const graph = useRef<HTMLCanvasElement>(null)
  const spec = useRef<HTMLCanvasElement>(null)
  const specAxes = useRef<HTMLCanvasElement>(null)
  const specBox = useRef<HTMLDivElement>(null)
  // Verlauf (neueste Zeile zuerst, Anzeige-dB je 1/24-Band), Sammeln der nächsten Zeile,
  // noch nicht gezeichnete Zeilen, „alles neu zeichnen“ und Stand der Achsenebene
  const history = useRef<Float32Array[]>([])
  const rowAcc = useRef({ sum: new Float64Array(SUB_BANDS.length), n: 0, since: 0 })
  const pendingRows = useRef(0)
  const specDirty = useRef(true)
  const axesKey = useRef('')
  const theme = useRef<Theme | null>(null)
  const lut = useRef<Uint8ClampedArray | null>(null)
  const scaleTop = useRef<number | null>(null)
  const shown = useRef<{ levels: number[]; curve: number[] | null }>({ levels: [], curve: null })
  const frame = useRef<FrameData | null>(null)
  const clipUntil = useRef(0)
  // aktueller Stand für die Bildschleife (ohne sie bei jeder Änderung neu zu starten)
  const live = useRef({ p, frozen, hover })
  live.current = { p, frozen, hover }

  /* ---- Einstellungen an Auswertung, Mikrofon-Korrektur und Feedback-Finder ---- */
  useEffect(() => {
    proc.current.configure({
      weighting: p.weighting,
      averaging: p.averaging,
      peak: p.peak,
      meter: p.meter,
      resolution: p.resolution
    })
  }, [p.weighting, p.averaging, p.peak, p.meter, p.resolution])
  useEffect(() => engine.current.setCorrection(p.correction?.points ?? null), [p.correction])
  useEffect(() => tracker.current.setSensitivity(p.sensitivity), [p.sensitivity])
  useEffect(() => {
    specDirty.current = true
    axesKey.current = ''
    if (p.spectrogram === 'off') {
      history.current = []
      pendingRows.current = 0
    }
  }, [p.spectrogram])

  /* ---- Farben aus den Tokens, neu bei Design- oder Akzentwechsel ---- */
  useEffect(() => {
    const load = (): void => {
      theme.current = readTheme()
      lut.current = heatLut(theme.current)
      specDirty.current = true
      axesKey.current = ''
    }
    load()
    const mo = new MutationObserver(load)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => mo.disconnect()
  }, [])

  /* ---- Eingänge (Bezeichnungen erst nach der ersten Freigabe) ---- */
  const refreshInputs = useCallback((): void => {
    void listInputs()
      .then(setInputs)
      .catch(() => {})
  }, [])
  useEffect(() => {
    refreshInputs()
    const md = navigator.mediaDevices
    md?.addEventListener?.('devicechange', refreshInputs)
    return () => md?.removeEventListener?.('devicechange', refreshInputs)
  }, [refreshInputs])

  /* ---- Bildschirm wach halten, solange gemessen wird (Handy) ---- */
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return
    let lock: { release: () => Promise<void> } | null = null
    const take = (): void => {
      if (document.visibilityState !== 'visible') return
      void navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => {})
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => {
      document.removeEventListener('visibilitychange', take)
      void lock?.release().catch(() => {})
    }
  }, [running])

  /* ---- Start und Stopp ---- */
  // Starts zählen: Nur der neueste beendet „Startet…“; ein Gerätewechsel während des Starts
  // startet neu (der ältere Start gibt dann in der Engine alles wieder frei).
  const startSeq = useRef(0)
  const pending = useRef(false)
  async function start(): Promise<void> {
    const mine = ++startSeq.current
    pending.current = true
    setStarting(true)
    setError(null)
    try {
      const i = await engine.current.start(p.deviceId, p.channel)
      setInfo(i)
      proc.current.reset()
      tracker.current.reset()
      scaleTop.current = null
      setRunning(true)
      refreshInputs()
    } catch (e) {
      // überholt (gestoppt, verlassen, anderes Gerät): der neuere Start gilt, nichts anzeigen
      if (isOvertaken(e)) return
      engine.current.stop()
      setError(startErrorText(e))
    } finally {
      if (mine === startSeq.current) {
        pending.current = false
        setStarting(false)
      }
    }
  }
  function stop(): void {
    engine.current.stop()
    setRunning(false)
    setInfo(null)
  }
  // Fenster zu oder Werkzeug verlassen: Mikrofon freigeben
  useEffect(() => () => engine.current.stop(), [])
  // anderes Gerät oder anderer Kanal während der Messung oder des Starts: neu öffnen
  const restartKey = `${p.deviceId}|${p.channel}`
  const lastKey = useRef(restartKey)
  useEffect(() => {
    if (lastKey.current === restartKey) return
    lastKey.current = restartKey
    if (engine.current.running || pending.current) void start()
    // start liest den neuesten Stand selbst
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey])

  function reset(): void {
    proc.current.reset()
    tracker.current.reset()
    clipUntil.current = 0
    setRead(EMPTY)
  }

  /* ---- Messen im Takt, Zeichnen im Bildtakt ---- */
  // Gemessen wird per Timer, gezeichnet, wenn der Bildschirm ein Bild will (requestAnimationFrame).
  // Verdeckte oder minimierte Fenster bekommen keine Bilder; im Bildtakt stünde die Messung dann
  // still. Ein Pegelmesser muss aber weitermessen, sonst stimmen Leq und Max nicht; sein Fenster
  // läuft dafür ohne Hintergrund-Drosselung (toolWindows: measures, Test in e2e/rta.mjs).
  useEffect(() => {
    if (!running) return
    const sub = new Float64Array(SUB_BANDS.length)
    let last = performance.now()
    let lastRead = 0
    let raf = 0
    const tick = (): void => {
      const now = performance.now()
      const dt = Math.min(0.5, Math.max(0.001, (now - last) / 1000))
      last = now
      const { p: cur, frozen: fz } = live.current
      const peak = engine.current.read(sub)
      const pr = proc.current
      pr.push(sub, peak, dt)
      if (pr.peakNow >= CLIP_DB) clipUntil.current = now + 2000
      if (cur.feedback) {
        const { db, df } = engine.current.feedbackSpectrum()
        const cands = findPeaks(db, df, {
          fMin: 60,
          fMax: 16000,
          minProminence: SENSITIVITY[cur.sensitivity].prominence,
          floorDb: Math.max(-100, pr.levelZ - 50)
        })
        tracker.current.update(cands, now / 1000)
      }
      if (cur.spectrogram !== 'off') {
        // eine Zeile je ROW_MS: Mittel der Leistungen (bewertet, Augenblick) im Zeitraum
        const acc = rowAcc.current
        for (let i = 0; i < acc.sum.length; i++) acc.sum[i] += pr.live[i]
        acc.n++
        if (acc.since === 0) acc.since = now
        if (now - acc.since >= ROW_MS) {
          const off = cur.offset ?? 0
          const row = Float32Array.from(acc.sum, (v) => msToDb(v / acc.n) + off)
          history.current.unshift(row)
          if (history.current.length > HISTORY_ROWS) history.current.length = HISTORY_ROWS
          pendingRows.current++
          acc.sum.fill(0)
          acc.n = 0
          acc.since = now
        }
      }
      if (!fz) {
        frame.current = compute(cur, now)
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0
            const f = frame.current
            if (f) paint(f, live.current.p, live.current.hover)
          })
        }
      }
      if (now - lastRead >= READ_EVERY_MS) {
        lastRead = now
        setRead({
          level: pr.level,
          levelZ: pr.levelZ,
          leq: pr.leq,
          lmax: pr.lmax,
          peak: pr.peak,
          clip: now < clipUntil.current,
          feedback: cur.feedback ? tracker.current.active(now / 1000) : [],
          log: [...tracker.current.log]
        })
      }
    }
    const timer = setInterval(tick, MEASURE_MS)
    return () => {
      clearInterval(timer)
      cancelAnimationFrame(raf)
    }
    // compute und paint nutzen nur Refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  /** Was gezeichnet wird – im Messtakt berechnet, auch wenn gerade kein Bild kommt (Ablesung) */
  function compute(cur: typeof p, now: number): FrameData {
    const pr = proc.current
    const off = cur.offset ?? 0
    const bands = pr.bandLayout
    const liveLevels = pr.bandLevels().map((v) => v + off)
    const liveCurve = cur.view === 'bars' ? null : pr.curve().map((v) => v + off)
    const ref = cur.diffRef ? cur.references.find((r) => r.id === cur.diffRef) : null
    const refLevels = (curve: number[]): number[] =>
      refBands(curve, cur.weighting, cur.resolution).map((v) => v + off)

    // Pegelachse: fest oder automatisch – rauf sofort, runter erst, wenn es deutlich leiser ist
    // (sonst springt sie). Das Spektrogramm nutzt sie auch in der Differenzansicht.
    let absTop: number
    if (cur.scale === 'fixed') absTop = cur.offset != null ? 120 : 0
    else {
      const max = Math.max(...liveLevels.filter(Number.isFinite), -200)
      const target = Math.ceil((max + 8) / 10) * 10
      const prev = scaleTop.current
      absTop = prev == null || target > prev || target < prev - 20 ? target : prev
      scaleTop.current = absTop
    }
    let levels = liveLevels
    let curve = liveCurve
    let top = absTop
    let range = 80
    if (ref) {
      const rb = refLevels(ref.curve)
      levels = liveLevels.map((v, i) => v - rb[i])
      const g = weightingGains(cur.weighting)
      curve = liveCurve
        ? liveCurve.map(
            (v, i) =>
              v - (ref.curve[i] > -199 ? ref.curve[i] + 10 * Math.log10(g[i]) + off : -Infinity)
          )
        : null
      top = 15
      range = 30
    }
    shown.current = { levels, curve }
    return {
      graph: {
        bands,
        levels,
        holds: ref ? [] : pr.peakHolds().map((v) => v + off),
        curve,
        showBars: cur.view !== 'curve',
        refs: ref
          ? []
          : cur.references
              .filter((r) => r.visible)
              .map((r) => ({ color: r.color, levels: refLevels(r.curve) })),
        diff: Boolean(ref),
        feedback: cur.feedback
          ? tracker.current.active(now / 1000).map((t) => ({ f: t.f, db: t.db + off }))
          : [],
        top,
        range
      },
      absTop
    }
  }

  /** Spektrum und Spektrogramm zeichnen */
  function paint(f: FrameData, cur: typeof p, hv: Pointer | null): void {
    const canvas = graph.current
    const th = theme.current
    if (!canvas || !th) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // Fadenkreuz auch, wenn der Zeiger im Wasserfall steht (gleiche Frequenzachse)
    const hoverX = hv && (hv.area === 'graph' || cur.spectrogram === 'waterfall') ? hv.x : null
    drawGraph(ctx, w, h, { ...f.graph, hoverX }, th)

    const sc = spec.current
    const mode = cur.spectrogram
    if (mode !== 'off' && sc && lut.current) {
      const sw = Math.round(sc.clientWidth * dpr)
      const sh = Math.round(sc.clientHeight * dpr)
      const scale = { top: f.absTop - 10, range: SPECTROGRAM_RANGE }
      const sctx = sc.getContext('2d')
      if (sctx) {
        // neue Größe, anderer Modus, anderes Design oder zu viel verpasst: alles aus dem Verlauf
        if (sc.width !== sw || sc.height !== sh || specDirty.current || pendingRows.current > 50) {
          sc.width = sw
          sc.height = sh
          renderSpectro(sctx, mode, dpr, history.current, scale, lut.current)
          specDirty.current = false
        } else {
          for (let i = Math.min(pendingRows.current, history.current.length) - 1; i >= 0; i--) {
            pushSpectro(sctx, mode, dpr, history.current[i], scale, lut.current)
          }
        }
        pendingRows.current = 0
      }
      const ax = specAxes.current
      const key = `${mode}|${sc.clientWidth}|${sc.clientHeight}|${dpr}`
      if (ax && axesKey.current !== key) {
        axesKey.current = key
        ax.width = Math.round(sc.clientWidth * dpr)
        ax.height = Math.round(sc.clientHeight * dpr)
        const actx = ax.getContext('2d')
        if (actx) {
          actx.setTransform(dpr, 0, 0, dpr, 0, 0)
          drawSpectroAxes(actx, mode, sc.clientWidth, sc.clientHeight, th)
        }
      }
    }
  }

  /* ---- Ablesen per Zeiger/Finger ---- */
  const pointerIn =
    (area: Pointer['area']) =>
    (e: PointerEvent<HTMLDivElement>): void => {
      const r = e.currentTarget.getBoundingClientRect()
      setHover({ x: e.clientX - r.left, y: e.clientY - r.top, area })
    }
  const onPointer = pointerIn('graph')
  const box = graphBox.current
  const hoverInfo = (() => {
    if (!hover || hover.area !== 'graph' || !box) return null
    const w = box.clientWidth
    if (hover.x < PAD.l || hover.x > w - PAD.r) return null
    const f = xToFreq(hover.x, w)
    const bands = proc.current.bandLayout
    const bi = bands.findIndex((b) => f >= b.lo && f < b.hi)
    const si = SUB_BANDS.findIndex((b) => f >= b.lo && f < b.hi)
    const band = bi >= 0 ? shown.current.levels[bi] : undefined
    const fine = si >= 0 ? shown.current.curve?.[si] : undefined
    const note = noteOf(f)
    return { f, bandLabel: bi >= 0 ? bands[bi].label : '', band, fine, note }
  })()

  // Ablesung im Spektrogramm: Frequenz, Note, Pegel und wie lange es her ist
  const sbox = specBox.current
  const specInfo = (() => {
    if (!hover || hover.area !== 'spectro' || !sbox || p.spectrogram === 'off') return null
    const w = sbox.clientWidth
    const h = sbox.clientHeight
    const f = spectroFreq(p.spectrogram, hover.x, hover.y, w, h)
    const row = spectroRow(p.spectrogram, hover.x, hover.y, w)
    const line = row >= 0 ? history.current[row] : undefined
    if (!line) return null
    return { f, note: noteOf(f), db: levelAt(line, subPosition(f)), ago: (row * ROW_MS) / 1000 }
  })()

  const unit = p.diffRef ? 'dB' : p.offset != null ? 'dB' : 'dBFS'
  const lname = (suffix: string): string => `L${p.weighting}${suffix}`
  const off = p.offset ?? 0

  function calibrate(): void {
    if (!running || !(read.levelZ > -90)) {
      setError('Zum Kalibrieren erst messen: Kalibrator aufs Mikrofon, dann „Kalibrieren“.')
      return
    }
    useRta.getState().set({ offset: Math.round((p.calibratorDb - read.levelZ) * 10) / 10 })
    setError(null)
  }

  const head = (
    <Card className="space-y-3 p-3 sm:p-4">
      {/* Leiste: Start und Ansicht */}
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square className="size-4" /> Stopp
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void start()}
            disabled={starting || Boolean(unsupported)}
          >
            <Mic className="size-4" /> {starting ? 'Startet…' : 'Messen'}
          </Button>
        )}
        <Segmented
          label="Ansicht"
          value={p.view}
          onChange={(view) => useRta.getState().set({ view })}
          options={[
            { value: 'bars', label: 'Bänder' },
            { value: 'curve', label: 'Kurve' },
            { value: 'both', label: 'Beides' }
          ]}
        />
        <Segmented
          label="Auflösung (Oktave)"
          value={String(p.resolution) as '1' | '3' | '6' | '12'}
          onChange={(v) => useRta.getState().set({ resolution: Number(v) as Resolution })}
          options={[
            { value: '1', label: '1/1' },
            { value: '3', label: '1/3' },
            { value: '6', label: '1/6' },
            { value: '12', label: '1/12' }
          ]}
        />
        <Segmented
          label="Bewertung"
          value={p.weighting}
          onChange={(weighting) => useRta.getState().set({ weighting })}
          options={[
            { value: 'Z', label: 'Z' },
            { value: 'A', label: 'A' },
            { value: 'C', label: 'C' }
          ]}
        />
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant={frozen ? 'secondary' : 'ghost'}
            onClick={() => setFrozen((f) => !f)}
            disabled={!running}
            title="Anzeige anhalten (gemessen wird weiter)"
          >
            {frozen ? <Play className="size-4" /> : <Snowflake className="size-4" />}
            {frozen ? 'Weiter' : 'Einfrieren'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            title="Mittelung, Spitzen, Leq und Max zurücksetzen"
          >
            <RotateCcw className="size-4" /> Zurücksetzen
          </Button>
        </div>
      </div>

      {unsupported && <Alert tone="warning">{unsupported}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {read.clip && running && (
        <Alert tone="danger" icon={AlertTriangle} title="Übersteuert">
          Der Eingang erreicht Vollaussteuerung – Pegel am Interface senken, sonst stimmt nichts.
        </Alert>
      )}

      <ReadoutGrid>
        <Readout
          label={lname(p.meter)}
          hint={`Pegel mit Bewertung ${p.weighting} und Zeitbewertung ${p.meter === 'F' ? 'Fast (125 ms)' : 'Slow (1 s)'}. In dB SPL erst nach dem Kalibrieren, sonst relativ zur Vollaussteuerung (dBFS).`}
          value={dbText(read.level + off)}
          unit={unit}
          big
          accent
        />
        <Readout
          label={lname('eq')}
          hint="Energetischer Mittelwert seit dem Start bzw. „Zurücksetzen“."
          value={dbText(read.leq + off)}
          unit={unit}
        />
        <Readout
          label={lname(`${p.meter}max`)}
          hint="Höchster Pegel (zeitbewertet) seit dem Start bzw. „Zurücksetzen“."
          value={dbText(read.lmax + off)}
          unit={unit}
        />
        <Readout
          label="Aussteuerung"
          hint="Größter Abtastwert am Eingang (unbewertet) – zeigt, wie viel Luft bis zur Vollaussteuerung bleibt."
          value={dbText(read.peak)}
          unit="dBFS"
        />
      </ReadoutGrid>

      <div
        ref={graphBox}
        className="relative touch-none select-none"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <canvas
          ref={graph}
          className="block h-64 w-full sm:h-72"
          aria-label="Spektrum"
          data-testid="rta-graph"
        />
        {!running && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-md bg-card/80 px-3 py-1.5 text-sm text-muted-foreground">
              {unsupported ? 'Messen ist hier nicht möglich' : '„Messen“ startet das Mikrofon'}
            </span>
          </div>
        )}
        {hoverInfo && running && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-lg"
            style={
              hover && box && hover.x > box.clientWidth / 2
                ? { right: box.clientWidth - hover.x + 12 }
                : { left: (hover?.x ?? 0) + 12 }
            }
          >
            <p className="font-semibold tabular-nums">
              {freqText(hoverInfo.f)}{' '}
              <span className="font-normal text-muted-foreground">
                {hoverInfo.note.name} {hoverInfo.note.cents >= 0 ? '+' : '−'}
                {Math.abs(hoverInfo.note.cents)} ct
              </span>
            </p>
            {hoverInfo.band != null && Number.isFinite(hoverInfo.band) && (
              <p className="tabular-nums text-muted-foreground">
                Band {hoverInfo.bandLabel}: {dbText(hoverInfo.band)} {unit}
              </p>
            )}
            {hoverInfo.fine != null && Number.isFinite(hoverInfo.fine) && (
              <p className="tabular-nums text-muted-foreground">
                Kurve: {dbText(hoverInfo.fine)} {unit}
              </p>
            )}
          </div>
        )}
      </div>
      {p.spectrogram !== 'off' && (
        <div
          ref={specBox}
          className="relative touch-none select-none overflow-hidden rounded-md bg-background/40"
          onPointerMove={pointerIn('spectro')}
          onPointerDown={pointerIn('spectro')}
          onPointerLeave={() => setHover(null)}
        >
          <canvas
            ref={spec}
            className={cn(
              'block w-full',
              p.spectrogram === 'waterfall' ? 'h-40 sm:h-48' : 'h-28 sm:h-32'
            )}
            aria-label={p.spectrogram === 'waterfall' ? 'Wasserfall' : 'Zeitachse des Spektrums'}
            data-testid="rta-spectro"
          />
          <canvas
            ref={specAxes}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          />
          {/* Fadenkreuz durch den Wasserfall – dieselbe Frequenzachse wie das Spektrum */}
          {hover && p.spectrogram === 'waterfall' && running && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/50"
              style={{ left: Math.round(hover.x) }}
            />
          )}
          {specInfo && running && (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-lg"
              style={
                hover && sbox && hover.x > sbox.clientWidth / 2
                  ? { right: sbox.clientWidth - hover.x + 12 }
                  : { left: (hover?.x ?? 0) + 12 }
              }
            >
              <p className="font-semibold tabular-nums">
                {freqText(specInfo.f)}{' '}
                <span className="font-normal text-muted-foreground">
                  {specInfo.note.name} {specInfo.note.cents >= 0 ? '+' : '−'}
                  {Math.abs(specInfo.note.cents)} ct
                </span>
              </p>
              <p className="tabular-nums text-muted-foreground">
                {Number.isFinite(specInfo.db) ? `${dbText(specInfo.db)} ${unit}` : 'still'} ·{' '}
                {specInfo.ago < 0.05 ? 'jetzt' : `vor ${fmt(specInfo.ago, 1)} s`}
              </p>
            </div>
          )}
        </div>
      )}

      <p
        className={cn(
          'flex flex-wrap items-center gap-x-2 text-xs',
          info?.filters.length ? 'text-warning' : 'text-muted-foreground'
        )}
        data-testid="rta-status"
      >
        {info ? (
          <>
            <span className="max-w-[18rem] truncate">{info.label}</span>
            <span>· {fmt(info.sampleRate / 1000, 1)} kHz</span>
            <span>
              ·{' '}
              {info.channels === 1
                ? 'Mono'
                : p.channel === 'mix'
                  ? 'Summe L+R'
                  : p.channel === 'left'
                    ? 'Links'
                    : 'Rechts'}
            </span>
            {p.correction && <span>· Korrektur {p.correction.serial ?? p.correction.name}</span>}
            {p.offset != null && (
              <span>
                · kalibriert ({p.offset > 0 ? '+' : ''}
                {fmt(p.offset, 1)} dB)
              </span>
            )}
            {info.filters.length > 0 && (
              <span>· Gerät filtert: {info.filters.join(', ')} – Messung verfälscht</span>
            )}
            {frozen && (
              <span className="flex items-center gap-1 text-primary">
                · <Pause className="size-3" /> eingefroren
              </span>
            )}
          </>
        ) : (
          <span>Nicht gestartet</span>
        )}
      </p>
    </Card>
  )

  return (
    <CalcPage head={head}>
      {p.feedback && (
        <FeedbackCard
          tracks={read.feedback}
          log={read.log}
          running={running}
          onClearLog={() => tracker.current.reset()}
          offset={off}
          unit={unit}
        />
      )}
      <ReferenceCard
        canAdd={running}
        onAdd={() => useRta.getState().addReference(proc.current.curveZ())}
      />
      <InputCard inputs={inputs} running={running} onCalibrate={calibrate} levelZ={read.levelZ} />
      <DisplayCard />
    </CalcPage>
  )
}
