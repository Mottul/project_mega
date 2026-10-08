// Analyse und Vorschaubilder der Elemente – abgeleitet, NICHT gespeichert. Eigene Kopie des
// Musters aus dem Video-Konverter (dessen Modul startet beim Laden seinen Fenster-Abgleich).
// Analyse mit Tiefenanalyse: liest bei Fotos die EXIF-Drehung und füllt den Cache im main,
// den der Rechenlauf danach nutzt.

import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { MediaInfo } from '@shared/types'
import { api } from '@renderer/lib/api'

export type Meta =
  { kind: 'loading' } | { kind: 'ok'; info: MediaInfo } | { kind: 'error'; message: string }

interface MetaState {
  meta: Record<string, Meta>
  load: (path: string, force?: boolean) => void
}

export const useVgenMeta = create<MetaState>((set, get) => ({
  meta: {},
  load: (path, force = false) => {
    const cur = get().meta[path]
    if (cur && !force && cur.kind !== 'error') return
    set((s) => ({ meta: { ...s.meta, [path]: { kind: 'loading' } } }))
    void api.mediaInfo
      .probe(path, { deep: true, force })
      .then((res) =>
        set((s) => ({
          meta: {
            ...s.meta,
            [path]: res.ok
              ? { kind: 'ok', info: res.info }
              : { kind: 'error', message: res.detail ? `${res.error} (${res.detail})` : res.error }
          }
        }))
      )
      .catch((e: unknown) =>
        set((s) => ({
          meta: {
            ...s.meta,
            [path]: { kind: 'error', message: e instanceof Error ? e.message : String(e) }
          }
        }))
      )
  }
}))

interface ThumbState {
  urls: Record<string, string | null>
  pending: Set<string>
  request: (path: string, timeSec: number | null, width: 320 | 960) => void
}

const thumbKey = (path: string, t: number | null, width: number): string =>
  `${path}|${t === null ? '' : t.toFixed(2)}|${width}`

const useThumbs = create<ThumbState>((set, get) => ({
  urls: {},
  pending: new Set(),
  request: (path, timeSec, width) => {
    const key = thumbKey(path, timeSec, width)
    if (key in get().urls || get().pending.has(key)) return
    get().pending.add(key)
    void api.videoGen
      .thumb(path, timeSec, width)
      .catch(() => null)
      .then((url) => {
        get().pending.delete(key)
        set((s) => ({ urls: { ...s.urls, [key]: url } }))
      })
  }
}))

/**
 * Vorschaubild erst laden, wenn das Element sichtbar wird (100+ Fotos im Storyboard).
 * Liefert ref (an das Bild-Element) und die URL (undefined = lädt noch, null = keins).
 */
export function useThumb(
  path: string,
  timeSec: number | null,
  width: 320 | 960 = 320
): { ref: React.RefObject<HTMLDivElement>; url: string | null | undefined } {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const url = useThumbs((s) => s.urls[thumbKey(path, timeSec, width)])
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: '200px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])
  useEffect(() => {
    if (visible) useThumbs.getState().request(path, timeSec, width)
  }, [visible, path, timeSec, width])
  return { ref, url }
}
