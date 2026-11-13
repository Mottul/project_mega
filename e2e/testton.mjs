// Testton im Testbild-Werkzeug, gemessen statt angenommen: Vor dem Ausgang der Seite hängt ein
// Analysator (je Kanal), so lassen sich Pegel, Frequenz, die Pausen der Kanal-Kennung und der
// Zeitpunkt des AV-Sync-Piepes gegenüber der vollen Sekunde prüfen. Dazu der Blitz in der
// Vorschau und dass der Ton beim Verlassen des Werkzeugs endet.
// Ohne laufende Audioausgabe (manche CI-Rechner) werden die Messschritte übersprungen.

import assert from 'node:assert/strict'
import { launchApp, openRoute, runSteps, Skip, sleep, waitFor } from './harness.mjs'
import { installToneTap, onsets, silentRuns, toneTap } from './toneTap.mjs'

const ctx = await launchApp()
const { page } = ctx

const installTap = () => installToneTap(page)
const tap = (fn, ...args) => toneTap(page, fn, ...args)
const toneButton = () => page.getByRole('button', { name: 'Ton', exact: true })
const toneSection = () => page.getByRole('button', { name: /^Testton/ })
const signalSelect = () =>
  page
    .getByTestId('settings-drawer')
    .locator('select')
    .filter({ has: page.locator('option[value="ident"]') })

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
        const want = 10 ** (-18 / 20)
        assert.ok(early.l < want * 0.9, `zu Beginn schon ${early.l}`)
        // eingeschwungen abwarten statt nach fester Pause einmal lesen: Unter Last (volle Suite)
        // blendete der Ton nach 900 ms noch ein – 0,096 statt 0,126 (17.10.2026)
        // zweimal in Folge: ein falscher Pegel liefe beim Einblenden durch den richtigen hindurch
        let last = { l: 0, r: 0 }
        let hits = 0
        const ok = await waitFor(async () => {
          last = await tap('peak')
          const at = Math.abs(last.l - want) < 0.01 && Math.abs(last.r - want) < 0.01
          hits = at ? hits + 1 : 0
          return hits >= 2
        }, 5000)
        assert.ok(ok, `${last.l} / ${last.r}`)
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
        // zweimal in Folge: Ein kaputter Deckel liefe durch −6 dBFS hindurch bis 0 dBFS
        let l = 0
        let hits = 0
        const capped = await waitFor(async () => {
          l = (await tap('peak')).l
          hits = Math.abs(l - 10 ** (-6 / 20)) < 0.02 ? hits + 1 : 0
          return hits >= 2
        }, 5000)
        assert.ok(capped, `Spitze ${l}`)
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
      'Metronom: Tempo im Betrieb wechseln – im Takt weiter, kein Neubeginn',
      async () => {
        needAudio()
        await signalSelect().selectOption('metronome')
        const tempo = page.getByLabel('Tempo (BPM)')
        await tempo.fill('120')
        await tempo.press('Enter')
        await sleep(700)
        // zehnmal wechseln, während aufgezeichnet wird: 200 BPM (0,3 s) und 120 BPM (0,5 s)
        const recording = tap('record', 4300, 4, 2048)
        for (let i = 0; i < 10; i++) {
          await sleep(300)
          await tempo.fill(i % 2 ? '120' : '200')
          await tempo.press('Enter')
        }
        const clicks = onsets(await recording, { high: 0.03, low: 0.005 })
        const gaps = clicks.slice(1).map((t, i) => t - clicks[i])
        assert.ok(clicks.length >= 8, `${clicks.length} Klicks`)
        // Bis zu 0,4 s voraus Eingeplantes kommt noch im alten Abstand, danach der neue – jeder
        // Abstand ist also einer der beiden. Ein Neubeginn (Klick gleich nach dem Wechsel, leise
        // im Überblenden) ergäbe andere.
        const off = gaps.filter((g) => Math.abs(g - 300) > 45 && Math.abs(g - 500) > 45)
        assert.deepEqual(off, [], `Abstände: ${gaps.join(', ')} ms`)
        await tempo.fill('120')
        await tempo.press('Enter')
      }
    ],
    [
      'Polaritätspuls: hängt die Seite, holt der Takt Verpasstes nicht übereinander nach',
      async () => {
        needAudio()
        await signalSelect().selectOption('polarity')
        await sleep(800)
        // 1,6 s blockiert: Drei Pulse fallen in die Zeit; sie zugleich nachzuholen ergäbe die
        // dreifache Spitze – am Pegel-Deckel vorbei
        const max = await tap('hang', 1600, 300)
        const level = 10 ** (-18 / 20)
        assert.ok(max <= level * 1.1, `Spitze ${max.toFixed(3)}, Pegel ${level.toFixed(3)}`)
      }
    ],
    [
      'Gegenphase: je Kanal der Pegel, die Summe still',
      async () => {
        needAudio()
        await signalSelect().selectOption('sine')
        const channels = page.locator('select', { has: page.locator('option[value="alternate"]') })
        const level = 10 ** (-18 / 20)
        const expectPeaks = async (sum, what) => {
          let last = {}
          const ok = await waitFor(async () => {
            last = await tap('peak')
            return (
              Math.abs(last.l - level) < 0.01 &&
              Math.abs(last.r - level) < 0.01 &&
              Math.abs(last.m - sum) < 0.01
            )
          }, 4000)
          assert.ok(ok, `${what}: ${JSON.stringify(last)}`)
        }
        await expectPeaks(level, 'beide')
        await channels.selectOption('antiphase')
        await expectPeaks(0, 'gegenphasig')
        await channels.selectOption('both')
        await expectPeaks(level, 'wieder beide')
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
        // mit Hysterese (onsets): ein Messfenster, das die 1-ms-Flanke nur halb erfasst, liegt
        // zwischen den Schwellen und darf den Piep weder verschlucken noch doppelt zählen
        const beeps = onsets(rec)
        assert.ok(beeps.length >= 2, `${beeps.length} Piepe`)
        // Abstand zur nächsten vollen Sekunde; der Analysator sieht den Ton um die Ausgabelatenz
        // früher, als er aus dem Gerät kommt – deshalb eher etwas vor der Sekunde
        const offsets = beeps.map((t) => t - Math.round(t / 1000) * 1000)
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
                // Anlaufzeit verwerfen: Die Ton-Messung davor hat die Seite beschäftigt, auf
                // langsamen Rechnern (macOS in der CI) zeigt das erste Bild noch den alten Blitz
                if (Date.now() - t0 >= 300) {
                  const px = g.getImageData(canvas.width >> 1, canvas.height >> 2, 1, 1).data
                  out.push([Date.now() % 1000, px[0]])
                }
                if (Date.now() - t0 < 3500) requestAnimationFrame(loop)
                else resolve(out)
              }
              requestAnimationFrame(loop)
            })
        )
        // helle Frames nur knapp nach der vollen Sekunde: 40 ms Blitz plus ein Frame Verzug, weil
        // die Vorschau im selben Frame vor oder nach dieser Messung zeichnet. Der Verzug ist der
        // Abstand zum vorigen Frame – auf dem langsamen macOS-Runner kam der nächste Frame einmal
        // erst bei 69 ms und zeigte noch den Blitz von 39 ms (CI rot, #179). Also: hell nach 60 ms
        // nur, wenn der Frame davor noch im Blitz lag.
        const lit = frames.filter(([, v]) => v > 200)
        const dark = frames.filter(([ms]) => ms >= 100 && ms < 900)
        assert.ok(lit.length > 0, 'die Vorschau blitzt nicht')
        const zuSpaet = frames.filter(([ms, v], i) => {
          if (v <= 200 || ms < 60) return false
          const vor = frames[i - 1]?.[0]
          return !(vor !== undefined && vor < 40 && vor <= ms)
        })
        assert.ok(zuSpaet.length === 0, JSON.stringify({ zuSpaet, lit }))
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
