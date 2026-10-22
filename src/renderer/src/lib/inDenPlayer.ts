// Fertige Datei (Download, Konvertierung, Video-Generator) in die Bibliothek des Video-Players –
// Import mit Wand-Auflösung und Einpassen, wie im Player eingestellt. Spart kurz vor der Show den
// Umweg über den Dateimanager.

import { api } from './api'
import { toast } from './toast'

export async function inDenPlayer(path: string): Promise<void> {
  const s = await api.getSettings()
  try {
    await api.player.import({
      sources: [path],
      fitMode: s.player.defaultFit,
      wall: { width: s.player.wallWidth, height: s.player.wallHeight }
    })
    toast.success('An den Video-Player übergeben – der Import läuft dort.')
  } catch (e) {
    toast.error(
      'Übernahme in den Player fehlgeschlagen',
      e instanceof Error ? e.message : String(e)
    )
  }
}
