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
//   Kurzfassung – beim ersten Öffnen erschlägt die Seite nicht. Die zweite Frage eines Rechners
//   (Stromlast: „Geräte pro Stromkreis“) ist ab Werk nur offen, wenn ihre Karte neben der ersten
//   steht (`defaultOpen="nebeneinander"`); am Handy zeigt sie zugeklappt ihre Antwort.
// - Nichts bleibt stumm: Eine Fehleingabe ist rot umrandet (`NumField`), der Status eines
//   Ergebnisses steht in Farbe und Symbol der App (`Readout` mit `tone`) statt als ✓/✗ im Text.
import {
  Children,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react'
import { ChevronDown, Square, type LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { parseDecimal } from '@renderer/components/ui/decimal-field'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { Input } from '@renderer/components/ui/input'
import { Segmented, segmentButtonClass, segmentGroupClass } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { STATUS, type StatusTone } from '@renderer/components/ui/status'
import { flag, usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'

/**
 * Wie viele Spalten das Raster der Rechner-Seite gerade hat: ab 2 stehen die Karten
 * nebeneinander (breites Fenster am Rechner), mit 1 untereinander (Handy, schmales Fenster).
 */
const Spalten = createContext(1)

/**
 * Spalten aus dem berechneten `grid-template-columns` des Rasters („406px 406px“ -> 2). auto-fit
 * legt Spalten ohne Karte auf 0px – die zählen nicht, ebenso „none“ (kein Raster).
 */
export function spaltenZahl(template: string): number {
  return Math.max(1, template.split(' ').filter((t) => parseFloat(t) > 0).length)
}

/**
 * Spalten des Rasters, gemessen statt aus der Fensterbreite geschätzt: Der Kompaktmodus
 * verkleinert die Karten, nicht das Fenster. Vor dem Zeichnen gemessen – eine Karte, die nur
 * nebeneinander ab Werk offen ist, erschiene sonst im ersten Bild zugeklappt.
 */
function useSpalten(ref: RefObject<HTMLElement>): number {
  const [n, setN] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => setN(spaltenZahl(getComputedStyle(el).gridTemplateColumns))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return n
}

/**
 * Zentrierte Rechner-Seite. Mehrere Karten stehen nebeneinander, sobald zwei je 22rem breit
 * Platz haben; `note` steht darunter über die ganze Breite (Sicherheitshinweise), `head` darüber
 * (eine Anzeige, die die volle Breite braucht – das Spektrum des RTA). Wie viele Karten gerade
 * nebeneinander stehen, erfahren die Karten über `Spalten` (`FoldCard`, „nebeneinander“).
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
  const raster = useRef<HTMLDivElement>(null)
  const spalten = useSpalten(raster)
  return (
    <div className={cn('mx-auto space-y-4 p-4 sm:p-6', multi || head ? 'max-w-5xl' : 'max-w-2xl')}>
      {head}
      <div
        ref={raster}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] items-start gap-4 sm:gap-5"
      >
        <Spalten.Provider value={spalten}>{children}</Spalten.Provider>
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
 * Gemerkter Zustand einer `FoldCard`: auf, zu oder – noch nie selbst geklappt – `null`, dann gilt
 * „ab Werk“. Gespeichert wie bisher als '1'/'0' (`flag`).
 */
const geklappt: Codec<boolean | null> = { parse: flag.parse, format: (v) => (v ? '1' : '0') }

/**
 * Karte, die sich auf- und zuklappen lässt: zugeklappt nur der Titel und rechts die Kurzfassung
 * der Werte (`summary`), aufgeklappt wie `SectionCard`. Gemerkt wird je `id`, was man selbst
 * auf- oder zuklappt (Bedien-Kleinigkeit); bis dahin gilt `defaultOpen` – mit „nebeneinander“
 * auch dann, wenn das Fenster danach breiter oder schmaler wird. Der Titel ist eine Überschrift
 * mit einem Knopf darin – so finden Vorlesewerkzeuge die Karten wie die übrigen; das ⓘ steht im
 * Inhalt, ein Knopf im Knopf geht nicht.
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
  /**
   * Ab Werk offen? „nebeneinander“: nur, solange die Karte neben einer anderen steht (breites
   * Fenster) – untereinander (Handy) zeigt sie zugeklappt nur ihre Kurzfassung.
   */
  defaultOpen?: boolean | 'nebeneinander'
  children: ReactNode
}): JSX.Element {
  const nebeneinander = useContext(Spalten) > 1
  const abWerk = defaultOpen === 'nebeneinander' ? nebeneinander : defaultOpen
  const [gemerkt, setGemerkt] = usePersistentState(`panel:${id}`, null, geklappt)
  const open = gemerkt ?? abWerk
  const bodyId = useId()
  return (
    <Card className="overflow-hidden">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setGemerkt((g) => !(g ?? abWerk))}
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

/**
 * Eingabe- oder Ergebnisfeld mit Label und Einheit. `derived` markiert bei verknüpften Feldern
 * den gerade BERECHNETEN Wert (Akzentfarbe) – tippt man hinein, wird das Feld zur Eingabe und die
 * Markierung wandert weiter.
 *
 * Eine Fehleingabe ist rot umrandet und trägt `aria-invalid`, damit sie nicht stumm bleibt (das
 * Ergebnis zeigt sonst nur „–“): Was `parseNum` (bzw. `parse`) nicht lesen kann, erkennt das Feld
 * selbst; `invalid` meldet Werte, die lesbar, aber nicht rechenbar sind (Gain 0) – das sagt der
 * Rechenkern (`invalid` in seinem Ergebnis). Leer ist nie ein Fehler; rechnet der Kern dann mit
 * einer Vorgabe, steht sie als `placeholder` im Feld.
 */
export function NumField({
  label,
  hint,
  unit,
  value,
  onChange,
  onFocus,
  derived,
  invalid,
  signed,
  digits,
  parse = parseNum,
  placeholder
}: {
  label: string
  hint?: string
  unit?: string
  value: string
  onChange?: (v: string) => void
  onFocus?: () => void
  derived?: boolean
  /** lesbar, aber nicht rechenbar – rot umrandet wie eine Fehleingabe */
  invalid?: boolean
  /** Der Wert darf negativ sein (Temperatur): am Handy eine Tastatur mit Minus */
  signed?: boolean
  /** Eingabe nur aus Ziffern (Timecode): am Handy die Zifferntastatur ohne Komma und Doppelpunkt */
  digits?: boolean
  /** liest den Text (null = nicht lesbar) – für eine eigene Schreibweise wie den Timecode */
  parse?: (text: string) => unknown
  placeholder?: string
}): JSX.Element {
  const id = useId()
  const bad = value.trim() !== '' && (invalid || parse(value) == null)
  return (
    <FieldRow label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        // Die Dezimaltastatur hat am iPhone kein Minus (WebKit-Fehler 193825) – Felder mit
        // negativen Werten öffnen deshalb die volle Tastatur.
        inputMode={digits ? 'numeric' : signed ? 'text' : 'decimal'}
        value={value}
        placeholder={placeholder}
        aria-invalid={bad || undefined}
        title={derived ? 'berechneter Wert – zum Eingeben einfach anklicken' : undefined}
        onFocus={onFocus}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={cn(
          unit && 'pr-12',
          derived && 'border-primary/40 bg-primary/[0.07] font-semibold text-primary',
          // auch der Fokusring: Beim Tippen verdeckte der Akzent sonst das Rot
          bad && 'border-danger focus-visible:ring-danger/70'
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

/** Statusstufen eines Ergebnisses; „info“ ist keine Bewertung */
type ReadoutTone = Exclude<StatusTone, 'info'>

/** Ergebniszeile. `accent` hebt DIE Kernaussage des Rechners hervor,
 *  `big` vergrößert den Wert (Hero-Ergebnis), `sub` zeigt denselben Wert in einer zweiten
 *  Einheit klein daneben (z. B. kN neben kg) – eine Zeile statt zwei. `tone` bewertet das
 *  Ergebnis („ausreichend“, „zu dunkel“): Wert in der Statusfarbe, davor das Symbol aus `STATUS`
 *  – wie überall in der App statt ✓, ✗ oder ⚠ im Text; ohne Wert („–“) bleibt die Zeile neutral.
 *  Im ReadoutGrid steht die Beschriftung über dem Wert: In halber Breite bräche sie sonst je nach
 *  Länge unruhig um. */
export function Readout({
  label,
  hint,
  value,
  unit,
  sub,
  big,
  accent,
  tone
}: {
  label: string
  hint?: string
  value: string
  unit?: string
  sub?: string
  big?: boolean
  accent?: boolean
  tone?: ReadoutTone
}): JSX.Element {
  const tile = useContext(InGrid)
  const status = tone && value ? STATUS[tone] : null
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
          status?.className,
          big ? 'text-2xl font-bold tracking-tight' : 'text-base font-semibold'
        )}
      >
        {/* so groß wie die Schrift, auf deren Mitte gesetzt (Tailwind macht SVGs sonst zu Blöcken) */}
        {status && <status.icon className="mr-1.5 inline-block size-[1em] align-[-0.125em]" />}
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
 * Ergebnisse als Kacheln nebeneinander, solange je 10rem (`min`) Platz ist – gemessen an der Karte,
 * nicht am Fenster (in zweispaltigen Rechnern ist die Karte schmal, das Fenster breit).
 */
export function ReadoutGrid({
  children,
  min
}: {
  children: ReactNode
  /** Mindestbreite einer Kachel (CSS), sonst 10rem – kleiner für kurze Werte (Pegel des RTA) */
  min?: string
}): JSX.Element {
  return (
    <InGrid.Provider value={true}>
      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2"
        style={
          min ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))` } : {}
        }
      >
        {children}
      </div>
    </InGrid.Provider>
  )
}

/** Kleine Fußnote, die sichtbar bleiben muss (Sicherheit); alles andere gehört hinter ein ⓘ. */
export function CalcNote({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

/**
 * Text -> Zahl (Komma oder Punkt als Dezimaltrenner), leer oder ungültig -> null. Reicht nur
 * `parseDecimal` weiter: eine Lese-Funktion für Rechner und `DecimalField`, damit beide dieselben
 * Eingaben annehmen – und `NumField` rot zeigt, was der Rechner nicht liest.
 */
export function parseNum(s: string): number | null {
  return parseDecimal(s)
}

/**
 * Text -> Zahl für Felder, die leer mit einer Vorgabe rechnen (Gain 1, 20 °C): leer -> null (der
 * Rechenkern nimmt die Vorgabe und das Feld zeigt sie als Platzhalter), unlesbar -> NaN. So
 * rechnet der Kern eine Fehleingabe nicht still mit der Vorgabe, sondern gar nicht – wie einen
 * lesbaren, aber unbrauchbaren Wert (NaN besteht keine Bereichsprüfung).
 */
export function parseOptional(s: string): number | null {
  return s.trim() === '' ? null : (parseNum(s) ?? Number.NaN)
}

/**
 * Zahl als editierbarer Klartext (ohne Tausenderpunkte), auf n Stellen gekürzt – mit Komma wie
 * die Ergebnisse (`fmt`); parseNum liest es zurück.
 */
export function trimNum(n: number | null, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return ''
  return plainNumber(Number(n.toFixed(digits))).replace('.', ',')
}

/**
 * Zahl als Text ohne Exponent. Ab 10²¹ schreibt JavaScript „1e+21“ – das läse `parseNum` nicht,
 * ein so großes berechnetes Feld wäre rot. Solche Zahlen sind immer ganz: die Ziffern der kurzen
 * Schreibweise mit Nullen auffüllen (darunter bleibt `String()`, bitgleich wie bisher).
 */
function plainNumber(n: number): string {
  const text = String(n)
  const exp = /^(-?)(\d)(?:\.(\d+))?e\+(\d+)$/.exec(text)
  if (!exp) return text
  const [, sign, int, frac = '', power] = exp
  return sign + (int + frac).padEnd(1 + Number(power), '0')
}

/** Zahl hübsch für Ergebnisse (de-DE, Tausenderpunkte). */
export function fmt(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return ''
  return Number(n.toFixed(digits)).toLocaleString('de-DE', { maximumFractionDigits: digits })
}
