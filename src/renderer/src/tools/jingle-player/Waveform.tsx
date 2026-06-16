// Waveform-Editor für die Start-/Stopp-Marker eines Jingles. Dekodiert die Datei
// (Web Audio) zu Peaks, zeichnet sie auf ein Canvas, erlaubt das Ziehen zweier
// Marker, eine Vorschau-Wiedergabe des Ausschnitts (mit Abspielkopf) und das
// automatische Trimmen von Stille am Anfang/Ende. Peaks werden je Datei gecacht.

import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Scissors } from 'lucide-react'
import { JINGLE_PROTOCOL } from '@shared/ipc-contracts'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'

const BUCKETS = 800
const peakCache = new Map<string, { peaks: Float32Array; duration: number }>()

async function loadPeaks(storedName: string): Promise<{ peaks: Float32Array; duration: number }> {
  const cached = peakCache.get(storedName)
  if (cached) return cached
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ac = new Ctx()
  try {
    // Bytes per IPC holen (fetch auf jingle:// scheitert an CORS), dann dekodieren.
    const bytes = await api.jingles.bytes(storedName)
    if (!bytes) throw new Error('Datei nicht gefunden')
    const arr = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
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

function detectSilence(peaks: Float32Array, duration: number, threshold = 0.02): { start: number; end: number } {
  let s = 0
  let e = peaks.length - 1
  while (s < peaks.length && peaks[s] < threshold) s++
  while (e > s && peaks[e] < threshold) e--
  if (s >= e) return { start: 0, end: duration } // (fast) Stille überall -> nicht trimmen
  return { start: (s / peaks.length) * duration, end: ((e + 1) / peaks.length) * duration }
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const r = Math.floor(sec % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

interface Props {
  storedName: string
  color: string
  volume: number
  outputDeviceId: string
  startSec: number
  endSec: number | null
  onChange: (startSec: number, endSec: number | null) => void
}

export function Waveform({ storedName, color, volume, outputDeviceId, startSec, endSec, onChange }: Props): JSX.Element {
  const [data, setData] = useState<{ peaks: Float32Array; duration: number } | null>(null)
  const [error, setError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playT, setPlayT] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const drag = useRef<'start' | 'end' | null>(null)

  // refs für die window-Listener (immer aktuelle Werte)
  const stateRef = useRef({ startSec, endSec, duration: 0 })
  stateRef.current = { startSec, endSec, duration: data?.duration ?? 0 }
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let alive = true
    setData(null)
    setError(false)
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
    }
  }, [storedName])

  // Zeichnen
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
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)
    const dur = data.duration || 1
    const end = endSec ?? dur
    const mid = h / 2
    const barW = w / BUCKETS
    for (let i = 0; i < BUCKETS; i++) {
      const t = (i / BUCKETS) * dur
      const inRegion = t >= startSec && t <= end
      const amp = Math.max(1, data.peaks[i] * (h * 0.46))
      ctx.fillStyle = inRegion ? color : 'rgba(120,120,138,0.45)'
      ctx.fillRect(i * barW, mid - amp, Math.max(0.6, barW - 0.4), amp * 2)
    }
    // Abspielkopf
    if (playT != null) {
      const x = (playT / dur) * w
      ctx.fillStyle = '#fff'
      ctx.fillRect(x - 0.5, 0, 1.5, h)
    }
  }, [data, startSec, endSec, playT, color])

  function timeFromClientX(clientX: number): number {
    const wrap = wrapRef.current
    const dur = stateRef.current.duration
    if (!wrap || dur <= 0) return 0
    const rect = wrap.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * dur
  }

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (!drag.current) return
      const { duration, startSec: st, endSec: en } = stateRef.current
      const end = en ?? duration
      let t = timeFromClientX(e.clientX)
      if (drag.current === 'start') {
        t = Math.max(0, Math.min(t, end - 0.05))
        onChangeRef.current(t <= 0.05 ? 0 : t, en)
      } else {
        t = Math.max(st + 0.05, Math.min(t, duration))
        onChangeRef.current(st, t >= duration - 0.15 ? null : t)
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
    const end = endSec ?? data.duration
    const el = new Audio(`${JINGLE_PROTOCOL}://library/${storedName}`)
    el.volume = volume
    el.currentTime = startSec
    const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
    if (typeof withSink.setSinkId === 'function') withSink.setSinkId(outputDeviceId || 'default').catch(() => {})
    audioRef.current = el
    const tick = (): void => {
      if (audioRef.current !== el) return
      if (el.currentTime >= end) {
        stopPreview()
        return
      }
      setPlayT(el.currentTime)
    }
    el.addEventListener('timeupdate', tick)
    el.addEventListener('ended', stopPreview)
    void el.play().catch(() => stopPreview())
  }

  const dur = data?.duration ?? 0
  const startPct = dur > 0 ? (startSec / dur) * 100 : 0
  const endPct = dur > 0 ? ((endSec ?? dur) / dur) * 100 : 100

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative h-24 w-full overflow-hidden rounded-md border border-border bg-black/40 select-none"
      >
        {error ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Waveform nicht verfügbar
          </div>
        ) : !data ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Lade Waveform…</div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block h-full w-full" />
            {/* abgedunkelte Bereiche außerhalb der Region */}
            <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/55" style={{ width: `${startPct}%` }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/55" style={{ width: `${100 - endPct}%` }} />
            {/* Marker-Griffe (breite, unsichtbare Trefferzone) */}
            <Handle pct={startPct} color={color} onDown={() => (drag.current = 'start')} />
            <Handle pct={endPct} color={color} onDown={() => (drag.current = 'end')} />
          </>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
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
            const { start, end } = detectSilence(data.peaks, data.duration)
            onChange(start <= 0.05 ? 0 : start, end >= data.duration - 0.15 ? null : end)
          }}
          title="Stille am Anfang/Ende automatisch wegschneiden"
        >
          <Scissors className="size-4" /> Stille trimmen
        </Button>
        <div className="flex-1" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {fmt(startSec)} – {fmt(endSec ?? dur)}
          {dur > 0 ? ` (${fmt(dur)})` : ''}
        </span>
      </div>
    </div>
  )
}

function Handle({ pct, color, onDown }: { pct: number; color: string; onDown: () => void }): JSX.Element {
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
