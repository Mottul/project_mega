// Seite „Keyer“: Einrichtung der Upstream-Keyer der gewählten M/E und der Downstream-Keyer des
// Mischers, mit Quellen und Dauer. Geschaltet wird auf der Seite „Mischen“ (Keyer-Streifen), hier
// steht nur, ob ein Keyer gerade auf Sendung ist: Wer Fill oder Cut ändert, soll das sehen.

import {
  QUELLE_FUER_KEY,
  type AtemDsk,
  type AtemKeyArt,
  type AtemQuelle,
  type AtemUsk,
  type AtemView
} from '@shared/atem'
import { Card } from '@renderer/components/ui/card'
import { Field } from '@renderer/components/ui/field'
import { AufSendung, DauerFeld, QuellenWahl, Titel } from './ui'
import { senden } from './useAtem'

const ART_NAMEN: Record<AtemKeyArt, string> = {
  luma: 'Luma',
  chroma: 'Chroma',
  pattern: 'Muster',
  dve: 'DVE'
}

function Kopf({ name, an, art }: { name: string; an: boolean; art?: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <h3 className="font-semibold">{name}</h3>
      <AufSendung an={an} />
      {art && <span className="ml-auto text-xs text-muted-foreground">{art}</span>}
    </div>
  )
}

function UskKarte({
  me,
  i,
  k,
  quellen
}: {
  me: number
  i: number
  k: AtemUsk
  quellen: AtemQuelle[]
}): JSX.Element {
  const name = `Key ${i + 1}`
  return (
    <Card className="space-y-3 p-4">
      <Kopf name={name} an={k.onAir} art={ART_NAMEN[k.art]} />
      <Field label="Fill">
        <QuellenWahl
          label={`${name} Fill`}
          quellen={quellen}
          wert={k.fill}
          onWahl={(quelle) => senden({ type: 'uskQuelle', me, keyer: i, art: 'fill', quelle })}
        />
      </Field>
      {k.art === 'luma' && (
        <Field label="Cut">
          <QuellenWahl
            label={`${name} Cut`}
            quellen={quellen}
            wert={k.cut}
            onWahl={(quelle) => senden({ type: 'uskQuelle', me, keyer: i, art: 'cut', quelle })}
          />
        </Field>
      )}
    </Card>
  )
}

function DskKarte({
  i,
  k,
  quellen,
  bildrate
}: {
  i: number
  k: AtemDsk
  quellen: AtemQuelle[]
  bildrate: number | null
}): JSX.Element {
  const name = `DSK ${i + 1}`
  return (
    <Card className="space-y-3 p-4">
      <Kopf name={name} an={k.onAir} />
      <DauerFeld
        label="Dauer für Auto"
        ariaLabel={`${name} Dauer in Bildern`}
        rate={k.rate}
        bildrate={bildrate}
        onRate={(rate) => senden({ type: 'dskRate', keyer: i, rate })}
      />
      <Field label="Fill">
        <QuellenWahl
          label={`${name} Fill`}
          quellen={quellen}
          wert={k.fill}
          onWahl={(quelle) => senden({ type: 'dskQuelle', keyer: i, art: 'fill', quelle })}
        />
      </Field>
      <Field label="Cut">
        <QuellenWahl
          label={`${name} Cut`}
          quellen={quellen}
          wert={k.cut}
          onWahl={(quelle) => senden({ type: 'dskQuelle', keyer: i, art: 'cut', quelle })}
        />
      </Field>
    </Card>
  )
}

export function SeiteKeyer({ view, me }: { view: AtemView; me: number }): JSX.Element {
  const m = view.mes[me]
  const quellen = view.quellen.filter((q) => (q.verfuegbar & QUELLE_FUER_KEY) !== 0)
  // Spalten nach dem Platz, nicht nach der Fensterbreite: Die Schublade nimmt davon 360 px
  const raster = 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]'
  return (
    <div className="space-y-4">
      {m.keyer.length > 0 && (
        <section aria-label="Upstream-Keyer" className="space-y-1.5">
          <Titel>Upstream-Keyer</Titel>
          <div className={raster}>
            {m.keyer.map((k, i) => (
              <UskKarte key={i} me={me} i={i} k={k} quellen={quellen} />
            ))}
          </div>
        </section>
      )}
      {view.dsk.length > 0 && (
        <section aria-label="Downstream-Keyer" className="space-y-1.5">
          <Titel>Downstream-Keyer</Titel>
          <div className={raster}>
            {view.dsk.map((k, i) => (
              <DskKarte key={i} i={i} k={k} quellen={quellen} bildrate={view.bildrate} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
