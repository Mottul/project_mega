import { cn } from '@renderer/lib/utils'
import { CalcPage, NumField, Readout, SectionCard, parseNum } from '../_calc/ui'
import { useCalcFields, type CalcSpec } from '../_calc/useCalcFields'
import { dmxAddress, dmxBinary, dmxSwitches, dmxToggle, switchValue } from './math'

// DMX-Startadresse <-> Dip-Schalter. Die Adresse ist die Summe der eingeschalteten Werte
// (Schalter 1 an = Adresse 1); die Umrechnung steht in math.ts.

/** Gemerkt (K4): die Startadresse als Text – die Schalter folgen aus ihr */
const FELDER = { adresse: '1' } satisfies CalcSpec<string>

export function DmxAddress(): JSX.Element {
  const f = useCalcFields('dmx-address', FELDER)
  const addrRaw = f.v.adresse
  const setAddrRaw = (v: string): void => f.set('adresse', v)

  const addr = dmxAddress(parseNum(addrRaw))

  function setAddr(n: number): void {
    setAddrRaw(String(dmxAddress(n)))
  }

  function toggle(i: number): void {
    // alle aus ist keine Adresse: dann bleibt das Feld leer
    const next = dmxToggle(addr, i)
    setAddrRaw(next == null ? '' : String(next))
  }

  const bits = dmxSwitches(addr)

  return (
    <CalcPage onReset={f.changed ? f.reset : undefined}>
      <SectionCard
        title="DMX-Adresse ↔ Dip-Schalter"
        desc="Startadresse eingeben oder Schalter umlegen – beides bleibt gleich."
        hint="Schalter 1 hat den Wert 1, Schalter 2 den Wert 2 … Schalter 9 den Wert 256. Adresse = Summe der eingeschalteten Werte: Schalter 1 an = Adresse 1, alle neun an = 511. ON ist oben. Ein 10. Schalter steuert meist Sonderfunktionen (Display, Modus); zählt er bei einem Gerät zur Adresse, hat er den Wert 512 – nur so geht Adresse 512."
      >
        <div className="max-w-xs">
          <NumField
            label="Startadresse"
            value={addrRaw}
            onChange={(v) => {
              if (v === '') {
                setAddrRaw('')
                return
              }
              const n = parseNum(v)
              if (n != null) setAddr(n)
            }}
          />
        </div>

        {/* festes 9er-Raster: bleibt auch im schmalsten Fenster eine Reihe. Jeder Schalter sagt
            Vorlesewerkzeugen, welcher er ist und ob er an ist. */}
        <div className="grid max-w-sm grid-cols-9 gap-1 pt-1">
          {bits.map((on, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={on === 1}
              aria-label={`Schalter ${i + 1}, Wert ${switchValue(i)}`}
              onClick={() => toggle(i)}
              className="flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-muted-foreground">{i + 1}</span>
              <span
                className={cn(
                  'relative h-10 w-6 rounded-full border transition-colors',
                  on ? 'border-primary bg-primary/20' : 'border-border bg-muted/40'
                )}
              >
                <span
                  className={cn(
                    'absolute left-1/2 size-3.5 -translate-x-1/2 rounded-full transition-all',
                    on ? 'top-1 bg-primary' : 'bottom-1 bg-muted-foreground'
                  )}
                />
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {switchValue(i)}
              </span>
            </button>
          ))}
        </div>

        {/* Die Adresse steht im Feld oben – kein zweites Ergebnis dafür */}
        <Readout label="Binär (Schalter 9 → 1)" value={dmxBinary(addr) ?? ''} />
      </SectionCard>
    </CalcPage>
  )
}
