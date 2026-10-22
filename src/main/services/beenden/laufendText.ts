// Zeilen für „Wirklich beenden?“ aus dem Stand der Dienste – rein und getestet
// (laufendText.test.ts); den Stand sammelt laufend.ts.

/** Was ein Fenster meldet – nur diese Kennungen (fremde Eingabe vom Renderer) */
export const RENDERER_AKTIV = ['testton', 'jingle'] as const
export type RendererAktiv = (typeof RENDERER_AKTIV)[number]

const RENDERER_NAME: Record<RendererAktiv, string> = {
  testton: 'Testton läuft',
  jingle: 'Jingle-Player spielt'
}

/** Log-Kennung des Fernsteuer-Servers → Werkzeug */
const FERNSTEUERUNG: Record<string, string> = {
  remote: 'Video-Player',
  'timer-remote': 'Stage-Timer',
  'jingle-remote': 'Jingle-Player',
  'osc-remote': 'OSC-Steuerung',
  'remote-app': 'Fernsteuer-App'
}

export interface LaufendStand {
  player: { ausgabe: boolean; spielt: boolean; ndi: boolean }
  timer: { ausgabe: boolean; laeuft: boolean; ndi: boolean }
  testbild: boolean
  /** laufende und wartende Aufträge (Konverter, Import, Download, Video-Generator) */
  auftraege: number
  vorschau: boolean
  /** Log-Kennung → verbundene Geräte */
  fernsteuerung: Record<string, number>
  renderer: RendererAktiv[]
}

const geraete = (n: number): string => `${n} ${n === 1 ? 'Gerät' : 'Geräte'}`

/** Zeilen für den Dialog (rein, getestet); leer = nichts läuft, keine Rückfrage */
export function laufendesAus(s: LaufendStand): string[] {
  const out: string[] = []
  const p = s.player
  if (p.ausgabe) out.push(`Video-Player: Ausgabe offen${p.spielt ? ', spielt' : ''}`)
  else if (p.spielt) out.push('Video-Player spielt')
  if (p.ndi) out.push('Video-Player: NDI-Ausgabe')
  const t = s.timer
  if (t.ausgabe) out.push(`Stage-Timer: Ausgabe offen${t.laeuft ? ', läuft' : ''}`)
  else if (t.laeuft) out.push('Stage-Timer läuft')
  if (t.ndi) out.push('Stage-Timer: NDI-Ausgabe')
  if (s.testbild) out.push('Testbild-Ausgabe offen')
  if (s.auftraege > 0)
    out.push(
      `${s.auftraege} ${s.auftraege === 1 ? 'Auftrag' : 'Aufträge'} (Konvertierung, Import, Download oder Video-Generator)`
    )
  if (s.vorschau) out.push('Video-Generator rechnet die Vorschau')
  const fern = Object.entries(s.fernsteuerung)
    .filter(([, n]) => n > 0)
    .map(
      ([tag, n]) =>
        `${Object.hasOwn(FERNSTEUERUNG, tag) ? FERNSTEUERUNG[tag] : tag} (${geraete(n)})`
    )
  if (fern.length) out.push(`Fernsteuerung verbunden: ${fern.join(', ')}`)
  for (const k of RENDERER_AKTIV) if (s.renderer.includes(k)) out.push(RENDERER_NAME[k])
  return out
}
