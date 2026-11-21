// Stream fürs Heimnetz von Stage-Timer und Video-Player: echter Server, echtes ffmpeg, ein
// Empfänger wie die Heimkino-Box (ffprobe bzw. tsMitschnitt.mjs liest den Strom über HTTP).
// Ohne gebündeltes ffmpeg übersprungen, die Schritte mit NDI ohne Binding.
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { findFfmpeg, launchApp, portFree, runSteps, Skip, sleep, waitFor } from './harness.mjs'
import { blitzUndPiep, mitschneiden, zeitachse } from './tsMitschnitt.mjs'

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
/** Wie oft ffmpeg für den Timer-Stream gestartet ist (Zeilen im Protokoll der App) */
const ffmpegStarts = () =>
  readFileSync(join(ctx.userData, 'avtoolbox-debug.log'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('[timer-stream] ffmpeg läuft')).length

/** Liest ein paar Sekunden vom Strom und meldet, was darin steckt (wie ein Empfänger). */
async function probeAlle(u = url) {
  const { stdout } = await pexec(
    ffprobe,
    [
      '-v',
      'error',
      '-read_intervals',
      '%+3',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,profile,sample_rate,channels',
      '-count_frames',
      '-of',
      'json',
      u
    ],
    { timeout: 30_000 }
  )
  return JSON.parse(stdout).streams
}
const probe = async () => (await probeAlle())[0]

const needFfmpeg = () => {
  if (!ffmpeg) throw new Skip('kein gebündeltes ffmpeg (resources/ffmpeg)')
}

// Stufe 2: Player mit Ton. Testclip: alle 2 s ein weißes Bild und ein Piep, 100 ms lang.
const PLAYER_PORT = 18094
const playerUrl = `http://127.0.0.1:${PLAYER_PORT}/live.ts`
const playerCfg = { width: 1280, height: 720, fps: 30, port: PLAYER_PORT, bitrateKbps: 3000 }
const WAND = { width: 1280, height: 720 }
const BLITZ = "drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='lt(mod(t-1,2),0.1)'"
const PIEP = '0.5*sin(2*PI*1000*t)*lt(mod(t-1,2),0.1)'
/**
 * Erlaubter Versatz Ton − Bild. Gemessen ±12 ms (ein Bild Raster bei 30 fps); 60 ms ist die
 * EBU-Grenze für Ton nach dem Bild und lässt langsameren Rechnern Luft (dort dauert das Zeichnen
 * im Offscreen-Fenster länger). Jeder Fehler aus dem Labor läge darüber: 85 ms Paketversatz der
 * Roh-PCM-Stempel, bis 162 ms nach Hängern.
 */
const LIPPENSYNCHRON_MS = 60
const tmp = mkdtempSync(join(tmpdir(), 'mottulbox-stream-'))
let geladen = false
const needClip = () => {
  needFfmpeg()
  if (!geladen) throw new Skip('Testclip nicht im Player')
}
const ndiVerfuegbar = async () =>
  (await page.evaluate(() => window.api.timer.ndiStatus())).available

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
      'Zeit im Strom läuft mit der Uhr, auch wenn der main-Prozess hängt',
      async () => {
        needFfmpeg()
        // Hänger nachstellen: Der main-Prozess rechnet fünfmal 0,8 s am Stück (wie ein großer
        // GC-Lauf oder ein Bild, das lange umgerechnet wird). Stufe 1 ließ danach Bilder aus –
        // die Zeit im Strom blieb jedes Mal dauerhaft zurück, bis der Puffer des Empfängers leer
        // war und er sekundenlang stockte (gemeldet am 21.11.2026 aus VLC am PC und am Handy).
        const st = await page.evaluate((c) => window.api.timer.streamStart(c), {
          ...cfg,
          width: 1280,
          height: 720,
          fps: 30,
          bitrateKbps: 2000
        })
        assert.equal(st.running, true, st.error ?? '')
        const haenger = async () => {
          await sleep(4000)
          for (let i = 0; i < 5; i++) {
            await app.evaluate(() => {
              const ende = Date.now() + 800
              while (Date.now() < ende) {
                // blockiert absichtlich
              }
            })
            await sleep(2500)
          }
        }
        const m = await mitschneiden(url, 24_000, { waehrend: haenger })
        const z = zeitachse(m.video)
        assert.ok(z, 'kein Bild empfangen')
        const skala = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().scaleFactor)
        console.log(
          `    ${m.video.length} Bilder über ${z.dauer.toFixed(1)} s Strom-Zeit ` +
            `(${z.bilderJeSekunde.toFixed(1)}/s), Rückstand am Ende ${z.rueckstand.toFixed(2)} s, ` +
            `größter Versatz ${z.puffer.toFixed(2)} s, Bildschirm-Skalierung ${skala}, ` +
            `Abstand ${z.schrittMs.toFixed(1)} ms` +
            (z.spruenge.length
              ? `, Sprünge: ${z.spruenge.map((s) => `${s.umS.toFixed(2)} s bei ${s.beiS.toFixed(1)} s`).join(', ')}`
              : '')
        )
        const ok = z.rueckstand < 0.3 && Math.abs(z.bilderJeSekunde - 30) < 1.5
        if (!ok) {
          // Was der Sender dabei protokolliert hat (Encoder, Neustarts, Abbrüche)
          const log = readFileSync(join(ctx.userData, 'avtoolbox-debug.log'), 'utf8')
          const zeilen = log.split(/\r?\n/).filter((l) => l.includes('[timer-stream]'))
          console.log(
            zeilen
              .slice(-25)
              .map((l) => `      ${l}`)
              .join('\n')
          )
        }
        // Fünf Hänger zu 0,8 s: Stufe 1 verlor dabei gemessen 3,98 s. Erlaubt ist Zittern, kein
        // Verlust – nach jedem Hänger muss die Zeit im Strom wieder mit der Uhr laufen.
        assert.ok(z.rueckstand < 0.3, `Strom-Zeit bleibt ${z.rueckstand.toFixed(2)} s zurück`)
        assert.ok(Math.abs(z.bilderJeSekunde - 30) < 1.5, `${z.bilderJeSekunde} Bilder/s`)
      }
    ],
    [
      'Bildgröße ändert sich mitten im Strom: ffmpeg startet neu, die Zeit läuft weiter',
      async () => {
        needFfmpeg()
        // Einmal auf dem macOS-Runner gesehen: Mitten im Strom fing die Zeit wieder vorn an
        // (11,5 s zurück, die Bilder kamen weiter im Takt) – das Bild eines neu gestarteten
        // ffmpeg. Neu starten muss der Sender, wenn sich die Bildgröße ändert (Skalierung
        // umgestellt, später NDI an oder aus). Für den Empfänger darf das nur eine kurze Lücke
        // sein, kein Sprung zurück. Nachgestellt: Das Offscreen-Fenster wird größer.
        const st = await page.evaluate((c) => window.api.timer.streamStart(c), {
          ...cfg,
          fps: 30
        })
        assert.equal(st.running, true, st.error ?? '')
        const vorher = ffmpegStarts()
        const groesser = async () => {
          await sleep(4000)
          await app.evaluate(({ BrowserWindow }) => {
            const w = BrowserWindow.getAllWindows().find(
              (x) => !x.isDestroyed() && x.webContents.isOffscreen()
            )
            w?.setContentSize(800, 450)
          })
        }
        const m = await mitschneiden(url, 10_000, { waehrend: groesser })
        const z = zeitachse(m.video)
        assert.ok(z, 'kein Bild empfangen')
        const neu = ffmpegStarts() - vorher
        console.log(
          `    ffmpeg ${neu}-mal gestartet, Rückstand am Ende ${z.rueckstand.toFixed(2)} s, ` +
            `größter Versatz ${z.puffer.toFixed(2)} s` +
            (z.spruenge.length
              ? `, Sprünge: ${z.spruenge.map((s) => `${s.umS.toFixed(2)} s bei ${s.beiS.toFixed(1)} s`).join(', ')}`
              : '')
        )
        assert.ok(neu >= 2, 'ffmpeg ist nicht neu gestartet – kam die neue Größe nicht an?')
        // Die Lücke des Neustarts darf sein, ein dauerhafter Rückstand nicht.
        assert.ok(z.rueckstand < 0.6, `Strom-Zeit bleibt ${z.rueckstand.toFixed(2)} s zurück`)
        assert.ok(
          z.spruenge.every((s) => s.umS > 0),
          'Zeit springt zurück'
        )
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

  await runSteps('Stufe 2: eine Erfassung für NDI und Stream, Video-Player mit Ton', [
    [
      'Timer: NDI und Stream aus EINEM Offscreen-Fenster; NDI geht, der Stream läuft weiter',
      async () => {
        needFfmpeg()
        if (!(await ndiVerfuegbar())) throw new Skip('kein NDI-Binding (npm run ndi:setup)')
        const ndi = await page.evaluate(() =>
          window.api.timer.ndiStart({
            name: 'Mottulbox E2E Stream',
            width: 1280,
            height: 720,
            fps: 15
          })
        )
        assert.equal(ndi.running, true, ndi.error ?? '')
        const st = await page.evaluate((c) => window.api.timer.streamStart(c), cfg)
        assert.equal(st.running, true, st.error ?? '')
        assert.equal(await offscreenWindows(), 1)
        // Das Fenster malt in der Größe der NDI-Ausgabe, der Stream skaliert selbst
        const s = await probe()
        assert.deepEqual([s.codec_name, s.width, s.height], ['h264', 640, 360])
        const vorher = (await page.evaluate(() => window.api.timer.ndiStatus())).framesSent
        assert.ok(
          await waitFor(
            async () =>
              (await page.evaluate(() => window.api.timer.ndiStatus())).framesSent > vorher + 10,
            10_000
          ),
          'NDI sendet nicht weiter, während der Stream läuft'
        )
        await page.evaluate(() => window.api.timer.ndiStop())
        assert.equal(await offscreenWindows(), 1)
        assert.equal((await probe()).codec_name, 'h264')
        await page.evaluate(() => window.api.timer.streamStop())
        assert.ok(await waitFor(async () => (await offscreenWindows()) === 0, 5000))
      }
    ],
    [
      'Vorbereitung: Testclip mit Blitz und Piep alle 2 s spielt im Player',
      async () => {
        needFfmpeg()
        const clip = join(tmp, 'Blitz und Piep.mp4')
        execFileSync(ffmpeg, [
          ...['-v', 'error', '-y'],
          // 60 s: Während der Messung springt das Video nicht an den Anfang zurück – ein Loop
          // wäre eine Störung mehr, die mit dem Stream nichts zu tun hat.
          ...['-f', 'lavfi', '-i', `color=c=black:s=1280x720:r=30:d=60,${BLITZ}`],
          ...['-f', 'lavfi', '-i', `aevalsrc='${PIEP}':s=48000:d=60`],
          ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
          ...['-c:a', 'aac', '-ac', '2', '-shortest', clip]
        ])
        await page.evaluate(
          (w) => window.api.setSettings({ player: { wallWidth: w.width, wallHeight: w.height } }),
          WAND
        )
        await page.evaluate(
          ([sources, wall]) => window.api.player.import({ sources, fitMode: 'bars', wall }),
          [[clip], WAND]
        )
        const fertig = await waitFor(
          async () => (await page.evaluate(() => window.api.player.libraryList())).length >= 1,
          120_000,
          500
        )
        assert.ok(fertig, 'Import nicht fertig')
        const ids = await page.evaluate(async () =>
          (await window.api.player.libraryList()).map((m) => m.id)
        )
        await page.evaluate(
          (ids) => window.api.player.command({ type: 'replace', mediaIds: ids }),
          ids
        )
        assert.equal((await page.evaluate(() => window.api.player.getState())).playing, true)
        geladen = true
      }
    ],
    [
      'Player-Stream: H.264 und AAC aus EINEM Fenster, der Startbildschirm weiß davon',
      async () => {
        needClip()
        assert.equal(await portFree(PLAYER_PORT), true, `Port ${PLAYER_PORT} ist belegt`)
        const st = await page.evaluate((c) => window.api.player.streamStart(c), playerCfg)
        assert.equal(st.running, true, st.error ?? '')
        assert.equal(await offscreenWindows(), 1)
        assert.equal((await page.evaluate(() => window.api.player.getState())).streamActive, true)
        const streams = await probeAlle(playerUrl)
        const v = streams.find((x) => x.codec_type === 'video')
        const a = streams.find((x) => x.codec_type === 'audio')
        assert.deepEqual([v?.codec_name, v?.width, v?.height], ['h264', 1280, 720])
        assert.deepEqual([a?.codec_name, Number(a?.sample_rate), a?.channels], ['aac', 48000, 2])
      }
    ],
    [
      'Ton lippensynchron – vor und nach zwei Hängern des main-Prozesses',
      async () => {
        needClip()
        // Kommt Ton aus dem Spiegel? Ohne laufende Audioausgabe bleibt der Abgriff stumm.
        const log = () => readFileSync(join(ctx.userData, 'avtoolbox-debug.log'), 'utf8')
        if (!(await waitFor(() => log().includes('erster PCM-Block empfangen'), 8000))) {
          throw new Skip('kein Ton aus dem Spiegel – keine laufende Audioausgabe?')
        }
        // Die Blöcke tragen ihre Sample-Nummer (currentFrame im AudioWorklet) – ohne sie legte der
        // Sender sie nur der Reihe nach, und ein Schub nach einem Hänger wäre nicht zu erkennen.
        assert.match(log(), /erster PCM-Block empfangen:.*Sample-Nummer \d+/)
        const datei = join(tmp, 'mitschnitt.ts')
        const t0 = performance.now()
        const haengerBei = []
        const haenger = async () => {
          await sleep(6000)
          for (let i = 0; i < 2; i++) {
            haengerBei.push(performance.now() - t0)
            await app.evaluate(() => {
              const ende = Date.now() + 800
              while (Date.now() < ende) {
                // blockiert absichtlich
              }
            })
            await sleep(4500)
          }
        }
        const m = await mitschneiden(playerUrl, 20_000, { waehrend: haenger, datei })
        const r = blitzUndPiep(datei, ffmpeg)
        // Zeit des Stroms zu jedem Hänger: PTS des Bildes, das damals ankam
        const haengerPts = haengerBei.map((ms) => {
          const e = m.video.find((x) => x.ankunft >= ms) ?? m.video.at(-1)
          return e.pts
        })
        // Ein Blitz IN einem Hänger hat kein Bild (der main-Prozess nimmt keins an) – gewertet
        // wird, was davor und danach kommt: Danach muss der Ton wieder genau passen. Ebenso
        // nicht der Blitz in der letzten halben Sekunde: silencedetect meldet am Ende der Tonspur
        // ein letztes silence_end, und ein Blitz kurz davor paarte sich damit (gesehen: −112 und
        // −122 ms, je 30 ms vor dem Ende des Mitschnitts – kein Versatz, ein Schein-Piep).
        const gewertet = r.paare.filter(
          (p) =>
            !haengerPts.some((h) => p.blitz > h - 0.3 && p.blitz < h + 1.5) &&
            p.blitz < r.ende - 0.5
        )
        console.log(
          `    ${r.blitze.length} Blitze, ${r.pieps.length} Pieps; Ton − Bild (ms): ` +
            r.paare.map((p) => `${p.versatzMs}${gewertet.includes(p) ? '' : '*'}`).join(' ') +
            ' (* im Hänger oder am Ende, nicht gewertet)'
        )
        for (const p of r.paare) {
          if (Math.abs(p.versatzMs) > LIPPENSYNCHRON_MS) {
            console.log(
              `    Ausreißer bei ${p.blitz.toFixed(2)} s (Ende ${r.ende.toFixed(2)} s), ` +
                `Helligkeit um den Blitz: ${p.hell.join(' ')}`
            )
          }
        }
        assert.ok(gewertet.length >= 5, `nur ${gewertet.length} gewertete Paare`)
        const nachHaenger = gewertet.filter((p) => p.blitz > haengerPts.at(-1))
        assert.ok(nachHaenger.length >= 1, 'kein Paar nach den Hängern')
        for (const p of gewertet) {
          assert.ok(Math.abs(p.versatzMs) <= LIPPENSYNCHRON_MS, `Versatz ${p.versatzMs} ms`)
        }
      }
    ],
    [
      'Player: NDI mit Ton läuft parallel aus demselben Fenster, der Stream weiter',
      async () => {
        needClip()
        if (!(await ndiVerfuegbar())) throw new Skip('kein NDI-Binding (npm run ndi:setup)')
        const ndiStatus = () => page.evaluate(() => window.api.player.ndiStatus())
        const st = await page.evaluate(() =>
          window.api.player.ndiStart({
            name: 'Mottulbox E2E Player',
            width: 1280,
            height: 720,
            fps: 30,
            fit: 'fill',
            audio: true
          })
        )
        assert.equal(st.running, true, st.error ?? '')
        assert.equal(await offscreenWindows(), 1)
        assert.ok(
          await waitFor(async () => {
            const s = await ndiStatus()
            return s.framesSent > 10 && s.audioChunks > 10
          }, 15_000),
          'NDI bekommt weder Bild noch Ton aus der gemeinsamen Erfassung'
        )
        const streams = await probeAlle(playerUrl)
        assert.deepEqual(streams.map((x) => x.codec_name).sort(), ['aac', 'h264'])
      }
    ],
    [
      'Stopp: NDI geht, das Fenster bleibt für den Stream; danach Fenster weg, Port frei',
      async () => {
        needClip()
        await page.evaluate(() => window.api.player.ndiStop())
        assert.equal(await offscreenWindows(), 1)
        const st = await page.evaluate(() => window.api.player.streamStop())
        assert.equal(st.running, false)
        assert.ok(await waitFor(async () => (await offscreenWindows()) === 0, 5000))
        assert.ok(await waitFor(() => portFree(PLAYER_PORT), 5000), 'Port bleibt belegt')
        assert.equal((await page.evaluate(() => window.api.player.getState())).streamActive, false)
      }
    ]
  ])
} finally {
  await ctx.close()
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

// Bildschirm-Skalierung 150 %: Das Offscreen-Fenster malt dann nicht genau in der eingestellten
// Größe (gemessen 641 × 362 statt 640 × 360). Stufe 1 skalierte deshalb JEDES Bild im
// main-Prozess zurück – bei jeder Skalierung über 100 % (Verdacht für die Hänger). Jetzt bekommt
// ffmpeg das Bild, wie es kommt, und skaliert selbst.
const hidpi = await launchApp({ args: ['--force-device-scale-factor=1.5'] })
try {
  await runSteps('Stream bei Bildschirm-Skalierung 150 %', [
    [
      'ffmpeg bekommt das Bild ungeändert, der Empfänger die eingestellte Größe',
      async () => {
        needFfmpeg()
        const st = await hidpi.page.evaluate((c) => window.api.timer.streamStart(c), cfg)
        assert.equal(st.running, true, st.error ?? '')
        const s = await probe()
        assert.equal(s.codec_name, 'h264')
        assert.deepEqual([s.width, s.height], [640, 360])
        await hidpi.page.evaluate(() => window.api.timer.streamStop())
        // Die letzte Startzeile nennt die Eingangsgröße. Kam der Empfänger vor dem ersten Bild,
        // startete ffmpeg zuerst in der eingestellten Größe und danach neu – auch das ist recht.
        const log = readFileSync(join(hidpi.userData, 'avtoolbox-debug.log'), 'utf8')
        const starts = [...log.matchAll(/\[timer-stream\] ffmpeg läuft: \S+ (\d+)x(\d+)/g)]
        assert.ok(starts.length, 'keine Logzeile „ffmpeg läuft“')
        const [, w, h] = starts.at(-1)
        if (w === '640' && h === '360') throw new Skip('Electron malt genau 640 × 360')
        console.log(`    paint-Bild ${w} × ${h}, ffmpeg skaliert auf 640 × 360`)
      }
    ]
  ])
} finally {
  await hidpi.close()
}
