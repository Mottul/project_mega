import { useEffect, useState } from 'react'
import { Input } from './input'

interface NumberFieldProps {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
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
  className,
  placeholder,
  'aria-label': ariaLabel
}: NumberFieldProps): JSX.Element {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

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
    v = Math.round(v)
    setText(String(v))
    onCommit(v)
  }

  return (
    <Input
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
