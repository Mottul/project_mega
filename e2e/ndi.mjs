// NDI-Ausgabe von Stage-Timer und Video-Player mit dem echten Binding (vendor/grandiose, siehe
// docs/NDI.md). Ohne Binding – so in der CI – werden die Schritte übersprungen.
// Geprüft wird, was beim gemeinsamen Offscreen-Sender schon schiefging: Absturz beim Stoppen
// während laufender Sends, verwaiste Fenster oder Sender bei Start/Stopp in schneller Folge.
import assert from 'node:assert/strict'
import { launchApp, runSteps, Skip, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx

const timerStatus = () => page.evaluate(() => window.api.timer.ndiStatus())
const playerStatus = () => page.evaluate(() => window.api.player.ndiStatus())
const offscreenWindows = () =>
  app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.webContents.isOffscreen())
        .length
  )
const small = { width: 640, height: 360, fps: 15 }

let available = false
const needNdi = () => {
  if (!available) throw new Skip('kein NDI-Binding (npm run ndi:setup)')
}

try {
  await runSteps('NDI-Ausgabe', [
    [
      'NDI-Modul geladen',
      async () => {
        const st = await timerStatus()
        available = st.available
        if (!available) throw new Skip(`kein NDI-Binding: ${String(st.error).slice(0, 80)}`)
        assert.equal(st.running, false)
      }
    ],
    [
      'Timer als NDI-Quelle: Bilder gehen raus, der Startbildschirm weiß davon',
      async () => {
        needNdi()
        const st = await page.evaluate((cfg) => window.api.timer.ndiStart(cfg), {
          name: 'Mottulbox E2E Timer',
          ...small
        })
        assert.equal(st.running, true, st.error ?? '')
        assert.equal(await offscreenWindows(), 1)
        await waitFor(async () => (await timerStatus()).framesSent >= 10)
        assert.equal((await page.evaluate(() => window.api.timer.getState())).ndiActive, true)
      }
    ],
    [
      'Werte aus dem Renderer begrenzt; Neustart ersetzt das Fenster',
      async () => {
        needNdi()
        const st = await page.evaluate(() =>
          window.api.timer.ndiStart({ name: '   ', width: 100, height: 99999, fps: 500 })
        )
        assert.deepEqual(
          { w: st.config.width, h: st.config.height, fps: st.config.fps },
          { w: 320, h: 2160, fps: 60 }
        )
        assert.match(st.config.name, /Timer$/)
        assert.equal(st.running, true)
        // 'closed' des alten Fensters kommt verspätet – es darf den neuen Sender nicht stoppen
        await waitFor(async () => (await offscreenWindows()) === 1)
        await waitFor(async () => (await timerStatus()).framesSent >= 5)
        assert.equal((await timerStatus()).running, true)
      }
    ],
    [
      'Start und Stopp in schneller Folge: kein Absturz, kein verwaistes Fenster',
      async () => {
        needNdi()
        await page.evaluate(async (cfg) => {
          const t = window.api.timer
          await Promise.all([
            t.ndiStart({ ...cfg, name: 'E2E a' }),
            t.ndiStop(),
            t.ndiStart({ ...cfg, name: 'E2E b' }),
            t.ndiStop(),
            t.ndiStart({ ...cfg, name: 'E2E c' })
          ])
        }, small)
        await waitFor(async () => (await timerStatus()).framesSent >= 5)
        const st = await timerStatus()
        assert.equal(st.running, true)
        assert.equal(st.config.name, 'E2E c')
        assert.equal(await offscreenWindows(), 1)
        // mitten in laufenden Sends stoppen und sofort neu starten (früher: Absturz)
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.api.timer.ndiStop())
          await page.evaluate((cfg) => window.api.timer.ndiStart(cfg), { ...small, name: 'E2E d' })
        }
        await page.evaluate(() => window.api.timer.ndiStop())
        await waitFor(async () => (await offscreenWindows()) === 0)
        assert.equal((await timerStatus()).running, false)
        assert.equal((await page.evaluate(() => window.api.timer.getState())).ndiActive, false)
      }
    ],
    [
      'Player als NDI-Quelle (mit Ton) neben dem Timer',
      async () => {
        needNdi()
        const cfg = { name: 'Mottulbox E2E Player', ...small, fit: 'contain', audio: true }
        const st = await page.evaluate((c) => window.api.player.ndiStart(c), cfg)
        assert.equal(st.running, true, st.error ?? '')
        assert.deepEqual(st.config, cfg)
        await page.evaluate((c) => window.api.timer.ndiStart(c), { ...small, name: 'E2E Timer' })
        assert.equal(await offscreenWindows(), 2)
        await waitFor(async () => (await playerStatus()).framesSent >= 10)
        await page.evaluate(() => window.api.player.ndiStop())
        assert.equal((await playerStatus()).running, false)
        assert.equal((await timerStatus()).running, true)
      }
    ],
    [
      'Offscreen-Fenster von außen geschlossen: Sender sauber gestoppt',
      async () => {
        needNdi()
        await app.evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.isOffscreen())
            ?.destroy()
        })
        await waitFor(async () => !(await timerStatus()).running)
        assert.equal(await offscreenWindows(), 0)
        assert.equal((await page.evaluate(() => window.api.timer.getState())).ndiActive, false)
        // die App lebt noch und antwortet
        assert.equal(typeof (await page.evaluate(() => window.api.getSettings())), 'object')
      }
    ]
  ])
} finally {
  await ctx.close()
}
