import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'

// Live-Status je Tool für den Homescreen: zeigt, was gerade läuft (Konverter-Aufträge,
// YouTube-Downloads, laufender Timer, offene Player- bzw. Timer-Ausgabe). Tools ohne
// Aktivität fehlen einfach in der Map.

export interface ToolActivity {
  count: number
  label: string
}

export function useToolActivity(): Record<string, ToolActivity> {
  const [conv, setConv] = useState(0)
  const [yt, setYt] = useState(0)
  const [vgen, setVgen] = useState<{ count: number; progress: number }>({ count: 0, progress: 0 })
  const [timer, setTimer] = useState<{ running: boolean; output: boolean }>({
    running: false,
    output: false
  })
  const [player, setPlayer] = useState<{ playing: boolean; output: boolean; items: number }>({
    playing: false,
    output: false,
    items: 0
  })

  // Video-Konverter
  useEffect(() => {
    const jobs = new Map<string, string>()
    const recompute = (): void =>
      setConv(
        [...jobs.values()].filter((s) => s === 'running' || s === 'queued' || s === 'probing')
          .length
      )
    void api.converter.list().then((list) => {
      for (const j of list) jobs.set(j.id, j.status)
      recompute()
    })
    return api.converter.onUpdate((job) => {
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

  // Video-Generator: laufende Aufträge samt Fortschritt des ersten
  useEffect(() => {
    const jobs = new Map<string, { status: string; progress: number }>()
    const recompute = (): void => {
      const active = [...jobs.values()].filter((j) =>
        ['queued', 'probing', 'running'].includes(j.status)
      )
      setVgen({ count: active.length, progress: active[0]?.progress ?? 0 })
    }
    void api.videoGen.list().then((list) => {
      for (const j of list) jobs.set(j.id, j)
      recompute()
    })
    return api.videoGen.onUpdate((job) => {
      jobs.set(job.id, job)
      recompute()
    })
  }, [])

  // Stage-Timer: läuft er, ist ein Ausgabefenster offen oder sendet NDI?
  useEffect(() => {
    const apply = (s: { running: boolean; outputOpen: boolean; ndiActive?: boolean }): void =>
      setTimer({ running: s.running, output: s.outputOpen || Boolean(s.ndiActive) })
    void api.timer.getState().then(apply)
    return api.timer.onState(apply)
  }, [])

  // Video-Player
  useEffect(() => {
    void api.player
      .getState()
      .then((s) =>
        setPlayer({ playing: s.playing, output: s.outputOpen, items: s.playlist.length })
      )
    return api.player.onState((s) =>
      setPlayer({ playing: s.playing, output: s.outputOpen, items: s.playlist.length })
    )
  }, [])

  const out: Record<string, ToolActivity> = {}
  if (conv > 0) out['hap-converter'] = { count: conv, label: `konvertiert · ${conv}` }
  if (yt > 0) out['youtube-dl'] = { count: yt, label: `lädt · ${yt}` }
  if (vgen.count > 0) {
    out['video-generator'] = {
      count: vgen.count,
      label: `rechnet · ${Math.round(vgen.progress * 100)} %`
    }
  }
  if (timer.running)
    out['stage-timer'] = { count: 1, label: timer.output ? 'läuft · Ausgabe' : 'läuft' }
  else if (timer.output) out['stage-timer'] = { count: 1, label: 'Ausgabe offen' }
  if (player.playing)
    out['video-player'] = { count: 1, label: player.output ? 'spielt · Ausgabe' : 'spielt' }
  else if (player.output) out['video-player'] = { count: 1, label: 'Ausgabe offen' }
  return out
}
