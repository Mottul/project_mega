// Was läuft gerade? – für die Rückfrage beim Beenden (rueckfrage.ts) und gegen das Energiesparen
// (energie/wachhalten.ts). Gesammelt wird aus den Diensten im main; was nur ein Fenster weiß
// (Testton, Jingle), melden die Werkzeuge selbst (api.setAktiv). Die Namen stehen so im Dialog –
// kurz, in der Sprache der Oberfläche.

import type { WebContents } from 'electron'
import { jobQueue } from '../jobs/queue'
import { previewBusy } from '../convert/videoGenPreview'
import { isPlayerNdiRunning } from '../player/playerNdi'
import { getPlayerState } from '../player/playerState'
import { isPatternOpen } from '../pattern/patternWindow'
import { verbundeneGeraete } from '../remote/remoteHttp'
import { isTimerNdiRunning } from '../timer/timerNdi'
import { getTimerState } from '../timer/stageTimer'
import { laufendesAus, RENDERER_AKTIV, type LaufendStand, type RendererAktiv } from './laufendText'

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

/** Der Stand aller Dienste – eine Quelle für die Rückfrage und fürs Wachhalten */
export function laufendStand(): LaufendStand {
  const player = getPlayerState()
  const timer = getTimerState()
  const renderer = new Set<RendererAktiv>()
  for (const s of imRenderer.values()) for (const k of s) renderer.add(k)
  return {
    player: {
      ausgabe: player.outputOpen,
      spielt: player.playing,
      // nur „läuft“: Der volle Status lüde das NDI-Modul, hier fragt das Wachhalten im Takt
      ndi: isPlayerNdiRunning()
    },
    timer: { ausgabe: timer.outputOpen, laeuft: timer.running, ndi: isTimerNdiRunning() },
    testbild: isPatternOpen(),
    auftraege: jobQueue.count(),
    vorschau: previewBusy(),
    fernsteuerung: verbundeneGeraete(),
    renderer: [...renderer]
  }
}

export function laufendes(): string[] {
  return laufendesAus(laufendStand())
}
