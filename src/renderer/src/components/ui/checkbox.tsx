import { cn } from '@renderer/lib/utils'
import { InfoTip } from './info-tip'

/** Checkbox mit Beschriftung; eine Erklärung steht hinter einem ⓘ statt darunter. */
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
    <div className={cn('flex items-center gap-2 text-sm', disabled && 'opacity-60')}>
      <label className="flex min-w-0 items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span>{label}</span>
      </label>
      {hint && <InfoTip text={hint} label={`Erklärung zu „${label}“`} />}
    </div>
  )
}
