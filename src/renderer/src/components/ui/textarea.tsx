// Gepufferte Textfelder für Inhalte (Anleitungen, Notizen), die beim Tippen live übernommen werden:
// Getippt wird in einen Puffer (useDraft – ein Hintergrund-Update oder ein anderes Fenster
// überschreibt die laufende Eingabe nicht), übernommen nach kurzer Pause und beim Verlassen.
// Anders als TextField ist ein leeres Feld erlaubt (Inhalte dürfen leer sein).

import { useEffect, useRef, type TextareaHTMLAttributes } from 'react'
import { useDraft } from '@renderer/lib/useDraft'
import { cn } from '@renderer/lib/utils'
import { Input } from './input'

const PAUSE_MS = 250

/** Übernahme nach einer Tipp-Pause und beim Verlassen */
function useLiveCommit(text: string, value: string, onCommit: (v: string) => void): () => void {
  const flushRef = useRef(() => {})
  flushRef.current = () => {
    if (text !== value) onCommit(text)
  }
  useEffect(() => {
    if (text === value) return
    const t = setTimeout(() => flushRef.current(), PAUSE_MS)
    return () => clearTimeout(t)
  }, [text, value])
  // beim Abbauen nichts verlieren
  useEffect(() => () => flushRef.current(), [])
  return () => flushRef.current()
}

interface LiveProps {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function TextArea({
  value,
  onCommit,
  rows = 3,
  ...rest
}: LiveProps & Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'>): JSX.Element {
  const { ref, text, setText } = useDraft<HTMLTextAreaElement>(value)
  const flush = useLiveCommit(text, value, onCommit)
  return (
    <textarea
      ref={ref}
      rows={rows}
      value={text}
      placeholder={rest.placeholder}
      maxLength={rest.maxLength}
      disabled={rest.disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => setText(e.target.value)}
      onBlur={flush}
      className={cn(
        'flex w-full resize-y rounded-md border border-border bg-input/40 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50',
        rest.className
      )}
    />
  )
}

/** Einzeiliges Gegenstück zu TextArea (Enter übernimmt sofort) */
export function LiveInput({ value, onCommit, ...rest }: LiveProps): JSX.Element {
  const { ref, text, setText } = useDraft<HTMLInputElement>(value)
  const flush = useLiveCommit(text, value, onCommit)
  return (
    <Input
      ref={ref}
      value={text}
      placeholder={rest.placeholder}
      maxLength={rest.maxLength}
      disabled={rest.disabled}
      aria-label={rest['aria-label']}
      className={rest.className}
      onChange={(e) => setText(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === 'Enter') flush()
      }}
    />
  )
}
