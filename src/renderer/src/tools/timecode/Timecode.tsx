import { useState } from 'react'
import { CalcPage, NumField, Readout, SectionCard, SelectField, fmt, parseNum } from '../_calc/ui'
import {
  formatRealtime,
  formatTc,
  framesToSeconds,
  framesToTc,
  parseTc,
  secondsToFrames,
  tcToFrames,
  TC_RATES
} from './tc'

// SMPTE-Timecode-Rechner: Timecode <-> Frames <-> Echtzeit (verknüpfte Felder,
// das zuletzt bearbeitete ist die Quelle) + Differenz/Dauer zwischen zwei
// Timecodes. Drop-Frame (29,97/59,94) wird korrekt behandelt.

type Driver = 'tc' | 'frames' | 'real'

export function Timecode(): JSX.Element {
  const [rateKey, setRateKey] = useState('25')
  const [driver, setDriver] = useState<Driver>('tc')
  const [raw, setRaw] = useState('01:00:00:00')

  const [tcA, setTcA] = useState('01:00:00:00')
  const [tcB, setTcB] = useState('01:05:30:00')

  const rate = TC_RATES.find((r) => r.key === rateKey) ?? TC_RATES[2]

  // Quelle -> Framenummer (null = Eingabe ungültig)
  let frames: number | null = null
  if (driver === 'tc') {
    const p = parseTc(raw, rate)
    frames = p ? tcToFrames(p, rate) : null
  } else if (driver === 'frames') {
    const n = parseNum(raw)
    frames = n != null && n >= 0 ? Math.round(n) : null
  } else {
    const n = parseNum(raw)
    frames = n != null && n >= 0 ? secondsToFrames(n, rate) : null
  }

  const vals: Record<Driver, string> = {
    tc: frames != null ? formatTc(framesToTc(frames, rate), rate) : '',
    frames: frames != null ? String(frames) : '',
    real: frames != null ? String(Number(framesToSeconds(frames, rate).toFixed(4))) : ''
  }

  function bind(field: Driver): {
    value: string
    derived: boolean
    onChange: (v: string) => void
    onFocus: () => void
  } {
    return {
      value: field === driver ? raw : vals[field],
      derived: field !== driver,
      onChange: (v) => {
        setDriver(field)
        setRaw(v)
      },
      onFocus: () => {
        if (field !== driver) {
          setDriver(field)
          setRaw(vals[field])
        }
      }
    }
  }

  // Differenz B − A
  const pA = parseTc(tcA, rate)
  const pB = parseTc(tcB, rate)
  const diffFrames = pA && pB ? tcToFrames(pB, rate) - tcToFrames(pA, rate) : null
  const diffTc =
    diffFrames != null
      ? (diffFrames < 0 ? '−' : '') + formatTc(framesToTc(Math.abs(diffFrames), rate), rate)
      : ''

  return (
    <CalcPage>
      <SectionCard
        title="Timecode ↔ Frames ↔ Echtzeit"
        desc="Ein Feld eingeben – die anderen folgen. Drop-Frame (29,97/59,94) lässt Frame-NUMMERN aus, keine Bilder; Schreibweise mit Semikolon (hh:mm:ss;ff)."
      >
        <SelectField label="Framerate" value={rateKey} onChange={setRateKey}>
          {TC_RATES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <NumField label="Timecode" placeholder="hh:mm:ss:ff" {...bind('tc')} />
        <NumField label="Frames (gesamt)" {...bind('frames')} />
        <NumField label="Echtzeit" unit="s" {...bind('real')} />
        <Readout
          label="Echtzeit (hh:mm:ss.ms)"
          value={frames != null ? formatRealtime(framesToSeconds(frames, rate)) : ''}
          accent
        />
        {driver === 'tc' && raw.trim() !== '' && frames == null && (
          <p className="text-xs text-destructive">
            Ungültiger Timecode – Format hh:mm:ss:ff, Frames &lt; {rate.nominal}.
          </p>
        )}
        {rate.drop && (
          <p className="pt-1 text-xs text-muted-foreground">
            Drop-Frame: 1 h Timecode ≙ 3599,996 s Echtzeit (kompensiert die NTSC-Rate). Non-Drop
            läuft pro Stunde 3,6 s der Uhr davon.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Dauer zwischen zwei Timecodes"
        desc="z.B. Clip-Länge aus In- und Out-Punkt (B − A)."
      >
        <NumField label="Timecode A (In)" placeholder="hh:mm:ss:ff" value={tcA} onChange={setTcA} />
        <NumField
          label="Timecode B (Out)"
          placeholder="hh:mm:ss:ff"
          value={tcB}
          onChange={setTcB}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Readout label="Dauer (Timecode)" value={diffTc} big accent />
          <Readout label="Frames" value={diffFrames != null ? fmt(diffFrames, 0) : ''} />
        </div>
        <Readout
          label="Echtzeit"
          value={diffFrames != null ? formatRealtime(framesToSeconds(diffFrames, rate)) : ''}
        />
      </SectionCard>
    </CalcPage>
  )
}
