// Testtongenerator (kleines Werkzeug, läuft auch in der Handy-PWA) in der echten App, gemessen
// statt angenommen – Analysator vor dem Ausgang (e2e/toneTap.mjs): Start und Stopp, Pegel und
// Deckel, alle Signale, Kanäle und Gegenphase, Metronom (Tempo im Betrieb, „Tippen“,
// Schlag-Anzeige), Leertaste, verdecktes Fenster, „Wirklich beenden?“, der gemerkte Stand und
// ein fehlendes oder ausfallendes Ausgabegerät.
// Fenster, Höhe und 320 px Breite prüft e2e/layout.mjs (SMALL).
// Die CI-Rechner unter Linux und Windows haben kein Audiogerät: Chromium meldet das mit einem
// Fehler gleich beim Start und rechnet dann auf einem Ersatzgerät – gemessen wird trotzdem. Läuft
// der Kontext gar nicht, werden die Messschritte übersprungen.

import assert from 'node:assert/strict'
import { launchApp, runSteps, Skip, sleep, waitFor } from './harness.mjs'
import { installToneTap, onsets, toneTap } from './toneTap.mjs'

const ctx = await launchApp()
const { app, page } = ctx

const LEVEL = 10 ** (-18 / 20)
let w = null
let audio = true
const needAudio = () => {
  if (!audio) throw new Skip('keine laufende Audioausgabe auf diesem Rechner')
}
const tap = (fn, ...args) => toneTap(w, fn, ...args)

/** Fenster des Werkzeugs öffnen und den Analysator einbauen */
async function openTool() {
  const ev = app.waitForEvent('window')
  await page.evaluate(() => window.api.openToolWindow('tone-generator'))
  const win = await ev
  await win.waitForLoadState()
  await win.getByRole('button', { name: /^(Ton starten|Stopp)$/ }).waitFor({ timeout: 10_000 })
  await installToneTap(win)
  return win
}

/**
 * Fenster des Werkzeugs im main: eine BrowserWindow-Methode aufrufen (minimize, close …). Ein
 * Fenster, das gerade schließt, ist noch in der Liste, sein Inhalt aber schon weg – getURL()
 * würfe dann „Object has been destroyed“ (Windows-CI, 13.11.2026).
 */
const toolWin = (method) =>
  app.evaluate(({ BrowserWindow }, m) => {
    const win = BrowserWindow.getAllWindows().find(
      (v) =>
        !v.isDestroyed() &&
        !v.webContents.isDestroyed() &&
        v.webContents.getURL().includes('#/tool/tone-generator?')
    )
    if (!win) return null
    return win[m]() ?? true
  }, method)

const startButton = () => w.getByRole('button', { name: 'Ton starten' })
const stopButton = () => w.getByRole('button', { name: 'Stopp' })
const signal = (name) =>
  w.getByRole('group', { name: 'Signal' }).getByRole('button', { name, exact: true })
const channel = (name) =>
  w.getByRole('group', { name: 'Kanäle' }).getByRole('button', { name, exact: true })
const tempo = () => w.getByLabel('Tempo in BPM')

/** Spitzen abwarten (zweimal in Folge im Ziel: ein Einblenden liefe durch den Wert hindurch) */
async function expectPeaks(want, what, ms = 5000) {
  let last = {}
  let hits = 0
  const ok = await waitFor(async () => {
    last = await tap('peak')
    const at = Object.entries(want).every(([k, v]) => Math.abs(last[k] - v) < 0.01)
    hits = at ? hits + 1 : 0
    return hits >= 2
  }, ms)
  assert.ok(ok, `${what}: ${JSON.stringify(last)}`)
}

/** Schieber wie eine Nutzereingabe setzen (Reacts Setter, dann input) */
const setSlider = (locator, value) =>
  locator.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, String(value))

/** Tempo eintippen und übernehmen */
async function setTempo(bpm) {
  await tempo().fill(String(bpm))
  await tempo().press('Enter')
}

try {
  await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 15_000 })

  await runSteps('Testtongenerator', [
    [
      'öffnet sich im eigenen kleinen Fenster, Ton zuerst aus',
      async () => {
        w = await openTool()
        await w.getByRole('heading', { name: 'Testtongenerator' }).waitFor()
        await startButton().waitFor()
        assert.equal(await w.getByRole('button', { name: 'AV-Sync' }).count(), 0)
        assert.match(await w.getByTestId('tone-summary').innerText(), /Sinus 1 kHz/)
      }
    ],
    [
      '„Ton starten“: 1 kHz bei −18 dBFS auf beiden Kanälen, eingeblendet; dann „Stopp“',
      async () => {
        await startButton().click()
        await stopButton().waitFor()
        audio = await waitFor(async () => (await tap('state')) === 'running', 3000)
        needAudio()
        const early = await tap('peak')
        assert.ok(early.l < LEVEL * 0.9, `zu Beginn schon ${early.l}`)
        await expectPeaks({ l: LEVEL, r: LEVEL }, 'Pegel')
        const f = await tap('freq')
        assert.ok(Math.abs(f - 1000) < 10, `Frequenz ${f}`)
      }
    ],
    [
      'Pegel: Schnellwahl −12 dBFS, Schieber ganz nach rechts höchstens −6 dBFS',
      async () => {
        needAudio()
        await w.getByRole('button', { name: '−12 dBFS' }).click()
        await expectPeaks({ l: 10 ** (-12 / 20) }, '−12 dBFS')
        await setSlider(w.getByLabel('Pegel in dBFS'), 0)
        await w.getByText('−6 dBFS', { exact: true }).first().waitFor()
        await expectPeaks({ l: 10 ** (-6 / 20) }, 'Deckel')
        await w.getByRole('button', { name: '−18 dBFS' }).click()
        await expectPeaks({ l: LEVEL }, 'zurück auf −18 dBFS')
      }
    ],
    [
      'Frequenz: Schnellwahl 440 Hz und der Schieber',
      async () => {
        needAudio()
        await w.getByRole('button', { name: '440 Hz' }).click()
        assert.ok(
          await waitFor(async () => Math.abs((await tap('freq')) - 440) < 6, 3000),
          'nicht 440 Hz'
        )
        // Mitte des logarithmischen Schiebers: gut 600 Hz
        await setSlider(w.getByLabel('Frequenz, logarithmisch'), 500)
        assert.equal(await w.getByLabel('Frequenz in Hz').inputValue(), '632')
        assert.ok(
          await waitFor(async () => Math.abs((await tap('freq')) - 632) < 6, 3000),
          'Schieber wirkt nicht'
        )
        await w.getByRole('button', { name: '1 kHz' }).click()
      }
    ],
    [
      'alle sieben Signale klingen, keines über dem Pegel',
      async () => {
        needAudio()
        for (const name of ['Sweep', 'Rosa', 'Weiß', 'Metronom', 'Kennung', 'Polarität', 'Sinus']) {
          await signal(name).click()
          await sleep(400)
          const rec = await tap('record', 1200, 20, 2048)
          const peak = Math.max(...rec.map((x) => Math.max(x[1], x[2])))
          assert.ok(peak > 0.02 && peak <= LEVEL + 0.005, `${name}: Spitze ${peak}`)
        }
      }
    ],
    [
      'Kanäle: „Links“ – rechts still; „Gegenphase“ – je Kanal der Pegel, die Summe still',
      async () => {
        needAudio()
        await channel('Links').click()
        await expectPeaks({ l: LEVEL, r: 0 }, 'links')
        await channel('Gegenphase').click()
        await expectPeaks({ l: LEVEL, r: LEVEL, m: 0 }, 'gegenphasig')
        assert.match(await w.getByTestId('tone-summary').innerText(), /gegenphasig/)
        await channel('Beide').click()
        await expectPeaks({ l: LEVEL, r: LEVEL, m: LEVEL }, 'beide')
        // Die Kennung legt ihre Kanäle selbst fest
        await signal('Kennung').click()
        assert.ok(await channel('Links').isDisabled(), 'Kanäle bei der Kennung wählbar')
        await signal('Sinus').click()
      }
    ],
    [
      'Metronom: 120 BPM im Takt, „Schneller“ im Betrieb ohne Neubeginn, Anzeige läuft mit',
      async () => {
        needAudio()
        await signal('Metronom').click()
        await setTempo(120)
        await sleep(600)
        const steady = onsets(await tap('record', 3000, 4, 2048), { high: 0.03, low: 0.005 })
        assert.ok(steady.length >= 5 && steady.length <= 7, `${steady.length} Klicks in 3 s`)
        const gaps = steady.slice(1).map((t, i) => t - steady[i])
        assert.ok(
          gaps.every((g) => Math.abs(g - 500) < 45),
          `Abstände bei 120 BPM: ${gaps.join(', ')}`
        )
        // zwanzigmal „Schneller“ während der Aufnahme: bis 140 BPM, nie ein Doppelklick
        const recording = tap('record', 3500, 4, 2048)
        const faster = w.getByRole('button', { name: 'Schneller' })
        for (let i = 0; i < 20; i++) {
          await faster.click()
          await sleep(100)
        }
        const clicks = onsets(await recording, { high: 0.03, low: 0.005 })
        const fast = clicks.slice(1).map((t, i) => t - clicks[i])
        assert.ok(Math.min(...fast) > 380, `Abstände: ${fast.join(', ')}`)
        assert.equal(await tempo().inputValue(), '140')
        // Schlag-Anzeige: der leuchtende Punkt wandert durch den Takt
        const seen = new Set()
        await waitFor(
          async () => {
            seen.add(await w.getByTestId('beat-dots').getAttribute('data-beat'))
            return seen.size >= 4
          },
          4000,
          50
        )
        assert.ok(
          ['0', '1', '2', '3'].every((b) => seen.has(b)),
          `Anzeige: ${[...seen]}`
        )
      }
    ],
    [
      '„Tippen“: viermal im Abstand von 500 ms – Tempo etwa 120',
      async () => {
        needAudio()
        await setTempo(200)
        const box = await w.getByRole('button', { name: 'Tippen' }).boundingBox()
        await w.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        for (let i = 0; i < 4; i++) {
          await w.mouse.down()
          await w.mouse.up()
          if (i < 3) await sleep(500)
        }
        const bpm = Number(await tempo().inputValue())
        assert.ok(bpm >= 114 && bpm <= 122, `Tempo ${bpm}`)
        await setTempo(120)
      }
    ],
    [
      'Leertaste startet und stoppt – in einem Zahlenfeld nicht',
      async () => {
        await w.locator('body').click({ position: { x: 5, y: 5 } })
        await w.keyboard.press('Space')
        await startButton().waitFor({ timeout: 3000 })
        await w.keyboard.press('Space')
        await stopButton().waitFor({ timeout: 3000 })
        await tempo().click()
        await w.keyboard.press('Space')
        await sleep(300)
        assert.equal(await stopButton().count(), 1, 'Leertaste im Feld schaltete den Ton')
        await tempo().press('Enter')
      }
    ],
    [
      'Fenster minimiert: das Metronom läuft gleichmäßig weiter',
      async () => {
        needAudio()
        await setTempo(120)
        await sleep(600)
        await toolWin('minimize')
        try {
          const clicks = onsets(await tap('record', 5000, 4, 2048), { high: 0.03, low: 0.005 })
          const gaps = clicks.slice(1).map((t, i) => t - clicks[i])
          assert.ok(clicks.length >= 9, `${clicks.length} Klicks in 5 s`)
          assert.ok(
            gaps.every((g) => Math.abs(g - 500) < 60),
            `Abstände: ${gaps.join(', ')}`
          )
        } finally {
          await toolWin('restore')
        }
      }
    ],
    [
      '„Wirklich beenden?“ nennt den laufenden Testton; Abbrechen lässt ihn laufen',
      async () => {
        await stopButton().waitFor()
        await app.evaluate(({ dialog }) => {
          globalThis.__rueckfragen = []
          dialog.showMessageBox = async (...args) => {
            const o = args.length > 1 ? args[1] : args[0]
            globalThis.__rueckfragen.push(o.detail)
            return { response: 1, checkboxChecked: false } // Abbrechen
          }
        })
        await app.evaluate(({ app: a }) => setTimeout(() => a.quit(), 0))
        const fragen = await waitFor(async () => {
          const f = await app.evaluate(() => globalThis.__rueckfragen)
          return f.length ? f : null
        }, 5000)
        assert.ok(fragen, 'keine Rückfrage beim Beenden')
        assert.match(fragen[0], /Testton läuft/)
        await sleep(500)
        await stopButton().waitFor()
      }
    ],
    [
      'Stand gemerkt: Fenster zu und wieder auf – Signal und Pegel wie verlassen, Ton aus',
      async () => {
        await signal('Rosa').click()
        await w.getByRole('button', { name: '−12 dBFS' }).click()
        await stopButton().click()
        await toolWin('close')
        assert.ok(await waitFor(async () => (await toolWin('isVisible')) === null, 5000))
        w = await openTool()
        await startButton().waitFor()
        assert.equal(await signal('Rosa').getAttribute('aria-pressed'), 'true')
        await w.getByText('−12 dBFS', { exact: true }).first().waitFor()
        assert.match(await w.getByTestId('tone-summary').innerText(), /Rosa Rauschen/)
      }
    ],
    [
      'Ausgabegerät fehlt beim Start: Hinweis, der Ton läuft; fällt es im Betrieb aus: Ton aus',
      async () => {
        needAudio()
        // So meldet Chromium einen Rechner ohne Audioausgabe (wie die CI-Rechner): Fehler gleich
        // nach dem Anlegen, danach angehalten (HandleRenderError in audio_context.cc)
        await w.evaluate(() => {
          const Echt = window.AudioContext
          window.__echtesAudioContext = Echt
          window.AudioContext = class extends Echt {
            constructor(...args) {
              super(...args)
              setTimeout(() => {
                this.dispatchEvent(new Event('error'))
                void this.suspend()
              }, 0)
            }
          }
        })
        try {
          await signal('Sinus').click()
          await w.getByRole('button', { name: '−18 dBFS' }).click()
          await startButton().click()
          await w.getByText(/^Kein Ausgabegerät bereit/).waitFor({ timeout: 5000 })
          await stopButton().waitFor()
          await expectPeaks({ l: LEVEL, r: LEVEL }, 'nach dem Fehler beim Start')
          // später derselbe Fehler: Gerät weg – der Ton ist aus, der Hinweis sagt es
          await sleep(1200)
          await w.evaluate(() => window.__tone.at(-1).ctx.dispatchEvent(new Event('error')))
          await startButton().waitFor({ timeout: 3000 })
          await w.getByText(/^Der Ton wurde unterbrochen/).waitFor()
        } finally {
          await w.evaluate(() => {
            window.AudioContext = window.__echtesAudioContext
          })
          if (await stopButton().count()) await stopButton().click()
        }
      }
    ]
  ])
} finally {
  await ctx.close()
}
