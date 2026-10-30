// Passwörter im gedruckten Dokument – Option im Druckdialog des Mini-Manuals.

import { Field } from '@renderer/components/ui/field'
import { Segmented } from '@renderer/components/ui/segmented'
import type { Passwoerter } from '../model'
import { useMiniManual } from '../store'

const PASSWOERTER: { value: Passwoerter; label: string }[] = [
  { value: 'separat', label: 'separat' },
  { value: 'schwaerzen', label: 'schwärzen' },
  { value: 'drucken', label: 'drucken' }
]

export function PasswortFeld(): JSX.Element {
  const pw = useMiniManual((s) => s.anleitung.ausgabe.passwoerter)
  const update = useMiniManual((s) => s.update)
  return (
    <Field
      group
      label="Passwörter im PDF"
      hint="separat: „wird separat übergeben“ · schwärzen: Punkte statt Passwort · drucken: im Klartext. Die Stufe Bedienung zeigt Zugangsdaten nie."
    >
      <Segmented
        label="Passwörter im PDF"
        value={pw}
        options={PASSWOERTER}
        onChange={(passwoerter) =>
          update((a) => ({ ...a, ausgabe: { ...a.ausgabe, passwoerter } }))
        }
      />
    </Field>
  )
}
