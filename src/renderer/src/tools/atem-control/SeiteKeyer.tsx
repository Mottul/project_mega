// Seite „Keyer“: Upstream-Keyer der gewählten M/E und die Downstream-Keyer des Mischers, mit
// Quellen und Dauer. Die Tasten zum Schalten stehen auch auf der Seite „Mischen“.

import {
  bilderJeSchritt,
  keyerBit,
  QUELLE_FUER_KEY,
  type AtemDsk,
  type AtemKeyArt,
  type AtemMe,
  type AtemQuelle,
  type AtemUsk,
  type AtemView
} from '@shared/atem'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Field } from '@renderer/components/ui/field'
import { DauerFeld, naechsterUmschalten, QuellenWahl, SchaltKnopf, Titel } from './ui'
import { senden } from './useAtem'

const ART_NAMEN: Record<AtemKeyArt, string> = {
  luma: 'Luma',
  chroma: 'Chroma',
  pattern: 'Muster',
  dve: 'DVE'
}

function UskKarte({
  me,
  m,
  i,
  k,
  quellen
}: {
  me: number
  m: AtemMe
  i: number
  k: AtemUsk
  quellen: AtemQuelle[]
}): JSX.Element {
  const name = `Key ${i + 1}`
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{name}</h3>
        <span className="text-xs text-muted-foreground">{ART_NAMEN[k.art]}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <SchaltKnopf
          an={k.onAir}
          testId={`atem-usk-${i}`}
          onClick={() => senden({ type: 'uskOnAir', me, keyer: i, an: !k.onAir })}
        >
          On Air
        </SchaltKnopf>
        <SchaltKnopf
          ton="akzent"
          an={(m.naechster & keyerBit(i)) !== 0}
          testId={`atem-usk-tie-${i}`}
          titel="Geht mit dem nächsten Übergang ein oder aus"
          onClick={() => naechsterUmschalten(me, m, keyerBit(i))}
        >
          Mit Übergang
        </SchaltKnopf>
      </div>
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
      <h3 className="font-semibold">{name}</h3>
      <div className="flex flex-wrap gap-2">
        <SchaltKnopf
          an={k.onAir}
          testId={`atem-dsk-${i}`}
          onClick={() => senden({ type: 'dskOnAir', keyer: i, an: !k.onAir })}
        >
          On Air
        </SchaltKnopf>
        <Button
          variant="secondary"
          data-testid={`atem-dsk-auto-${i}`}
          data-laeuft={k.laeuft}
          title="Blendet über die eingestellte Dauer ein oder aus"
          className="h-10"
          onClick={() => senden({ type: 'dskAuto', keyer: i })}
        >
          Auto
          {k.laeuft && <span className="tabular-nums">{k.rest * bilderJeSchritt(bildrate)}</span>}
        </Button>
        <SchaltKnopf
          ton="akzent"
          an={k.tie}
          testId={`atem-dsk-tie-${i}`}
          titel="Geht mit dem nächsten Übergang ein oder aus"
          onClick={() => senden({ type: 'dskTie', keyer: i, an: !k.tie })}
        >
          Mit Übergang
        </SchaltKnopf>
      </div>
      <DauerFeld
        label="Dauer in Bildern"
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
              <UskKarte key={i} me={me} m={m} i={i} k={k} quellen={quellen} />
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
