// NovaStar-Kacheln der OSC-Steuerung: Ziel ist der geteilte Prozessor statt OSC – Helligkeit
// (absolut, fest, in Schritten, weiche Blende), Freeze/Blackout (schließen sich aus), Presets.

import { useCallback, useEffect, useRef } from 'react'
import { api } from '@renderer/lib/api'
import { clamp, type Nova } from './oscShared'
import { useOscSurface } from './store'
import type { PushLog } from './useOscLog'

export function useNovaRunner(pushLog: PushLog): Nova {
  /* ---- NovaStar-Widgets (Ziel = geteilter Prozessor statt OSC) ---- */
  // Zuletzt gesetzte Helligkeit (0..100) -> Grundlage für relative Schritte und
  // weiche Blenden. Die Blende läuft als Intervall (wie im NovaStar-Tool).
  const novaBrightRef = useRef(100)
  const novaFadeRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopNovaFade = useCallback((): void => {
    if (novaFadeRef.current) {
      clearInterval(novaFadeRef.current)
      novaFadeRef.current = null
    }
  }, [])
  // Helligkeit setzen: an den Prozessor senden, merken und etwaige Helligkeits-
  // Fader auf der Fläche mitziehen (damit weiche Blenden sichtbar sind).
  const setNovaBright = useCallback(
    (pct: number): void => {
      const v = clamp(pct, 0, 100)
      novaBrightRef.current = v
      void api.novastar.brightness(v)
      const st = useOscSurface.getState()
      for (const x of st.currentSet().widgets) {
        if (x.target === 'nova' && x.nova.fn === 'brightness' && x.value !== v)
          st.updateWidget(x.id, { value: v })
      }
      pushLog('out', 'nova/helligkeit', [Math.round(v)])
    },
    [pushLog]
  )
  const fadeNovaTo = useCallback(
    (to: number, sec: number): void => {
      stopNovaFade()
      const from = novaBrightRef.current
      const steps = Math.max(1, Math.round((Math.max(0.1, sec) * 1000) / 50))
      let i = 0
      novaFadeRef.current = setInterval(() => {
        i++
        setNovaBright(from + (to - from) * (i / steps))
        if (i >= steps) stopNovaFade()
      }, 50)
    },
    [setNovaBright, stopNovaFade]
  )
  // Blackout und Freeze sind am Gerät EIN Anzeigemodus -> schließen sich
  // gegenseitig aus. Beim Einschalten des einen den anderen Schalter optisch lösen.
  const clearNovaMode = useCallback((keep: 'freeze' | 'blackout'): void => {
    const other = keep === 'freeze' ? 'blackout' : 'freeze'
    const st = useOscSurface.getState()
    for (const x of st.currentSet().widgets) {
      if (x.target === 'nova' && x.nova.fn === other && x.value >= 0.5)
        st.updateWidget(x.id, { value: 0 })
    }
  }, [])
  const runNova = useCallback<Nova>(
    (w, arg) => {
      const n = w.nova
      switch (n.fn) {
        case 'brightness':
          stopNovaFade()
          setNovaBright(arg)
          break
        case 'brightnessSet':
          stopNovaFade()
          setNovaBright(n.value)
          break
        case 'brightnessStep':
          stopNovaFade()
          setNovaBright(novaBrightRef.current + n.value)
          break
        case 'fadeToBlack':
          fadeNovaTo(arg >= 0.5 ? 0 : n.restore, n.value)
          break
        case 'freeze':
          if (arg >= 0.5) clearNovaMode('freeze')
          void api.novastar.freeze(arg >= 0.5)
          pushLog('out', 'nova/freeze', [arg >= 0.5 ? 1 : 0])
          break
        case 'blackout':
          if (arg >= 0.5) clearNovaMode('blackout')
          void api.novastar.blackout(arg >= 0.5)
          pushLog('out', 'nova/blackout', [arg >= 0.5 ? 1 : 0])
          break
        case 'preset':
          void api.novastar.preset(Math.round(arg))
          pushLog('out', 'nova/preset', [Math.round(arg)])
          break
      }
    },
    [setNovaBright, fadeNovaTo, stopNovaFade, clearNovaMode, pushLog]
  )
  // Laufende Blende beim Schließen des Tabs stoppen.
  useEffect(() => () => stopNovaFade(), [stopNovaFade])

  return runNova
}
