// Karten unter dem Spektrum: Feedback-Finder, Referenzkurven, Eingang mit Kalibrierung und
// Anzeige-Einstellungen. Werte im Store (store.ts), Aktionen über Rückrufe aus Rta.tsx.

import { useRef, useState } from 'react'
import { BookmarkPlus, Eye, EyeOff, FileUp, GitCompareArrows, Trash2, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { TextField } from '@renderer/components/ui/text-field'
import { cn } from '@renderer/lib/utils'
import { fmt, NumField, parseNum, SectionCard, SelectField, trimNum } from '../_calc/ui'
import type { Averaging, MeterSpeed, PeakMode } from './analysis'
import { freqText } from './bands'
import { parseCorrection } from './calibration'
import { REF_TOKENS } from './draw'
import {
  notchSuggestion,
  noteOf,
  type FeedbackLogEntry,
  type FeedbackTrack,
  type Sensitivity
} from './feedback'
import type { Channel } from './engine'
import { MAX_REFERENCES, useRta, type ScaleMode, type SpectroMode } from './store'

/** Tailwind-Klassen je Referenzfarbe (gleiche Reihenfolge wie REF_TOKENS in draw.ts) */
const REF_DOT: Record<(typeof REF_TOKENS)[number], string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  fg: 'bg-foreground',
  muted: 'bg-muted-foreground',
  primary: 'bg-primary/50',
  border: 'bg-border',
  card: 'bg-card'
}

const set = (patch: Parameters<ReturnType<typeof useRta.getState>['set']>[0]): void =>
  useRta.getState().set(patch)

function noteText(f: number): string {
  const n = noteOf(f)
  return `${n.name} ${n.cents >= 0 ? '+' : '−'}${Math.abs(n.cents)} ct`
}

/* ------------------------------ Feedback ------------------------------- */

export function FeedbackCard({
  tracks,
  log,
  running,
  offset,
  unit,
  onClearLog
}: {
  tracks: FeedbackTrack[]
  log: FeedbackLogEntry[]
  running: boolean
  offset: number
  unit: string
  onClearLog: () => void
}): JSX.Element {
  const sensitivity = useRta((s) => s.sensitivity)
  return (
    <SectionCard
      title="Feedback-Finder"
      desc="Schmale, stehende Spitzen – so beginnt eine Rückkopplung."
      hint="Gemeldet wird, was deutlich über seiner Umgebung (±1/6 Oktave) liegt und an derselben Frequenz stehen bleibt. Zum Einpegeln: Mikrofone offen, Pegel langsam hochziehen, jede gemeldete Frequenz mit einem schmalen Filter absenken. Der Vorschlag nennt eine Glocke mit 1/10 Oktave Breite; die Absenkung richtet sich danach, wie weit die Spitze heraussticht."
    >
      <SelectField
        label="Empfindlichkeit"
        hint="Hoch meldet früher (ab 7 dB über der Umgebung, 0,3 s), niedrig erst Deutliches (14 dB, 0,8 s)."
        value={sensitivity}
        onChange={(v) => set({ sensitivity: v as Sensitivity })}
      >
        <option value="low">Niedrig</option>
        <option value="mid">Mittel</option>
        <option value="high">Hoch</option>
      </SelectField>
      <div className="space-y-2" data-testid="rta-feedback">
        {tracks.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-sm text-muted-foreground">
            {running ? 'Keine stehende Spitze.' : 'Läuft mit der Messung.'}
          </p>
        ) : (
          tracks.slice(0, 5).map((t) => {
            const s = notchSuggestion(t.prominence)
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2"
              >
                <span className="text-lg font-bold tabular-nums text-danger">{freqText(t.f)}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{noteText(t.f)}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fmt(t.db + offset, 1)} {unit} · +{fmt(t.prominence, 0)} dB über Umgebung
                </span>
                <span className="w-full text-xs text-foreground">
                  Vorschlag: Glocke {fmt(t.f, 0)} Hz, {s.gainDb} dB, Q {fmt(s.q, 1)}
                </span>
              </div>
            )
          })
        )}
      </div>
      {log.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Gefunden</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={onClearLog}
            >
              Liste leeren
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {log.map((e) => (
              <span
                key={`${e.at}-${e.f}`}
                className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs tabular-nums"
                title={noteText(e.f)}
              >
                {freqText(e.f)}
              </span>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

/* ------------------------------ Referenzen ------------------------------- */

export function ReferenceCard({
  canAdd,
  onAdd
}: {
  canAdd: boolean
  onAdd: () => void
}): JSX.Element {
  const refs = useRta((s) => s.references)
  const diffRef = useRta((s) => s.diffRef)
  const { updateReference, removeReference } = useRta.getState()
  return (
    <SectionCard
      title="Referenzen"
      desc="Kurve merken und vergleichen – vorher/nachher, Raum A gegen B."
      hint="Gemerkt wird die gemittelte Kurve in 1/24 Oktave, unbewertet und ohne Kalibrier-Offset – sie passt so zu jeder Auflösung und Bewertung. „Differenz“ zeigt die laufende Messung minus der Referenz (0 dB = gleich)."
    >
      <Button
        size="sm"
        variant="outline"
        onClick={onAdd}
        disabled={!canAdd || refs.length >= MAX_REFERENCES}
        title={refs.length >= MAX_REFERENCES ? `Höchstens ${MAX_REFERENCES} Referenzen` : undefined}
      >
        <BookmarkPlus className="size-4" /> Aktuelle Kurve merken
      </Button>
      {refs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Referenz.</p>
      ) : (
        <div className="space-y-1.5">
          {refs.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span
                className={cn(
                  'size-3 shrink-0 rounded-full',
                  REF_DOT[REF_TOKENS[r.color % REF_TOKENS.length]]
                )}
              />
              <TextField
                value={r.name}
                maxLength={40}
                aria-label="Name der Referenz"
                className="h-8 min-w-0 flex-1"
                onCommit={(name) => updateReference(r.id, { name })}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                title={r.visible ? 'Ausblenden' : 'Einblenden'}
                aria-label={r.visible ? `${r.name} ausblenden` : `${r.name} einblenden`}
                onClick={() => updateReference(r.id, { visible: !r.visible })}
              >
                {r.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant={diffRef === r.id ? 'secondary' : 'ghost'}
                className="size-8"
                title="Differenz: laufende Messung minus diese Referenz"
                aria-label={`Differenz zu ${r.name}`}
                aria-pressed={diffRef === r.id}
                onClick={() => set({ diffRef: diffRef === r.id ? null : r.id })}
              >
                <GitCompareArrows className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-danger"
                title="Löschen"
                aria-label={`${r.name} löschen`}
                onClick={() => removeReference(r.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

/* -------------------------- Eingang & Kalibrierung ------------------------ */

export function InputCard({
  inputs,
  running,
  levelZ,
  onCalibrate
}: {
  inputs: { id: string; label: string }[]
  running: boolean
  levelZ: number
  onCalibrate: () => void
}): JSX.Element {
  const p = useRta()
  const file = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  async function loadFile(f: File | undefined): Promise<void> {
    if (!f) return
    const res = parseCorrection(await f.text(), f.name)
    if (typeof res === 'string') setFileError(res)
    else {
      setFileError(null)
      set({ correction: res })
    }
  }

  return (
    <SectionCard
      title="Eingang & Kalibrierung"
      desc="Mikrofon wählen, Pegel auf dB SPL bringen, Messmikrofon korrigieren."
      hint="Ohne Kalibrierung zeigt der RTA dBFS (relativ zur Vollaussteuerung). Mit einem Kalibrator (94 oder 114 dB bei 1 kHz) auf dem Mikrofon setzt „Kalibrieren“ den Offset so, dass der Pegel stimmt. Handymikrofone messen unter ~100 Hz und ganz oben zu wenig – für Vergleiche und Feedback reicht das, für Messungen ein Messmikrofon (z. B. per USB) mit seiner Korrekturdatei nehmen."
    >
      <SelectField
        label="Eingang"
        value={p.deviceId ?? ''}
        onChange={(v) => set({ deviceId: v || null })}
      >
        <option value="">Standard</option>
        {inputs.map((d) => (
          <option key={d.id || d.label} value={d.id}>
            {d.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Kanal"
        hint="Bei Interfaces mit zwei Eingängen: welcher gemessen wird. Summe = Mittel aus beiden."
        value={p.channel}
        onChange={(v) => set({ channel: v as Channel })}
      >
        <option value="mix">Summe L+R</option>
        <option value="left">Links</option>
        <option value="right">Rechts</option>
      </SelectField>
      <NumField
        label="Offset"
        unit="dB"
        hint="dBFS + Offset = dB SPL. Leer = nicht kalibriert."
        value={p.offset == null ? '' : trimNum(p.offset, 1)}
        placeholder="dBFS"
        onChange={(v) => {
          const n = parseNum(v)
          set({
            offset: v.trim() === '' ? null : n == null ? p.offset : Math.max(-50, Math.min(200, n))
          })
        }}
      />
      <SelectField
        label="Kalibrator"
        value={String(p.calibratorDb)}
        onChange={(v) => set({ calibratorDb: Number(v) })}
      >
        <option value="94">94 dB (1 Pa)</option>
        <option value="114">114 dB (10 Pa)</option>
      </SelectField>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCalibrate}
          disabled={!running}
          title={
            running && levelZ > -90
              ? `Jetzt gemessen ${fmt(levelZ, 1)} dBFS -> ${p.calibratorDb} dB`
              : 'Erst messen, Kalibrator aufs Mikrofon'
          }
        >
          Kalibrieren
        </Button>
        {p.offset != null && (
          <Button size="sm" variant="ghost" onClick={() => set({ offset: null })}>
            Zurück auf dBFS
          </Button>
        )}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => file.current?.click()}>
            <FileUp className="size-4" /> Korrekturdatei…
          </Button>
          {p.correction && (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate" title={p.correction.name}>
                {p.correction.serial ? `Seriennr. ${p.correction.serial}` : p.correction.name}
              </span>
              · {p.correction.points.length} Punkte
              <button
                type="button"
                className="hover:text-danger"
                aria-label="Korrektur entfernen"
                onClick={() => set({ correction: null })}
              >
                <X className="size-3.5" />
              </button>
            </span>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept=".txt,.cal,.frd,.csv,text/plain"
          className="hidden"
          onChange={(e) => {
            void loadFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {fileError && <p className="text-xs text-danger">{fileError}</p>}
      </div>
    </SectionCard>
  )
}

/* ------------------------------- Anzeige -------------------------------- */

export function DisplayCard(): JSX.Element {
  const p = useRta()
  return (
    <SectionCard title="Anzeige" desc="Wie schnell und wie die Messung gezeigt wird.">
      <SelectField
        label="Mittelung"
        hint="Schnell = 125 ms, Langsam = 1 s (exponentiell), Unendlich = Mittel seit Start/Zurücksetzen – für rosa Rauschen am ruhigsten."
        value={p.averaging}
        onChange={(v) => set({ averaging: v as Averaging })}
      >
        <option value="off">Aus</option>
        <option value="fast">Schnell</option>
        <option value="slow">Langsam</option>
        <option value="inf">Unendlich</option>
      </SelectField>
      <SelectField
        label="Spitzen"
        hint="Markiert je Band den höchsten Pegel – gehalten oder langsam fallend (15 dB/s)."
        value={p.peak}
        onChange={(v) => set({ peak: v as PeakMode })}
      >
        <option value="off">Aus</option>
        <option value="hold">Halten</option>
        <option value="fall">Fallend</option>
      </SelectField>
      <SelectField
        label="Pegelmesser"
        hint="Zeitbewertung nach IEC 61672: Fast 125 ms, Slow 1 s."
        value={p.meter}
        onChange={(v) => set({ meter: v as MeterSpeed })}
      >
        <option value="F">Fast</option>
        <option value="S">Slow</option>
      </SelectField>
      <SelectField
        label="Skala"
        hint="Automatisch folgt dem Signal; fest zeigt −80 … 0 dBFS bzw. 40 … 120 dB SPL."
        value={p.scale}
        onChange={(v) => set({ scale: v as ScaleMode })}
      >
        <option value="auto">Automatisch</option>
        <option value="fixed">Fest</option>
      </SelectField>
      <SelectField
        label="Spektrogramm"
        hint="Unter dem Spektrum, Farbe = Pegel, eine Zeile je 0,1 s. Wasserfall: Frequenz waagrecht wie im Spektrum darüber (eine Linie steht genau unter ihrer Spitze), Zeit läuft nach unten. Zeitachse: Zeit waagrecht, Frequenz senkrecht. Zeiger bzw. Finger zeigt Frequenz, Note, Pegel und wie lange es her ist."
        value={p.spectrogram}
        onChange={(v) => set({ spectrogram: v as SpectroMode })}
      >
        <option value="off">Aus</option>
        <option value="waterfall">Wasserfall</option>
        <option value="timeline">Zeitachse waagrecht</option>
      </SelectField>
      <Checkbox
        checked={p.feedback}
        onChange={(feedback) => set({ feedback })}
        label="Feedback-Finder"
        hint="Sucht stehende, schmale Spitzen (Rückkopplung) und schlägt Filter vor."
      />
    </SectionCard>
  )
}
