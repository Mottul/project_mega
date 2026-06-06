import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import { currentItem, EMPTY_PLAYER_STATE, nextIndex } from '@shared/player'
import type { MediaItem, PlayerState } from '@shared/types'

// Inhalt des rahmenlosen Vollbild-Ausgabefensters (#/player-output).
//
// Doppelpuffer für nahtlose Übergänge: zwei Ebenen (0/1), jede kann ein <video>
// ODER <img> halten. Das aktuelle Medium läuft in der aktiven Ebene, das NÄCHSTE
// wird in der inaktiven bereits vorgeladen. Endet das aktuelle, hat das main den
// Index schon weitergeschaltet -> wir blenden auf die bereits gepufferte Ebene um
// (kein Nachladen, daher praktisch lückenlos).
//
// Der main-Prozess bleibt autoritativ; dieses Fenster meldet nur Position/Ende.
export function PlayerOutput(): JSX.Element {
  const [state, setState] = useState<PlayerState>(EMPTY_PLAYER_STATE)
  const [active, setActive] = useState(0)
  const [debug, setDebug] = useState(false)

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null])
  const imgRefs = useRef<(HTMLImageElement | null)[]>([null, null])
  const slotItems = useRef<(MediaItem | null)[]>([null, null])
  const activeRef = useRef(0)
  const lastSeek = useRef(-1)

  // Bild-Standzeit-Steuerung
  const imageTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const imageElapsed = useRef(0)
  const imageItemId = useRef<string | null>(null)

  useEffect(() => {
    void api.player.getState().then(setState)
    const off = api.player.onState(setState)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'd' || e.key === 'D') setDebug((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function setActiveSlot(s: number): void {
    activeRef.current = s
    setActive(s)
  }

  function clearImageTimer(): void {
    if (imageTimer.current) {
      clearInterval(imageTimer.current)
      imageTimer.current = null
    }
  }

  // Belegt eine Ebene mit einem Medium (oder leert sie). Imperativ, damit das
  // Vorladen nicht von React-Renderzyklen abhängt.
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

  function startImageTimerIfNeeded(item: MediaItem, playing: boolean, durationSec: number): void {
    if (imageItemId.current !== item.id) {
      imageItemId.current = item.id
      imageElapsed.current = 0
    }
    clearImageTimer()
    void api.player.report(imageElapsed.current, durationSec)
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

  function applyActive(s: PlayerState, slot: number): void {
    const item = slotItems.current[slot]
    if (!item) {
      clearImageTimer()
      return
    }
    if (item.kind === 'image') {
      startImageTimerIfNeeded(item, s.playing, s.imageDurationSec)
      return
    }
    clearImageTimer()
    imageItemId.current = null
    const v = videoRefs.current[slot]
    if (!v) return
    v.muted = s.muted
    v.volume = s.volume
    v.loop = s.loop === 'one' || (s.playlist.length === 1 && s.loop === 'all')
    if (s.playing) void v.play().catch(() => {})
    else v.pause()
  }

  // Steuer-Controller: reagiert NUR auf strukturelle Zustandsänderungen
  // (Index/Play/Loop/Seek/Playlist) – Positions-Ticks laufen separat.
  useEffect(() => {
    const curr = currentItem(state)
    if (!curr) {
      assignSlot(0, null)
      assignSlot(1, null)
      clearImageTimer()
      return
    }

    let a = activeRef.current
    const other = a ^ 1
    if (slotItems.current[a]?.id === curr.id) {
      // bereits in der aktiven Ebene
    } else if (slotItems.current[other]?.id === curr.id) {
      setActiveSlot(other) // vorgeladene Ebene wird aktiv -> nahtlos
      a = other
    } else {
      assignSlot(other, curr)
      setActiveSlot(other)
      a = other
    }

    // Seek anwenden (nur bei neuer Seek-Marke)
    if (state.seekSeq !== lastSeek.current) {
      lastSeek.current = state.seekSeq
      const v = videoRefs.current[a]
      if (v && curr.kind !== 'image') {
        try {
          v.currentTime = state.positionSec
        } catch {
          /* noch nicht ladbar -> ignorieren */
        }
      } else if (curr.kind === 'image') {
        imageElapsed.current = state.positionSec
      }
    }

    applyActive(state, a)

    // nächstes Medium in die inaktive Ebene vorladen
    const ni = nextIndex(state)
    const nxt = ni >= 0 ? state.playlist[ni] : null
    const inactive = a ^ 1
    if (nxt && nxt.id !== curr.id && slotItems.current[inactive]?.id !== nxt.id) {
      assignSlot(inactive, nxt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

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

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: i === active ? 1 : 0,
            transition: 'opacity 120ms linear',
            zIndex: i === active ? 2 : 1
          }}
        >
          <video
            ref={(el) => (videoRefs.current[i] = el)}
            playsInline
            preload="auto"
            onEnded={() => onVideoEnded(i)}
            onTimeUpdate={() => onVideoTime(i)}
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'none', background: '#000' }}
          />
          <img
            ref={(el) => (imgRefs.current[i] = el)}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'none', background: '#000' }}
          />
        </div>
      ))}

      {!curr && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3f3f46',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '2vw',
            zIndex: 3
          }}
        >
          Keine Wiedergabe
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
            `index: ${state.index}/${state.playlist.length}  loop:${state.loop}  shuffle:${state.shuffle ? 'an' : 'aus'}\n` +
            `pos: ${state.positionSec.toFixed(1)} / ${state.durationSec.toFixed(1)}s  ${state.playing ? '▶' : '⏸'}`}
        </div>
      )}
    </div>
  )
}
