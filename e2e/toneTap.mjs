// Ton messen statt hören – für e2e/testton.mjs (Testbildgenerator) und e2e/tone-generator.mjs:
// Vor jeden Ausgang (AudioDestinationNode) der Seite hängt je ein Analysator für links, rechts
// und die Summe (Mono-Abmischung: halbe Summe beider Kanäle, gegenphasig also still). Gelesen
// wird in der Seite; Zeitstempel sind Date.now() der Seite.
//
// Kurze Ereignisse (Metronom-Klicks, 30 ms) mit einem Fenster von 2048 Samples aufnehmen: Der
// Ton wird in Blöcken von etwa 10 ms gerechnet, ein Fenster von 256 Samples (5 ms) sieht nur
// einen Teil jedes Blocks – manche Klicks erwischte es erst abgeklungen (gemessen am 13.11.2026:
// jeder zweite Schlag 0,026 statt 0,071, „nur jeder zweite Klick“ war ein Messfehler).

/** Analysatoren einbauen – vor dem ersten Start eines Tons in dieser Seite aufrufen */
export async function installToneTap(page) {
  await page.evaluate(() => {
    if (window.__tone) return
    const taps = []
    window.__tone = taps
    const connect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (dest, ...rest) {
      const result = connect.call(this, dest, ...rest)
      if (dest instanceof AudioDestinationNode) {
        const c = this.context
        const split = c.createChannelSplitter(2)
        const l = c.createAnalyser()
        const r = c.createAnalyser()
        const m = c.createAnalyser()
        m.channelCount = 1
        m.channelCountMode = 'explicit'
        connect.call(this, split)
        connect.call(split, l, 0)
        connect.call(split, r, 1)
        connect.call(this, m)
        taps.push({ ctx: c, l, r, m })
      }
      return result
    }
    const peakOf = (a, size) => {
      a.fftSize = size
      const buf = new Float32Array(a.fftSize)
      a.getFloatTimeDomainData(buf)
      return buf.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
    }
    window.__toneTap = {
      state: () => taps.at(-1)?.ctx.state ?? 'none',
      contexts: () => taps.length,
      peak: (size = 2048) => {
        const t = taps.at(-1)
        return { l: peakOf(t.l, size), r: peakOf(t.r, size), m: peakOf(t.m, size) }
      },
      freq: () => {
        const t = taps.at(-1)
        t.l.fftSize = 16384
        const bins = new Float32Array(t.l.frequencyBinCount)
        t.l.getFloatFrequencyData(bins)
        let best = 0
        for (let i = 1; i < bins.length; i++) if (bins[i] > bins[best]) best = i
        return (best * t.ctx.sampleRate) / t.l.fftSize
      },
      /** Spitzen je Kanal über `ms` Millisekunden, alle `step` ms: [Date.now(), l, r, m] */
      record: (ms, step, size) =>
        new Promise((resolve) => {
          const out = []
          const t0 = Date.now()
          const id = setInterval(() => {
            const p = window.__toneTap.peak(size)
            out.push([Date.now(), p.l, p.r, p.m])
            if (Date.now() - t0 >= ms) {
              clearInterval(id)
              resolve(out)
            }
          }, step)
        }),
      /**
       * Die Seite `ms` lang blockieren (wie ein hängendes Fenster) und danach `after` ms lang die
       * größte Spitze messen – was der Planungstakt nach dem Hänger nachholt, klingt dann.
       */
      hang: (ms, after) =>
        new Promise((resolve) => {
          const until = Date.now() + ms
          while (Date.now() < until) {
            /* blockieren */
          }
          let max = 0
          const end = Date.now() + after
          const id = setInterval(() => {
            const p = window.__toneTap.peak(2048)
            max = Math.max(max, p.l, p.r)
            if (Date.now() >= end) {
              clearInterval(id)
              resolve(max)
            }
          }, 2)
        })
    }
  })
}

/** Funktion des Analysators in der Seite aufrufen: state, contexts, peak, freq, record, hang */
export const toneTap = (page, fn, ...args) =>
  page.evaluate(([f, a]) => window.__toneTap[f](...a), [fn, args])

/** Läufe von Stille (< 0,01) in einer Folge von Spitzen zählen */
export function silentRuns(samples) {
  let runs = 0
  let quiet = false
  for (const v of samples) {
    if (v < 0.01 && !quiet) runs++
    quiet = v < 0.01
  }
  return runs
}

/**
 * Einsätze (Klicks, Pulse, Piepe) in einer Aufnahme [t, l, …]: Zeitpunkte, an denen die Spitze
 * über `high` steigt, nachdem sie unter `low` lag. Die Hysterese verhindert, dass ein Messfenster,
 * das eine Flanke nur halb erfasst, einen Einsatz verschluckt oder doppelt zählt.
 */
export function onsets(rec, { col = 1, high = 0.05, low = 0.01 } = {}) {
  const out = []
  let loud = true // erst nach einer leisen Messung zählen
  for (const row of rec) {
    const v = row[col]
    if (!loud && v > high) {
      out.push(row[0])
      loud = true
    } else if (loud && v < low) loud = false
  }
  return out
}
