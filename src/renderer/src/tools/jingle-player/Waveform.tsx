// Waveform-Editor für die Start-/Stopp-Marker eines Jingles. Dekodiert die Datei
// (Web Audio, Bytes via IPC) zu Peaks, zeichnet einen ausschnittweise zoombaren
// Verlauf, erlaubt millisekundengenaues Ziehen zweier Marker, eine Vorschau des
// Ausschnitts (mit Abspielkopf) und automatisches Trimmen von Stille. Peaks je
// Datei gecacht.

import { useEffect, useRef, useState } from 'react'
import { Minus, Pause, Play, Plus, Scissors } from 'lucide-react'
import { JINGLE_PROTOCOL } from '@shared/ipc-contracts'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'

const BUCKETS = 4000 // hohe Auflösung -> auch beim Hineinzoomen brauchbar
const peakCache = new Map<string, { peaks: Float32Array; duration: number }>()

async function loadPeaks(storedName: string): Promise<{ peaks: Float32Array; duration: number }> {
  const cached = peakCache.get(storedName)
  if (cached) return cached
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ac = new Ctx()
  try {
    const bytes = await api.jingles.bytes(storedName)
    if (!bytes) throw new Error('Datei nicht gefunden')
    const arr = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    const audio = await ac.decodeAudioData(arr)
    const ch = audio.getChannelData(0)
    const peaks = new Float32Array(BUCKETS)
    const block = Math.max(1, Math.floor(ch.length / BUCKETS))
    for (let i = 0; i < BUCKETS; i++) {
      let max = 0
      const start = i * block
      const end = Math.min(ch.length, start + block)
      for (let j = start; j < end; j++) {
        const v = Math.abs(ch[j])
        if (v > max) max = v
      }
      peaks[i] = max
    }
    const result = { peaks, duration: audio.duration }
    peakCache.set(storedName, result)
    return result
  } finally {
    void ac.close()
  }
}

function detectSilence(
  peaks: Float32Array,
  duration: number,
  threshold = 0.02
): { start: number; end: number } {
  let s = 0
  let e = peaks.length - 1
  while (s < peaks.length && peaks[s] < threshold) s++
  while (e > s && peaks[e] < threshold) e--
  if (s >= e) return { start: 0, end: duration }
  return { start: (s / peaks.length) * duration, end: ((e + 1) / peaks.length) * duration }
}

/** m:ss.mmm (millisekundengenau). NaN/undefined -> 0. */
export function fmtMs(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, sec) : 0
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  const ms = Math.round((s - Math.floor(s)) * 1000)
  return `${m}:${String(r).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

interface Props {
  storedName: string
  color: string
  volume: number
  outputDeviceId: string
  startSec: number
  endSec: number | null
  onChange: (startSec: number, endSec: number | null) => void
}

export function Waveform({
  storedName,
  color,
  volume,
  outputDeviceId,
  startSec,
  endSec,
  onChange
}: Props): JSX.Element {
  const [data, setData] = useState<{ peaks: Float32Array; duration: number } | null>(null)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState(0) // sichtbarer Startzeitpunkt
  const [playT, setPlayT] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const drag = useRef<'start' | 'end' | 'pan' | null>(null)

  const duration = data?.duration ?? 0
  const viewDur = duration > 0 ? duration / zoom : 1
  const maxOffset = Math.max(0, duration - viewDur)
  const viewStart = Math.min(Math.max(0, offset), maxOffset)
  const viewEnd = viewStart + viewDur
  const end = endSec ?? duration

  // aktuelle Werte für die window-Listener
  const ref = useRef({ startSec, endSec, duration, viewStart, viewDur })
  ref.current = { startSec, endSec, duration, viewStart, viewDur }
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let alive = true
    setData(null)
    setError(false)
    setZoom(1)
    setOffset(0)
    loadPeaks(storedName)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayT(null)
      setPlaying(false)
    }
  }, [storedName])

  // Zeichnen (nur sichtbares Fenster)
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !data) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    canvas.width = Math.max(1, Math.round(w * dpr))
    canvas.height = Math.max(1, Math.round(h * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const dur = data.duration || 1
    const mid = h / 2
    const i0 = Math.floor((viewStart / dur) * BUCKETS)
    const i1 = Math.ceil((viewEnd / dur) * BUCKETS)
    const span = Math.max(1, i1 - i0)
    const barW = w / span
    for (let i = i0; i < i1; i++) {
      const t = (i / BUCKETS) * dur
      const inRegion = t >= startSec && t <= end
      const amp = Math.max(1, (data.peaks[i] ?? 0) * (h * 0.46))
      ctx.fillStyle = inRegion ? color : 'rgba(130,130,150,0.5)'
      ctx.fillRect((i - i0) * barW, mid - amp, Math.max(0.6, barW - 0.3), amp * 2)
    }
    if (playT != null && playT >= viewStart && playT <= viewEnd) {
      const x = ((playT - viewStart) / viewDur) * w
      ctx.fillStyle = '#fff'
      ctx.fillRect(x - 0.5, 0, 1.5, h)
    }
  }, [data, startSec, endSec, playT, color, zoom, viewStart, viewDur, viewEnd, end])

  function timeFromClientX(clientX: number): number {
    const wrap = wrapRef.current
    const st = ref.current
    if (!wrap || st.duration <= 0) return 0
    const rect = wrap.getBoundingClientRect()
    return st.viewStart + clamp01((clientX - rect.left) / rect.width) * st.viewDur
  }

  // Marker- und Pan-Drag (window -> löst auch außerhalb aus)
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (!drag.current) return
      const st = ref.current
      const e2 = st.endSec ?? st.duration
      if (drag.current === 'start') {
        const t = Math.max(0, Math.min(timeFromClientX(e.clientX), e2 - 0.02))
        onChangeRef.current(t <= 0.02 ? 0 : t, st.endSec)
      } else if (drag.current === 'end') {
        const t = Math.max(st.startSec + 0.02, Math.min(timeFromClientX(e.clientX), st.duration))
        onChangeRef.current(st.startSec, t >= st.duration - 0.05 ? null : t)
      } else if (drag.current === 'pan') {
        const track = trackRef.current
        if (!track || st.duration <= 0) return
        const rect = track.getBoundingClientRect()
        const center = clamp01((e.clientX - rect.left) / rect.width) * st.duration
        setOffset(center - st.viewDur / 2)
      }
    }
    const onUp = (): void => {
      drag.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Mausrad zoomt (auf den Cursor zentriert) – nativer non-passive Listener.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheel = (e: WheelEvent): void => {
      const st = ref.current
      if (st.duration <= 0) return
      e.preventDefault()
      const rect = wrap.getBoundingClientRect()
      const r = clamp01((e.clientX - rect.left) / rect.width)
      const cursorT = st.viewStart + r * st.viewDur
      setZoom((z) => {
        const nz = Math.max(1, Math.min(64, z * (e.deltaY < 0 ? 1.3 : 1 / 1.3)))
        const nViewDur = st.duration / nz
        setOffset(Math.max(0, Math.min(cursorT - r * nViewDur, st.duration - nViewDur)))
        return nz
      })
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [])

  function zoomBy(factor: number): void {
    const center = startSec // beim Knopf-Zoom auf den Start-Marker zentrieren
    setZoom((z) => {
      const nz = Math.max(1, Math.min(64, z * factor))
      const nViewDur = duration / nz
      setOffset(Math.max(0, Math.min(center - nViewDur / 2, duration - nViewDur)))
      return nz
    })
  }

  function stopPreview(): void {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayT(null)
    setPlaying(false)
  }

  function togglePreview(): void {
    if (audioRef.current) {
      stopPreview()
      return
    }
    if (!data) return
    setPlaying(true)
    const stop = endSec ?? data.duration
    const el = new Audio(`${JINGLE_PROTOCOL}://library/${storedName}`)
    el.volume = volume
    el.currentTime = startSec
    const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    if (typeof withSink.setSinkId === 'function')
      withSink.setSinkId(outputDeviceId || 'default').catch(() => {})
    audioRef.current = el
    el.addEventListener('timeupdate', () => {
      if (audioRef.current !== el) return
      if (el.currentTime >= stop) stopPreview()
      else setPlayT(el.currentTime)
    })
    el.addEventListener('ended', stopPreview)
    void el.play().catch(stopPreview)
  }

  // Marker-Positionen im sichtbaren Fenster (%) bzw. außerhalb -> Griff ausblenden
  const startInView = startSec >= viewStart && startSec <= viewEnd
  const endInView = end >= viewStart && end <= viewEnd
  const startPct = ((startSec - viewStart) / viewDur) * 100
  const endPct = ((end - viewStart) / viewDur) * 100
  const dimLeft = clamp01((startSec - viewStart) / viewDur) * 100
  const dimRight = (1 - clamp01((end - viewStart) / viewDur)) * 100
  const thumbW = (1 / zoom) * 100
  const thumbLeft = duration > 0 ? (viewStart / duration) * 100 : 0

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative h-44 w-full select-none overflow-hidden rounded-md border border-border bg-black/40 light:bg-zinc-200"
      >
        {error ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Waveform nicht verfügbar
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Lade Waveform…
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block h-full w-full" />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-black/55 light:bg-black/20"
              style={{ width: `${dimLeft}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 bg-black/55 light:bg-black/20"
              style={{ width: `${dimRight}%` }}
            />
            {startInView && (
              <Handle pct={startPct} color={color} onDown={() => (drag.current = 'start')} />
            )}
            {endInView && (
              <Handle pct={endPct} color={color} onDown={() => (drag.current = 'end')} />
            )}
          </>
        )}
      </div>

      {/* Scroll-/Übersichtsleiste (nur wenn gezoomt) */}
      {data && zoom > 1.01 && (
        <div ref={trackRef} className="relative mt-1 h-2 w-full rounded-full bg-muted">
          <div
            onPointerDown={(e) => {
              e.preventDefault()
              drag.current = 'pan'
            }}
            className="absolute inset-y-0 cursor-grab rounded-full bg-primary/60 hover:bg-primary/80"
            style={{ left: `${thumbLeft}%`, width: `${thumbW}%` }}
          />
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!data} onClick={togglePreview}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? 'Stopp' : 'Vorschau'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data}
          onClick={() => {
            if (!data) return
            const { start, end: e } = detectSilence(data.peaks, data.duration)
            onChange(start <= 0.02 ? 0 : start, e >= data.duration - 0.05 ? null : e)
          }}
          title="Stille am Anfang/Ende automatisch wegschneiden"
        >
          <Scissors className="size-4" /> Stille trimmen
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!data || zoom <= 1.01}
            onClick={() => zoomBy(1 / 1.6)}
            title="Auszoomen"
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-9 text-center text-xs tabular-nums text-muted-foreground">
            {zoom.toFixed(1)}×
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={!data}
            onClick={() => zoomBy(1.6)}
            title="Hineinzoomen"
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <div className="flex-1" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {fmtMs(startSec)} – {fmtMs(end)}
        </span>
      </div>
    </div>
  )
}

function Handle({
  pct,
  color,
  onDown
}: {
  pct: number
  color: string
  onDown: () => void
}): JSX.Element {
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault()
        onDown()
      }}
      className="absolute inset-y-0 z-10 flex w-4 -translate-x-1/2 cursor-ew-resize items-stretch justify-center"
      style={{ left: `${pct}%` }}
    >
      <div className="h-full w-[3px] rounded-full" style={{ background: color }} />
    </div>
  )
}
