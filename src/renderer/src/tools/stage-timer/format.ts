// Zeit-Formatierung/-Parsing für den Stage-Timer (reine Funktionen).

/** Sekunden -> "MM:SS" bzw. "H:MM:SS"; negativ -> "−M:SS" (Überziehung). */
export function fmtTimer(totalSec: number): string {
  const neg = totalSec < 0
  const s = Math.abs(Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const core =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`
  return neg ? `−${core}` : core
}

/** Uhrzeit "HH:MM:SS" (mit Sekunden). */
export function fmtClock(d: Date): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':')
}

/** "5" (Minuten), "5:30", "1:05:00" -> Sekunden; ungültig -> null. */
export function parseDuration(input: string): number | null {
  const t = input.trim().replace(',', '.')
  if (t === '') return null
  if (!t.includes(':')) {
    const min = Number(t)
    return Number.isFinite(min) && min > 0 ? Math.round(min * 60) : null
  }
  const parts = t.split(':').map((p) => Number(p))
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null
  const sec =
    parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts.length === 2
        ? parts[0] * 60 + parts[1]
        : null
  return sec != null && sec > 0 ? Math.round(sec) : null
}
