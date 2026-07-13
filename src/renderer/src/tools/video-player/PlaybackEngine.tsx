import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import { currentItem, EMPTY_PLAYER_STATE, nextIndex, tickerStripPx } from '@shared/player'
import { TickerStrip } from './TickerStrip'
import type { MediaItem, PatternId, PlayerState } from '@shared/types'
import { IdlePattern } from './IdlePattern'

interface EngineProps {
  /** 'fill' für die Wand (1:1 eingebacken), 'contain' für die kleine Vorschau. */
  objectFit?: 'fill' | 'contain'
  debug?: boolean
  /** Passiver Spiegel: zeigt nur, treibt NICHT (keine Positions-/Ende-Meldung,
   *  immer stumm). Für eine bewegte Vorschau NEBEN dem autoritativen
   *  Ausgabefenster – sonst gäbe es doppelte „ended"-Sprünge und doppelten Ton. */
  passive?: boolean
  /** Kleine FPS-Anzeige (tatsächlich dargestellte Videobilder/s) oben rechts. */
  showFps?: boolean
}

// Gemeinsame Wiedergabe-Engine. Zwei Ebenen (0/1), jede hält ein <video> ODER
// <img>. Das aktuelle Medium läuft aktiv, das nächste wird in der inaktiven Ebene
// vorgeladen -> nahtloser Wechsel. Übergänge per Opazität (cut = 0ms, crossfade),
// Audio wird zur Vermeidung von Knacksern weich ein-/ausgeblendet.
//
// Crossfade ist ein ECHTER Overlap: kurz vor dem natürlichen Ende (Restzeit =
// Überblenddauer) meldet die Engine 'ended' vor -> das nächste Medium startet,
// während das alte WEITERLÄUFT und erst nach Abschluss der Blende pausiert wird
// (kein eingefrorenes Schlussbild). Das Vorladen des übernächsten Mediums erfolgt
// erst NACH der Überblendung (sonst blitzt es kurz auf).
//
// Der main-Prozess bleibt autoritativ; diese Engine meldet nur Position/Ende.
export function PlaybackEngine({
  objectFit = 'fill',
  debug = false,
  passive = false,
  showFps = false
}: EngineProps): JSX.Element {
  const [state, setState] = useState<PlayerState>(EMPTY_PLAYER_STATE)
  const [active, setActive] = useState(0)
  const [fps, setFps] = useState<number | null>(null)

  const stateRef = useRef<PlayerState>(EMPTY_PLAYER_STATE)
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null])
  const imgRefs = useRef<(HTMLImageElement | null)[]>([null, null])
  const slotItems = useRef<(MediaItem | null)[]>([null, null])
  const activeRef = useRef(0)
  const lastSeek = useRef(-1)
  const engaged = useRef<{ id: string | null; playing: boolean }>({ id: null, playing: false })

  const rampTimers = useRef<(ReturnType<typeof setInterval> | null)[]>([null, null])
  const pauseTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([null, null])
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const imageElapsed = useRef(0)
  const imageItemId = useRef<string | null>(null)
  // seekSeq, fuer den bereits ein vorgezogenes 'ended' gemeldet wurde (Overlap);
  // jeder Titelwechsel/Seek erhoeht seekSeq -> Guard re-armiert sich automatisch.
  const earlyEndedAt = useRef(-1)

  useEffect(() => {
    void api.player.getState().then((s) => {
      stateRef.current = s
      setState(s)
    })
    return api.player.onState((s) => {
      stateRef.current = s
      setState(s)
    })
  }, [])

  function setActiveSlot(s: number): void {
    activeRef.current = s
    setActive(s)
  }

  // ---- Audio-Fade (verhindert Knackser bei Play/Pause/Übergang) ----
  function fadeAudio(slot: number, target: number, ms: number, onDone?: () => void): void {
    const v = videoRefs.current[slot]
    if (rampTimers.current[slot]) {
      clearInterval(rampTimers.current[slot]!)
      rampTimers.current[slot] = null
    }
    if (!v) return
    if (v.muted || ms <= 0) {
      v.volume = Math.max(0, Math.min(1, target))
      onDone?.()
      return
    }
    const steps = Math.max(1, Math.round(ms / 25))
    const from = v.volume
    let i = 0
    rampTimers.current[slot] = setInterval(() => {
      i++
      const t = Math.min(1, i / steps)
      v.volume = Math.max(0, Math.min(1, from + (target - from) * t))
      if (i >= steps) {
        clearInterval(rampTimers.current[slot]!)
        rampTimers.current[slot] = null
        onDone?.()
      }
    }, 25)
  }

  function clearImageTimer(): void {
    if (imageTimer.current) {
      clearInterval(imageTimer.current)
      imageTimer.current = null
    }
  }

  function clearPauseTimer(slot: number): void {
    if (pauseTimers.current[slot]) {
      clearTimeout(pauseTimers.current[slot]!)
      pauseTimers.current[slot] = null
    }
  }

  function assignSlot(slot: number, item: MediaItem | null): void {
    clearPauseTimer(slot)
    const v = videoRefs.current[slot]
    const img = imgRefs.current[slot]
    slotItems.current[slot] = item
    if (!v || !img) return
    if (!item) {
      v.pause()
      v.removeAttribute('src')
      v.load()
      v.style.display = 'none'
      img.removeAttribute('src')
      img.style.display = 'none'
      return
    }
    if (item.kind === 'image') {
      img.src = item.url
      img.style.display = 'block'
      v.pause()
      v.removeAttribute('src')
      v.load()
      v.style.display = 'none'
    } else {
      if (v.getAttribute('src') !== item.url) {
        v.src = item.url
        v.load()
      }
      v.style.display = 'block'
      img.removeAttribute('src')
      img.style.display = 'none'
    }
  }

  function startImageTimer(
    item: MediaItem,
    playing: boolean,
    durationSec: number,
    fresh: boolean
  ): void {
    if (fresh) {
      imageItemId.current = item.id
      imageElapsed.current = 0
    }
    clearImageTimer()
    if (passive) return // Spiegel: Bild nur anzeigen, nicht weiterschalten
    void api.player.report(Math.min(imageElapsed.current, durationSec), durationSec)
    if (!playing) return
    imageTimer.current = setInterval(() => {
      imageElapsed.current += 0.25
      void api.player.report(Math.min(imageElapsed.current, durationSec), durationSec)
      if (imageElapsed.current >= durationSec) {
        clearImageTimer()
        void api.player.command({ type: 'ended' })
      }
    }, 250)
  }

  function syncPlayback(slot: number, item: MediaItem, swapped: boolean, xMs: number): void {
    const isNew = engaged.current.id !== item.id
    if (item.kind === 'image') {
      startImageTimer(item, state.playing, state.imageDurationSec, isNew || swapped)
      engaged.current = { id: item.id, playing: state.playing }
      return
    }
    clearImageTimer()
    imageItemId.current = null
    const v = videoRefs.current[slot]
    if (!v) return
    v.loop = state.loop === 'one' || (state.playlist.length === 1 && state.loop === 'all')
    // Spiegel normalerweise stumm (Ton kommt vom Ausgabefenster).
    const vol = state.volume
    v.muted = passive || state.muted
    if (state.playing) {
      const start = swapped || isNew || !engaged.current.playing
      if (start) {
        v.volume = v.muted ? vol : 0
        void v.play().catch(() => {})
        fadeAudio(slot, vol, swapped ? xMs : 120)
      } else if (!rampTimers.current[slot]) {
        v.volume = vol
      }
    } else if (engaged.current.playing || !v.paused) {
      fadeAudio(slot, 0, 100, () => v.pause())
    } else {
      v.pause()
    }
    engaged.current = { id: item.id, playing: state.playing }
  }

  function schedulePreload(curr: MediaItem, delayMs: number): void {
    if (preloadTimer.current) {
      clearTimeout(preloadTimer.current)
      preloadTimer.current = null
    }
    const run = (): void => {
      const s = stateRef.current
      const ni = nextIndex(s)
      const nxt = ni >= 0 ? s.playlist[ni] : null
      const inactive = activeRef.current ^ 1
      if (nxt && nxt.id !== curr.id && slotItems.current[inactive]?.id !== nxt.id) {
        assignSlot(inactive, nxt)
      }
    }
    if (delayMs > 0) preloadTimer.current = setTimeout(run, delayMs)
    else run()
  }

  // Steuer-Controller: reagiert auf strukturelle Zustandsänderungen.
  useEffect(() => {
    const curr = currentItem(state)
    if (!curr) {
      ;[0, 1].forEach((s) => assignSlot(s, null))
      engaged.current = { id: null, playing: false }
      clearImageTimer()
      return
    }

    const a = activeRef.current
    const other = a ^ 1
    let targetSlot: number
    if (slotItems.current[a]?.id === curr.id) targetSlot = a
    else if (slotItems.current[other]?.id === curr.id) targetSlot = other
    else {
      assignSlot(other, curr)
      targetSlot = other
    }

    const swapped = targetSlot !== a
    const xMs = state.transition === 'crossfade' ? state.transitionMs : 0

    if (swapped) {
      // Alte Ebene: Audio über die volle Blende ausfaden. Pausiert wird erst NACH
      // Abschluss der Blende und unabhängig vom Audio (läuft auch muted weiter)
      // -> echter Overlap statt eingefrorenem Schlussbild.
      const old = a
      clearPauseTimer(old)
      fadeAudio(old, 0, xMs || 80)
      pauseTimers.current[old] = setTimeout(
        () => {
          pauseTimers.current[old] = null
          if (old === activeRef.current) return // inzwischen wieder aktiv -> nicht anfassen
          const vi = videoRefs.current[old]
          if (vi && slotItems.current[old]?.kind !== 'image') vi.pause()
        },
        (xMs || 80) + 30
      )
      clearPauseTimer(targetSlot)
      setActiveSlot(targetSlot)
    }

    if (state.seekSeq !== lastSeek.current) {
      lastSeek.current = state.seekSeq
      const v = videoRefs.current[targetSlot]
      if (curr.kind !== 'image' && v) {
        try {
          v.currentTime = state.positionSec
        } catch {
          /* noch nicht ladbar */
        }
      } else if (curr.kind === 'image') {
        imageElapsed.current = state.positionSec
      }
    }

    syncPlayback(targetSlot, curr, swapped, xMs)
    schedulePreload(curr, swapped ? (xMs || 80) + 60 : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  useEffect(() => {
    // stabile Array-/Element-Referenzen einfangen (Einträge werden mutiert,
    // die Arrays selbst nie ersetzt) -> Cleanup sieht die aktuellen Timer
    const videos = videoRefs.current
    const ramps = rampTimers.current
    const pauses = pauseTimers.current
    return () => {
      ramps.forEach((t) => t && clearInterval(t))
      pauses.forEach((t) => t && clearTimeout(t))
      if (preloadTimer.current) clearTimeout(preloadTimer.current)
      clearImageTimer()
      // Videos beim Unmount aktiv stoppen (z.B. Vorschau weicht dem Vollbild)
      videos.forEach((v) => {
        if (v) {
          v.pause()
          v.removeAttribute('src')
        }
      })
    }
  }, [])

  function onVideoEnded(slot: number): void {
    if (passive) return // Spiegel schaltet nicht weiter – das macht das Ausgabefenster
    if (slot !== activeRef.current) return
    const item = slotItems.current[slot]
    if (item && (item.kind === 'image' || videoRefs.current[slot]?.loop)) return
    void api.player.command({ type: 'ended' })
  }

  function onVideoTime(slot: number): void {
    if (passive) return // Spiegel meldet keine Position/kein Ende
    if (slot !== activeRef.current) return
    const v = videoRefs.current[slot]
    if (!v || !Number.isFinite(v.duration)) return
    void api.player.report(v.currentTime, v.duration || 0)

    // Overlap-Crossfade: Restzeit = Überblenddauer -> 'ended' VORZIEHEN, damit das
    // nächste Medium startet, während dieses noch läuft. Pro seekSeq nur einmal
    // (jeder Titelwechsel/Seek erhöht seekSeq und re-armiert den Guard).
    const s = stateRef.current
    if (s.transition !== 'crossfade' || !s.playing || v.loop || v.paused) return
    const xSec = s.transitionMs / 1000
    if (v.duration <= xSec + 1) return // zu kurz -> normaler Wechsel am echten Ende
    if (v.duration - v.currentTime > xSec) return
    if (earlyEndedAt.current === s.seekSeq) return
    const ni = nextIndex(s)
    const nxt = ni >= 0 ? s.playlist[ni] : null
    // Ohne (anderes) Folge-Medium kein Overlap möglich -> natürliches Ende abwarten.
    if (!nxt || nxt.id === slotItems.current[slot]?.id) return
    earlyEndedAt.current = s.seekSeq
    void api.player.command({ type: 'ended' })
  }

  // FPS-Anzeige: tatsächlich dargestellte Videobilder/s des aktiven <video>
  // (per getVideoPlaybackQuality gepollt). 0 = pausiert/Bild/kein Video.
  useEffect(() => {
    if (!showFps) {
      setFps(null)
      return
    }
    let prev = -1
    const id = setInterval(() => {
      const v = videoRefs.current[activeRef.current]
      if (!v || v.paused || v.ended || typeof v.getVideoPlaybackQuality !== 'function') {
        setFps(0)
        prev = -1
        return
      }
      const q = v.getVideoPlaybackQuality()
      const shown = q.totalVideoFrames - q.droppedVideoFrames
      if (prev >= 0) setFps(Math.max(0, shown - prev))
      prev = shown
    }, 1000)
    return () => clearInterval(id)
  }, [showFps])

  // Audio-Ausgabegerät: nur wo diese Instanz tatsächlich Ton produziert (nicht
  // im passiven Spiegel). setSinkId ist ein Element-Feature -- einmal gesetzt,
  // bleibt es auch beim Quellwechsel (assignSlot) erhalten.
  useEffect(() => {
    if (passive) return
    const id = state.outputAudioDeviceId || 'default'
    for (const v of videoRefs.current) {
      const withSink = v as
        (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null
      if (withSink && typeof withSink.setSinkId === 'function') {
        withSink.setSinkId(id).catch(() => {
          // Gerät nicht (mehr) verfügbar -> beim Systemstandard bleiben
        })
      }
    }
  }, [passive, state.outputAudioDeviceId])

  const curr = currentItem(state)
  const xDur = state.transition === 'crossfade' ? state.transitionMs : 0
  // Laufschrift (LED-Trailer): reserviert unten einen Streifen; der Medienbereich
  // schrumpft anteilig (die Ausgabe skaliert die Wand formatfüllend).
  const stripFrac = state.wall.height > 0 ? tickerStripPx(state) / state.wall.height : 0

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: stripFrac > 0 ? `${stripFrac * 100}%` : 0
        }}
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: i === active ? 1 : 0,
              transition: `opacity ${xDur}ms linear`,
              zIndex: i === active ? 2 : 1
            }}
          >
            <video
              ref={(el) => (videoRefs.current[i] = el)}
              playsInline
              preload="auto"
              onEnded={() => onVideoEnded(i)}
              onTimeUpdate={() => onVideoTime(i)}
              style={{
                width: '100%',
                height: '100%',
                objectFit,
                display: 'none',
                background: '#000'
              }}
            />
            <img
              ref={(el) => (imgRefs.current[i] = el)}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit,
                display: 'none',
                background: '#000'
              }}
            />
          </div>
        ))}

        {!curr && state.idlePattern === 'custom' && state.idleMediaUrl && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 3, background: '#000' }}>
            {state.idleMediaKind === 'video' ? (
              <video
                key={state.idleMediaUrl}
                src={state.idleMediaUrl}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: objectFit === 'contain' ? 'contain' : 'cover'
                }}
              />
            ) : (
              <img
                key={state.idleMediaUrl}
                src={state.idleMediaUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: objectFit === 'contain' ? 'contain' : 'cover'
                }}
              />
            )}
          </div>
        )}
        {!curr && state.idlePattern !== 'off' && state.idlePattern !== 'custom' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
            <IdlePattern pattern={state.idlePattern as PatternId} />
          </div>
        )}
        {/* idlePattern 'off' -> bewusst nichts: reines Schwarz auf der Ausgabe (kein Text). */}
      </div>

      {stripFrac > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${stripFrac * 100}%`,
            zIndex: 4
          }}
        >
          <TickerStrip ticker={state.ticker} />
        </div>
      )}

      {showFps && fps != null && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            zIndex: 10,
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            font: '600 11px ui-monospace, monospace',
            padding: '2px 6px',
            borderRadius: 4,
            pointerEvents: 'none'
          }}
        >
          {fps} fps
        </div>
      )}

      {debug && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 10,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            font: '12px monospace',
            padding: '8px 10px',
            borderRadius: 6,
            whiteSpace: 'pre'
          }}
        >
          {`aktiv: Ebene ${active}\n` +
            `aktuell: ${curr?.title ?? '—'} (${curr?.kind ?? '-'})\n` +
            `index: ${state.index}/${state.playlist.length}  loop:${state.loop}  übergang:${state.transition}\n` +
            `pos: ${state.positionSec.toFixed(1)} / ${state.durationSec.toFixed(1)}s  ${state.playing ? '▶' : '⏸'}`}
        </div>
      )}
    </div>
  )
}
