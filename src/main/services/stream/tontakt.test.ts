import { describe, expect, it } from 'vitest'
import { Tontakt, TONTAKT_VORGABE } from './tontakt'

const RATE = 48000
const BLOCK = 1600 // wie das AudioWorklet: ~33 ms
const BLOCK_MS = (BLOCK * 1000) / RATE
const START = 1_000_000

/**
 * Spielt einen Spiegel nach: Er rendert ab `abMs` im Takt seiner Uhr (Faktor `uhr` gegen die
 * Wanduhr), ein Block ist fertig, wenn sein letztes Sample gerendert ist. `zustellung(fertig)`
 * sagt, wann der Block im main ankommt (Hänger: später, als Schub).
 */
function laufen(
  takt: Tontakt,
  bisMs: number,
  {
    abMs = START + 100,
    uhr = 1,
    frame0 = 0,
    zustellung = (fertig: number): number => fertig + 2,
    tickMs = 20,
    ticks = true
  } = {}
): { stille: number; geschrieben: number; verworfen: number } {
  const events: { t: number; frame?: number }[] = []
  for (let f = 0; ; f += BLOCK) {
    const fertig = abMs + ((f + BLOCK) * 1000) / RATE / uhr
    if (fertig > bisMs) break
    events.push({ t: zustellung(fertig), frame: frame0 + f })
  }
  if (ticks) for (let t = START; t <= bisMs; t += tickMs) events.push({ t })
  // stabil: Blöcke gleicher Ankunft in ihrer Reihenfolge (IPC stellt der Reihe nach zu), Takte danach
  events.sort((a, b) => a.t - b.t || (a.frame == null ? 1 : 0) - (b.frame == null ? 1 : 0))
  let stille = 0
  let geschrieben = 0
  let verworfen = 0
  for (const e of events) {
    if (e.t > bisMs) continue
    if (e.frame == null) {
      stille += takt.tick(e.t, tickMs)
      continue
    }
    const p = takt.block(e.t, e.frame, BLOCK)
    stille += p.stille
    geschrieben += p.anzahl
    verworfen += BLOCK - p.anzahl
  }
  return { stille, geschrieben, verworfen }
}

describe('Tontakt – Zeitachse des Tons', () => {
  it('gleichmäßige Blöcke: lückenlos, die Position läuft mit der Uhr', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    const r = laufen(t, START + 10_000)
    expect(r.verworfen).toBeLessThan(BLOCK) // höchstens der Anfang des ersten Blocks
    // Stille nur bis zum ersten Block (der Spiegel beginnt 50 ms nach dem Verbinden zu rendern,
    // sein erster Block ist 33 ms später fertig) – danach keine mehr
    expect((r.stille * 1000) / RATE).toBeLessThan(55)
    const abstandMs = ((t.soll(START + 10_000) - t.position) * 1000) / RATE
    expect(abstandMs).toBeGreaterThanOrEqual(0)
    expect(abstandMs).toBeLessThan(BLOCK_MS + 5)
  })

  it('Schub nach einem Hänger: alle Blöcke lückenlos an ihrem Platz, keine Stille', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    // Der main-Prozess hängt 800 ms: Blöcke und Takt bleiben aus, danach kommt alles auf einmal.
    const hang = { von: START + 3000, bis: START + 3800 }
    const zustellung = (fertig: number): number =>
      fertig >= hang.von && fertig < hang.bis ? hang.bis : fertig + 2
    const vergleich = new Tontakt(START)
    vergleich.beginn(START + 50)
    const ohneHaenger = laufen(vergleich, START + 6000, { ticks: false })
    const events = laufen(t, START + 6000, {
      zustellung,
      ticks: false // die Takte prüft der nächste Fall
    })
    // genau so viel Stille und so viele Samples wie ohne Hänger: nichts ersetzt, nichts verloren
    expect(events.stille).toBe(ohneHaenger.stille)
    expect(events.geschrieben).toBe(ohneHaenger.geschrieben)
    expect(events.verworfen).toBe(ohneHaenger.verworfen)
  })

  it('verspäteter Takt nach dem Hänger setzt keine Stille ein', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    t.tick(START + 100, 20)
    t.block(START + 140, 0, BLOCK)
    t.tick(START + 160, 20)
    // 800 ms nichts – der nächste Takt kommt zu spät und schiebt keine Stille nach
    expect(t.tick(START + 960, 20)).toBe(0)
    // der übernächste schon, falls bis dahin kein Block kam
    expect(t.tick(START + 980, 20)).toBeGreaterThan(0)
  })

  it('Ton fällt aus: nach der Geduld Stille, danach geht es an der richtigen Stelle weiter', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    laufen(t, START + 2000)
    const vorher = t.position
    // 3 s kein Block (Spiegel ohne Ton), der Takt läuft weiter
    let stille = 0
    for (let now = START + 2000; now <= START + 5000; now += 20) stille += t.tick(now, 20)
    expect(stille).toBeGreaterThan(RATE * 2.5)
    expect(t.position).toBeGreaterThan(vorher)
    // höchstens Geduld + ein Takt hinter der Uhr
    const hinterherMs = ((t.soll(START + 5000) - t.position) * 1000) / RATE
    expect(hinterherMs).toBeLessThanOrEqual(TONTAKT_VORGABE.geduldMs + 20)
    // Der Spiegel-Ton läuft weiter (seine Uhr lief durch): Blöcke ab 5 s landen ohne Sprung
    const frame = Math.round(((START + 5000 - (START + 100)) * RATE) / 1000)
    const p = t.block(START + 5000 + BLOCK_MS + 2, frame, BLOCK)
    expect(p.anzahl).toBe(BLOCK)
    expect(((p.stille * 1000) / RATE) | 0).toBeLessThanOrEqual(TONTAKT_VORGABE.geduldMs + 25)
  })

  it('Spiegel neu geladen (Sample-Nummer beginnt bei 0): neuer Anker, Block endet jetzt', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    laufen(t, START + 3000)
    const p = t.block(START + 3500, 0, BLOCK)
    expect(p.anzahl).toBe(BLOCK)
    expect(t.position).toBe(t.soll(START + 3500))
  })

  it('Soundkarte 0,1 % zu langsam: Ton bleibt in der Toleranz an der Uhr (Stille eingefügt)', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    const r = laufen(t, START + 120_000, { uhr: 0.999 })
    expect(r.stille).toBeGreaterThan(0)
    const abweichungMs = ((t.soll(START + 120_000) - t.position) * 1000) / RATE
    expect(abweichungMs).toBeLessThan(TONTAKT_VORGABE.toleranzMs + BLOCK_MS + 5)
    expect(abweichungMs).toBeGreaterThan(-TONTAKT_VORGABE.toleranzMs)
  })

  it('Soundkarte 0,1 % zu schnell: Ton bleibt in der Toleranz (Überhang verworfen)', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    const r = laufen(t, START + 120_000, { uhr: 1.001 })
    expect(r.verworfen).toBeGreaterThan(BLOCK)
    const abweichungMs = ((t.soll(START + 120_000) - t.position) * 1000) / RATE
    expect(abweichungMs).toBeLessThan(TONTAKT_VORGABE.toleranzMs + BLOCK_MS + 5)
    expect(abweichungMs).toBeGreaterThan(-TONTAKT_VORGABE.toleranzMs - 5)
  })

  it('erster Block kam verspätet: der nächste pünktliche verbessert den Anker', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    const abMs = START + 100
    const fertig = (f: number): number => abMs + ((f + BLOCK) * 1000) / RATE
    t.block(fertig(0) + 30, 0, BLOCK) // 30 ms zu spät
    t.block(fertig(BLOCK) + 1, BLOCK, BLOCK) // pünktlich
    // ab jetzt liegen pünktliche Blöcke genau an der Uhr
    t.block(fertig(2 * BLOCK) + 1, 2 * BLOCK, BLOCK)
    const abstandMs = ((t.soll(fertig(2 * BLOCK) + 1) - t.position) * 1000) / RATE
    expect(Math.abs(abstandMs)).toBeLessThan(2)
  })

  it('beschäftigter main beim Start: Blöcke kommen 3 s lang 25 ms zu spät – mit der Renderzeit sitzt der Anker trotzdem richtig', () => {
    // Beim Start von ffmpeg lädt auch das Spiegelfenster, der main-Prozess ist beschäftigt: Die
    // ersten Blöcke kommen alle spät an. Nach der Ankunft eingeordnet, saß der Anker 25 ms zu
    // spät und blieb dort (unter der Toleranz) – der Ton lag den ganzen Lauf zu spät.
    const t = new Tontakt(START)
    t.beginn(START + 50)
    const abMs = START + 100
    let letzterFertig = 0
    for (let f = 0; f < 10 * RATE; f += BLOCK) {
      const fertig = abMs + ((f + BLOCK) * 1000) / RATE // Renderzeit des Blockendes
      const ankunft = fertig + (fertig < abMs + 3000 ? 25 : 1)
      t.block(ankunft, f, BLOCK, fertig)
      letzterFertig = fertig
    }
    // Das Ende des letzten Blocks liegt dort, wo die Uhr stand, als er gerendert wurde.
    expect(Math.abs(((t.position - t.soll(letzterFertig)) * 1000) / RATE)).toBeLessThan(2)
  })

  it('unbrauchbare Renderzeit (fehlt, weit weg): eingeordnet nach der Ankunft', () => {
    const a = new Tontakt(START)
    const b = new Tontakt(START)
    a.beginn(START + 50)
    b.beginn(START + 50)
    a.block(START + 200, 0, BLOCK)
    b.block(START + 200, 0, BLOCK, START - 60_000) // eine Minute daneben: nicht glaubhaft
    expect(b.position).toBe(a.position)
  })

  it('Weg des Bildes als Verzug je Block: Der Ton liegt genau so viel später', () => {
    // Das Bild braucht vom Spiegel bis zum main länger als der Ton (am Mac rund 19 ms) – um diesen
    // Weg legt der Takt den Ton später, damit beide im Strom zusammenpassen.
    const ohne = new Tontakt(START)
    const mit = new Tontakt(START)
    ohne.beginn(START + 50)
    mit.beginn(START + 50)
    const abMs = START + 100
    for (let f = 0; f < 3 * RATE; f += BLOCK) {
      const fertig = abMs + ((f + BLOCK) * 1000) / RATE
      ohne.block(fertig + 2, f, BLOCK, fertig)
      mit.block(fertig + 2, f, BLOCK, fertig, 19)
    }
    expect(((mit.position - ohne.position) * 1000) / RATE).toBeCloseTo(19, 0)
  })

  it('Verzug wackelt um 1–2 ms: kein neues Ansetzen; ändert er sich um 10 ms: einmal Stille', () => {
    const t = new Tontakt(START)
    t.beginn(START + 50)
    const abMs = START + 100
    let stille = 0
    for (let f = 0; f < 6 * RATE; f += BLOCK) {
      const fertig = abMs + ((f + BLOCK) * 1000) / RATE
      // Median schwankt zwischen 19 und 21; ab 4 s ist der Weg 31 ms
      const verzug = fertig < abMs + 4000 ? 19 + (f % 3) : 31
      stille += t.block(fertig + 2, f, BLOCK, fertig, verzug).stille
    }
    // Stille nur am Anfang (bis zum ersten Block) und einmal 10–12 ms beim Sprung
    const beginn = Math.round(((START + 100 + 19 - START - 50) * RATE) / 1000)
    expect(stille - beginn).toBeGreaterThan((10 * RATE) / 1000)
    expect(stille - beginn).toBeLessThan((13 * RATE) / 1000)
  })

  it('Verzug: Ton liegt um so viel später', () => {
    const ohne = new Tontakt(START)
    const mit = new Tontakt(START, { ...TONTAKT_VORGABE, verzugMs: 30 })
    expect(ohne.soll(START + 1000) - mit.soll(START + 1000)).toBe(30 * 48)
    expect(mit.soll(START + 10)).toBe(0) // nie negativ
  })
})
