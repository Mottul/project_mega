import { useState } from 'react'
import { CalcPage, NumField, Readout, SectionCard, SelectField, fmt, parseNum } from '../_calc/ui'

// Beamer-Helligkeit: Wieviel ANSI-Lumen braucht die Projektion?
// Faustformel aus dem Verleih-Alltag: Ziel-Beleuchtungsstärke auf der Leinwand
// je nach Umgebungslicht, dann Lumen = Ziel-Lux × Bildfläche ÷ Gain.

const AMBIENT: { key: string; label: string; lux: number }[] = [
  { key: 'dark', label: 'Dunkel (Kino/abgedunkelt)', lux: 250 },
  { key: 'dim', label: 'Gedimmt (Vortragssaal)', lux: 400 },
  { key: 'bright', label: 'Hell (Konferenzraum/Messe)', lux: 650 },
  { key: 'daylight', label: 'Tageslicht (Schaufenster/Zelt)', lux: 1100 }
]

export function ProjectorLumen(): JSX.Element {
  const [wRaw, setWRaw] = useState('4')
  const [hRaw, setHRaw] = useState('2,25')
  const [ambient, setAmbient] = useState('dim')
  const [gainRaw, setGainRaw] = useState('1')
  const [haveRaw, setHaveRaw] = useState('')

  const w = parseNum(wRaw)
  const h = parseNum(hRaw)
  const gainParsed = parseNum(gainRaw)
  const gain = gainParsed != null && gainParsed > 0 ? gainParsed : 1
  const targetLux = AMBIENT.find((a) => a.key === ambient)?.lux ?? 400

  const area = w != null && h != null && w > 0 && h > 0 ? w * h : null
  const needed = area != null ? (targetLux * area) / gain : null

  const have = parseNum(haveRaw)
  const achievedLux = have != null && have > 0 && area != null ? (have * gain) / area : null
  const enough = needed != null && have != null ? have >= needed : null

  return (
    <CalcPage>
      <SectionCard
        title="Projektion"
        desc="Bildgröße und Umgebungslicht angeben – der Lumen-Bedarf ist die Kernaussage."
      >
        <NumField label="Bildbreite" unit="m" value={wRaw} onChange={setWRaw} />
        <NumField label="Bildhöhe" unit="m" value={hRaw} onChange={setHRaw} />
        <SelectField label="Umgebungslicht" value={ambient} onChange={setAmbient}>
          {AMBIENT.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label} – Ziel {a.lux} lx
            </option>
          ))}
        </SelectField>
        <NumField label="Leinwand-Gain" value={gainRaw} onChange={setGainRaw} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Readout label="Bildfläche" value={fmt(area)} unit="m²" />
          <Readout label="Lumen-Bedarf" value={fmt(needed, 0)} unit="lm" big accent />
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          Faustformel: Lumen = Ziel-Lux × Fläche ÷ Gain. Richtwerte ohne Reserve – für kritische
          Inhalte (Video, dunkle Grafiken) eher eine Stufe höher planen.
        </p>
      </SectionCard>

      <SectionCard title="Vorhandener Beamer" desc="Optional: reicht das Gerät, das verfügbar ist?">
        <NumField label="Beamer-Lichtstrom" unit="lm" value={haveRaw} onChange={setHaveRaw} placeholder="z.B. 6500" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Readout label="Erreichte Helligkeit" value={fmt(achievedLux, 0)} unit="lx" />
          <Readout
            label="Bewertung"
            value={enough == null ? '' : enough ? 'ausreichend ✓' : 'zu dunkel ✗'}
            accent={enough === true}
          />
        </div>
      </SectionCard>
    </CalcPage>
  )
}
