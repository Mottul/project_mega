// Fenster-Wächter und Shell-Kanäle in der echten App (services/windowGuards.ts, windowPolicy.ts):
// keine fremde Navigation und keine neuen Fenster – im Hauptfenster wie im Ausgabefenster –,
// Browser-Berechtigungen nur nach Allowlist, „Ordner öffnen“ nur für lokale Ordner.
// Öffnet kurz die Testbild-Ausgabe auf dem ersten Bildschirm.

import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launchApp, openRoute, runSteps, Skip, waitFor } from './harness.mjs'

const ctx = await launchApp()
const { app, page } = ctx

/** Standardbrowser und Shell ersetzen: merken, was die App ihnen geben würde. */
async function stubShell() {
  await app.evaluate(({ shell }) => {
    const calls = (globalThis.__shell = [])
    shell.openExternal = async (url) => void calls.push(['extern', url])
    shell.openPath = async (p) => {
      calls.push(['ordner', p])
      return ''
    }
    shell.showItemInFolder = (p) => void calls.push(['zeigen', p])
  })
}
const shellCalls = () => app.evaluate(() => globalThis.__shell)
const resetShell = () => app.evaluate(() => void (globalThis.__shell.length = 0))
const windowCount = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length).catch(() => -1)

/** In einem Fenster wegnavigieren lassen; danach muss es noch die App-Seite zeigen. */
async function tryNavigate(win, url) {
  await win.evaluate((u) => {
    window.location.href = u
  }, url)
  await new Promise((r) => setTimeout(r, 800))
  return win.url()
}

try {
  await stubShell()
  const foreign = join(ctx.userData, 'fremd')
  mkdirSync(foreign)
  const foreignPage = join(foreign, 'seite.html')
  writeFileSync(foreignPage, '<p>fremd</p>')

  await runSteps('Fenster-Wächter', [
    [
      'Hauptfenster: Navigation zu einer Webseite bleibt in der App, der Link geht an den Browser',
      async () => {
        await openRoute(page, '/')
        await page.getByPlaceholder('Werkzeug suchen…').waitFor({ timeout: 15_000 })
        await resetShell()
        const url = await tryNavigate(page, 'https://example.com/')
        assert.match(url, /index\.html#\/$/)
        assert.deepEqual(await shellCalls(), [['extern', 'https://example.com/']])
      }
    ],
    [
      'Hauptfenster: Navigation zu einer anderen Datei wird verhindert (und nicht weitergegeben)',
      async () => {
        await resetShell()
        const url = await tryNavigate(page, pathToFileURL(foreignPage).href)
        assert.match(url, /index\.html#\/$/)
        assert.deepEqual(await shellCalls(), [])
      }
    ],
    [
      'window.open: kein neues Fenster; nur http(s) geht an den Browser',
      async () => {
        await resetShell()
        const before = await windowCount()
        await page.evaluate(() => {
          window.open('https://192.168.1.20/', '_blank')
          window.open('file:///C:/Windows/System32/calc.exe', '_blank')
          window.open('javascript:alert(1)', '_blank')
        })
        await new Promise((r) => setTimeout(r, 800))
        assert.equal(await windowCount(), before)
        assert.deepEqual(await shellCalls(), [['extern', 'https://192.168.1.20/']])
      }
    ],
    [
      'Ausgabefenster (Testbild) ist genauso bewacht',
      async () => {
        const displays = await page.evaluate(() => window.api.screen.list())
        const cfg = await page.evaluate(() => window.api.patterns.current())
        const ev = app.waitForEvent('window')
        await page.evaluate(([c, id]) => window.api.patterns.open(c, id), [cfg, displays[0].id])
        const out = await ev
        await out.waitForLoadState()
        await resetShell()
        const before = await windowCount()
        const url = await tryNavigate(out, 'https://example.com/ausgabe')
        assert.match(url, /index\.html#\/output$/)
        await out.evaluate(() => void window.open('https://example.com/neu', '_blank'))
        await new Promise((r) => setTimeout(r, 500))
        assert.equal(await windowCount(), before)
        assert.deepEqual(await shellCalls(), [
          ['extern', 'https://example.com/ausgabe'],
          ['extern', 'https://example.com/neu']
        ])
        await page.evaluate(() => window.api.patterns.close())
        assert.ok(await waitFor(async () => (await windowCount()) === before - 1, 10_000))
      }
    ],
    [
      'Berechtigungen: Kamera, Mikrofon, Standort und Benachrichtigungen verweigert',
      async () => {
        const states = await page.evaluate(async () => {
          const q = (name) =>
            navigator.permissions.query({ name }).then(
              (s) => s.state,
              () => 'unbekannt'
            )
          return {
            camera: await q('camera'),
            microphone: await q('microphone'),
            geolocation: await q('geolocation'),
            notifications: await Notification.requestPermission()
          }
        })
        assert.deepEqual(states, {
          camera: 'denied',
          microphone: 'denied',
          geolocation: 'denied',
          notifications: 'denied'
        })
      }
    ],
    [
      'Audio-Ausgabegeräte haben ihre Namen (Jingle-Player), Mikrofone bleiben anonym und zu',
      async () => {
        const r = await page.evaluate(async () => {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const names = (kind) => devices.filter((d) => d.kind === kind).map((d) => d.label)
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true }).then(
            (s) => {
              s.getTracks().forEach((t) => t.stop())
              return 'Zugriff'
            },
            (e) => e.name
          )
          return { outputs: names('audiooutput'), inputs: names('audioinput'), mic }
        })
        assert.ok(
          r.inputs.every((l) => l === ''),
          'Mikrofon-Namen sichtbar'
        )
        assert.notEqual(r.mic, 'Zugriff')
        if (r.outputs.length === 0) throw new Skip('kein Audio-Ausgabegerät (CI)')
        assert.ok(
          r.outputs.every((l) => l.length > 0),
          'Ausgabegeräte ohne Namen: ' + JSON.stringify(r.outputs)
        )
      }
    ],
    [
      '„Ordner öffnen“ nur für lokale Ordner – nie Dateien (Programme), nie Netzwerkpfade',
      async () => {
        await resetShell()
        await page.evaluate(
          async ([dir, file]) => {
            await window.api.openPath(file)
            await window.api.openPath('\\\\server\\freigabe')
            await window.api.openPath('relativ/ordner')
            await window.api.openPath(dir)
          },
          [foreign, foreignPage]
        )
        assert.deepEqual(await shellCalls(), [['ordner', foreign]])
      }
    ],
    [
      '„Im Ordner zeigen“ nur mit absolutem Pfad (startet nichts, NAS erlaubt)',
      async () => {
        await resetShell()
        await page.evaluate(async (file) => {
          await window.api.showItemInFolder('relativ.mp4')
          await window.api.showItemInFolder('file:///C:/x.mp4')
          await window.api.showItemInFolder(file)
          await window.api.showItemInFolder('\\\\nas\\show\\clip.mp4')
        }, foreignPage)
        assert.deepEqual(await shellCalls(), [
          ['zeigen', foreignPage],
          ['zeigen', '\\\\nas\\show\\clip.mp4']
        ])
      }
    ],
    [
      'keine Konsolenfehler im Hauptfenster',
      async () => {
        assert.deepEqual(ctx.errors, [])
      }
    ]
  ])
} finally {
  await ctx.close()
}
