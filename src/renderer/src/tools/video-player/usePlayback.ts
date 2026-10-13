// Wiedergabeposition des Video-Players: Tick aus dem main, Ziehen am Positionsregler (ohne
// Zurückspringen nach dem Loslassen) und die Tastatursteuerung. Leiste und Wiedergabe lesen
// dieselbe Position.

import { useEffect, useRef, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { MediaItem, PlayerState } from '@shared/types'

export interface Playback {
  current: MediaItem | null
  /** Anzeige-Position: aktives Ziehen > committe Zielposition > Tick > Zustand */
  position: number
  duration: number
  seekable: boolean
  /** Regler wird gezogen (noch nicht suchen) */
  scrubTo: (sec: number) => void
  /** Loslassen: einmal suchen und die Zielposition halten */
  commitSeek: () => void
}

export function usePlayback(pstate: PlayerState): Playback {
  const [tick, setTick] = useState<{ positionSec: number; durationSec: number } | null>(null)
  // Live gezogene Position (während des Scrubbens) und die committe Zielposition,
  // die gehalten wird, bis der Tick sie erreicht -> kein Zurückspringen auf die
  // alte Position nach dem Loslassen. scrubRef = neuester Wert, damit das
  // Loslassen AUCH außerhalb des Sliders sauber committet.
  const [scrub, setScrub] = useState<number | null>(null)
  const [seekTarget, setSeekTarget] = useState<number | null>(null)
  const scrubRef = useRef<number | null>(null)

  useEffect(() => api.player.onTick((t) => setTick(t)), [])

  const current = pstate.index >= 0 ? pstate.playlist[pstate.index] : null
  const duration = tick?.durationSec || pstate.durationSec || current?.durationSec || 0
  const position = scrub ?? seekTarget ?? tick?.positionSec ?? pstate.positionSec
  const seekable = current != null && current.kind !== 'image' && duration > 0

  // Aktuelle Wiedergabewerte für die Tastatursteuerung -> der Handler unten liest
  // sie über die Ref, statt bei jedem Tick neu zu binden.
  const kbRef = useRef({ position, duration, seekable, volume: pstate.volume, muted: pstate.muted })
  kbRef.current = { position, duration, seekable, volume: pstate.volume, muted: pstate.muted }

  function scrubTo(v: number): void {
    scrubRef.current = v
    setScrub(v)
  }

  // Suche committen: einmalig (idempotent über scrubRef). Hält die Zielposition,
  // bis der Tick sie erreicht -> kein Zurückspringen.
  function commitSeek(): void {
    const v = scrubRef.current
    if (v == null) return
    scrubRef.current = null
    setScrub(null)
    setSeekTarget(v)
    void api.player.command({ type: 'seek', positionSec: v })
    // Fallback: spätestens nach 2 s wieder dem Tick folgen.
    window.setTimeout(() => setSeekTarget((cur) => (cur === v ? null : cur)), 2000)
  }

  // Zusätzlich am window lauschen, damit das Loslassen AUCH außerhalb des Sliders
  // sicher committet (sonst bliebe der Playhead an der alten Stelle hängen).
  useEffect(() => {
    if (scrub == null) return
    const onUp = (): void => commitSeek()
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // bewusst nur am Start/Ende des Scrubbens neu binden (scrub==null als Schwelle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub == null])

  // Zielposition halten, bis der Tick sie (ungefähr) erreicht.
  useEffect(() => {
    if (seekTarget == null) return
    const p = tick?.positionSec ?? pstate.positionSec
    if (Math.abs(p - seekTarget) < 0.75) setSeekTarget(null)
  }, [tick, pstate.positionSec, seekTarget])

  // Bei Track-Wechsel Scrub/Ziel verwerfen.
  useEffect(() => {
    setScrub(null)
    setSeekTarget(null)
    scrubRef.current = null
  }, [pstate.index])

  // Tastatursteuerung: aktiv, solange der Player-Tab offen ist -- außer man tippt
  // gerade in einem Eingabefeld oder hält eine Modifiertaste (App-Kürzel). Steuert
  // die Wiedergabe über den main-Prozess (autoritativ, spiegelt in alle Fenster).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const { position, duration, seekable, volume, muted } = kbRef.current
      const seek = (v: number): void => {
        if (seekable) {
          void api.player.command({ type: 'seek', positionSec: Math.max(0, Math.min(v, duration)) })
        }
      }
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault()
          void api.player.command({ type: 'toggle' })
          break
        case 'ArrowLeft':
          e.preventDefault()
          seek(position - 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          seek(position + 5)
          break
        case 'j':
        case 'J':
          seek(position - 10)
          break
        case 'l':
        case 'L':
          seek(position + 10)
          break
        case 'p':
        case 'P':
          void api.player.command({ type: 'prev' })
          break
        case 'n':
        case 'N':
          void api.player.command({ type: 'next' })
          break
        case 'ArrowUp':
          e.preventDefault()
          void api.player.command({ type: 'setVolume', volume: Math.min(1, volume + 0.05) })
          break
        case 'ArrowDown':
          e.preventDefault()
          void api.player.command({ type: 'setVolume', volume: Math.max(0, volume - 0.05) })
          break
        case 'm':
        case 'M':
          void api.player.command({ type: 'setMuted', muted: !muted })
          break
        case 'Home':
          e.preventDefault()
          seek(0)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return { current, position, duration, seekable, scrubTo, commitSeek }
}
