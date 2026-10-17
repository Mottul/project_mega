// Kleine Bauteile der Mini-Manual-Oberfläche: Stufe wählen und anzeigen, Zeilen verschieben,
// Foto einfügen. Fotos laufen nur über api.fotos (main verkleinert, dreht, entfernt Metadaten);
// hier steht nur der Hash.

import { ArrowDown, ArrowUp, ImagePlus, Trash2, X } from 'lucide-react'
import { fotoUrl } from '@shared/fotos'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { cn } from '@renderer/lib/utils'
import { STUFEN, stufeLabel, type Stufe } from '../model'

export function StufeSelect({
  value,
  onChange,
  label = 'Stufe'
}: {
  value: Stufe
  onChange: (s: Stufe) => void
  label?: string
}): JSX.Element {
  return (
    <Select
      size="xs"
      aria-label={label}
      title={`ab ${stufeLabel(value)}: ${STUFEN[value - 1].fuer}`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as Stufe)}
    >
      {STUFEN.map((s) => (
        <option key={s.value} value={s.value}>
          ab {s.label}
        </option>
      ))}
    </Select>
  )
}

/** Drei Balken wie in der Skizze: wie viele gefüllt sind, ab welcher Stufe etwas erscheint */
export function StufeBalken({
  stufe,
  className
}: {
  stufe: Stufe
  className?: string
}): JSX.Element {
  return (
    <span
      className={cn('inline-flex h-3.5 items-end gap-0.5', className)}
      title={`ab ${stufeLabel(stufe)}`}
      aria-label={`ab ${stufeLabel(stufe)}`}
    >
      {[1, 2, 3].map((i) => (
        <i
          key={i}
          className={cn('block w-1 rounded-sm', i <= stufe ? 'bg-foreground' : 'bg-border')}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  )
}

export function ZeilenKnoepfe({
  onUp,
  onDown,
  onDelete,
  was
}: {
  onUp?: () => void
  onDown?: () => void
  /** fehlt = kein Entfernen-Knopf */
  onDelete?: () => void
  /** für die Beschriftung: „Schritt“, „Block“ … */
  was: string
}): JSX.Element {
  return (
    <span className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={!onUp}
        onClick={onUp}
        aria-label={`${was} nach oben`}
        title="nach oben"
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        disabled={!onDown}
        onClick={onDown}
        aria-label={`${was} nach unten`}
        title="nach unten"
      >
        <ArrowDown className="size-3.5" />
      </Button>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-danger"
          onClick={onDelete}
          aria-label={`${was} entfernen`}
          title="entfernen"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </span>
  )
}

const GRUND: Record<string, string> = {
  format: 'kein JPG oder PNG',
  kaputt: 'Bild lässt sich nicht lesen',
  'zu-gross': 'Datei größer als 40 MB',
  fehler: 'Fehler beim Einlesen (Debug-Log)'
}

/** Ein Foto über den Dialog holen; null = abgebrochen oder fehlgeschlagen (mit Hinweis) */
export async function fotoWaehlen(): Promise<string | null> {
  const res = await api.fotos.pick()
  if (!res?.length) return null
  const ok = res.find((r) => r.ok)
  for (const r of res) if (!r.ok) toast.warning(`${r.name}: ${GRUND[r.reason] ?? r.reason}`)
  return ok && ok.ok ? ok.hash : null
}

export function FotoFeld({
  hash,
  onChange,
  klein = false
}: {
  hash: string | null
  onChange: (h: string | null) => void
  klein?: boolean
}): JSX.Element {
  if (hash) {
    return (
      <span className="relative inline-flex shrink-0">
        <img
          src={fotoUrl(hash)}
          alt="Foto"
          className={cn(
            'rounded border border-border object-cover',
            klein ? 'h-9 w-12' : 'h-24 max-w-[220px]'
          )}
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-card p-0.5 text-muted-foreground hover:text-danger"
          aria-label="Foto entfernen"
          title="Foto entfernen"
        >
          <X className="size-3" />
        </button>
      </span>
    )
  }
  return (
    <Button
      variant="ghost"
      size={klein ? 'icon' : 'sm'}
      className={klein ? 'size-7 text-muted-foreground' : ''}
      onClick={() => void fotoWaehlen().then((h) => h && onChange(h))}
      aria-label="Foto einfügen"
      title="Foto einfügen (JPG, PNG)"
    >
      <ImagePlus className="size-4" />
      {!klein && 'Foto …'}
    </Button>
  )
}
