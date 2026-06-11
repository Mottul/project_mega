import { useState } from 'react'
import { CalcPage, NumField, Readout, SectionCard, parseNum } from '../_calc/ui'

// DMX-Startadresse <-> Dip-Schalter. Konvention: Schalter 1..9 bilden die Adresse
// binär ab, wobei der Binärwert = Adresse − 1 ist (Adresse 1 = alle Schalter aus).
// Schalter 1 = Wert 1 (LSB) ... Schalter 9 = Wert 256 (MSB) -> Bereich 1..512.

const SWITCHES = 9

export function DmxAddress(): JSX.Element {
  const [addrRaw, setAddrRaw] = useState('1')

  const parsed = parseNum(addrRaw)
  const addr = parsed == null ? null : Math.min(512, Math.max(1, Math.round(parsed)))
  const value = addr == null ? null : addr - 1 // 0..511

  function setAddr(n: number): void {
    setAddrRaw(String(Math.min(512, Math.max(1, Math.round(n)))))
  }

  function toggle(i: number): void {
    const base = value ?? 0
    setAddr(((base ^ (1 << i)) + 1))
  }

  const bits = Array.from({ length: SWITCHES }, (_, i) => (value != null ? (value >> i) & 1 : 0))
  const binary = bits.slice().reverse().join('') // MSB..LSB für die Anzeige

  return (
    <CalcPage>
      <SectionCard
        title="DMX-Adresse → Dip-Schalter"
        desc="Startadresse eingeben oder die Schalter umlegen – beides bleibt synchron."
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

        <div className="flex flex-wrap gap-2 pt-1">
          {bits.map((on, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className="flex flex-col items-center gap-1"
              title={`Schalter ${i + 1} · Wert ${1 << i}`}
            >
              <span className="text-[10px] text-muted-foreground">{i + 1}</span>
              <span
                className={`relative h-10 w-6 rounded-full border transition-colors ${
                  on ? 'border-primary bg-primary/20' : 'border-border bg-muted/40'
                }`}
              >
                <span
                  className={`absolute left-1/2 size-3.5 -translate-x-1/2 rounded-full transition-all ${
                    on ? 'top-1 bg-primary' : 'bottom-1 bg-muted-foreground'
                  }`}
                />
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">{1 << i}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          <Readout label="Adresse" value={addr != null ? String(addr) : ''} big accent />
          <Readout label="Binär (Schalter 9→1)" value={addr != null ? binary : ''} />
        </div>
        <p className="text-xs text-muted-foreground">
          Schalter ON = oben. Manche Geräte haben einen 10. Schalter für Sonderfunktionen
          (z. B. Display/Modus) – der zählt hier nicht zur Adresse.
        </p>
      </SectionCard>
    </CalcPage>
  )
}
