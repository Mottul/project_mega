// Gemeinsame Bausteine der kleinen Werkzeuge (Rechner, RTA, Testtongenerator): schlankes,
// einheitliches Formular-Layout (Beschriftung links, Bedienelement rechts), hervorgehobene
// Ergebnis-Zeilen und Zahl-Helfer. Bewusst dezimalfähig (NumberField rundet auf ganze Zahlen ->
// für freies Rechnen nicht nutzbar). Ergebnisse tragen den Akzent; bei verknüpften Feldern zeigt
// die Akzentfarbe live, welche Werte gerade BERECHNET werden.
//
// Die kleinen Werkzeuge laufen in eigenen, schmalen Fenstern (shared/toolWindows) und am Handy
// (Rechner-PWA), deshalb:
// - Hintergrund und Formeln hinter dem ⓘ (`hint`), sichtbar bleibt eine kurze Zeile je Karte.
// - Unter ~330 px rückt die Beschriftung über das Feld (flex-wrap), ab ~770 px stehen zwei
//   Karten nebeneinander (auto-fit-Raster) – ohne Medienabfragen, die Fensterbreite entscheidet.
// - Auswahl: bis vier kurze Möglichkeiten als Knopfgruppe (`ChoiceField`, ein Tipp, alles
//   sichtbar), sonst als Liste (`SelectField`).
// - Bedienfelder in ganzer Breite (Testtongenerator): `FieldBlock` – Beschriftung darüber, der
//   Wert rechts daneben; so stehen Knopfgruppen, Schieber und Schnellwahl bündig untereinander.
// - Selten Gebrauchtes (Einstellungen des RTA) in `FoldCard`: zugeklappt nur eine Zeile mit der
//   Kurzfassung – beim ersten Öffnen erschlägt die Seite nicht.
import { Children, createContext, useContext, useId, useState, type ReactNode } from 'react'
import { ChevronDown, Square, type LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Input } from '@renderer/components/ui/input'
import { Segmented, segmentButtonClass, segmentGroupClass } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { flag, usePersistentState } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'

/**
 * Zentrierte Rechner-Seite. Mehrere Karten stehen nebeneinander, sobald zwei je 22rem breit
 * Platz haben; `note` steht darunter über die ganze Breite (Sicherheitshinweise), `head` darüber
 * (eine Anzeige, die die volle Breite braucht – das Spektrum des RTA).
 */
export function CalcPage({
  children,
  note,
  head
}: {
  children: ReactNode
  note?: ReactNode
  head?: ReactNode
}): JSX.Element {
  const multi = Children.toArray(children).length > 1
  return (
    <div className={cn('mx-auto space-y-4 p-4 sm:p-6', multi || head ? 'max-w-5xl' : 'max-w-2xl')}>
      {head}
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
 * Karte, die sich auf- und zuklappen lässt: zugeklappt nur der Titel und rechts die Kurzfassung
 * der Werte (`summary`), aufgeklappt wie `SectionCard`. Der Zustand wird je `id` gemerkt
 * (Bedien-Kleinigkeit). Der Titel ist eine Überschrift mit einem Knopf darin – so finden
 * Vorlesewerkzeuge die Karten wie die übrigen; das ⓘ steht im Inhalt, ein Knopf im Knopf geht nicht.
 */
export function FoldCard({
  id,
  title,
  summary,
  desc,
  hint,
  defaultOpen = false,
  children
}: {
  /** Schlüssel für den gemerkten Zustand, z. B. „rta:anzeige“ */
  id: string
  title: string
  /** Kurzfassung, bleibt auch zugeklappt sichtbar */
  summary?: ReactNode
  desc?: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}): JSX.Element {
  const [open, setOpen] = usePersistentState(`panel:${id}`, defaultOpen, flag)
  const bodyId = useId()
  return (
    <Card className="overflow-hidden">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 sm:px-5"
        >
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {title}
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
            {summary}
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              !open && '-rotate-90'
            )}
          />
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="px-4 pb-4 sm:px-5 sm:pb-5">
          {(desc || hint) && (
            <div className="flex items-start gap-2">
              {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
              {hint && <InfoTip text={hint} label={`Erklärung zu „${title}“`} />}
            </div>
          )}
          <div className={cn('space-y-3', (desc || hint) && 'mt-4')}>{children}</div>
        </div>
      )}
    </Card>
  )
}

/**
 * Beschriftung einer Zeile. Das ⓘ steht NEBEN dem <label> (wie bei `Field`): Läge es darin,
 * wäre es das erste beschriftbare Element, und ein Klick auf die Beschriftung löste das ⓘ aus.
 * Ohne `htmlFor` (Knopfgruppe) bloßer Text: Ein <label> gälte sonst für den ersten Knopf.
 */
function RowLabel({
  htmlFor,
  label,
  hint,
  className = 'w-40'
}: {
  htmlFor?: string
  label: string
  hint?: string
  className?: string
}): JSX.Element {
  return (
    <span
      className={cn('flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground', className)}
    >
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {hint && <InfoTip text={hint} label={`Erklärung zu „${label}“`} />}
    </span>
  )
}

/** Zeile mit Beschriftung links und Feld rechts; zu schmal -> Beschriftung darüber. */
const rowClass = 'flex flex-wrap items-center gap-x-3 gap-y-1.5'
const fieldBox = 'relative min-w-[8rem] flex-1'

/**
 * Eine Zeile mit beliebigem Bedienelement – die Grundform von NumField, SelectField,
 * ChoiceField und RangeField. `htmlFor` verbindet die Beschriftung mit einem Feld. `fit`: Das
 * Element schrumpft nicht unter seine eigene Breite (Knopfgruppe) und rückt, wo der Platz neben
 * der Beschriftung fehlt, darunter.
 */
export function FieldRow({
  label,
  hint,
  htmlFor,
  fit,
  children
}: {
  label: string
  hint?: string
  htmlFor?: string
  fit?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div className={rowClass}>
      <RowLabel htmlFor={htmlFor} label={label} hint={hint} />
      <div className={cn(fieldBox, fit && 'min-w-fit')}>{children}</div>
    </div>
  )
}

/**
 * Beschriftung über dem Bedienelement, rechts in ihrer Zeile der Wert (`value`: Text oder ein
 * kleines Feld) – für Bedienfelder in ganzer Breite. Neben einer Beschriftung links bliebe am
 * Handy zu wenig Platz: Knopfgruppen stünden einspaltig, Zahlenknöpfe ragten heraus.
 */
export function FieldBlock({
  label,
  hint,
  htmlFor,
  value,
  children
}: {
  label: string
  hint?: string
  htmlFor?: string
  value?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <RowLabel htmlFor={htmlFor} label={label} hint={hint} className="min-w-0" />
        {value != null && (
          <div className="flex min-w-0 items-center justify-end text-sm font-medium tabular-nums">
            {value}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

interface LinkedFieldProps {
  value: string
  derived: boolean
  onChange: (v: string) => void
  onFocus: () => void
}

/**
 * Verknüpfte Felder (Durchmesser ↔ Radius ↔ Umfang, Leistung ↔ Strom …): Das zuletzt bearbeitete
 * Feld ist die Quelle (`driver`, Eingabe `raw`), die übrigen zeigen ihren berechneten Wert.
 * `bind(feld, berechnet)` liefert die Props eines NumField: Tippen macht das Feld zur Quelle; der
 * Fokus auf einem berechneten Feld übernimmt dessen Wert als Eingabe – so springt nichts.
 */
export function useLinkedFields<F extends string>(
  first: F,
  initial: string
): { driver: F; raw: string; bind: (field: F, computed: string) => LinkedFieldProps } {
  const [driver, setDriver] = useState<F>(first)
  const [raw, setRaw] = useState(initial)
  const bind = (field: F, computed: string): LinkedFieldProps => ({
    value: field === driver ? raw : computed,
    derived: field !== driver,
    onChange: (v) => {
      setDriver(field)
      setRaw(v)
    },
    onFocus: () => {
      if (field === driver) return
      setDriver(field)
      setRaw(computed)
    }
  })
  return { driver, raw, bind }
}

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
    <FieldRow label={label} hint={hint} htmlFor={id}>
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
      {unit && <FieldUnit>{unit}</FieldUnit>}
    </FieldRow>
  )
}

/** Einheit rechts im Feld (das Feld braucht dafür `pr-12`) */
export function FieldUnit({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
      {children}
    </span>
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
    <FieldRow label={label} hint={hint} htmlFor={id}>
      <Select id={id} className="w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </Select>
    </FieldRow>
  )
}

/**
 * Auswahl aus wenigen kurzen Möglichkeiten als Knopfgruppe: ein Tipp, alles sichtbar (statt
 * einer Liste mit zwei Tipps). `wrap`: Die Knöpfe brechen in gleich breiten Spalten um – für
 * mehr als vier, die man im Betrieb oft umschaltet.
 */
export function ChoiceField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  wrap,
  disabled
}: {
  label: string
  hint?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  wrap?: boolean
  disabled?: boolean
}): JSX.Element {
  return (
    <FieldRow label={label} hint={hint} fit={!wrap}>
      <Segmented
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        wrap={wrap}
        disabled={disabled}
      />
    </FieldRow>
  )
}

/** Schieber in der Akzentfarbe, mit genug Höhe für den Finger */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  id,
  className
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** Name für Vorlesewerkzeuge (z. B. „Pegel in dBFS“) */
  label: string
  id?: string
  className?: string
}): JSX.Element {
  return (
    <input
      type="range"
      id={id}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn('h-8 w-full cursor-pointer accent-[hsl(var(--primary))]', className)}
    />
  )
}

/** Zeile mit Schieber und dem Wert als Text daneben; `children` darunter (z. B. Schnellwahl) */
export function RangeField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  display,
  ariaLabel,
  children
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** angezeigter Wert, z. B. „−18 dBFS“ */
  display: string
  /** Name des Schiebers, sonst die Beschriftung */
  ariaLabel?: string
  children?: ReactNode
}): JSX.Element {
  const id = useId()
  return (
    <FieldRow label={label} hint={hint} htmlFor={id}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <Slider
            id={id}
            label={ariaLabel ?? label}
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={onChange}
            className="min-w-0 flex-1"
          />
          <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
            {display}
          </span>
        </div>
        {children}
      </div>
    </FieldRow>
  )
}

/**
 * Schnellwahl: kleine Knöpfe, die einen Wert setzen; der gerade gewählte ist gedrückt. `fill`:
 * eine Reihe über die ganze Breite, gleich breit und im Aussehen einer Knopfgruppe – passt zu
 * `Segmented` darüber oder darunter.
 */
export function QuickPick<T extends string | number>({
  label,
  value,
  options,
  onPick,
  fill
}: {
  /** Name der Gruppe für Vorlesewerkzeuge */
  label: string
  value: T
  options: { value: T; label: string }[]
  onPick: (v: T) => void
  fill?: boolean
}): JSX.Element {
  if (fill) {
    return (
      <div role="group" aria-label={label} className={cn(segmentGroupClass, 'flex gap-0.5')}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={cn(
              segmentButtonClass(value === o.value),
              'min-w-0 flex-1 px-1 tabular-nums'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Button
          key={String(o.value)}
          size="sm"
          variant={value === o.value ? 'secondary' : 'outline'}
          aria-pressed={value === o.value}
          onClick={() => onPick(o.value)}
          className="tabular-nums [@media(pointer:coarse)]:h-9"
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

/**
 * Start und Stopp für kleine Werkzeuge, die laufen (RTA misst, Testton spielt): Start im Akzent
 * mit Symbol; läuft es, eine rote Fläche „Stopp“ mit gefülltem Quadrat (Rot = live, und ein
 * leeres Quadrat sähe aus wie eine Checkbox). `big` für die Hauptaktion am Handy.
 */
export function RunButton({
  running,
  starting = false,
  onStart,
  onStop,
  startLabel,
  startIcon: StartIcon,
  disabled,
  big,
  className
}: {
  running: boolean
  starting?: boolean
  onStart: () => void
  onStop: () => void
  startLabel: string
  startIcon: LucideIcon
  disabled?: boolean
  big?: boolean
  className?: string
}): JSX.Element {
  const size = big ? 'h-12 min-w-[10rem] px-6 text-base [&_svg]:size-5' : undefined
  if (running) {
    return (
      <Button
        size={big ? 'default' : 'sm'}
        variant="destructive"
        onClick={onStop}
        className={cn(size, className)}
      >
        <Square className="size-4 fill-current" /> Stopp
      </Button>
    )
  }
  return (
    <Button
      size={big ? 'default' : 'sm'}
      onClick={onStart}
      disabled={starting || disabled}
      className={cn(size, className)}
    >
      <StartIcon className="size-4" /> {starting ? 'Startet…' : startLabel}
    </Button>
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
