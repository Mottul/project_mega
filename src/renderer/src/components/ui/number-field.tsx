import { useDraft } from '@renderer/lib/useDraft'
import { Input } from './input'

interface NumberFieldProps {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  /** Nur Vielfache davon, gerundet beim Verlassen; `min` und `max` liegen selbst auf dem Raster */
  step?: number
  /**
   * Der Wert kommt von einem Gerät zurück (ATEM): Nach der Eingabe zeigt das Feld wieder den
   * gemeldeten Stand, bis das Gerät den neuen meldet. Sonst bliebe die Eingabe stehen, sobald die
   * Meldung den alten Wert bestätigt, etwa wenn zwei Änderungen in einer Meldung zusammenfallen.
   */
  zeigtMeldung?: boolean
  className?: string
  placeholder?: string
  'aria-label'?: string
}

// Zahlenfeld, das freies Tippen erlaubt: waehrend der Eingabe wird NICHT geclamped
// (man kann z.B. bei min=16 erst "1", dann "120" tippen). Geprueft/begrenzt wird
// erst bei Verlassen des Feldes oder Enter. Externe Wertaenderungen (z.B. Presets)
// werden uebernommen.
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  zeigtMeldung = false,
  className,
  placeholder,
  'aria-label': ariaLabel
}: NumberFieldProps): JSX.Element {
  const { ref, text, setText } = useDraft(String(value))

  function commit(): void {
    if (text.trim() === '') {
      setText(String(value))
      return
    }
    let v = Number(text)
    if (!Number.isFinite(v)) {
      setText(String(value))
      return
    }
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    v = Math.round(v / step) * step
    setText(String(zeigtMeldung ? value : v))
    onCommit(v)
  }

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
