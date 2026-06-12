// Audio-Engine des Jingle-Players. Pro Pad ein <audio>-Element (lazy), Ausgabe
// über setSinkId auf das gewählte Gerät, sanftes Fade-Out beim Stoppen. Liefert
// laufende Pads + Fortschritt für die Anzeige. Der main-Prozess ist hier NICHT
// beteiligt – reine Renderer-Wiedergabe (Dateien via jingle://).

import { useCallback, useEffect, useRef, useState } from 'react'
import { JINGLE_PROTOCOL } from '@shared/ipc-contracts'
import type { Pad } from './store'

interface EngineArgs {
  pads: Pad[]
  outputDeviceId: string
  soloMode: boolean
}

interface AudioEntry {
  el: HTMLAudioElement
  storedName: string
  fade: ReturnType<typeof setInterval> | null
}

interface Engine {
  playing: Record<string, boolean>
  progress: Record<string, number>
  trigger: (padId: string) => void
  stop: (padId: string) => void
  stopAll: () => void
}

function setSink(el: HTMLAudioElement, id: string): void {
  const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
  if (typeof withSink.setSinkId === 'function') {
    withSink.setSinkId(id || 'default').catch(() => {
      /* Gerät evtl. verschwunden -> Standard bleibt aktiv */
    })
  }
}

export function useJingleEngine({ pads, outputDeviceId, soloMode }: EngineArgs): Engine {
  const entries = useRef<Map<string, AudioEntry>>(new Map())
  const padsRef = useRef(pads)
  const soloRef = useRef(soloMode)
  const sinkRef = useRef(outputDeviceId)
  padsRef.current = pads
  soloRef.current = soloMode
  sinkRef.current = outputDeviceId

  const [playing, setPlaying] = useState<Record<string, boolean>>({})
  const [progress, setProgress] = useState<Record<string, number>>({})
  const raf = useRef<number>(0)

  const markPlaying = useCallback((id: string, on: boolean): void => {
    setPlaying((prev) => {
      if (!!prev[id] === on) return prev
      const next = { ...prev }
      if (on) next[id] = true
      else delete next[id]
      return next
    })
  }, [])

  const clearFade = (e: AudioEntry): void => {
    if (e.fade) {
      clearInterval(e.fade)
      e.fade = null
    }
  }

  // Pad -> Audio-Element (lädt bei Bedarf, hält das Element je storedName aktuell).
  const ensure = useCallback((pad: Pad): AudioEntry | null => {
    if (!pad.storedName) return null
    let e = entries.current.get(pad.id)
    if (e && e.storedName !== pad.storedName) {
      e.el.pause()
      entries.current.delete(pad.id)
      e = undefined
    }
    if (!e) {
      const el = new Audio(`${JINGLE_PROTOCOL}://library/${pad.storedName}`)
      el.preload = 'auto'
      setSink(el, sinkRef.current)
      const entry: AudioEntry = { el, storedName: pad.storedName, fade: null }
      el.addEventListener('ended', () => {
        if (!el.loop) markPlaying(pad.id, false)
      })
      entries.current.set(pad.id, entry)
      e = entry
    }
    return e
  }, [markPlaying])

  const stop = useCallback(
    (padId: string): void => {
      const e = entries.current.get(padId)
      if (!e) return
      const pad = padsRef.current.find((p) => p.id === padId)
      const fadeMs = pad?.fadeMs ?? 300
      clearFade(e)
      if (e.el.paused) {
        markPlaying(padId, false)
        return
      }
      if (fadeMs <= 0) {
        e.el.pause()
        e.el.currentTime = 0
        markPlaying(padId, false)
        return
      }
      const steps = Math.max(1, Math.round(fadeMs / 25))
      const from = e.el.volume
      let i = 0
      e.fade = setInterval(() => {
        i++
        e.el.volume = Math.max(0, from * (1 - i / steps))
        if (i >= steps) {
          clearFade(e)
          e.el.pause()
          e.el.currentTime = 0
          markPlaying(padId, false)
        }
      }, 25)
    },
    [markPlaying]
  )

  const stopAll = useCallback((): void => {
    for (const id of entries.current.keys()) stop(id)
  }, [stop])

  const trigger = useCallback(
    (padId: string): void => {
      const pad = padsRef.current.find((p) => p.id === padId)
      if (!pad || !pad.storedName) return
      const e = ensure(pad)
      if (!e) return

      // Toggle-Pad, das gerade läuft -> stoppen.
      if (pad.mode === 'toggle' && !e.el.paused) {
        stop(padId)
        return
      }
      if (soloRef.current) {
        for (const id of entries.current.keys()) if (id !== padId) stop(id)
      }
      clearFade(e)
      e.el.loop = pad.loop
      e.el.volume = pad.volume
      e.el.currentTime = 0
      void e.el.play().then(() => markPlaying(padId, true)).catch(() => {})
    },
    [ensure, stop, markPlaying]
  )

  // Lautstärke/Sink/Loop laufender Elemente an Änderungen anpassen.
  useEffect(() => {
    for (const pad of pads) {
      const e = entries.current.get(pad.id)
      if (!e) continue
      if (!e.fade) e.el.volume = pad.volume
      e.el.loop = pad.loop
    }
  }, [pads])

  useEffect(() => {
    for (const e of entries.current.values()) setSink(e.el, outputDeviceId)
  }, [outputDeviceId])

  // Fortschritts-Schleife, solange etwas läuft.
  const hasPlaying = Object.keys(playing).length > 0
  useEffect(() => {
    if (!hasPlaying) {
      setProgress((p) => (Object.keys(p).length ? {} : p))
      return
    }
    let last = 0
    const loop = (t: number): void => {
      if (t - last > 80) {
        last = t
        const next: Record<string, number> = {}
        for (const [id, e] of entries.current) {
          if (!e.el.paused && e.el.duration > 0) next[id] = e.el.currentTime / e.el.duration
        }
        setProgress(next)
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [hasPlaying])

  // Aufräumen beim Verlassen des Tools.
  useEffect(() => {
    const map = entries.current
    return () => {
      for (const e of map.values()) {
        if (e.fade) clearInterval(e.fade)
        e.el.pause()
        e.el.src = ''
      }
      map.clear()
    }
  }, [])

  return { playing, progress, trigger, stop, stopAll }
}
