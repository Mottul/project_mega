// Seite „AUX“: Was liegt auf den Ausgängen? Namen und Zahl der Busse meldet der Mischer. Beim
// ATEM Mini sind das etwa der HDMI-Ausgang, was dort hängt, sieht die Änderung sofort.

import { QUELLE_FUER_AUX, type AtemView } from '@shared/atem'
import { Card } from '@renderer/components/ui/card'
import { Field } from '@renderer/components/ui/field'
import { QuellenWahl } from './ui'
import { senden } from './useAtem'

export function SeiteAux({ view }: { view: AtemView }): JSX.Element {
  const quellen = view.quellen.filter((q) => (q.verfuegbar & QUELLE_FUER_AUX) !== 0)
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
      {view.aux.map((a, bus) => (
        <Card key={bus} className="p-4">
          <Field label={a.name}>
            <QuellenWahl
              label={`AUX ${bus + 1}`}
              quellen={quellen}
              wert={a.quelle}
              onWahl={(quelle) => senden({ type: 'aux', bus, quelle })}
            />
          </Field>
        </Card>
      ))}
    </div>
  )
}
