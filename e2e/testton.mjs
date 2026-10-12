// Testton im Testbild-Werkzeug, gemessen statt angenommen: Vor dem Ausgang der Seite hängt ein
// Analysator (je Kanal), so lassen sich Pegel, Frequenz, die Pausen der Kanal-Kennung und der
// Zeitpunkt des AV-Sync-Piepes gegenüber der vollen Sekunde prüfen. Dazu der Blitz in der
// Vorschau und dass der Ton beim Verlassen des Werkzeugs endet.
// Ohne laufende Audioausgabe (manche CI-Rechner) werden die Messschritte übersprungen.

import assert from 'node:assert/strict'
import { launchApp, openRoute, runSteps, Skip, sleep, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { page } = ctx

/** Analysator vor jedem Ausgang (AudioDestinationNode), je Kanal einer */
async function installTap() {
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
        connect.call(this, split)
        connect.call(split, l, 0)
        connect.call(split, r, 1)
        taps.push({ ctx: c, l, r })
      }
      return result
    }
    const peakOf = (a, size) => {
      a.fftSize = size
      const buf = new Float32Array(a.fftSize)
      a.getFloatTimeDomainData(buf)
      return buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    }
    window.__toneTap = {
      state: () => taps.at(-1)?.ctx.state ?? 'none',
      peak: (size = 2048) => {
        const t = taps.at(-1)
        return { l: peakOf(t.l, size), r: peakOf(t.r, size) }
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
      /** Peaks je Kanal über `ms` Millisekunden, alle `step` ms: [Date.now(), l, r] */
      record: (ms, step, size) =>
        new Promise((resolve) => {
          const out = []
          const t0 = Date.now()
          const id = setInterval(() => {
            const p = window.__toneTap.peak(size)
            out.push([Date.now(), p.l, p.r])
            if (Date.now() - t0 >= ms) {
              clearInterval(id)
              resolve(out)
            }
          }, step)
        })
    }
  })
}

const tap = (fn, ...args) => page.evaluate(([f, a]) => window.__toneTap[f](...a), [fn, args])
const toneButton = () => page.getByRole('button', { name: 'Ton', exact: true })
const toneSection = () => page.getByRole('button', { name: /^Testton/ })
const signalSelect = () =>
  page
    .getByTestId('settings-drawer')
    .locator('select')
    .filter({ has: page.locator('option[value="ident"]') })

/** Läufe von Stille (< 0,01) in einer Aufnahme zählen */
function silentRuns(samples) {
  let runs = 0
  let quiet = false
  for (const v of samples) {
    if (v < 0.01 && !quiet) runs++
    quiet = v < 0.01
  }
  return runs
}

let audio = true
let toneContexts = 0
const needAudio = () => {
  if (!audio) throw new Skip('keine laufende Audioausgabe auf diesem Rechner')
}

try {
  await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 15_000 })
  await openRoute(page, '/tool/test-patterns')
  await page.getByTestId('tool-bar').waitFor({ timeout: 10_000 })
  await installTap()

  await runSteps('Testton', [
    [
      '„Ton“ in der Leiste: live, Status nennt das Signal',
      async () => {
        await toneButton().click()
        await waitFor(async () => (await toneButton().getAttribute('aria-pressed')) === 'true')
        assert.equal(await page.getByTestId('tool-bar').getAttribute('data-active'), 'true')
        await page.getByTestId('tool-bar').getByText('Ton: Sinus 1 kHz · −18 dBFS').waitFor()
        audio = await waitFor(async () => (await tap('state')) === 'running', 3000)
      }
    ],
    [
      'Sinus 1 kHz bei −18 dBFS: sanft eingeblendet, dann genau der Pegel',
      async () => {
        needAudio()
        // gleich nach dem Start noch leise (Einblenden über 0,5 s)
        const early = await tap('peak')
        await sleep(900)
        const { l, r } = await tap('peak')
        const want = 10 ** (-18 / 20)
        assert.ok(early.l < want * 0.9, `zu Beginn schon ${early.l}`)
        assert.ok(Math.abs(l - want) < 0.01 && Math.abs(r - want) < 0.01, `${l} / ${r}`)
        const f = await tap('freq')
        assert.ok(Math.abs(f - 1000) < 10, `Frequenz ${f}`)
      }
    ],
    [
      'Pegel gedeckelt bei −6 dBFS; beim Ziehen hörbar, gespeichert erst beim Loslassen',
      async () => {
        needAudio()
        await toneSection().click()
        const slider = page.getByLabel('Pegel in dBFS')
        // wie eine Nutzereingabe: Wert über Reacts Setter, dann input (Ziehen) bzw. pointerup
        const drag = (value, release) =>
          slider.evaluate(
            (el, [v, up]) => {
              const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
              set.call(el, v)
              el.dispatchEvent(new Event('input', { bubbles: true }))
              if (up) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
            },
            [value, release]
          )
        const stored = () =>
          page.evaluate(() => window.api.getSettings().then((x) => x.patternTone.levelDb))
        await drag('0', false)
        await sleep(500)
        const { l } = await tap('peak')
        assert.ok(Math.abs(l - 10 ** (-6 / 20)) < 0.02, `Spitze ${l}`)
        await page.getByText('−6 dBFS', { exact: true }).waitFor()
        assert.equal(await stored(), -18, 'beim Ziehen schon gespeichert')
        await drag('-6', true)
        assert.ok(await waitFor(async () => (await stored()) === -6, 3000), 'nicht gespeichert')
        // zurück auf −18 für die übrigen Schritte
        await drag('-18', true)
        assert.ok(await waitFor(async () => (await stored()) === -18, 3000))
      }
    ],
    [
      'Sweep, Rauschen, Metronom, Polaritätspuls: klingen, nie über dem Pegel; Kanal „Links“',
      async () => {
        needAudio()
        const max = 10 ** (-18 / 20) + 0.005
        for (const signal of ['sweep', 'pink', 'white', 'metronome', 'polarity']) {
          await signalSelect().selectOption(signal)
          await sleep(400)
          const rec = await tap('record', 1200, 20, 2048)
          const peak = Math.max(...rec.map((x) => Math.max(x[1], x[2])))
          assert.ok(peak > 0.02 && peak <= max, `${signal}: Spitze ${peak}`)
        }
        const channels = page.locator('select', { has: page.locator('option[value="alternate"]') })
        await channels.selectOption('left')
        await sleep(300)
        const rec = await tap('record', 800, 20, 2048)
        assert.ok(Math.max(...rec.map((x) => x[1])) > 0.02, 'links still')
        assert.ok(Math.max(...rec.map((x) => x[2])) < 0.001, 'rechts nicht still')
        await channels.selectOption('both')
      }
    ],
    [
      'Kanal-Kennung: links eine Pause, rechts zwei je 4 s',
      async () => {
        needAudio()
        await signalSelect().selectOption('ident')
        // Zyklus ab dem Wechsel: links Pause bei 4,0 s, rechts bei 4,5 und 5,0 s. Gemessen wird
        // von 3,8 bis 6,8 s – beide Grenzen liegen sicher im Ton, nicht in einer Pause.
        await sleep(3800)
        const rec = await tap('record', 3000, 20, 512)
        const left = silentRuns(rec.map((x) => x[1]))
        const right = silentRuns(rec.map((x) => x[2]))
        assert.deepEqual({ left, right }, { left: 1, right: 2 })
      }
    ],
    [
      'AV-Sync: Testbild wechselt mit, Piep zur vollen Sekunde, Vorschau blitzt dann',
      async () => {
        needAudio()
        await signalSelect().selectOption('avsync')
        // das Testbild zieht mit (Blitz ohne Piep misst nichts)
        const patternSelect = page.locator('select', {
          has: page.locator('option[value="bars-ebu"]')
        })
        assert.ok(await waitFor(async () => (await patternSelect.inputValue()) === 'avsync', 3000))
        await sleep(1200)
        const rec = await tap('record', 3200, 4, 256)
        // mit Hysterese: ein Messfenster, das die 1-ms-Flanke nur halb erfasst, liegt zwischen
        // den Schwellen und darf den Piep weder verschlucken noch doppelt zählen
        const onsets = []
        let loud = true // erst nach einer leisen Messung zählen
        for (const [t, v] of rec) {
          if (!loud && v > 0.05) {
            onsets.push(t)
            loud = true
          } else if (loud && v < 0.01) loud = false
        }
        assert.ok(onsets.length >= 2, `${onsets.length} Piepe`)
        // Abstand zur nächsten vollen Sekunde; der Analysator sieht den Ton um die Ausgabelatenz
        // früher, als er aus dem Gerät kommt – deshalb eher etwas vor der Sekunde
        const offsets = onsets.map((t) => t - Math.round(t / 1000) * 1000)
        console.log(`    Piep gegenüber der vollen Sekunde: ${offsets.join(', ')} ms`)
        assert.ok(
          offsets.every((o) => o > -150 && o < 40),
          offsets.join(', ')
        )
        // Vorschau: kurz nach der vollen Sekunde weiß, in der Mitte der Sekunde schwarz
        const frames = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const canvas =
                document.querySelector('main canvas') ?? document.querySelector('canvas')
              const g = canvas.getContext('2d')
              const out = []
              const t0 = Date.now()
              const loop = () => {
                const px = g.getImageData(canvas.width >> 1, canvas.height >> 2, 1, 1).data
                out.push([Date.now() % 1000, px[0]])
                if (Date.now() - t0 < 3200) requestAnimationFrame(loop)
                else resolve(out)
              }
              requestAnimationFrame(loop)
            })
        )
        // helle Frames nur knapp nach der vollen Sekunde (40 ms Blitz + bis zu einem Frame
        // Verzug, weil die Vorschau im selben Frame vor oder nach dieser Messung zeichnet)
        const lit = frames.filter(([, v]) => v > 200)
        const dark = frames.filter(([ms]) => ms >= 100 && ms < 900)
        assert.ok(lit.length > 0, 'die Vorschau blitzt nicht')
        assert.ok(
          lit.every(([ms]) => ms < 60),
          JSON.stringify(lit)
        )
        assert.ok(
          dark.length > 10 && dark.every(([, v]) => v < 60),
          'Vorschau blitzt zur falschen Zeit'
        )
      }
    ],
    [
      'Player-Ruhebild bietet AV-Sync nicht an',
      async () => {
        toneContexts = await page.evaluate(() => window.__tone.length)
        await openRoute(page, '/tool/video-player')
        await page.getByTestId('tool-bar').waitFor()
        assert.equal(await page.locator('option[value="avsync"]').count(), 0)
      }
    ],
    [
      'Werkzeug verlassen: der Ton endet',
      async () => {
        needAudio()
        // im vorigen Schritt verlassen – die Kontexte des Testtons sind geschlossen
        const closed = () =>
          page.evaluate(
            (n) => window.__tone.slice(0, n).every((t) => t.ctx.state === 'closed'),
            toneContexts
          )
        assert.ok(toneContexts > 0 && (await waitFor(closed, 3000)))
      }
    ]
  ])
} finally {
  await ctx.close()
}
