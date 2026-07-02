// Richtet das optionale NDI-Binding (rse/grandiose, sende-fähiger Fork) unter
// vendor/grandiose ein -- als EXPLIZITE Schritte statt npm-Lifecycle-Scripts:
// neuere npm-Versionen blockieren Install-Scripts fremder Pakete (allow-scripts),
// wodurch "npm install github:rse/grandiose" zwar Dateien holt, aber weder das
// NDI-SDK laedt noch kompiliert. Dieses Script macht genau das kontrolliert:
//
//   1. git clone https://github.com/rse/grandiose -> vendor/grandiose
//   2. npm install --ignore-scripts   (Laufzeit-Deps des Bindings)
//   3. node ndi.js                    (laedt das NDI-SDK nach ndi/)
//   4. node-gyp rebuild gegen die ELECTRON-Header (ABI der App)
//
// Voraussetzungen: git, Internet, Python 3 (fuer node-gyp; python.org oder
// py-Launcher) und C++-Build-Tools (Windows: Visual Studio "Desktop
// development with C++"; macOS: Xcode CLT; Linux: build-essential).
// Aufruf: npm run ndi:setup    (Neu-Bau erzwingen: npm run ndi:setup -- --force)
//
// Robustheit: ndi.js (Upstream) verschluckt Fehler und endet IMMER mit Exit 0
// -> das SDK-Ergebnis wird hier hart validiert. Nach einem Electron-Upgrade
// passt die ABI des Kompilats nicht mehr -> die Ziel-Version wird in einer
// Markerdatei festgehalten und bei Abweichung automatisch neu gebaut.
// npm/node-gyp laufen als "node <script.js>" OHNE Shell (kein .cmd-Shim) --
// sonst zerlegt cmd.exe Projektpfade mit Leerzeichen ("E:\Meine Programme\...").

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = join(projectRoot, 'vendor', 'grandiose')
const abiMarker = join(vendorDir, 'build', 'electron-target.json')
const force = process.argv.includes('--force')

function fail(msg) {
  console.error(`\n[ndi-setup] FEHLER: ${msg}`)
  process.exit(1)
}

/** npm-CLI-Skript finden (npm_execpath, wenn via `npm run` gestartet). */
function npmCliPath() {
  const fromEnv = process.env.npm_execpath
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const base = dirname(process.execPath)
  const candidates = [
    join(base, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows-Layout
    join(base, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js') // Linux/macOS/nvm
  ]
  const hit = candidates.find(existsSync)
  if (!hit) fail('npm-cli.js nicht gefunden -- bitte über "npm run ndi:setup" starten.')
  return hit
}

/** npm bündelt node-gyp -> direkt nutzen (kein npx: kein Netz, kein .cmd-Shim). */
function nodeGypPath() {
  const npmRoot = dirname(dirname(npmCliPath())) // .../npm
  const bundled = join(npmRoot, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
  if (existsSync(bundled)) return bundled
  fail('node-gyp nicht gefunden (npm-Bündelung fehlt) -- npm aktualisieren.')
}

function run(title, cmd, args, cwd) {
  console.log(`\n[ndi-setup] ${title}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (r.error || r.status !== 0)
    fail(`Schritt fehlgeschlagen: ${title} (Code ${r.status ?? r.error?.code})`)
}

/** SDK-Ergebnis hart pruefen: ndi.js meldet Fehler nur als Log (Exit bleibt 0). */
function sdkComplete() {
  const base = join(vendorDir, 'ndi')
  if (!existsSync(join(base, 'include'))) return false
  if (process.platform === 'win32') {
    const arch = process.arch === 'ia32' ? 'win-x86' : 'win-x64'
    const lib = process.arch === 'ia32' ? 'Processing.NDI.Lib.x86' : 'Processing.NDI.Lib.x64'
    return (
      existsSync(join(base, 'lib', arch, `${lib}.lib`)) &&
      existsSync(join(base, 'lib', arch, `${lib}.dll`))
    )
  }
  // macOS/Linux: mindestens eine Bibliothek unterhalb von ndi/lib
  const libDir = join(base, 'lib')
  if (!existsSync(libDir)) return false
  const stack = [libDir]
  while (stack.length) {
    const dir = stack.pop()
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(join(dir, e.name))
      else if (/libndi/i.test(e.name)) return true
    }
  }
  return false
}

// Electron-Version der App (dafür wird kompiliert).
let electronVersion
try {
  electronVersion = require('electron/package.json').version
} catch {
  fail('electron nicht installiert -- zuerst "npm ci" im Projekt ausführen.')
}

// Fertig-Check inkl. ABI: nach einem Electron-Upgrade muss neu gebaut werden.
const builtBinary = join(vendorDir, 'build', 'Release', 'grandiose.node')
const builtFor = existsSync(abiMarker) ? JSON.parse(readFileSync(abiMarker, 'utf8')).electron : null
if (existsSync(builtBinary) && builtFor === electronVersion && !force) {
  console.log(
    `[ndi-setup] bereits für Electron ${electronVersion} gebaut -- fertig` +
      ` (Neu-Bau: npm run ndi:setup -- --force).`
  )
  process.exit(0)
}
if (existsSync(builtBinary) && builtFor !== electronVersion) {
  console.log(
    `[ndi-setup] Kompilat ist für Electron ${builtFor ?? '?'}, App nutzt ${electronVersion} -> Neu-Bau.`
  )
}

// 1) Quellen holen (git ist eine echte .exe -> ohne Shell + Leerzeichen-sicher).
//    Rest eines abgebrochenen Clones (ohne package.json) vorher wegräumen.
if (!existsSync(join(vendorDir, 'package.json'))) {
  rmSync(vendorDir, { recursive: true, force: true })
  mkdirSync(join(projectRoot, 'vendor'), { recursive: true })
  run(
    'Quellen holen (github.com/rse/grandiose)',
    'git',
    ['clone', '--depth', '1', 'https://github.com/rse/grandiose', vendorDir],
    projectRoot
  )
  // Stand festhalten (bewusst ungepinnt: Upstream ändert sich selten; der
  // Commit landet im Log, falls ein künftiger Stand Probleme macht).
  spawnSync('git', ['-C', vendorDir, 'log', '-1', '--format=[ndi-setup] Quelle: %h %cs %s'], {
    stdio: 'inherit'
  })
} else {
  console.log('[ndi-setup] Quellen vorhanden (vendor/grandiose) -- Clone übersprungen.')
}

// 2) Laufzeit-Abhängigkeiten des Bindings (bindings, got, ...) -- Scripts aus.
run(
  'Abhängigkeiten installieren (--ignore-scripts)',
  process.execPath,
  [npmCliPath(), 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
  vendorDir
)

// 3) NDI-SDK laden (das täte sonst der blockierte Install-Script). Partielle
//    Downloads werden verworfen, das Ergebnis hart geprüft (ndi.js: immer Exit 0).
if (!sdkComplete() || force) {
  rmSync(join(vendorDir, 'ndi'), { recursive: true, force: true })
  run('NDI-SDK laden (ndi.js)', process.execPath, [join(vendorDir, 'ndi.js')], vendorDir)
  if (!sdkComplete())
    fail(
      'NDI-SDK unvollständig -- der Download ist fehlgeschlagen (Ausgabe von ndi.js oben ' +
        'prüfen: Netzwerk/Proxy?). Einfach erneut ausführen: npm run ndi:setup'
    )
} else {
  console.log('[ndi-setup] NDI-SDK vorhanden (ndi/) -- Download übersprungen.')
}

// Python nur VORWARNEN (node-gyp findet u.U. Installationen, die hier nicht
// sichtbar sind); die harte Entscheidung trifft node-gyp selbst.
const pythonFound = ['py', 'python3', 'python'].some((cand) => {
  const r = spawnSync(cand, ['--version'], { stdio: 'ignore' })
  return !r.error && r.status === 0
})
if (!pythonFound) {
  console.warn(
    '\n[ndi-setup] WARNUNG: kein Python im PATH gefunden -- node-gyp braucht Python 3 ' +
      '(python.org installieren, "Add to PATH" anhaken). Versuche es trotzdem ...'
  )
}

// 4) Gegen die Electron-Header kompilieren (npm bündelt node-gyp -> direkt nutzen).
run(
  `Kompilieren für Electron ${electronVersion} (node-gyp)`,
  process.execPath,
  [
    nodeGypPath(),
    'rebuild',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    '--dist-url=https://electronjs.org/headers'
  ],
  vendorDir
)

if (!existsSync(builtBinary))
  fail(
    'Build lief durch, aber build/Release/grandiose.node fehlt. Häufigste Ursachen: ' +
      'Python 3 fehlt oder VS-Build-Tools ("Desktop development with C++") fehlen.'
  )
writeFileSync(abiMarker, JSON.stringify({ electron: electronVersion, arch: process.arch }))

const ver = JSON.parse(readFileSync(join(vendorDir, 'package.json'), 'utf8')).version
console.log(
  `\n[ndi-setup] fertig: grandiose ${ver} für Electron ${electronVersion} (${process.arch})` +
    `\n[ndi-setup] -> App neu starten; das Timer-Panel "NDI-Ausgabe" ist dann aktiv.` +
    `\n[ndi-setup] -> "npm run package" nimmt nur die Laufzeitdateien mit (extraResources).`
)
