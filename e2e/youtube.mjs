// YouTube-Downloader mit dem echten yt-dlp gegen einen lokalen Server (kein Netz, keine fremde
// Seite): yt-dlp lädt direkte Dateiadressen über seinen allgemeinen Extraktor. Geprüft wird die
// Auftragsliste: fertiger Download, Abbrechen mitten im Laden, höchstens zwei gleichzeitig,
// Beenden der App mitten im Download. yt-dlp kommt aus MOTTULBOX_E2E_YTDLP oder aus der
// installierten Mottulbox; ohne yt-dlp oder ffmpeg (so in der CI) werden die Schritte übersprungen.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { findFfmpeg, launchApp, runSteps, Skip, sleep, waitFor } from './harness.mjs'

const exe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
const installed = {
  win32: join(process.env.APPDATA ?? '', 'Mottulbox', 'bin', exe),
  darwin: join(homedir(), 'Library', 'Application Support', 'Mottulbox', 'bin', exe),
  linux: join(homedir(), '.config', 'Mottulbox', 'bin', exe)
}[process.platform]
const ytdlp = [process.env.MOTTULBOX_E2E_YTDLP, installed].find((p) => p && existsSync(p))
const ffmpeg = findFfmpeg()

if (!ytdlp || !ffmpeg) {
  await runSteps('YouTube-Downloader', [
    [
      'yt-dlp und ffmpeg vorhanden',
      async () => {
        throw new Skip(!ytdlp ? 'kein yt-dlp (MOTTULBOX_E2E_YTDLP setzen)' : 'kein ffmpeg')
      }
    ]
  ])
} else {
  await run()
}

async function run() {
  const work = mkdtempSync(join(tmpdir(), 'mottulbox-e2e-yt-'))
  const out = join(work, 'ziel')
  mkdirSync(out)
  // Testclip per lavfi: 4 s Bild und Ton
  const clipPath = join(work, 'clip.mp4')
  execFileSync(ffmpeg, [
    ...['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25'],
    ...['-f', 'lavfi', '-i', 'sine=frequency=1000', '-t', '4', '-c:v', 'libx264', '-c:a', 'aac'],
    ...['-movflags', '+faststart', '-y', clipPath]
  ])
  const clip = readFileSync(clipPath)

  // /clip.mp4 sofort, /langsam-N.mp4 tröpfelnd (1 KB je 100 ms) – bleibt lange „läuft“
  const open = new Set()
  const server = createServer((req, res) => {
    const name = req.url?.split('?')[0] ?? ''
    if (!name.endsWith('.mp4')) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': clip.length })
    if (req.method === 'HEAD') return res.end()
    if (!name.startsWith('/langsam')) return res.end(clip)
    open.add(res)
    let pos = 0
    const timer = setInterval(() => {
      if (pos >= clip.length) {
        clearInterval(timer)
        res.end()
        return
      }
      res.write(clip.subarray(pos, (pos += 1024)))
    }, 100)
    res.on('close', () => {
      clearInterval(timer)
      open.delete(res)
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`

  // eigenes userData mit yt-dlp und ohne Selbst-Aktualisierung (die ginge ins Netz)
  const userData = join(work, 'userData')
  mkdirSync(join(userData, 'bin'), { recursive: true })
  copyFileSync(ytdlp, join(userData, 'bin', exe))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ ytdlpAutoUpdate: false }))

  const ctx = await launchApp({ userData })
  const { app, page } = ctx
  const enqueue = (url, title) =>
    page.evaluate((r) => window.api.youtube.enqueue(r).then((x) => x.jobId), {
      url,
      format: 'video',
      maxHeight: null,
      outputDir: out,
      title
    })
  const jobs = () => page.evaluate(() => window.api.youtube.list())
  const job = async (id) => (await jobs()).find((j) => j.id === id)
  const statusOf = async (id) => (await job(id))?.status

  /** laufende yt-dlp-Prozesse aus diesem userData */
  function ourYtdlp() {
    const me = join(userData, 'bin').toLowerCase()
    const lines =
      process.platform === 'win32'
        ? execFileSync(
            'powershell',
            [
              '-NoProfile',
              '-Command',
              'Get-Process yt-dlp -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id)|$($_.Path)" }; exit 0'
            ],
            { encoding: 'utf8', windowsHide: true }
          ).split(/\r?\n/)
        : execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).split('\n')
    return lines.filter((l) => l.toLowerCase().includes(me))
  }

  try {
    await runSteps('YouTube-Downloader', [
      [
        'fertiger Download landet im Zielordner',
        async () => {
          const st = await page.evaluate(() => window.api.youtube.status())
          assert.equal(st.available, true, 'yt-dlp nicht gefunden')
          const id = await enqueue(`${base}/clip.mp4`, 'clip')
          assert.ok(
            await waitFor(async () => (await statusOf(id)) === 'done', 60_000),
            JSON.stringify(await job(id))
          )
          const files = readdirSync(out)
          assert.ok(
            files.some((f) => f.startsWith('clip') && f.endsWith('.mp4')),
            files.join(', ')
          )
        }
      ],
      [
        'Abbrechen mitten im Download beendet yt-dlp',
        async () => {
          const id = await enqueue(`${base}/langsam-1.mp4`, 'langsam')
          assert.ok(
            await waitFor(async () => (await job(id))?.progress > 0, 30_000),
            'kein Fortschritt'
          )
          await page.evaluate((i) => window.api.youtube.cancel(i), id)
          assert.equal(await statusOf(id), 'canceled')
          // yt-dlp ist beendet: die Verbindung zum Server ist zu, kein Prozess mehr
          assert.ok(await waitFor(async () => open.size === 0, 10_000), 'Verbindung bleibt offen')
          assert.ok(
            await waitFor(async () => ourYtdlp().length === 0, 10_000),
            ourYtdlp().join('\n')
          )
          await sleep(500)
          assert.equal(await statusOf(id), 'canceled') // kein späterer Fehler überschreibt das
        }
      ],
      [
        'höchstens zwei gleichzeitig, der dritte wartet und lässt sich wartend abbrechen',
        async () => {
          const ids = []
          for (let i = 2; i <= 4; i++) ids.push(await enqueue(`${base}/langsam-${i}.mp4`, `l${i}`))
          assert.ok(
            await waitFor(
              async () =>
                (await statusOf(ids[0])) === 'running' && (await statusOf(ids[1])) === 'running',
              30_000
            )
          )
          await sleep(1000)
          assert.equal(await statusOf(ids[2]), 'queued')
          await page.evaluate((i) => window.api.youtube.cancel(i), ids[2])
          await page.evaluate((i) => window.api.youtube.cancel(i), ids[0])
          await sleep(1500)
          // der wartende rückt nach dem Abbruch nicht nach – abgebrochen bleibt abgebrochen
          assert.equal(await statusOf(ids[2]), 'canceled')
          assert.equal(await statusOf(ids[1]), 'running')
        }
      ],
      [
        'Beenden mitten im Download: kein yt-dlp läuft weiter',
        async () => {
          assert.ok(ourYtdlp().length > 0, 'es sollte noch ein Download laufen')
          const proc = app.process()
          const exited = new Promise((resolve) => proc.once('exit', resolve))
          await app.evaluate(({ app: a }) => {
            setTimeout(() => a.quit(), 0)
          })
          await Promise.race([exited, sleep(20_000)])
          assert.ok(proc.exitCode !== null || proc.signalCode !== null, 'die App läuft noch')
          assert.ok(
            await waitFor(async () => ourYtdlp().length === 0, 10_000),
            ourYtdlp().join('\n')
          )
        }
      ]
    ])
  } finally {
    await ctx.close()
    server.close()
    for (const res of open) res.destroy()
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
