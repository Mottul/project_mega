import { useState } from 'react'
import {
  CalcPage,
  NumField,
  Readout,
  SectionCard,
  SelectField,
  fmt,
  parseNum,
  trimNum,
  ReadoutGrid,
  useLinkedFields
} from '../_calc/ui'
import {
  formatRealtime,
  formatTc,
  framesFrom,
  framesToSeconds,
  framesToTc,
  parseTc,
  tcToFrames,
  TC_RATES,
  type TcField
} from './tc'
import { Alert } from '@renderer/components/ui/alert'

// SMPTE-Timecode-Rechner: Timecode <-> Frames <-> Echtzeit (verknüpfte Felder,
// das zuletzt bearbeitete ist die Quelle) + Differenz/Dauer zwischen zwei
// Timecodes. Drop-Frame (29,97/59,94) wird korrekt behandelt.

// ⓘ der Timecode-Felder: Am Handy gibt es nur die Zifferntastatur (ohne Doppelpunkt)
const TC_HINT =
  'hh:mm:ss:ff oder nur Ziffern, gelesen paarweise von rechts: 1020312 = 01:02:03:12. Ein oder zwei Ziffern sind Frames.'

export function Timecode(): JSX.Element {
  const [rateKey, setRateKey] = useState('25')
  const { driver, raw, bind } = useLinkedFields<TcField>('tc', '01:00:00:00')

  const [tcA, setTcA] = useState('01:00:00:00')
  const [tcB, setTcB] = useState('01:05:30:00')

  const rate = TC_RATES.find((r) => r.key === rateKey) ?? TC_RATES[2]
  // Ein Timecode ist keine Dezimalzahl: Seine Felder lesen mit parseTc, sonst wären sie rot
  const readTc = (s: string): unknown => parseTc(s, rate)

  // Quelle -> Framenummer (null = Eingabe ungültig); negativ macht der Rechenkern das Feld rot
  const src = framesFrom(
    driver === 'tc' ? { field: 'tc', text: raw } : { field: driver, value: parseNum(raw) },
    rate
  )
  const { frames } = src
  const bad = (f: TcField): boolean => src.invalid.includes(f)

  const vals: Record<TcField, string> = {
    tc: frames != null ? formatTc(framesToTc(frames, rate), rate) : '',
    frames: frames != null ? String(frames) : '',
    real: frames != null ? trimNum(framesToSeconds(frames, rate), 4) : ''
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
        desc="Ein Feld eingeben – die übrigen folgen."
      >
        <SelectField
          label="Framerate"
          hint="Drop-Frame (29,97 und 59,94 fps) lässt Frame-NUMMERN aus, keine Bilder – Schreibweise mit Semikolon (hh:mm:ss;ff). 1 h Drop-Frame-Timecode ≙ 3599,996 s Echtzeit; Non-Drop läuft der Uhr je Stunde 3,6 s davon."
          value={rateKey}
          onChange={setRateKey}
        >
          {TC_RATES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </SelectField>
        {/* Timecodes lesen mit parseTc (ungültig = rot) und öffnen am Handy die Zifferntastatur */}
        <NumField
          label="Timecode"
          hint={TC_HINT}
          placeholder="hh:mm:ss:ff"
          digits
          parse={readTc}
          {...bind('tc', vals.tc)}
        />
        <NumField
          label="Frames (gesamt)"
          invalid={bad('frames')}
          {...bind('frames', vals.frames)}
        />
        <NumField label="Echtzeit" unit="s" invalid={bad('real')} {...bind('real', vals.real)} />
        {/* kein Akzent: Die Antwort der Karte sind die berechneten Felder */}
        <Readout
          label="Echtzeit (hh:mm:ss.ms)"
          value={frames != null ? formatRealtime(framesToSeconds(frames, rate)) : ''}
        />
        {driver === 'tc' && raw.trim() !== '' && frames == null && (
          <Alert tone="danger">
            Ungültiger Timecode – hh:mm:ss:ff oder nur Ziffern, Frames unter {rate.nominal}.
          </Alert>
        )}
      </SectionCard>

      <SectionCard
        title="Dauer zwischen zwei Timecodes"
        desc="Zum Beispiel die Clip-Länge aus In- und Out-Punkt (B − A)."
        hint={`Timecodes A und B: ${TC_HINT}`}
      >
        <NumField
          label="Timecode A (In)"
          placeholder="hh:mm:ss:ff"
          digits
          parse={readTc}
          value={tcA}
          onChange={setTcA}
        />
        <NumField
          label="Timecode B (Out)"
          placeholder="hh:mm:ss:ff"
          digits
          parse={readTc}
          value={tcB}
          onChange={setTcB}
        />
        <ReadoutGrid>
          <Readout label="Dauer (Timecode)" value={diffTc} big accent />
          <Readout label="Frames" value={diffFrames != null ? fmt(diffFrames, 0) : ''} />
        </ReadoutGrid>
        <Readout
          label="Echtzeit"
          value={diffFrames != null ? formatRealtime(framesToSeconds(diffFrames, rate)) : ''}
        />
      </SectionCard>
    </CalcPage>
  )
}
