// Gemerkte Eingaben eines Rechners (Gesamtplan, K4): Alle Felder stehen als Text unter
// `calc:<kennung>` – eine Bedien-Kleinigkeit (usePersistentState, localStorage), in der App und
// in der Handy-PWA gleich. Gelesen wird wie fremde Eingabe: nur bekannte Felder, nur Text bis
// 40 Zeichen, bei einer Auswahl nur ihre Werte – sonst gilt die Vorgabe, also der Beispielwert.
// So öffnet das Fenster wieder mit dem, was man zuletzt eingetippt hat; „Zurücksetzen“ unter den
// Karten (CalcPage) holt die Beispielwerte zurück. Nicht für RTA und Testtongenerator: Die haben
// ihren eigenen Store.

import { useCallback, useMemo } from 'react'
import { usePersistentState, type Codec } from '@renderer/lib/usePersistentState'

/** Längster Text, den ein gemerktes Feld haben darf – ein Timecode hat 11 Zeichen */
export const MAX_TEXT = 40

/**
 * Vorgabe eines Felds: der Text ab Werk – bei einer Auswahl (Knopfgruppe, Liste) und bei der
 * Quelle verknüpfter Felder zusammen mit den Werten, die es annehmen darf.
 */
export type FieldSpec = string | { vorgabe: string; erlaubt: readonly string[] }

/** Felder eines Rechners mit ihren Vorgaben */
export type CalcSpec<K extends string> = Readonly<Record<K, FieldSpec>>

/** Eingaben eines Rechners, je Feld als Text */
export type CalcValues<K extends string> = Record<K, string>

function vorgabe(spec: FieldSpec): string {
  return typeof spec === 'string' ? spec : spec.vorgabe
}

function felder<K extends string>(spec: CalcSpec<K>): K[] {
  return Object.keys(spec) as K[]
}

/** Die Beispielwerte ab Werk */
export function vorgaben<K extends string>(spec: CalcSpec<K>): CalcValues<K> {
  const out = {} as CalcValues<K>
  for (const k of felder(spec)) out[k] = vorgabe(spec[k])
  return out
}

/** Taugt ein gemerkter Wert für das Feld? Text bis 40 Zeichen, bei einer Auswahl einer ihrer Werte */
function taugt(value: unknown, spec: FieldSpec): value is string {
  if (typeof value !== 'string' || value.length > MAX_TEXT) return false
  return typeof spec === 'string' || spec.erlaubt.includes(value)
}

/**
 * Gemerkten Stand lesen (JSON-Objekt): jedes bekannte Feld geprüft – fehlt es oder taugt es
 * nicht, nimmt es seine Vorgabe; fremde Felder fallen weg. Kein Objekt (Unsinn, Liste, Zahl)
 * -> null, dann gelten alle Vorgaben.
 */
export function readCalcFields<K extends string>(
  raw: string,
  spec: CalcSpec<K>
): CalcValues<K> | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return null
  const stored = data as Record<string, unknown>
  const out = vorgaben(spec)
  for (const k of felder(spec)) {
    // nur eigene Einträge: Ein Feld wie „constructor“ käme sonst aus dem Prototyp
    if (Object.prototype.hasOwnProperty.call(stored, k) && taugt(stored[k], spec[k])) {
      out[k] = stored[k] as string
    }
  }
  return out
}

/** Weicht eine Eingabe von ihrer Vorgabe ab? Nur dann zeigt der Rechner „Zurücksetzen“. */
export function weichtAb<K extends string>(values: CalcValues<K>, spec: CalcSpec<K>): boolean {
  return felder(spec).some((k) => values[k] !== vorgabe(spec[k]))
}

/** Wie der Stand gespeichert wird: JSON, beim Lesen geprüft (`readCalcFields`) */
export function calcCodec<K extends string>(spec: CalcSpec<K>): Codec<CalcValues<K>> {
  return { parse: (raw) => readCalcFields(raw, spec), format: (v) => JSON.stringify(v) }
}

/** Gemerkter Stand verknüpfter Felder für `useLinkedFields`: welches die Quelle ist und ihr Text */
export interface LinkedState<F extends string> {
  driver: F
  raw: string
  set: (driver: F, raw: string) => void
}

export interface CalcFields<K extends string> {
  /** die Eingaben (Text) */
  v: CalcValues<K>
  /** ein Feld setzen */
  set: (key: K, value: string) => void
  /** mehrere Felder auf einmal (eine Wahl, die auch ein Feld umstellt) */
  patch: (values: Partial<CalcValues<K>>) => void
  /** Wert und Änderung für ein `NumField`: `{...f.bind('span')}` */
  bind: (key: K) => { value: string; onChange: (v: string) => void }
  /** verknüpfte Felder: Quelle unter `driverKey`, ihr Text unter `rawKey` */
  linked: <F extends string>(driverKey: K, rawKey: K) => LinkedState<F>
  /** weicht etwas von den Beispielwerten ab? */
  changed: boolean
  /** die Beispielwerte zurückholen */
  reset: () => void
}

/**
 * Eingaben eines Rechners, gemerkt unter `calc:<id>`. `spec` ist eine Konstante des Rechners
 * (außerhalb der Komponente): Sie bestimmt Felder, Vorgaben und was ein Feld annehmen darf.
 */
export function useCalcFields<K extends string>(id: string, spec: CalcSpec<K>): CalcFields<K> {
  const codec = useMemo(() => calcCodec(spec), [spec])
  const [v, setValues] = usePersistentState(`calc:${id}`, vorgaben(spec), codec)
  const patch = useCallback(
    (values: Partial<CalcValues<K>>) => setValues((prev) => ({ ...prev, ...values })),
    [setValues]
  )
  const set = useCallback(
    (key: K, value: string) => patch({ [key]: value } as Partial<CalcValues<K>>),
    [patch]
  )
  return {
    v,
    set,
    patch,
    bind: (key) => ({ value: v[key], onChange: (value) => set(key, value) }),
    // Die gemerkte Quelle ist geprüft (`erlaubt` im spec) – deshalb darf sie als F gelten
    linked: <F extends string>(driverKey: K, rawKey: K): LinkedState<F> => ({
      driver: v[driverKey] as F,
      raw: v[rawKey],
      set: (driver, raw) => patch({ [driverKey]: driver, [rawKey]: raw } as Partial<CalcValues<K>>)
    }),
    changed: weichtAb(v, spec),
    reset: () => setValues(vorgaben(spec))
  }
}
