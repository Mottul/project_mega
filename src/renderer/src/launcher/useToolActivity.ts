import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'

// Live-Status je Tool für den Homescreen: zeigt, was gerade läuft (HAP-Jobs,
// YouTube-Downloads, laufender Timer, offene Player-Ausgabe). Tools ohne
// Aktivität fehlen einfach in der Map.

export interface ToolActivity {
  count: number
  label: string
}

export function useToolActivity(): Record<string, ToolActivity> {
  const [hap, setHap] = useState(0)
  const [yt, setYt] = useState(0)
  const [timer, setTimer] = useState(false)
  const [player, setPlayer] = useState<{ playing: boolean; output: boolean; items: number }>({
    playing: false,
    output: false,
    items: 0
  })

  // HAP-Jobs
  useEffect(() => {
    const jobs = new Map<string, string>()
    const recompute = (): void =>
      setHap([...jobs.values()].filter((s) => s === 'running' || s === 'queued' || s === 'probing').length)
    void api.hap.list().then((list) => {
      for (const j of list) jobs.set(j.id, j.status)
      recompute()
    })
    return api.hap.onUpdate((job) => {
      jobs.set(job.id, job.status)
      recompute()
    })
  }, [])

  // YouTube-Downloads
  useEffect(() => {
    const jobs = new Map<string, string>()
    const recompute = (): void =>
      setYt([...jobs.values()].filter((s) => s === 'running' || s === 'queued').length)
    void api.youtube.list().then((list) => {
      for (const j of list) jobs.set(j.id, j.status)
      recompute()
    })
    return api.youtube.onJobUpdate((job) => {
      jobs.set(job.id, job.status)
      recompute()
    })
  }, [])

  // Stage-Timer
  useEffect(() => {
    void api.timer.getState().then((s) => setTimer(s.running))
    return api.timer.onState((s) => setTimer(s.running))
  }, [])

  // Video-Player
  useEffect(() => {
    void api.player.getState().then((s) =>
      setPlayer({ playing: s.playing, output: s.outputOpen, items: s.playlist.length })
    )
    return api.player.onState((s) =>
      setPlayer({ playing: s.playing, output: s.outputOpen, items: s.playlist.length })
    )
  }, [])

  const out: Record<string, ToolActivity> = {}
  if (hap > 0) out['hap-converter'] = { count: hap, label: `konvertiert · ${hap}` }
  if (yt > 0) out['youtube-dl'] = { count: yt, label: `lädt · ${yt}` }
  if (timer) out['stage-timer'] = { count: 1, label: 'läuft' }
  if (player.playing) out['video-player'] = { count: 1, label: player.output ? 'spielt · Ausgabe' : 'spielt' }
  else if (player.output) out['video-player'] = { count: 1, label: 'Ausgabe offen' }
  return out
}
