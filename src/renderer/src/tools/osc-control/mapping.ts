// Wert -> Text der Anzeige-Kachel (Meter, Quelle „Text"). MadMapper kann für
// Enum-Parameter (Blendmodus, ausgewähltes Surface, …) über OSC nur ZAHLEN
// senden -- keinen Klartext. Der Nutzer ordnet daher im Inspector jedem
// beobachteten Zahlenwert einen Namen zu; hier wird der eingehende Wert auf den
// passenden Namen abgebildet. Bewusst reine, testbare Logik (kein Store/DOM).

import type { OscItem } from './store'

/** Zahl fürs Anzeige-Feld formatieren: ganzzahlig ohne Nachkomma, sonst 2 Stellen. */
export function formatMeterNumber(n: number): string {
  if (!Number.isFinite(n)) return '–'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** Einen empfangenen Zahlenwert auf den vom Nutzer vergebenen Text abbilden
 *  (z. B. 0.5 -> „Multiply"). MadMapper schickt für Enums diskrete Zahlen, daher
 *  nehmen wir die NÄCHSTLIEGENDE Zuordnung -- aber nur, wenn der Wert wirklich in
 *  ihrer Nähe liegt (Toleranz = halbe kleinste Lücke der vergebenen Werte; bei
 *  nur einem Eintrag 0.5, passend für Ganzzahl-Indizes). Sonst -> Rohwert, damit
 *  ein unerwarteter Wert nicht fälschlich einen Namen bekommt. Einträge ohne Text
 *  zählen nicht als Ziel. */
export function labelForValue(value: number, items: OscItem[]): string {
  const withLabel = items.filter((it) => it.label.trim() !== '')
  if (withLabel.length === 0) return formatMeterNumber(value)

  let best = withLabel[0]
  let bestDist = Math.abs(value - best.value)
  for (const it of withLabel) {
    const d = Math.abs(value - it.value)
    if (d < bestDist) {
      bestDist = d
      best = it
    }
  }

  let tol = 0.5
  if (withLabel.length >= 2) {
    const vals = withLabel.map((it) => it.value).sort((a, b) => a - b)
    let minGap = Infinity
    for (let i = 1; i < vals.length; i++) minGap = Math.min(minGap, vals[i] - vals[i - 1])
    if (Number.isFinite(minGap) && minGap > 0) tol = minGap / 2
  }

  return bestDist <= tol ? best.label : formatMeterNumber(value)
}
