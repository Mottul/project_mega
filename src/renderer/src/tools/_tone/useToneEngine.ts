// Testton im Fenster abspielen – gemeinsam für den Testbildgenerator (Einstellungen aus
// settings.json, Meldungen als Toast) und den Testtongenerator (eigener Store, Meldungen in der
// Seite, auch in der Handy-PWA): Engine anlegen, mit den Einstellungen nachführen, beim Verlassen
// stoppen, Ausgabegeräte auflisten und „Testton läuft“ melden. Ohne api, ohne Einstellungen.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PatternToneSettings } from '@shared/testton'
import { useAktivMelden } from '@renderer/lib/aktivMelden'
import { canChooseOutputDevice, ToneEngine, type SoundingBeat } from './engine'

export interface ToneMeldungen {
  /** Ausgabegerät nicht verfügbar o. Ä. – die Wiedergabe läuft weiter */
  onWarning?: (message: string) => void
  /** Start gescheitert */
  onError?: (message: string) => void
  /** Ton von außen beendet (Handy: App gewechselt, gesperrt, Anruf) */
  onEnded?: (message: string) => void
}

export interface ToneEngineHandle {
  playing: boolean
  /**
   * Ein/Aus. Synchron aus dem Klick heraus aufrufen: Am Handy gibt der Browser den Ton nur in
   * der Bedienung selbst frei.
   */
  toggle: () => void
  stop: () => void
  /** Ausgabegeräte (Namen erst nach einer Freigabe, am Handy meist keine) */
  devices: MediaDeviceInfo[]
  /** Lässt sich das Ausgabegerät wählen? */
  canChooseDevice: boolean
  /** Der Schlag, der gerade klingt (Metronom) – für eine Anzeige im Bildtakt */
  currentBeat: () => SoundingBeat | null
}

const CAN_CHOOSE = canChooseOutputDevice()

export function useToneEngine(
  settings: PatternToneSettings,
  meldungen: ToneMeldungen = {}
): ToneEngineHandle {
  const [playing, setPlaying] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const engine = useRef<ToneEngine | null>(null)
  // jüngster Stand für den Start und die Rückrufe, ohne toggle bei jeder Änderung neu zu bauen
  const latest = useRef({ settings, meldungen })
  latest.current = { settings, meldungen }
  useAktivMelden('testton', playing)

  // Ausgabegeräte auflisten. Über HTTP (PWA im LAN) gibt es mediaDevices gar nicht.
  useEffect(() => {
    const md = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
    if (!md?.enumerateDevices) return
    const load = (): void => {
      void md
        .enumerateDevices()
        .then((d) => setDevices(d.filter((x) => x.kind === 'audiooutput')))
        .catch(() => setDevices([]))
    }
    load()
    md.addEventListener?.('devicechange', load)
    return () => md.removeEventListener?.('devicechange', load)
  }, [])

  // Werkzeug verlassen = Ton aus (nie unbemerkt weiterlaufen lassen)
  useEffect(
    () => () => {
      engine.current?.stop()
      engine.current = null
    },
    []
  )

  useEffect(() => {
    if (playing) engine.current?.update(settings)
  }, [playing, settings])

  const stop = useCallback((): void => {
    engine.current?.stop()
    engine.current = null
    setPlaying(false)
  }, [])

  const toggle = useCallback((): void => {
    if (engine.current) {
      stop()
      return
    }
    const e: ToneEngine = new ToneEngine({
      onWarning: (m) => latest.current.meldungen.onWarning?.(m),
      onEnded: (m) => {
        if (engine.current !== e) return
        engine.current = null
        setPlaying(false)
        latest.current.meldungen.onEnded?.(m)
      }
    })
    engine.current = e
    setPlaying(true)
    // start() erzeugt und weckt den Kontext noch synchron, also in dieser Bedienung
    e.start(latest.current.settings).catch((err: unknown) => {
      e.stop()
      if (engine.current === e) {
        engine.current = null
        setPlaying(false)
      }
      latest.current.meldungen.onError?.(err instanceof Error ? err.message : String(err))
    })
  }, [stop])

  const currentBeat = useCallback((): SoundingBeat | null => {
    return engine.current?.currentBeat() ?? null
  }, [])

  return { playing, toggle, stop, devices, canChooseDevice: CAN_CHOOSE, currentBeat }
}
