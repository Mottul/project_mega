// Die LED-Wall-Planung derselben Projektdatei, an die die Anleitung gebunden ist – nur gelesen
// (api.projects.peek, kein Binden). Neu gelesen beim Binden und wenn das Fenster den Fokus
// zurückbekommt (der Konfigurator hat vielleicht gerade gespeichert).

import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { ledWallDirty, useLedWall } from '../../led-wall/store'
import { useMiniManual } from '../store'

export interface LedWallQuelle {
  /** Stand in der Datei; null = keine Datei gebunden oder kein LED-Wall-Abschnitt darin */
  stand: { rev: number; sha256: string; data: unknown } | null
  /** gebunden, aber die Datei ließ sich nicht lesen */
  problem: string | null
  /** Konfigurator ist an dieselbe Datei gebunden und hat ungespeicherte Änderungen */
  konfiguratorUngespeichert: boolean
  /** Kopie in der Anleitung ist älter als die Planung in der Datei */
  neuer: { von: number; bis: number } | null
  neuLesen: () => void
}

export function useLedWallQuelle(): LedWallQuelle {
  const path = useMiniManual((s) => s.file?.path ?? null)
  const quelle = useMiniManual((s) => s.anleitung.ledWall?.quelle ?? null)
  const [stand, setStand] = useState<LedWallQuelle['stand']>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const konfiguratorUngespeichert = useLedWall(
    (s) => !!path && !!s.file && s.file.path.toLowerCase() === path.toLowerCase() && ledWallDirty(s)
  )

  useEffect(() => {
    if (!path) {
      setStand(null)
      setProblem(null)
      return
    }
    let alive = true
    void api.projects.peek('ledWall', path).then((r) => {
      if (!alive) return
      if (!r || !r.ok) {
        setStand(null)
        setProblem(r ? r.reason : 'ungueltig')
        return
      }
      setProblem(null)
      setStand(
        r.section ? { rev: r.section.rev, sha256: r.section.sha256, data: r.section.data } : null
      )
    })
    return () => {
      alive = false
    }
  }, [path, tick])

  useEffect(() => {
    const onFocus = (): void => setTick((t) => t + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const neuLesen = useCallback(() => setTick((t) => t + 1), [])
  const neuer =
    stand && quelle && stand.sha256 !== quelle.sha256 ? { von: quelle.rev, bis: stand.rev } : null
  return { stand, problem, konfiguratorUngespeichert, neuer, neuLesen }
}
