// ATEM-Steuerung im Werkzeug-Muster:
//   Leiste „Mischer“   Adresse, Verbinden, Probebetrieb, Sperre; rechts der Status
//   Schublade          Verbindung, Tastatur
//   Arbeitsfläche      Seiten als Reiter; was der Mischer nicht kann, erscheint nicht
// Die Verbindung lebt im main und läuft weiter, wenn das Werkzeug zugeht.

import { useEffect } from 'react'
import { Keyboard, Link2, Lock, Plug, TriangleAlert, Unplug } from 'lucide-react'
import {
  ATEM_SIM_MODELLE,
  ATEM_SIM_NAMEN,
  type AtemSimModell,
  type AtemStatus,
  type AtemView
} from '@shared/atem'
import {
  BarDivider,
  BarToggle,
  PanelSection,
  ToolBar,
  ToolShell
} from '@renderer/components/ToolShell'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { Reiter } from '@renderer/components/ui/reiter'
import { Segmented } from '@renderer/components/ui/segmented'
import { Select } from '@renderer/components/ui/select'
import { TextField } from '@renderer/components/ui/text-field'
import { api } from '@renderer/lib/api'
import { updateSettings, useSettings } from '@renderer/lib/settings'
import { toolPageClass } from '@renderer/lib/toolPage'
import { flag, usePersistentState, type Codec } from '@renderer/lib/usePersistentState'
import { SeiteAux } from './SeiteAux'
import { SeiteKeyer } from './SeiteKeyer'
import { SeiteMakros } from './SeiteMakros'
import { SeiteMedien } from './SeiteMedien'
import { SeiteMischen } from './SeiteMischen'
import { useAtem } from './useAtem'

const TASTEN: [string, string][] = [
  ['1–9', 'Vorschau'],
  ['Umschalt + 1–9', 'Programm'],
  ['Leertaste', 'Cut'],
  ['Eingabe', 'Auto']
]

const SEITEN = [
  { id: 'mischen', label: 'Mischen' },
  { id: 'keyer', label: 'Keyer' },
  { id: 'makros', label: 'Makros' },
  { id: 'medien', label: 'Medien' },
  { id: 'aux', label: 'AUX' }
] as const

type Seite = (typeof SEITEN)[number]['id']

const SEITE: Codec<Seite> = {
  parse: (roh) => SEITEN.find((s) => s.id === roh)?.id ?? null,
  format: (s) => s
}

/** Gewählte M/E: Größere Mischer haben höchstens vier */
const ZIFFER: Codec<number> = {
  parse: (roh) => (/^\d$/.test(roh) ? Number(roh) : null),
  format: String
}

/** Was der Mischer nicht kann, erscheint nicht */
function hatSeite(view: AtemView, seite: Seite): boolean {
  switch (seite) {
    case 'mischen':
      return true
    case 'keyer':
      return view.dsk.length > 0 || view.mes.some((m) => m.keyer.length > 0)
    case 'makros':
      return view.makroPlaetze > 0
    case 'medien':
      return view.medien.player.length > 0
    case 'aux':
      return view.aux.length > 0
  }
}

function Seiten({ view, bedienbar }: { view: AtemView; bedienbar: boolean }): JSX.Element {
  const [wahl, setWahl] = usePersistentState<Seite>('atem:seite', 'mischen', SEITE)
  const [meWahl, setMeWahl] = usePersistentState('atem:me', 0, ZIFFER)
  // Kann der nächste Mischer eine gemerkte Seite oder M/E nicht, bleibt die Wahl für später stehen
  const seite = hatSeite(view, wahl) ? wahl : 'mischen'
  const me = Math.min(meWahl, view.mes.length - 1)
  const mitMe = seite === 'mischen' || seite === 'keyer'
  return (
    <div className="space-y-4">
      <Reiter
        label="Seiten"
        className="w-fit"
        value={seite}
        options={SEITEN.filter((s) => hatSeite(view, s.id))}
        onChange={setWahl}
      />
      <fieldset disabled={!bedienbar} className="space-y-4">
        {mitMe && view.mes.length > 1 && (
          <Segmented
            label="M/E"
            className="max-w-xs"
            value={String(me)}
            options={view.mes.map((_, i) => ({ value: String(i), label: `M/E ${i + 1}` }))}
            onChange={(v) => setMeWahl(Number(v))}
          />
        )}
        {seite === 'mischen' && (
          <SeiteMischen
            view={view}
            me={me}
            bedienbar={bedienbar}
            onAlleMakros={() => setWahl('makros')}
          />
        )}
        {seite === 'keyer' && <SeiteKeyer view={view} me={me} />}
        {seite === 'makros' && <SeiteMakros view={view} />}
        {seite === 'medien' && <SeiteMedien view={view} />}
        {seite === 'aux' && <SeiteAux view={view} />}
      </fieldset>
    </div>
  )
}

function Status({ status }: { status: AtemStatus }): JSX.Element {
  switch (status.phase) {
    case 'getrennt':
      return status.fehler ? (
        <span className="truncate text-danger">{status.fehler}</span>
      ) : (
        <span className="text-muted-foreground">getrennt</span>
      )
    case 'verbindet':
      return (
        <span className={status.fehler ? 'truncate text-warning' : 'text-muted-foreground'}>
          {status.fehler ?? 'verbindet …'}
        </span>
      )
    case 'verloren':
      return <span className="font-medium text-danger">Verbindung verloren</span>
    case 'verbunden':
      return (
        <span className="truncate">
          {status.modell}
          {status.simulator ? (
            ' · Probebetrieb'
          ) : (
            <>
              {' '}
              · <span className="font-mono">{status.host}</span>
            </>
          )}
        </span>
      )
  }
}

export function AtemControl(): JSX.Element {
  const { status, view } = useAtem()
  const einstellungen = useSettings((s) => s.atem)
  // gemerkt: Die Sperre darf nicht aufgehen, nur weil jemand kurz ein anderes Werkzeug öffnet
  const [gesperrt, setGesperrt] = usePersistentState('atem:sperre', false, flag)
  const host = einstellungen?.host ?? ''
  const offen = status.phase !== 'getrennt'
  const bedienbar = status.phase === 'verbunden' && !gesperrt

  // Nach einem Mausklick gehört die Tastatur dem Mischer: Sonst behält der Knopf den Fokus, ohne
  // dass ihn jemand meint, und die Leertaste trennt die Verbindung oder löst die Sperre, statt zu
  // schneiden. Per Tab angesteuerte Knöpfe (`detail` 0) behalten ihn.
  useEffect(() => {
    const klick = (e: MouseEvent): void => {
      const el = document.activeElement
      if (e.detail > 0 && el instanceof HTMLButtonElement) el.blur()
    }
    window.addEventListener('click', klick)
    return () => window.removeEventListener('click', klick)
  }, [])

  function verbinden(): void {
    if (offen) void api.atem.disconnect()
    else if (host) void api.atem.connect({ host })
  }

  return (
    <ToolShell
      id="atem-control"
      bar={
        <ToolBar label="Mischer" status={<Status status={status} />}>
          <TextField
            aria-label="Adresse des Mischers"
            placeholder="192.168.1.240"
            className="h-8 w-40 font-mono"
            disabled={offen}
            value={host}
            onCommit={(h) => updateSettings({ atem: { host: h } })}
          />
          <Button
            size="sm"
            variant={offen ? 'outline' : 'default'}
            disabled={!offen && !host}
            title={!offen && !host ? 'Zuerst die Adresse des Mischers eintragen' : undefined}
            onClick={verbinden}
          >
            {offen ? <Unplug className="size-4" /> : <Link2 className="size-4" />}
            {offen ? 'Trennen' : 'Verbinden'}
          </Button>
          {!offen && (
            <Button
              size="sm"
              variant="outline"
              title="Ohne Gerät üben und vorbereiten"
              onClick={() =>
                void api.atem.connect({ simulator: einstellungen?.simModell ?? 'mini-extreme' })
              }
            >
              <Plug className="size-4" /> Probebetrieb
            </Button>
          )}
          <BarDivider />
          <BarToggle
            on={gesperrt}
            title="Nimmt alle Knöpfe und die Tastatur aus der Bedienung"
            onClick={() => setGesperrt(!gesperrt)}
          >
            Sperre
          </BarToggle>
        </ToolBar>
      }
      aside={
        <>
          <PanelSection
            id="verbindung"
            title="Verbindung"
            icon={Link2}
            summary={einstellungen?.autoConnect ? 'Verbindet beim Start' : 'Von Hand'}
          >
            <Checkbox
              label="Beim Start verbinden"
              hint="Verbindet mit der letzten Adresse, sobald die App startet. Die Verbindung bleibt bestehen, wenn dieses Werkzeug geschlossen wird."
              checked={einstellungen?.autoConnect ?? false}
              onChange={(autoConnect) => updateSettings({ atem: { autoConnect } })}
            />
            <Field
              label="Modell im Probebetrieb"
              hint="Der Probebetrieb bildet einen Mischer ohne Gerät nach: zum Üben und um die Oberfläche für andere Mischer-Größen zu sehen."
            >
              <Select
                className="w-full"
                value={einstellungen?.simModell ?? 'mini-extreme'}
                onChange={(e) =>
                  updateSettings({ atem: { simModell: e.target.value as AtemSimModell } })
                }
              >
                {ATEM_SIM_MODELLE.map((m) => (
                  <option key={m} value={m}>
                    {ATEM_SIM_NAMEN[m]}
                  </option>
                ))}
              </Select>
            </Field>
          </PanelSection>
          <PanelSection id="tastatur" title="Tastatur" icon={Keyboard} defaultOpen={false}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {TASTEN.map(([taste, wirkung]) => (
                <div key={taste} className="contents">
                  <dt className="font-mono text-xs leading-5 text-muted-foreground">{taste}</dt>
                  <dd>{wirkung}</dd>
                </div>
              ))}
            </dl>
          </PanelSection>
        </>
      }
      main={
        <div className={toolPageClass('full')}>
          {status.phase === 'verloren' && (
            <Alert tone="danger" icon={TriangleAlert} title="Verbindung verloren">
              Die Knöpfe sind gesperrt, bis der Mischer wieder antwortet. Das Bild zeigt den letzten
              bekannten Stand. Mottulbox verbindet sich von selbst neu.
            </Alert>
          )}
          {gesperrt && (
            <Alert tone="warning" icon={Lock} title="Gesperrt">
              Maus und Tastatur schalten nichts, bis die Sperre in der Leiste aus ist.
            </Alert>
          )}
          {!status.protokollBekannt && (
            <Alert tone="warning" icon={TriangleAlert} title="Unbekannte Mischer-Firmware">
              Protokoll {status.protokoll} ist neuer als die eingebaute Bibliothek. Die Steuerung
              kann lückenhaft sein, ein Update der App schafft Abhilfe.
            </Alert>
          )}
          {view && view.mes.length > 0 ? (
            <Seiten view={view} bedienbar={bedienbar} />
          ) : (
            <Card className="p-6 text-sm text-muted-foreground">
              {status.phase === 'verbindet'
                ? 'Warte auf den Mischer …'
                : 'Adresse eintragen und verbinden, oder ohne Gerät im Probebetrieb üben.'}
            </Card>
          )}
        </div>
      }
    />
  )
}
