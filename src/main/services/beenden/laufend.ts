// Was läuft gerade? – für die Rückfrage beim Beenden (rueckfrage.ts). Gesammelt wird aus den
// Diensten im main; was nur ein Fenster weiß (Testton, Jingle), melden die Werkzeuge selbst
// (api.setAktiv). Die Namen stehen so im Dialog – kurz, in der Sprache der Oberfläche.

import type { WebContents } from 'electron'
import { jobQueue } from '../jobs/queue'
import { previewBusy } from '../convert/videoGenPreview'
import { getPlayerNdiStatus } from '../player/playerNdi'
import { getPlayerState } from '../player/playerState'
import { isPatternOpen } from '../pattern/patternWindow'
import { verbundeneGeraete } from '../remote/remoteHttp'
import { getTimerNdiStatus } from '../timer/timerNdi'
import { getTimerState } from '../timer/stageTimer'
import { laufendesAus, RENDERER_AKTIV, type RendererAktiv } from './laufendText'

/** Was die Fenster melden – je Fenster, damit ein geschlossenes nichts zurücklässt */
const imRenderer = new Map<number, Set<RendererAktiv>>()

export function setRendererAktiv(wc: WebContents, key: unknown, an: unknown): void {
  if (!RENDERER_AKTIV.includes(key as RendererAktiv) || typeof an !== 'boolean') return
  let set = imRenderer.get(wc.id)
  if (!set) {
    set = new Set()
    imRenderer.set(wc.id, set)
    const id = wc.id
    wc.once('destroyed', () => imRenderer.delete(id))
  }
  if (an) set.add(key as RendererAktiv)
  else set.delete(key as RendererAktiv)
}

export function laufendes(): string[] {
  const player = getPlayerState()
  const timer = getTimerState()
  const renderer = new Set<RendererAktiv>()
  for (const s of imRenderer.values()) for (const k of s) renderer.add(k)
  return laufendesAus({
    player: {
      ausgabe: player.outputOpen,
      spielt: player.playing,
      ndi: getPlayerNdiStatus().running
    },
    timer: { ausgabe: timer.outputOpen, laeuft: timer.running, ndi: getTimerNdiStatus().running },
    testbild: isPatternOpen(),
    auftraege: jobQueue.count(),
    vorschau: previewBusy(),
    fernsteuerung: verbundeneGeraete(),
    renderer: [...renderer]
  })
}
