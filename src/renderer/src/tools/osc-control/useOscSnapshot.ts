// Schnappschuss der OSC-Fläche für die Handy-Fernsteuerung: gedrosselt bei jeder Änderung,
// beim Schließen „getrennt“. Liefert die Funktion, die ihn sofort schickt (nach dem Start).

import { useCallback, useEffect, useRef } from 'react'
import type { OscRemoteSnapshot } from '@shared/types'
import { api } from '@renderer/lib/api'
import { meterReadout } from './Displays'
import type { VideoInfo } from './oscShared'
import { useOscSurface, type OscSet, type OscWidget } from './store'

export function useOscSnapshot(
  video: VideoInfo,
  set: OscSet,
  sets: OscSet[],
  columns: number,
  widgets: OscWidget[]
): () => void {
  // Schnappschuss der Oberfläche an den Fernsteuer-Server – gedrosselt, da sich
  // Werte beim Ziehen schnell ändern.
  const pubRef = useRef<{ t: number; timer: ReturnType<typeof setTimeout> | null }>({
    t: 0,
    timer: null
  })
  const publishSnapshot = useCallback((): void => {
    const store = useOscSurface.getState()
    const cs = store.currentSet()
    const snap: OscRemoteSnapshot = {
      connected: true,
      setName: cs.name,
      columns: cs.columns,
      sets: store.currentProject().sets.map((s) => ({ id: s.id, name: s.name })),
      currentSetId: cs.id,
      widgets: cs.widgets.map((w) => {
        const m = w.type === 'meter' ? meterReadout(w, video) : { level: 0, text: '' }
        return {
          id: w.id,
          type: w.type,
          label: w.label,
          color: w.color,
          address: w.address,
          addressY: w.addressY,
          min: w.min,
          max: w.max,
          gx: w.gx,
          gy: w.gy,
          cw: w.cw,
          ch: w.ch,
          value: w.value,
          x: w.x,
          y: w.y,
          r: w.r,
          g: w.g,
          b: w.b,
          a: w.a,
          align: w.align,
          meterLevel: m.level,
          meterText: m.text,
          items: w.items.map((it) => ({ label: it.label, address: it.address, value: it.value })),
          orient: w.orient,
          cols: w.cols,
          bankMode: w.bankMode,
          endless: w.endless
        }
      })
    }
    void api.osc.publish(snap)
  }, [video])
  useEffect(() => {
    const p = pubRef.current
    const run = (): void => {
      p.t = Date.now()
      p.timer = null
      publishSnapshot()
    }
    const dt = Date.now() - p.t
    if (dt >= 150) run()
    else if (!p.timer) p.timer = setTimeout(run, 150 - dt)
    // `sets` als Dep -> auch Umbenennen/Hinzufügen/Löschen anderer Sets erneuert
    // die Umschaltleiste am Handy. `publishSnapshot` hängt an `video` (Meter).
  }, [set, sets, columns, widgets, publishSnapshot])

  // Beim Schließen des Tabs ausstehende Veröffentlichung abbrechen und dem
  // Server „getrennt" melden. pubRef zeigt auf ein stabiles Objekt -> die
  // Referenz beim Mount einzufangen ist korrekt.
  useEffect(() => {
    const p = pubRef.current
    return () => {
      if (p.timer) {
        clearTimeout(p.timer)
        p.timer = null
      }
      void api.osc.publish({
        connected: false,
        setName: '',
        columns: 24,
        widgets: [],
        sets: [],
        currentSetId: ''
      })
    }
  }, [])

  return publishSnapshot
}
