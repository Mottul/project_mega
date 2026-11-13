// Anzeigeformate des Video-Players (Zeit, Restzeit, Dateigröße) – gemeinsam für Leiste,
// Bibliothek, Bühne, Playlist und Schublade. Getestet in format.test.ts.

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`
  return `${n} B`
}

/**
 * Restzeit als Countdown („−0:48“, mit echtem Minuszeichen U+2212): aufgerundet wie bei jedem
 * Countdown – „−0:00“ steht erst, wenn wirklich nichts mehr läuft, nicht schon eine Sekunde vorher.
 */
export function fmtRest(position: number, duration: number): string {
  const p = Number.isFinite(position) ? position : 0
  const d = Number.isFinite(duration) ? duration : 0
  return `−${fmtTime(Math.ceil(Math.max(0, d - p)))}`
}

/** Millisekunden als Sekunden mit Komma: 500 -> „0,5“, 1000 -> „1“, 1250 -> „1,25“ */
export function fmtSekunden(ms: number): string {
  return String(Math.round(ms / 10) / 100).replace('.', ',')
}
