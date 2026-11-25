import { useState } from 'react'
import { Segmented } from '@renderer/components/ui/segmented'
import {
  CalcPage,
  FieldBlock,
  FoldCard,
  NumField,
  Readout,
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
  type TcField,
  type TcRate
} from './tc'
import { Alert } from '@renderer/components/ui/alert'

// SMPTE-Timecode-Rechner: Timecode <-> Frames <-> Echtzeit (verknüpfte Felder,
// das zuletzt bearbeitete ist die Quelle) + Differenz/Dauer zwischen zwei
// Timecodes. Drop-Frame (29,97/59,94) wird korrekt behandelt.
// Aufbau nach Muster 2 (Gesamtplan, K6 wie der Pilot Stromlast): Beide Fragen sind zuklappbare
// Karten mit ihrer Antwort als Kurzfassung; ab Werk ist nur die erste offen, „Dauer“ zeigt
// zugeklappt die Dauer – offen ist sie ab Werk nur, wenn die Karten nebeneinander stehen (im
// 520 px breiten Fenster stehen sie untereinander). Die Framerate ist eine Knopfgruppe: ein
// Tipp, alle zehn sichtbar.

// ⓘ der Timecode-Felder: Am Handy gibt es nur die Zifferntastatur (ohne Doppelpunkt)
const TC_HINT =
  'hh:mm:ss:ff oder nur Ziffern, gelesen paarweise von rechts: 1020312 = 01:02:03:12. Ein oder zwei Ziffern sind Frames.'

// Was die Liste dazusagte („25 fps (PAL/EBU)“), steht hinter dem ⓘ
const RATE_HINT =
  'Bilder je Sekunde (fps): 23,976 = 24 ÷ 1,001, 24 Film, 25 PAL/EBU, 29,97 NTSC. DF = Drop-Frame: lässt Frame-NUMMERN aus, keine Bilder – Schreibweise mit Semikolon (hh:mm:ss;ff). 1 h Drop-Frame-Timecode ≙ 3599,996 s Echtzeit; Non-Drop läuft der Uhr je Stunde 3,6 s davon.'

/** Kurzer Name einer Bildrate für ihren Knopf („29,97 DF“) – lesbar auch bei 320 px Breite */
function rateButton(rate: TcRate): string {
  return `${fmt(rate.exact, 3)}${rate.drop ? ' DF' : ''}`
}

/** Kurzfassung der Karte „Umrechnen“: der Timecode und die Bildrate, mit der er zählt */
function convertSummary(tc: string, rate: TcRate): string {
  return tc === '' ? '–' : `${tc} · ${rateButton(rate)}${rate.drop ? '' : ' fps'}`
}

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
      <FoldCard
        id="timecode:umrechnen"
        title="Timecode ↔ Frames ↔ Echtzeit"
        summary={convertSummary(vals.tc, rate)}
        desc="Ein Feld eingeben – die übrigen folgen."
        defaultOpen
      >
        <FieldBlock label="Framerate" hint={RATE_HINT}>
          <Segmented
            label="Framerate"
            value={rateKey}
            options={TC_RATES.map((r) => ({ value: r.key, label: rateButton(r) }))}
            onChange={setRateKey}
            wrap={4.5}
          />
        </FieldBlock>
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
      </FoldCard>

      <FoldCard
        id="timecode:dauer"
        title="Dauer zwischen zwei Timecodes"
        summary={diffTc || '–'}
        desc="Zum Beispiel die Clip-Länge aus In- und Out-Punkt (B − A)."
        hint={`Timecodes A und B: ${TC_HINT}`}
        defaultOpen="nebeneinander"
      >
        {/* die Antwort zuerst, darunter die Felder, darunter die Nebenwerte */}
        <Readout label="Dauer (Timecode)" value={diffTc} big accent />
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
          <Readout label="Frames" value={diffFrames != null ? fmt(diffFrames, 0) : ''} />
          <Readout
            label="Echtzeit"
            value={diffFrames != null ? formatRealtime(framesToSeconds(diffFrames, rate)) : ''}
          />
        </ReadoutGrid>
      </FoldCard>
    </CalcPage>
  )
}
