// RTA in der echten App mit eingespeistem Mikrofon: Chromium liest statt eines Geräts eine WAV-
// Datei (--use-file-for-fake-audio-capture). Die Freigabe läuft wie beim Bediener über die
// Berechtigungs-Regel der App (windowPolicy: Mikrofon nur auf der RTA-Route) – NICHT mit
// --use-fake-ui-for-media-stream, das die Regel umgeht (so blieb einmal unbemerkt, dass sie das
// Mikrofon sperrte). Testsignale per lavfi,
// mit dem gebündelten ffmpeg nachgemessen (ffmpeg-labor): Sinus 1 kHz mit Spitze −20,0 dBFS
// (AES17: −20 dBFS), rosa Rauschen in Terzen 63 Hz … 4 kHz flach auf ±0,3 dB (darüber fällt das
// lavfi-Rauschen ab: −1 dB bei 8 kHz). Chromium spielt die Datei in Schleife; an der Naht spritzt
// es kurz breitbandig (eine Nachbarterz las einmal −56 statt −134 dB) – daher lange Signale.
// Abgelesen wird über die Oberfläche wie vom Bediener:
// Pegelanzeige, Fadenkreuz-Ablesung, Feedback-Liste, Kalibrieren, Referenz und Differenz.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findFfmpeg, launchApp, runSteps, waitFor } from './harness.mjs'

const ffmpeg = findFfmpeg()
const dir = mkdtempSync(join(tmpdir(), 'rta-e2e-'))

function wav(name, source) {
  const out = join(dir, name)
  execFileSync(ffmpeg, [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    source,
    '-c:a',
    'pcm_s16le',
    '-ac',
    '1',
    out
  ])
  return out
}

/** Zahl aus deutscher Anzeige („-20,3“, „94,0“) */
const num = (s) => Number(String(s).replace('−', '-').replace(',', '.'))

/** App mit dieser Datei als Mikrofon starten und den RTA im eigenen Fenster öffnen */
async function openRta(file) {
  const ctx = await launchApp({
    args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`]
  })
  const ev = ctx.app.waitForEvent('window')
  await ctx.page.evaluate(() => window.api.openToolWindow('rta'))
  const w = await ev
  await w.waitForLoadState()
  await w.getByRole('button', { name: 'Messen' }).waitFor()
  return { ctx, w }
}

/**
 * Kommt das eingespeiste Signal überhaupt an? Eigene kleine Kette in der Seite (ohne den RTA):
 * Mikrofon -> Analysator, größter Abtastwert über 1 s. Trennt „Testumgebung liefert Stille“ von
 * „RTA misst falsch“.
 */
async function probeSignal(w) {
  return w.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    })
    const ac = new AudioContext()
    await ac.resume().catch(() => {})
    const a = ac.createAnalyser()
    a.fftSize = 2048
    ac.createMediaStreamSource(stream).connect(a)
    const buf = new Float32Array(2048)
    let peak = 0
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50))
      a.getFloatTimeDomainData(buf)
      for (const v of buf) peak = Math.max(peak, Math.abs(v))
    }
    const info = {
      peak,
      state: ac.state,
      rate: ac.sampleRate,
      label: stream.getAudioTracks()[0]?.label ?? '',
      visibility: document.visibilityState
    }
    stream.getTracks().forEach((t) => t.stop())
    await ac.close()
    return info
  })
}

/** Wert einer Pegelkachel (Beschriftung z. B. „LZF“; gefunden über ihr ⓘ) */
async function readout(w, label) {
  const tile = w
    .getByRole('button', { name: `Erklärung zu „${label}“` })
    .locator('xpath=ancestor::div[1]')
  const text = await tile.innerText()
  const m = /(-?\d+(?:,\d+)?)\s*(dBFS|dB)/.exec(text.replace('−', '-'))
  return m ? { value: num(m[1]), unit: m[2] } : null
}

/**
 * Fadenkreuz auf die Frequenz f stellen und die Ablesung „Band …: x dB“ lesen. Die Achse ist
 * logarithmisch 20 Hz … 20 kHz zwischen den Rändern der Zeichenfläche (draw.ts: PAD links 36,
 * rechts 8).
 */
async function bandAt(w, f) {
  // kleine Bildschirme (CI 1024 × 768): das Fenster ist gekürzt, ein Klick weiter unten
  // scrollt das Spektrum aus dem Bild – erst zurückholen
  await w.getByTestId('rta-graph').scrollIntoViewIfNeeded()
  const box = await w.getByTestId('rta-graph').boundingBox()
  const t = Math.log(f / 20) / Math.log(1000)
  const x = box.x + 36 + t * (box.width - 36 - 8)
  await w.mouse.move(x, box.y + box.height / 2)
  const line = w.getByText(/^Band /)
  await line.waitFor({ timeout: 5_000 })
  // ganze Werte stehen ohne „,0“ da (−20 dBFS)
  const m = /Band ([\d,k]+): (-?\d+(?:,\d+)?)/.exec((await line.innerText()).replace('−', '-'))
  return m ? { band: m[1], db: num(m[2]) } : null
}

/**
 * Helligkeit des Spektrogramms bei Frequenz f (0–255): Wasserfall in der neuesten Zeile, an der
 * Stelle, an der f auch im Spektrum steht; Zeitachse in der neuesten Spalte an der Höhe von f.
 */
async function spectroBrightness(w, mode, f) {
  return w.getByTestId('rta-spectro').evaluate(
    (c, [mode, f]) => {
      const dpr = c.width / c.clientWidth
      const wCss = c.clientWidth
      const hCss = c.clientHeight
      let x
      let y
      if (mode === 'waterfall') {
        x = 36 + (Math.log(f / 20) / Math.log(1000)) * (wCss - 36 - 8)
        y = 3
      } else {
        x = wCss - 8 - 4
        y = (Math.log(20000 / f) / Math.log(1000)) * hCss
      }
      // hellster Wert in einem kleinen Fenster: die Linie eines Sinus ist nur ~1 px breit bzw. hoch
      const r = 3 * dpr
      const x0 = Math.max(0, Math.round(x * dpr - r))
      const y0 = Math.max(0, Math.round(y * dpr - r))
      const size = Math.round(2 * r) + 1
      const d = c.getContext('2d').getImageData(x0, y0, size, size).data
      let max = 0
      for (let i = 0; i < d.length; i += 4) {
        max = Math.max(max, 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
      }
      return Math.round(max)
    },
    [mode, f]
  )
}

const steps = (file, list) => async () => {
  if (!ffmpeg) {
    console.log(`RTA – ${list.title}
  – übersprungen: kein ffmpeg für die Testsignale`)
    return
  }
  const { ctx, w } = await openRta(file())
  try {
    const probe = await probeSignal(w)
    const db = probe.peak > 0 ? (20 * Math.log10(probe.peak)).toFixed(1) : '−∞'
    const line = `Eingespeistes Signal: Spitze ${db} dBFS (${probe.label}, ${probe.rate} Hz, ${probe.state}, ${probe.visibility})`
    if (probe.peak < 0.001) {
      // Chromiums Fake-Mikrofon liest die Datei im Audio-Dienst; liefert die Umgebung trotzdem
      // Stille, misst der RTA nichts – auf macOS in der CI eine Grenze der Testumgebung, sonst
      // ein Fehler
      if (process.platform === 'darwin') {
        console.log(
          `RTA – ${list.title}\n  – übersprungen: ${line} – Fake-Mikrofon liefert hier Stille`
        )
        return
      }
      throw new Error(`${line} – Stille statt Testsignal`)
    }
    console.log(`  ${line}`)
    await runSteps(`RTA – ${list.title}`, list.steps(w, ctx))
  } finally {
    await ctx.close()
  }
}

let failed = false
try {
  await steps(() => wav('sinus.wav', 'aevalsrc=0.1*sin(2*PI*1000*t):s=48000:d=60'), {
    title: 'Sinus 1 kHz, −20 dBFS',
    steps: (w, ctx) => [
      [
        'Messen startet das Mikrofon (ohne Sprachfilter)',
        async () => {
          await w.getByRole('button', { name: 'Messen' }).click()
          await w.getByRole('button', { name: 'Stopp' }).waitFor()
          const status = w.getByTestId('rta-status')
          assert.ok(await waitFor(async () => /kHz/.test(await status.innerText())), 'kein Eingang')
          assert.doesNotMatch(await status.innerText(), /filtert/)
        }
      ],
      [
        'Pegel −20 dBFS (±0,5), Aussteuerung −20 dBFS',
        async () => {
          assert.ok(
            await waitFor(async () => {
              const r = await readout(w, 'LZF')
              return r && Math.abs(r.value + 20) <= 0.5
            }, 10_000),
            `LZF: ${JSON.stringify(await readout(w, 'LZF'))} · ${await w
              .getByTestId('rta-status')
              .innerText()} · ${await w.evaluate(() => document.visibilityState)}`
          )
          assert.equal((await readout(w, 'LZF')).unit, 'dBFS')
          const peak = await readout(w, 'Aussteuerung')
          assert.ok(Math.abs(peak.value + 20) <= 0.5, `Aussteuerung ${peak.value}`)
        }
      ],
      [
        'Ablesung bei 1 kHz: Terz 1k mit −20 dB, die Nachbarterzen weit darunter',
        async () => {
          const at = await bandAt(w, 1000)
          assert.equal(at.band, '1k')
          assert.ok(Math.abs(at.db + 20) <= 0.5, `1k: ${at.db}`)
          const below = await bandAt(w, 630)
          assert.ok(below.db < -60, `630 Hz: ${below.db}`)
        }
      ],
      [
        'Feedback-Finder meldet den stehenden Ton bei 1.000 Hz (H5)',
        async () => {
          const box = w.getByTestId('rta-feedback')
          assert.ok(
            await waitFor(async () => /1\.000 Hz/.test(await box.innerText()), 10_000),
            await box.innerText()
          )
          assert.match(await box.innerText(), /H5 \+2\d ct/)
          assert.match(await box.innerText(), /Vorschlag: Glocke 1.000 Hz, -12 dB/)
        }
      ],
      [
        'Kalibrieren mit 94-dB-Kalibrator: Pegel zeigt 94 dB, zurück auf dBFS',
        async () => {
          await w.getByRole('button', { name: 'Kalibrieren', exact: true }).click()
          assert.ok(
            await waitFor(async () => {
              const r = await readout(w, 'LZF')
              return r?.unit === 'dB' && Math.abs(r.value - 94) <= 0.5
            }, 5_000),
            JSON.stringify(await readout(w, 'LZF'))
          )
          assert.match(await w.getByTestId('rta-status').innerText(), /kalibriert \(\+114/)
          await w.getByRole('button', { name: 'Zurück auf dBFS' }).click()
          assert.ok(await waitFor(async () => (await readout(w, 'LZF'))?.unit === 'dBFS'))
        }
      ],
      [
        'Referenz merken, Differenz zeigt bei gleichem Signal 0 dB',
        async () => {
          await w.getByRole('button', { name: 'Aktuelle Kurve merken' }).click()
          await w.getByRole('button', { name: 'Differenz zu Referenz 1' }).click()
          assert.ok(
            await waitFor(async () => {
              const at = await bandAt(w, 1000)
              return at && Math.abs(at.db) <= 0.5
            }, 5_000),
            JSON.stringify(await bandAt(w, 1000))
          )
          await w.getByRole('button', { name: 'Differenz zu Referenz 1' }).click()
        }
      ],
      [
        'Wasserfall: 1-kHz-Linie genau unter der Spitze, Ablesung mit Frequenz, Pegel und Zeit',
        async () => {
          await w.getByLabel('Spektrogramm', { exact: true }).selectOption('waterfall')
          const spectro = w.getByTestId('rta-spectro')
          await spectro.waitFor()
          // erst eine Weile Zeilen sammeln (eine je 100 ms)
          await new Promise((r) => setTimeout(r, 1500))
          assert.ok(
            await waitFor(async () => {
              const on = await spectroBrightness(w, 'waterfall', 1000)
              const off = await spectroBrightness(w, 'waterfall', 630)
              return on > off + 60
            }, 5_000),
            `Wasserfall 1 kHz ${await spectroBrightness(w, 'waterfall', 1000)}, 630 Hz ${await spectroBrightness(w, 'waterfall', 630)}`
          )
          await spectro.scrollIntoViewIfNeeded()
          const box = await spectro.boundingBox()
          const t = Math.log(1000 / 20) / Math.log(1000)
          await w.mouse.move(box.x + 36 + t * (box.width - 44), box.y + 5)
          const tip = w.getByText(/ vor \d|· jetzt/)
          await tip.waitFor({ timeout: 5_000 })
          const text = (await tip.locator('xpath=ancestor::div[1]').innerText()).replace('−', '-')
          assert.match(text, /(99\d|1\.0[01]\d) Hz/)
          const db = /(-\d+(?:,\d+)?) dBFS/.exec(text)
          assert.ok(db && Number(db[1].replace(',', '.')) > -30, text)
        }
      ],
      [
        'Zeitachse waagrecht: 1 kHz in der neuesten Spalte hell, 630 Hz dunkel; aus schaltet ab',
        async () => {
          await w.getByLabel('Spektrogramm', { exact: true }).selectOption('timeline')
          await new Promise((r) => setTimeout(r, 1500))
          assert.ok(
            await waitFor(async () => {
              const on = await spectroBrightness(w, 'timeline', 1000)
              const off = await spectroBrightness(w, 'timeline', 630)
              return on > off + 60
            }, 5_000),
            `Zeitachse 1 kHz ${await spectroBrightness(w, 'timeline', 1000)}, 630 Hz ${await spectroBrightness(w, 'timeline', 630)}`
          )
          await w.getByLabel('Spektrogramm', { exact: true }).selectOption('off')
          assert.equal(await w.getByTestId('rta-spectro').count(), 0)
        }
      ],
      [
        'Kanal wechseln mitten im Start: genau ein Mikrofon offen, nach Stopp keins',
        async () => {
          await w.getByRole('button', { name: 'Stopp' }).click()
          await w.getByRole('button', { name: 'Messen' }).waitFor()
          // jede Freigabe mitzählen, um offene Spuren von außen zu sehen
          await w.evaluate(() => {
            const md = navigator.mediaDevices
            const orig = md.getUserMedia.bind(md)
            window.__rtaStreams = []
            md.getUserMedia = async (c) => {
              const s = await orig(c)
              window.__rtaStreams.push(s)
              return s
            }
          })
          const live = () =>
            w.evaluate(
              () =>
                window.__rtaStreams
                  .flatMap((s) => s.getTracks())
                  .filter((t) => t.readyState === 'live').length
            )
          await w.getByRole('button', { name: 'Messen' }).click()
          await w.getByLabel('Kanal', { exact: true }).selectOption('left')
          await w.getByRole('button', { name: 'Stopp' }).waitFor()
          assert.ok(
            await waitFor(
              async () => (await w.evaluate(() => window.__rtaStreams.length)) >= 2,
              5_000
            ),
            'kein zweiter Start'
          )
          await new Promise((r) => setTimeout(r, 1000))
          assert.equal(await live(), 1, 'offene Mikrofone nach überholtem Start')
          await w.getByRole('button', { name: 'Stopp' }).click()
          assert.ok(await waitFor(async () => (await live()) === 0, 5_000), 'Mikrofon bleibt offen')
          await w.getByLabel('Kanal', { exact: true }).selectOption('mix')
          await w.getByRole('button', { name: 'Messen' }).click()
          await w.getByRole('button', { name: 'Stopp' }).waitFor()
        }
      ],
      [
        'Fenster minimiert: ungedrosselt, die Messung läuft weiter',
        async () => {
          const rta = (method) =>
            ctx.app.evaluate(({ BrowserWindow }, m) => {
              const x = BrowserWindow.getAllWindows().find(
                (y) => !y.isDestroyed() && y.webContents.getURL().includes('tool/rta')
              )
              return m === 'throttling' ? x.webContents.getBackgroundThrottling() : x[m]()
            }, method)
          assert.equal(await rta('throttling'), false)
          await rta('minimize')
          // Zurücksetzen leert die Anzeige; nur eine weiterlaufende Messung füllt sie wieder
          await w.evaluate(() =>
            [...document.querySelectorAll('button')]
              .find((b) => b.textContent?.includes('Zurücksetzen'))
              ?.click()
          )
          assert.ok(
            await waitFor(async () => {
              const r = await readout(w, 'LZF')
              return r && Math.abs(r.value + 20) <= 0.5
            }, 10_000),
            'keine Messwerte im minimierten Fenster'
          )
          await rta('restore')
        }
      ],
      [
        'Stopp gibt das Mikrofon frei',
        async () => {
          await w.getByRole('button', { name: 'Stopp' }).click()
          await w.getByRole('button', { name: 'Messen' }).waitFor()
          assert.match(await w.getByTestId('rta-status').innerText(), /Nicht gestartet/)
        }
      ]
    ]
  })()

  await steps(
    () =>
      wav('rosa.wav', 'anoisesrc=color=pink:amplitude=0.3:sample_rate=48000:duration=30:seed=7'),
    {
      title: 'rosa Rauschen',
      steps: (w) => [
        [
          'Terzen 63 Hz … 4 kHz flach (±1,5 dB um den Mittelwert, Mittelung unendlich)',
          async () => {
            await w.getByLabel('Mittelung', { exact: true }).selectOption('inf')
            await w.getByRole('button', { name: 'Messen' }).click()
            await w.getByRole('button', { name: 'Stopp' }).waitFor()
            await new Promise((r) => setTimeout(r, 5000))
            const freqs = [63, 125, 250, 500, 1000, 2000, 4000]
            const levels = []
            for (const f of freqs) levels.push((await bandAt(w, f)).db)
            const mean = levels.reduce((a, b) => a + b, 0) / levels.length
            for (let i = 0; i < freqs.length; i++) {
              assert.ok(
                Math.abs(levels[i] - mean) <= 1.5,
                `${freqs[i]} Hz: ${levels[i]} (Mittel ${mean.toFixed(1)})`
              )
            }
          }
        ],
        [
          'Feedback-Finder meldet im Rauschen nichts',
          async () => {
            assert.match(await w.getByTestId('rta-feedback').innerText(), /Keine stehende Spitze/)
          }
        ]
      ]
    }
  )()
} catch (e) {
  failed = true
  console.error(e)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
if (failed) process.exitCode = 1
