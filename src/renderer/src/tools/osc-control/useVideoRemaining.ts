// Restzeit des laufenden Videos aus dem Video-Player – Quelle „Video“ der Anzeige-Kacheln.

import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import type { VideoInfo } from './oscShared'

export function useVideoRemaining(): VideoInfo {
  const [video, setVideo] = useState<VideoInfo>({
    playing: false,
    remainingSec: null,
    durationSec: 0
  })

  // Restzeit des laufenden Videos beobachten (Quelle „Video" der Anzeige/Meter).
  // Bewusst grob: nur bei ganzzahliger Sekundenänderung neu rendern.
  useEffect(() => {
    let playing = false
    let dur = 0
    let pos = 0
    const apply = (): void => {
      const remaining = playing && dur > 0 ? Math.max(0, Math.round(dur - pos)) : null
      setVideo((prev) =>
        prev.playing === playing && prev.remainingSec === remaining && prev.durationSec === dur
          ? prev
          : { playing, remainingSec: remaining, durationSec: dur }
      )
    }
    void api.player
      .getState()
      .then((s) => {
        if (!s) return
        playing = s.playing
        dur = s.durationSec
        pos = s.positionSec
        apply()
      })
      .catch(() => {})
    const offState = api.player.onState((s) => {
      playing = s.playing
      dur = s.durationSec
      pos = s.positionSec
      apply()
    })
    const offTick = api.player.onTick((t) => {
      dur = t.durationSec
      pos = t.positionSec
      apply()
    })
    return () => {
      offState()
      offTick()
    }
  }, [])

  return video
}
