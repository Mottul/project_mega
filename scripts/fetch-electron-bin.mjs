// Laedt die Electron-Laufzeit-Binary direkt aus dem GitHub-Release und legt
// node_modules/electron/{dist, path.txt} an -- in reinem Node, ohne electron's
// eigenen install.js / @electron/get.
//
// Hintergrund: In gehaerteten Umgebungen (Script-Gating / Security-Wrapper) wird
// electron's postinstall (node install.js) abgefangen/abgebrochen ("is not a tty"),
// sodass die Binary fehlt und electron-vite "Electron uninstall" wirft. Dieser
// Schritt laeuft als normaler (nicht abgefangener) Root-Postinstall durch -- genau
// wie der ffmpeg-Downloader, der in derselben Umgebung funktioniert.
//
// Idempotent: liegt die Binary schon vor, passiert nichts (npm install bleibt schnell).

import { createRequire } from 'node:module'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import https from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

let elDir
try {
  elDir = dirname(require.resolve('electron/package.json'))
} catch {
  console.log('[electron-bin] electron nicht installiert — uebersprungen.')
  process.exit(0)
}

const version = JSON.parse(readFileSync(join(elDir, 'package.json'), 'utf8')).version
const platform = process.platform // win32 | darwin | linux
const arch = process.arch // x64 | arm64 | ...

// Name der ausfuehrbaren Datei je Plattform; [0] ist der Wurzeleintrag im dist/.
const BIN_NAME =
  platform === 'win32'
    ? 'electron.exe'
    : platform === 'darwin'
      ? 'Electron.app/Contents/MacOS/Electron'
      : 'electron'
const ROOT_ENTRY = BIN_NAME.split('/')[0]

const distPath = join(elDir, 'dist')
const pathTxt = join(elDir, 'path.txt')

// Schon vorhanden? -> nichts tun.
if (existsSync(pathTxt) && existsSync(join(distPath, ROOT_ENTRY))) {
  console.log(`[electron-bin] Electron ${version} bereits vorhanden — uebersprungen.`)
  process.exit(0)
}

const url = `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-${platform}-${arch}.zip`

function download(u, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('Zu viele Redirects'))
    https
      .get(u, { headers: { 'User-Agent': 'av-toolbox-build' } }, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve(download(res.headers.location, dest, redirects + 1))
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`HTTP ${status} bei ${u}`))
          return
        }
        const total = Number(res.headers['content-length'] || 0)
        let got = 0
        let lastPct = -1
        res.on('data', (c) => {
          got += c.length
          if (total) {
            const pct = Math.floor((got / total) * 100)
            if (pct >= lastPct + 10) {
              lastPct = pct
              process.stdout.write(
                `\r[electron-bin]   ${pct}% (${(got / 1048576) | 0}/${(total / 1048576) | 0} MB)`
              )
            }
          }
        })
        // WICHTIG: Abbrüche des Response-Streams explizit behandeln. Ohne diese
        // Handler löst der Promise bei einem Verbindungsabriss NIE auf -- der
        // Event-Loop leert sich und Node beendet sich still mit Exit 0
        // ("hing bei 99%", keine Meldung).
        res.on('aborted', () =>
          reject(new Error('Verbindung abgebrochen (Download unvollständig)'))
        )
        res.on('error', (err) => reject(new Error(`Download-Fehler: ${err.message}`)))
        const out = createWriteStream(dest)
        res.pipe(out)
        out.on('finish', () => {
          if (total) process.stdout.write('\n')
          out.close(() => {
            // Vollständigkeit hart prüfen -- ein abgerissener Stream kann trotzdem
            // ein 'finish' der Datei auslösen.
            if (total && got !== total) {
              reject(new Error(`Download unvollständig (${got} von ${total} Bytes)`))
            } else resolve()
          })
        })
        out.on('error', reject)
      })
      .on('error', reject)
  })
}

/** Download mit bis zu 3 Versuchen (transiente Netzfehler/Abbrüche). */
async function downloadWithRetry(u, dest) {
  for (let attempt = 1; ; attempt++) {
    try {
      await download(u, dest)
      return
    } catch (err) {
      rmSync(dest, { force: true })
      if (attempt >= 3) throw err
      console.warn(
        `\n[electron-bin] Versuch ${attempt} fehlgeschlagen (${err.message}) -- neuer Versuch …`
      )
    }
  }
}

async function main() {
  // extract-zip ist eine Dependency von electron (fuer dessen install.js) -> vorhanden.
  const extract = require(require.resolve('extract-zip', { paths: [elDir] }))
  const tmp = join(tmpdir(), `electron-bin-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  const zip = join(tmp, 'electron.zip')
  try {
    console.log(`[electron-bin] lade Electron ${version} (${platform}-${arch}) …`)
    await downloadWithRetry(url, zip)
    console.log('[electron-bin] Download vollständig, entpacke …')
    rmSync(distPath, { recursive: true, force: true })
    mkdirSync(distPath, { recursive: true })
    await extract(zip, { dir: distPath })
    if (!existsSync(join(distPath, ROOT_ENTRY))) {
      throw new Error(`${ROOT_ENTRY} nach dem Entpacken nicht gefunden (Virenscanner?)`)
    }
    // path.txt -- exakt der Binary-Name, OHNE Zeilenumbruch (electron-vite trimmt nicht).
    writeFileSync(pathTxt, BIN_NAME)
    console.log('[electron-bin] fertig.')
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(`\n[electron-bin] Konnte Electron-Binary nicht installieren: ${err.message}`)
  console.error('  Erneut versuchen:  npm run electron:bin')
  console.error(
    '  Fehlt die exe nach dem Entpacken: Projektordner in den Virenscanner-Ausnahmen eintragen.'
  )
  // Als postinstall den npm-install nicht hart scheitern lassen; beim manuellen
  // Aufruf (npm run electron:bin) den Fehler aber sichtbar machen (Exit 1).
  process.exit(process.env.npm_lifecycle_event === 'postinstall' ? 0 : 1)
})
