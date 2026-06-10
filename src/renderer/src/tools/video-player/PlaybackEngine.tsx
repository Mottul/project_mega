import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import { currentItem, EMPTY_PLAYER_STATE, nextIndex } from '@shared/player'
import type { MediaItem, PatternId, PlayerState } from '@shared/types'
import { IdlePattern } from './IdlePattern'

interface EngineProps {
  /** 'fill' für die Wand (1:1 eingebacken), 'contain' für die kleine Vorschau. */
  objectFit?: 'fill' | 'contain'
  debug?: boolean
}

// Gemeinsame Wiedergabe-Engine. Zwei Ebenen (0/1), jede hält ein <video> ODER
// <img>. Das aktuelle Medium läuft aktiv, das nächste wird in der inaktiven Ebene
// vorgeladen -> nahtloser Wechsel. Übergänge per Opazität (cut = 0ms, crossfade),
// Audio wird zur Vermeidung von Knacksern weich ein-/ausgeblendet. Beim Wechsel
// wird die alte Ebene aktiv pausiert (sonst doppelter Ton); das Vorladen erfolgt
// erst NACH der Überblendung (sonst blitzt das nächste Medium kurz auf).
//
// Der main-Prozess bleibt autoritativ; diese Engine meldet nur Position/Ende.
export function PlaybackEngine({ objectFit = 'fill', debug = false }: EngineProps): JSX.Element {
  const [state, setState] = useState<PlayerState>(EMPTY_PLAYER_STATE)
  const [active, setActive] = useState(0)

  const stateRef = useRef<PlayerState>(EMPTY_PLAYER_STATE)
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null])
  const imgRefs = useRef<(HTMLImageElement | null)[]>([null, null])
  const slotItems = useRef<(MediaItem | null)[]>([null, null])
  const activeRef = useRef(0)
  const lastSeek = useRef(-1)
  const engaged = useRef<{ id: string | null; playing: boolean }>({ id: null, playing: false })

  const rampTimers = useRef<(ReturnType<typeof setInterval> | null)[]>([null, null])
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const imageElapsed = useRef(0)
  const imageItemId = useRef<string | null>(null)

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

  function assignSlot(slot: number, item: MediaItem | null): void {
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

  function startImageTimer(item: MediaItem, playing: boolean, durationSec: number, fresh: boolean): void {
    if (fresh) {
      imageItemId.current = item.id
      imageElapsed.current = 0
    }
    clearImageTimer()
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
    v.muted = state.muted
    if (state.playing) {
      const start = swapped || isNew || !engaged.current.playing
      if (start) {
        v.volume = state.muted ? state.volume : 0
        void v.play().catch(() => {})
        fadeAudio(slot, state.volume, swapped ? xMs : 120)
      } else if (!rampTimers.current[slot]) {
        v.volume = state.volume
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
    let targetSlot = a
    if (slotItems.current[a]?.id === curr.id) targetSlot = a
    else if (slotItems.current[other]?.id === curr.id) targetSlot = other
    else {
      assignSlot(other, curr)
      targetSlot = other
    }

    const swapped = targetSlot !== a
    const xMs = state.transition === 'crossfade' ? state.transitionMs : 0

    if (swapped) {
      // alte Ebene: Audio ausblenden + pausieren (kein Doppel-Ton)
      const old = a
      fadeAudio(old, 0, Math.min(150, xMs || 80), () => {
        const vi = videoRefs.current[old]
        if (vi && slotItems.current[old]?.kind !== 'image') vi.pause()
      })
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
    const videos = videoRefs.current
    return () => {
      rampTimers.current.forEach((t) => t && clearInterval(t))
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
    if (slot !== activeRef.current) return
    const item = slotItems.current[slot]
    if (item && (item.kind === 'image' || videoRefs.current[slot]?.loop)) return
    void api.player.command({ type: 'ended' })
  }

  function onVideoTime(slot: number): void {
    if (slot !== activeRef.current) return
    const v = videoRefs.current[slot]
    if (v && Number.isFinite(v.duration)) void api.player.report(v.currentTime, v.duration || 0)
  }

  const curr = currentItem(state)
  const xDur = state.transition === 'crossfade' ? state.transitionMs : 0

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
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
            style={{ width: '100%', height: '100%', objectFit, display: 'none', background: '#000' }}
          />
          <img
            ref={(el) => (imgRefs.current[i] = el)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit, display: 'none', background: '#000' }}
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
              style={{ width: '100%', height: '100%', objectFit: objectFit === 'contain' ? 'contain' : 'cover' }}
            />
          ) : (
            <img
              key={state.idleMediaUrl}
              src={state.idleMediaUrl}
              style={{ width: '100%', height: '100%', objectFit: objectFit === 'contain' ? 'contain' : 'cover' }}
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
