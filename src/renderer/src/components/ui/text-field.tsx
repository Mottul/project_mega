import { useDraft } from '@renderer/lib/useDraft'
import { Input } from './input'

interface TextFieldProps {
  value: string
  onCommit: (value: string) => void
  disabled?: boolean
  maxLength?: number
  className?: string
  placeholder?: string
  'aria-label'?: string
}

// Textfeld wie NumberField: getippt wird in einen Puffer, übernommen erst beim Verlassen
// oder mit Enter (Escape verwirft). So landet nicht jeder Tastendruck in settings.json,
// und ein Hintergrund-Update überschreibt die laufende Eingabe nicht (useDraft).
// Leere Eingabe stellt den bisherigen Wert wieder her.
export function TextField({
  value,
  onCommit,
  disabled,
  maxLength,
  className,
  placeholder,
  'aria-label': ariaLabel
}: TextFieldProps): JSX.Element {
  const { ref, text, setText } = useDraft(value)

  function commit(): void {
    const t = text.trim()
    if (!t) {
      setText(value)
      return
    }
    setText(t)
    if (t !== value) onCommit(t)
  }

  return (
    <Input
      ref={ref}
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        else if (e.key === 'Escape') {
          setText(value)
          // erst nach dem Zurücksetzen verlassen, sonst übernähme der Blur den Puffer
          requestAnimationFrame(() => ref.current?.blur())
        }
      }}
    />
  )
}
