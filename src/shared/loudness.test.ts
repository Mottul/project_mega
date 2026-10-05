import { describe, expect, it } from 'vitest'
import {
  loudnessOutcome,
  loudnessResultStep,
  loudnormApplyFilter,
  loudnormMeasureFilter,
  lufsText,
  parseLoudnormOutput,
  withLoudnessResult,
  type LoudnessMeasurement,
  type LoudnessTarget
} from './loudness'

const T: LoudnessTarget = { i: -16, tp: -1.5, lra: 11 }

// Ende einer echten ffmpeg-Ausgabe (gekürzt): Messwerte als JSON, danach noch Zeilen
const OUTPUT = `[aist#0:0/pcm_s16le @ 0x5563] Guessed Channel Layout: stereo
[Parsed_loudnorm_0 @ 0x55d0c8a4c3c0]
{
	"input_i" : "-27.61",
	"input_tp" : "-10.47",
	"input_lra" : "6.20",
	"input_thresh" : "-38.20",
	"output_i" : "-16.58",
	"output_tp" : "-1.50",
	"output_lra" : "5.10",
	"output_thresh" : "-27.71",
	"normalization_type" : "dynamic",
	"target_offset" : "0.58"
}
[out#0/null @ 0x5563] video:0KiB audio:3750KiB subtitle:0KiB other streams:0KiB`

const SILENT = `[Parsed_loudnorm_0 @ 0x1]
{
	"input_i" : "-inf",
	"input_tp" : "-inf",
	"input_lra" : "0.00",
	"input_thresh" : "-70.00",
	"output_i" : "-inf",
	"output_tp" : "-inf",
	"output_lra" : "0.00",
	"output_thresh" : "-70.00",
	"normalization_type" : "dynamic",
	"target_offset" : "inf"
}`

const m = (p: Partial<LoudnessMeasurement>): LoudnessMeasurement => ({
  i: -27.6,
  tp: -15, // +11,6 dB Verstärkung -> −3,4 dBTP: passt unter −1,5
  lra: 6,
  thresh: -38,
  offset: 0.5,
  ...p
})

describe('Lautheit messen', () => {
  it('liest die Messwerte aus der ffmpeg-Ausgabe', () => {
    expect(parseLoudnormOutput(OUTPUT)).toEqual({
      i: -27.61,
      tp: -10.47,
      lra: 6.2,
      thresh: -38.2,
      offset: 0.58
    })
    expect(parseLoudnormOutput(SILENT)).toMatchObject({ i: -Infinity, offset: Infinity })
    expect(parseLoudnormOutput('Conversion failed!')).toBeNull()
    expect(parseLoudnormOutput('{ "input_i" : kaputt')).toBeNull()
  })

  it('Messfilter: Ziel, Mono über beide Lautsprecher, JSON-Ausgabe', () => {
    expect(loudnormMeasureFilter(T)).toBe(
      'loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:print_format=json'
    )
  })
})

describe('Lautheit einordnen und anwenden', () => {
  it('gleichmäßig, wenn die Spitzen nach dem Verstärken unter dem Grenzwert bleiben', () => {
    const o = loudnessOutcome(T, m({}))
    expect(o).toMatchObject({ kind: 'measured', linear: true })
    expect(loudnormApplyFilter(T, o)).toBe(
      'loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true:measured_I=-27.60:measured_TP=-15.00' +
        ':measured_LRA=6.00:measured_thresh=-38.00:offset=0.50:linear=true'
    )
    // −19,95 LUFS mit Spitzen bei −3,9 dBTP: +3,95 dB brächten +0,05 dBTP -> begrenzen
    expect(loudnessOutcome(T, m({ i: -19.95, tp: -3.9 }))).toMatchObject({ linear: false })
  })

  it('große Dynamik wird nicht zusammengedrückt (Bereich nie unter dem gemessenen)', () => {
    const o = loudnessOutcome(T, m({ lra: 15.53 }))
    expect(o).toMatchObject({ linear: true })
    expect(loudnormApplyFilter(T, o)).toContain(':LRA=15.6:')
  })

  it('umgeht loudnorms „nicht angegeben“-Werte (LRA 0 eines gleichmäßigen Tons)', () => {
    const o = loudnessOutcome(T, m({ lra: 0, tp: -51, i: -51.75 }))
    expect(o).toMatchObject({ linear: true })
    expect(loudnormApplyFilter(T, o)).toContain('measured_LRA=0.01')
    // Schwelle −70: so leise, dass loudnorm ohnehin dynamisch regelt – ehrlich so anzeigen
    expect(loudnessOutcome(T, m({ i: -62, thresh: -70, tp: -55 }))).toMatchObject({
      linear: false
    })
  })

  it('stille Spur bleibt unverändert, kaputte Messung gleicht einstufig an', () => {
    const silent = loudnessOutcome(T, parseLoudnormOutput(SILENT))
    expect(silent).toEqual({ kind: 'silent' })
    expect(loudnormApplyFilter(T, silent)).toBeNull()
    expect(loudnessOutcome(T, m({ i: -75 }))).toEqual({ kind: 'silent' })
    const broken = loudnessOutcome(T, m({ tp: NaN }))
    expect(broken).toEqual({ kind: 'unmeasured' })
    expect(loudnessOutcome(T, null)).toEqual({ kind: 'unmeasured' })
    expect(loudnormApplyFilter(T, broken)).toBe('loudnorm=I=-16:TP=-1.5:LRA=11:dual_mono=true')
  })
})

describe('Lautheit anzeigen', () => {
  it('deutsche Zahlen mit echtem Minus', () => {
    expect(lufsText(-27.61)).toBe('−27,6')
    expect(lufsText(-16)).toBe('−16')
  })

  it('ersetzt den Plan-Schritt durch das Ergebnis', () => {
    const steps = ['Deinterlaced (25i → 50p)', 'Lautheit auf −16 LUFS (EBU R128)']
    const linear = loudnessOutcome(T, m({}))
    expect(withLoudnessResult(steps, T, linear)).toEqual([
      'Deinterlaced (25i → 50p)',
      'Lautheit −27,6 → −16 LUFS, gleichmäßig'
    ])
    expect(loudnessResultStep(T, loudnessOutcome(T, m({ i: -19.95, tp: -3.9 })))).toBe(
      'Lautheit −20 → −16 LUFS, Spitzen begrenzt'
    )
    expect(withLoudnessResult([], T, { kind: 'silent' })).toEqual([
      'Ton still – Lautheit unverändert'
    ])
  })
})
