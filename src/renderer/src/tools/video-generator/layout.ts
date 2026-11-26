// Anordnung des Video-Generators – rein und getestet (layout.test.ts): die Raster je Stufe der
// Arbeitsfläche (components/workAreaRaster.ts) und die Texte in den Köpfen und Zeilen der Felder.
// Muster und Messungen: docs/PLAN.md („Muster 1: Arbeitsfläche“); die Skizzen
// docs/bilder/video-generator-layout-breit.svg und …-mittel.svg hat Matthias am 25. November 2026
// freigegeben.

import type { Raster, Stufe } from '@renderer/components/workAreaRaster'
import { rateText } from '@shared/convertPlan'
import type { VgenJob } from '@shared/types'
import { basename, fmtDuration } from './presets'

/** Namen der drei Felder (CSS grid-template-areas) */
export type VgenFeld = 'storyboard' | 'vorschau' | 'auftraege'

/**
 * Drei Felder – Storyboard (die Abfolge), Vorschau (was daraus wird), Aufträge (was gerechnet wird):
 * - breit und mittel: links das Storyboard über die ganze Höhe, rechts die Vorschau über den
 *   Aufträgen. Die Aufträge sind so hoch wie ihr Inhalt (höchstens drei Zeilen, die Liste scrollt
 *   in sich), die Vorschau bekommt den Rest und wird kleiner, wenn er nicht reicht.
 *   breit: rechts 40 % (mindestens 420, höchstens 760 px) – im Storyboard drei Kacheln je Reihe
 *   bei 1366 px, vier bei 1920 px. mittel: rechts mindestens 320 px, sonst gut 44 % – bei
 *   1024 px noch zwei Kacheln je Reihe (eine Kachel mit ihrem Übergang ist 252 px breit).
 * - schmal: untereinander, die Vorschau zuerst; die Arbeitsfläche scrollt.
 * Ohne Aufträge fehlt ihr Bereich, die Vorschau reicht dann bis unten (sonst bliebe dort der
 * Abstand einer leeren Zeile stehen). Das Feld „Aufträge“ steht im DOM als letztes: Kommt es
 * dazu, bleiben die anderen, wie sie sind. Ihre Reihenfolge ist in jeder Stufe dieselbe, nur die
 * Bereiche wandern – sonst baute React beim Wechsel der Stufe die Live-Vorschau neu auf, und ein
 * laufendes Video lüde neu.
 */
const MIT_AUFTRAEGEN: Record<Stufe, Raster<VgenFeld>> = {
  breit: {
    columns: 'minmax(0, 1fr) clamp(420px, 40%, 760px)',
    rows: 'minmax(0, 1fr) auto',
    areas: [
      ['storyboard', 'vorschau'],
      ['storyboard', 'auftraege']
    ]
  },
  mittel: {
    columns: 'minmax(0, 1fr) minmax(320px, 0.8fr)',
    rows: 'minmax(0, 1fr) auto',
    areas: [
      ['storyboard', 'vorschau'],
      ['storyboard', 'auftraege']
    ]
  },
  schmal: {
    columns: 'minmax(0, 1fr)',
    rows: 'auto auto auto',
    areas: [['vorschau'], ['storyboard'], ['auftraege']]
  }
}

const OHNE_AUFTRAEGE: Record<Stufe, Raster<VgenFeld>> = {
  breit: { ...MIT_AUFTRAEGEN.breit, rows: 'minmax(0, 1fr)', areas: [['storyboard', 'vorschau']] },
  mittel: { ...MIT_AUFTRAEGEN.mittel, rows: 'minmax(0, 1fr)', areas: [['storyboard', 'vorschau']] },
  schmal: { columns: 'minmax(0, 1fr)', rows: 'auto auto', areas: [['vorschau'], ['storyboard']] }
}

/** Raster je Stufe – mit dem Bereich „Aufträge“ nur, solange es welche gibt */
export function vgenRaster(mitAuftraegen: boolean): Record<Stufe, Raster<VgenFeld>> {
  return mitAuftraegen ? MIT_AUFTRAEGEN : OHNE_AUFTRAEGE
}

/**
 * Zahl im Kopf des Storyboards: Anzahl und Gesamtdauer („12 · 48 s“); die Dauer erst, wenn die
 * Analyse fertig ist (`null` solange), sonst stünde eine Summe ohne die noch offenen Videos da.
 * Leer: nichts.
 */
export function storyboardZahl(anzahl: number, dauerSek: number | null): string | undefined {
  if (anzahl <= 0) return undefined
  return dauerSek === null ? String(anzahl) : `${anzahl} · ${fmtDuration(dauerSek)}`
}

const LAEUFT = new Set<VgenJob['status']>(['probing', 'running'])

/** Läuft oder wartet der Auftrag noch (Abbrechen möglich)? */
export function auftragAktiv(job: Pick<VgenJob, 'status'>): boolean {
  return job.status === 'queued' || LAEUFT.has(job.status)
}

/** Zahl im Kopf der Aufträge: „4 · 1 läuft · 2 warten“ – nur, was es gibt */
export function auftraegeZahl(jobs: Pick<VgenJob, 'status'>[]): string {
  const laufen = jobs.filter((j) => LAEUFT.has(j.status)).length
  const warten = jobs.filter((j) => j.status === 'queued').length
  return [
    String(jobs.length),
    laufen ? `${laufen} ${laufen === 1 ? 'läuft' : 'laufen'}` : null,
    warten ? `${warten} ${warten === 1 ? 'wartet' : 'warten'}` : null
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Ton der Zustandsangabe in der Zeile – die Farbe kommt aus den Statusstufen */
export type AuftragTon = 'neutral' | 'info' | 'success' | 'danger' | 'warning'

/**
 * Eine Zeile je Auftrag (freigegeben am 25. November 2026 statt der Karten mit drei Zeilen): was
 * gerade ist – bei einem laufenden die Stufe („Elemente 3/12“), bei einem gescheiterten der
 * Fehler selbst –, und alles Weitere für den Tooltip: Datei, Format, Größe, Bildrate, Dauer,
 * Encoder, die Stücke und Warnungen des fertigen Auftrags.
 */
export function auftragZeile(job: VgenJob): { zustand: string; ton: AuftragTon; info: string } {
  const fakten = [
    job.formatLabel,
    `${job.width}×${job.height}`,
    `${rateText(job.fps)} fps`,
    job.durationSec !== null ? fmtDuration(job.durationSec) : null,
    job.encoder
  ]
    .filter(Boolean)
    .join(' · ')
  const stuecke =
    job.cachedPieces + job.renderedPieces > 0
      ? `${job.renderedPieces} Stücke gerechnet, ${job.cachedPieces} aus dem Zwischenspeicher`
      : null
  const warnungen = job.hints.filter((h) => h.level !== 'info').map((h) => h.text)
  const zeilen = (...weitere: (string | null | undefined)[]): string =>
    [job.outputPath, fakten, ...weitere].filter(Boolean).join('\n')
  switch (job.status) {
    case 'queued':
      return { zustand: 'Wartet', ton: 'neutral', info: zeilen() }
    case 'probing':
      return { zustand: job.stageText || 'Analyse', ton: 'info', info: zeilen(job.stageText) }
    case 'running':
      return { zustand: job.stageText || 'Rechnet', ton: 'info', info: zeilen(job.stageText) }
    case 'done':
      return {
        zustand: warnungen.length
          ? `Fertig · ${warnungen.length} ${warnungen.length === 1 ? 'Hinweis' : 'Hinweise'}`
          : 'Fertig',
        ton: warnungen.length ? 'warning' : 'success',
        info: zeilen(stuecke, ...warnungen)
      }
    case 'error':
      return { zustand: job.error || 'Fehler', ton: 'danger', info: zeilen(job.error) }
    case 'canceled':
      return { zustand: 'Abgebrochen', ton: 'warning', info: zeilen() }
  }
}

/** Name des Auftrags in der Zeile: die Zieldatei */
export const auftragName = (job: Pick<VgenJob, 'outputPath'>): string => basename(job.outputPath)
