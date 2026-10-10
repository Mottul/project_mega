// Gemeinsame Bausteine der Rechner-Tools: schlankes, einheitliches Formular-Layout
// (Label links, Eingabe rechts mit Einheit), hervorgehobene Ergebnis-Zeilen und
// Zahl-Helfer. Bewusst dezimalfähig (NumberField rundet auf ganze Zahlen -> hier
// nicht nutzbar). Ergebnisse tragen den Akzent; bei verknüpften Feldern zeigt die
// Akzentfarbe live, welche Werte gerade BERECHNET werden.
//
// Die Rechner laufen in eigenen, schmalen Fenstern (shared/toolWindows), deshalb:
// - Hintergrund und Formeln hinter dem ⓘ (`hint`), sichtbar bleibt eine kurze Zeile je Karte.
// - Unter ~330 px rückt die Beschriftung über das Feld (flex-wrap), ab ~770 px stehen zwei
//   Karten nebeneinander (auto-fit-Raster) – ohne Medienabfragen, die Fensterbreite entscheidet.
import { Children, createContext, useContext, useId, type ReactNode } from 'react'
import { Card } from '@renderer/components/ui/card'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Input } from '@renderer/components/ui/input'
import { selectClass as selectBase } from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'

// Rechner-Layouts sind zentriert -> volle Breite. Basis-Styling kommt aus dem
// gemeinsamen Select-Baustein (eine Quelle).
export const selectClass = `${selectBase} w-full`

/**
 * Zentrierte Rechner-Seite. Mehrere Karten stehen nebeneinander, sobald zwei je 22rem breit
 * Platz haben; `note` steht darunter über die ganze Breite (Sicherheitshinweise).
 */
export function CalcPage({
  children,
  note
}: {
  children: ReactNode
  note?: ReactNode
}): JSX.Element {
  const multi = Children.toArray(children).length > 1
  return (
    <div className={cn('mx-auto space-y-4 p-4 sm:p-6', multi ? 'max-w-5xl' : 'max-w-2xl')}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] items-start gap-4 sm:gap-5">
        {children}
      </div>
      {note && <CalcNote>{note}</CalcNote>}
    </div>
  )
}

export function SectionCard({
  title,
  desc,
  hint,
  children
}: {
  title: string
  /** eine kurze Zeile: was tut man hier? */
  desc?: string
  /** Hintergrund, Formel, Beispiel – hinter dem ⓘ */
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{title}</h2>
        {hint && <InfoTip text={hint} label={`Erklärung zu „${title}“`} />}
      </div>
      {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  )
}

/**
 * Beschriftung einer Zeile. Das ⓘ steht NEBEN dem <label> (wie bei `Field`): Läge es darin,
 * wäre es das erste beschriftbare Element, und ein Klick auf die Beschriftung löste das ⓘ aus.
 */
function RowLabel({
  htmlFor,
  label,
  hint
}: {
  htmlFor: string
  label: string
  hint?: string
}): JSX.Element {
  return (
    <span className="flex w-40 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
      <label htmlFor={htmlFor}>{label}</label>
      {hint && <InfoTip text={hint} label={`Erklärung zu „${label}“`} />}
    </span>
  )
}

/** Zeile mit Beschriftung links und Feld rechts; zu schmal -> Beschriftung darüber. */
const rowClass = 'flex flex-wrap items-center gap-x-3 gap-y-1.5'
const fieldBox = 'relative min-w-[8rem] flex-1'

/** Eingabe- oder Ergebnisfeld mit Label und Einheit. `derived` markiert bei
 *  verknüpften Feldern den gerade BERECHNETEN Wert (Akzentfarbe) – tippt man
 *  hinein, wird das Feld zur Eingabe und die Markierung wandert weiter. */
export function NumField({
  label,
  hint,
  unit,
  value,
  onChange,
  onFocus,
  readOnly,
  derived,
  placeholder
}: {
  label: string
  hint?: string
  unit?: string
  value: string
  onChange?: (v: string) => void
  onFocus?: () => void
  readOnly?: boolean
  derived?: boolean
  placeholder?: string
}): JSX.Element {
  const id = useId()
  return (
    <div className={rowClass}>
      <RowLabel htmlFor={id} label={label} hint={hint} />
      <div className={fieldBox}>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          title={derived ? 'berechneter Wert – zum Eingeben einfach anklicken' : undefined}
          onFocus={onFocus}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          className={cn(
            unit && 'pr-12',
            readOnly && 'cursor-default bg-muted/30',
            derived && 'border-primary/40 bg-primary/[0.07] font-semibold text-primary'
          )}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  children
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}): JSX.Element {
  const id = useId()
  return (
    <div className={rowClass}>
      <RowLabel htmlFor={id} label={label} hint={hint} />
      <div className={fieldBox}>
        <select
          id={id}
          className={selectClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {children}
        </select>
      </div>
    </div>
  )
}

/** Liegt die Ergebniszeile in einem ReadoutGrid? Dann als Kachel (Beschriftung über dem Wert). */
const InGrid = createContext(false)

/** Ergebniszeile. `accent` hebt DIE Kernaussage des Rechners hervor,
 *  `big` vergrößert den Wert (Hero-Ergebnis), `sub` zeigt denselben Wert in einer zweiten
 *  Einheit klein daneben (z. B. kN neben kg) – eine Zeile statt zwei. Im ReadoutGrid steht die
 *  Beschriftung über dem Wert: In halber Breite bräche sie sonst je nach Länge unruhig um. */
export function Readout({
  label,
  hint,
  value,
  unit,
  sub,
  big,
  accent
}: {
  label: string
  hint?: string
  value: string
  unit?: string
  sub?: string
  big?: boolean
  accent?: boolean
}): JSX.Element {
  const tile = useContext(InGrid)
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        tile ? 'flex flex-col gap-0.5' : 'flex flex-wrap items-baseline justify-between gap-x-3',
        accent ? 'border-primary/35 bg-primary/[0.09]' : 'border-border bg-muted/20'
      )}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-sm',
          accent ? 'font-medium text-primary' : 'text-muted-foreground'
        )}
      >
        {label}
        {hint && <InfoTip text={hint} label={`Erklärung zu „${label}“`} />}
      </span>
      <span
        className={cn(
          'tabular-nums',
          accent && 'text-primary',
          big ? 'text-2xl font-bold tracking-tight' : 'text-base font-semibold'
        )}
      >
        {value || '–'}
        {unit && value && (
          <span
            className={cn(
              'ml-1 text-xs font-normal',
              accent ? 'text-primary/70' : 'text-muted-foreground'
            )}
          >
            {unit}
          </span>
        )}
        {sub && value && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">· {sub}</span>
        )}
      </span>
    </div>
  )
}

/**
 * Ergebnisse als Kacheln nebeneinander, solange je 10rem Platz ist – gemessen an der Karte,
 * nicht am Fenster (in zweispaltigen Rechnern ist die Karte schmal, das Fenster breit).
 */
export function ReadoutGrid({ children }: { children: ReactNode }): JSX.Element {
  return (
    <InGrid.Provider value={true}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2">
        {children}
      </div>
    </InGrid.Provider>
  )
}

/** Hinweis zur Eingabe: `warning` (bernstein, wie überall in der App) oder `danger` (rot). */
export function CalcAlert({
  tone,
  children
}: {
  tone: 'warning' | 'danger'
  children: ReactNode
}): JSX.Element {
  return (
    <p
      role="status"
      className={cn(
        'rounded-md border px-3 py-2 text-xs font-medium',
        tone === 'warning'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 light:text-amber-700'
          : 'border-destructive/40 bg-destructive/10 text-destructive'
      )}
    >
      {children}
    </p>
  )
}

/** Kleine Fußnote, die sichtbar bleiben muss (Sicherheit); alles andere gehört hinter ein ⓘ. */
export function CalcNote({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

/** Text -> Zahl (akzeptiert Komma als Dezimaltrenner). Leer/ungültig -> null. */
export function parseNum(s: string): number | null {
  const t = (s ?? '').replace(',', '.').trim()
  if (t === '' || t === '-' || t === '.' || !/^-?\d*\.?\d*$/.test(t)) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/**
 * Zahl als editierbarer Klartext (ohne Tausenderpunkte), auf n Stellen gekürzt – mit Komma wie
 * die Ergebnisse (`fmt`); parseNum liest es zurück.
 */
export function trimNum(n: number | null, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return ''
  return String(Number(n.toFixed(digits))).replace('.', ',')
}

/** Zahl hübsch für Ergebnisse (de-DE, Tausenderpunkte). */
export function fmt(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return ''
  return Number(n.toFixed(digits)).toLocaleString('de-DE', { maximumFractionDigits: digits })
}
