// YouTube-Downloader mit dem echten yt-dlp gegen einen lokalen Server (kein Netz, keine fremde
// Seite): yt-dlp lädt direkte Dateiadressen über seinen allgemeinen Extraktor. Geprüft wird die
// Auftragsliste: fertiger Download, Abbrechen mitten im Laden, höchstens zwei gleichzeitig,
// Beenden der App mitten im Download. Dazu die Anmeldung per cookies.txt und eine Seite, die
// Programme aussperrt wie Cloudflare (erst der zweite Versuch als Browser kommt durch), und was
// nach „fertig“ wirklich da liegt: Dateien mit Umlaut, ein schon vergebener Name, ein Lauf ohne
// Ergebnis. yt-dlp kommt aus MOTTULBOX_E2E_YTDLP oder aus der installierten Mottulbox; ohne yt-dlp
// oder ffmpeg (so in der CI) werden die Schritte übersprungen.
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
  statSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { findFfmpeg, launchApp, openRoute, runSteps, Skip, sleep, waitFor } from './harness.mjs'

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
  const cfSeen = { blocked: 0, browser: 0 }
  const server = createServer((req, res) => {
    const name = req.url?.split('?')[0] ?? ''
    // leerer Feed: yt-dlp findet nichts, lädt nichts und endet trotzdem mit Code 0
    if (name === '/leer.rss') {
      res.writeHead(200, { 'Content-Type': 'application/rss+xml' })
      res.end(
        '<?xml version="1.0"?><rss version="2.0"><channel><title>Leer</title></channel></rss>'
      )
      return
    }
    // /seite/<kennung>-<sekunden>.html: Videoseite mit Titel und Länge, wie eine Mediathek
    const seite = /^\/seite\/\w+-(\d+)\.html$/.exec(name)
    if (seite) {
      const video = {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: 'Folge',
        contentUrl: `http://${req.headers.host}/clip.mp4`,
        duration: `PT${seite[1]}S`
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(
        `<html><head><title>Folge</title><script type="application/ld+json">${JSON.stringify(video)}</script></head></html>`
      )
      return
    }
    if (!name.endsWith('.mp4')) {
      res.writeHead(404).end()
      return
    }
    // /anmeldung/…: nur mit Cookie „geheim=ja“ (wie ein Video, das eine Anmeldung braucht)
    if (name.startsWith('/anmeldung/') && !/geheim=ja/.test(req.headers.cookie ?? '')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Anmeldung nötig')
      return
    }
    // /cf/…: sperrt alles aus, was nicht wie ein Browser fragt – so meldet es Cloudflare
    if (name.startsWith('/cf/')) {
      if (!('sec-ch-ua' in req.headers)) {
        cfSeen.blocked++
        res.writeHead(403, {
          'Content-Type': 'text/html',
          server: 'cloudflare',
          'cf-mitigated': 'challenge'
        })
        res.end('<html><head><title>Just a moment...</title></head></html>')
        return
      }
      cfSeen.browser++
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
  const finished = async (id, status = 'done') =>
    assert.ok(
      await waitFor(async () => (await statusOf(id)) === status, 60_000),
      JSON.stringify(await job(id))
    )

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
        'Umlaut und Doppelpunkt im Titel: die gemeldete Datei gibt es wirklich',
        async () => {
          // Unter Windows kam die Ausgabe von yt-dlp in der Systemkodierung an: aus „ö“ wurde „�“,
          // der Vollbreiten-Doppelpunkt fehlte ganz – der Pfad zeigte auf nichts
          const id = await enqueue(`${base}/Gr%C3%BC%C3%9Fe%3A%20K%C3%B6ln.mp4`, 'Grüße')
          await finished(id)
          const file = (await job(id)).outputFile
          assert.ok(existsSync(file ?? ''), `Datei fehlt: ${file}`)
          assert.match(basename(file), /^Grüße.*Köln\.mp4$/)
          assert.match((await job(id)).title, /Köln$/)
        }
      ],
      [
        'gleicher Name, gleiche Länge: nichts geladen; andere Länge: eigener Name, alte Datei bleibt',
        async () => {
          const eins = await enqueue(`${base}/seite/a-4.html`, 'Folge')
          await finished(eins)
          const alt = (await job(eins)).outputFile
          assert.equal(basename(alt), 'Folge.mp4')
          const stand = statSync(alt).mtimeMs
          // Dieselbe Länge wie die Datei: dasselbe Video, auch beim erneuten Start einer Playlist
          const gleich = await enqueue(`${base}/seite/b-4.html`, 'Folge')
          await finished(gleich)
          assert.equal((await job(gleich)).outputFile, alt)
          assert.equal((await job(gleich)).alreadyThere, true)
          assert.equal(readdirSync(out).filter((f) => f.startsWith('Folge')).length, 1)
          // Nach ein paar Sekunden „fertig“, und es lag nichts Neues im Ordner
          const anders = await enqueue(`${base}/seite/c-60.html`, 'Folge')
          await finished(anders)
          const neu = (await job(anders)).outputFile
          assert.equal(basename(neu ?? ''), 'Folge [c-60].mp4')
          assert.ok(existsSync(neu ?? ''), `Datei fehlt: ${neu}`)
          assert.equal((await job(anders)).alreadyThere, undefined)
          assert.equal(statSync(alt).mtimeMs, stand)
        }
      ],
      [
        'gleicher Name, Länge unbekannt: eigener Name, erst danach „schon da“',
        async () => {
          const eins = await enqueue(`${base}/folge-1/Sendung.mp4`, 'Sendung')
          await finished(eins)
          const alt = (await job(eins)).outputFile
          // direkte Dateiadressen nennen keine Länge: lieber eine Kopie als ein fehlender Download
          const zwei = await enqueue(`${base}/folge-2/Sendung.mp4`, 'Sendung')
          await finished(zwei)
          const neu = (await job(zwei)).outputFile
          assert.ok(existsSync(neu ?? ''), `Datei fehlt: ${neu}`)
          assert.notEqual(neu, alt)
          // Auch unter dem eindeutigen Namen da: Das ist wirklich dieses Video
          const drei = await enqueue(`${base}/folge-2/Sendung.mp4`, 'Sendung')
          await finished(drei)
          assert.equal((await job(drei)).outputFile, neu)
          assert.equal((await job(drei)).alreadyThere, true)
        }
      ],
      [
        'yt-dlp endet ohne Fehler und ohne Datei: Fehler statt „fertig“',
        async () => {
          const id = await enqueue(`${base}/leer.rss`, 'leer')
          await waitFor(async () => ['done', 'error'].includes(await statusOf(id)), 60_000)
          await finished(id, 'error')
          assert.match((await job(id)).error, /keine Datei/)
        }
      ],
      [
        'Knopf „Im Ordner zeigen“ trifft die Datei, „Schon vorhanden“ steht am Auftrag',
        async () => {
          await app.evaluate(({ shell }) => {
            globalThis.gezeigt = []
            shell.showItemInFolder = (p) => globalThis.gezeigt.push(p)
          })
          await openRoute(page, '/tool/youtube-dl')
          const knoepfe = page.getByRole('button', { name: 'Im Ordner zeigen' })
          assert.ok(await waitFor(async () => (await knoepfe.count()) >= 4), 'Knöpfe fehlen')
          for (const k of await knoepfe.all()) await k.click()
          const gezeigt = await app.evaluate(() => globalThis.gezeigt)
          assert.ok(gezeigt.length >= 4 && gezeigt.every(existsSync), gezeigt.join(', '))
          assert.ok(
            gezeigt.some((p) => basename(p).includes('Köln')),
            gezeigt.join(', ')
          )
          assert.equal(await page.getByText('Schon vorhanden', { exact: true }).count(), 2)
          await openRoute(page, '/')
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
        'Anmeldung per cookies.txt: geschützte Adresse lädt nur mit der Datei',
        async () => {
          const setYt = (patch) =>
            page.evaluate((p) => window.api.setSettings({ youtube: p }), patch)
          const ohne = await enqueue(`${base}/anmeldung/ohne.mp4`, 'ohne')
          assert.ok(await waitFor(async () => (await statusOf(ohne)) === 'error', 60_000))
          // Netscape-Format; yt-dlp liest die Einstellung bei jedem Aufruf aus dem main
          const jar = join(work, 'cookies.txt')
          writeFileSync(
            jar,
            '# Netscape HTTP Cookie File\n127.0.0.1\tFALSE\t/\tFALSE\t0\tgeheim\tja\n'
          )
          await setYt({ cookies: 'file', cookiesFile: jar })
          const mit = await enqueue(`${base}/anmeldung/mit.mp4`, 'mit')
          assert.ok(
            await waitFor(async () => (await statusOf(mit)) === 'done', 60_000),
            JSON.stringify(await job(mit))
          )
          // Datei weg: klare Meldung statt eines Downloads ohne Anmeldung
          await setYt({ cookiesFile: join(work, 'fehlt.txt') })
          const weg = await enqueue(`${base}/anmeldung/weg.mp4`, 'weg')
          assert.ok(await waitFor(async () => (await statusOf(weg)) === 'error', 30_000))
          assert.match((await job(weg)).error, /cookies\.txt nicht gefunden/)
          await setYt({ cookies: 'none', cookiesFile: '' })
        }
      ],
      [
        'Seite sperrt Programme aus (Cloudflare): zweiter Versuch als Browser kommt durch',
        async () => {
          // erst die Analyse der Adresse, dann der Download – beide brauchen den zweiten Versuch
          const probe = await page.evaluate(
            (u) => window.api.youtube.probe(u),
            `${base}/cf/sperre.mp4`
          )
          assert.equal(probe.kind, 'video')
          const id = await enqueue(`${base}/cf/sperre.mp4`, 'sperre')
          assert.ok(
            await waitFor(async () => (await statusOf(id)) === 'done', 60_000),
            JSON.stringify(await job(id))
          )
          assert.ok(cfSeen.blocked >= 2 && cfSeen.browser >= 2, JSON.stringify(cfSeen))
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
          // Der Download zählt als laufend: Rückfrage „Wirklich beenden?“ mit „Beenden“ beantworten
          await app.evaluate(({ app: a, dialog }) => {
            dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false })
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
