// Stream fürs Heimnetz vom Stage-Timer: echter Server, echtes ffmpeg, ein Empfänger wie die
// Heimkino-Box (ffprobe liest den Strom über HTTP). Ohne gebündeltes ffmpeg übersprungen.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import net from 'node:net'
import { promisify } from 'node:util'
import { findFfmpeg, launchApp, portFree, runSteps, Skip, waitFor } from './harness.mjs'

const pexec = promisify(execFile)
const ffmpeg = findFfmpeg()
const ffprobe = ffmpeg?.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1') ?? null

const ctx = await launchApp()
const { app, page } = ctx

const status = () => page.evaluate(() => window.api.timer.streamStatus())
const offscreenWindows = () =>
  app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.isOffscreen())
        .length
  )
const PORT = 18093
const cfg = { width: 640, height: 360, fps: 15, port: PORT, bitrateKbps: 1000 }
const url = `http://127.0.0.1:${PORT}/live.ts`

/** Liest ein paar Sekunden vom Strom und meldet, was darin steckt (wie ein Empfänger). */
async function probe() {
  const { stdout } = await pexec(
    ffprobe,
    [
      '-v',
      'error',
      '-read_intervals',
      '%+3',
      '-show_entries',
      'stream=codec_name,width,height,profile',
      '-count_frames',
      '-of',
      'json',
      url
    ],
    { timeout: 30_000 }
  )
  return JSON.parse(stdout).streams[0]
}

const needFfmpeg = () => {
  if (!ffmpeg) throw new Skip('kein gebündeltes ffmpeg (resources/ffmpeg)')
}

try {
  await runSteps('Stream fürs Heimnetz (Stage-Timer)', [
    [
      'aus beim Start',
      async () => {
        const st = await status()
        assert.equal(st.running, false)
        assert.deepEqual(st.urls, [])
      }
    ],
    [
      'Start: Server lauscht, ein Offscreen-Fenster, der Startbildschirm weiß davon',
      async () => {
        assert.equal(await portFree(PORT), true, `Port ${PORT} ist belegt`)
        const st = await page.evaluate((c) => window.api.timer.streamStart(c), cfg)
        assert.equal(st.running, true, st.error ?? '')
        assert.equal(st.clients, 0)
        assert.ok(
          st.urls.every((u) => u.endsWith(`:${PORT}/live.ts`)),
          st.urls.join(' ')
        )
        assert.equal(await offscreenWindows(), 1)
        assert.equal(await portFree(PORT), false)
        assert.equal((await page.evaluate(() => window.api.timer.getState())).streamActive, true)
      }
    ],
    [
      'ein Empfänger bekommt H.264 in der eingestellten Größe',
      async () => {
        needFfmpeg()
        const s = await probe()
        assert.equal(s.codec_name, 'h264')
        assert.equal(s.width, 640)
        assert.equal(s.height, 360)
        assert.equal(s.profile, 'High')
      }
    ],
    [
      'zwei Empfänger gleichzeitig; Status zählt sie und misst die Datenrate',
      async () => {
        needFfmpeg()
        const beide = Promise.all([probe(), probe()])
        const st = await waitFor(async () => {
          const s = await status()
          return s.clients === 2 && s.kbps > 0 && s.encoder ? s : null
        }, 15_000)
        assert.ok(st, 'Status meldet nicht 2 Empfänger mit Datenrate')
        const [a, b] = await beide
        assert.equal(a.codec_name, 'h264')
        assert.equal(b.codec_name, 'h264')
      }
    ],
    [
      'Empfänger weg -> Zähler 0 (ffmpeg läuft noch kurz nach)',
      async () => {
        needFfmpeg()
        assert.ok(await waitFor(async () => (await status()).clients === 0, 10_000))
      }
    ],
    [
      'Werte aus dem Renderer begrenzt',
      async () => {
        const st = await page.evaluate(
          (p) =>
            window.api.timer.streamStart({
              width: 641,
              height: 99999,
              fps: 500,
              port: p,
              bitrateKbps: 1
            }),
          PORT
        )
        assert.deepEqual(
          [st.config.width, st.config.height, st.config.fps, st.config.bitrateKbps],
          [640, 2160, 60, 500]
        )
        assert.equal(st.running, true)
        await waitFor(async () => (await offscreenWindows()) === 1)
        assert.equal(await offscreenWindows(), 1)
      }
    ],
    [
      'Stopp: Fenster weg, Port frei, Startbildschirm zurück',
      async () => {
        const st = await page.evaluate(() => window.api.timer.streamStop())
        assert.equal(st.running, false)
        assert.ok(await waitFor(async () => (await offscreenWindows()) === 0, 5000))
        assert.ok(await waitFor(() => portFree(PORT), 5000), 'Port bleibt belegt')
        assert.equal((await page.evaluate(() => window.api.timer.getState())).streamActive, false)
      }
    ],
    [
      'belegter Port: verständliche Meldung statt Absturz',
      async () => {
        const blocker = net.createServer()
        await new Promise((r) => blocker.listen(PORT, r))
        try {
          const st = await page.evaluate((c) => window.api.timer.streamStart(c), cfg)
          assert.equal(st.running, false)
          assert.match(st.error ?? '', /belegt/)
          assert.equal(await offscreenWindows(), 0)
        } finally {
          blocker.close()
        }
      }
    ]
  ])
} finally {
  await ctx.close()
}
