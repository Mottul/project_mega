import { cn } from '@renderer/lib/utils'

/** Kontrollkästchen mit Beschriftung und optionalem Hinweis darunter. */
export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <label className={cn('flex items-start gap-2 text-sm', disabled && 'opacity-60')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}
