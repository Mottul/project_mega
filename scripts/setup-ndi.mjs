// Richtet das optionale NDI-Binding (rse/grandiose, sende-fähiger Fork) unter
// vendor/grandiose ein -- als EXPLIZITE Schritte statt npm-Lifecycle-Scripts:
// neuere npm-Versionen blockieren Install-Scripts fremder Pakete (allow-scripts),
// wodurch "npm install github:rse/grandiose" zwar Dateien holt, aber weder das
// NDI-SDK laedt noch kompiliert. Dieses Script macht genau das kontrolliert:
//
//   1. git clone https://github.com/rse/grandiose -> vendor/grandiose
//   2. npm install --ignore-scripts        (Laufzeit-Deps: bindings, got, ...)
//   3. node ndi.js                         (laedt das NDI-SDK nach ndi/)
//   4. node-gyp rebuild gegen die ELECTRON-Header (ABI der App)
//
// Voraussetzungen: git, Internet, C++-Build-Tools (Windows: Visual Studio
// "Desktop development with C++"; macOS: Xcode CLT; Linux: build-essential).
// Aufruf: npm run ndi:setup   (erneut ausfuehren mit --force baut neu)
//
// npm/npx werden bewusst als "node <cli.js>" OHNE Shell gestartet (kein
// .cmd-Shim) -- sonst zerlegt cmd.exe Projektpfade mit Leerzeichen
// (z.B. "E:\Meine Programme\..."), siehe rebuild-native.mjs.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = join(projectRoot, 'vendor', 'grandiose')
const force = process.argv.includes('--force')

function fail(msg) {
  console.error(`\n[ndi-setup] FEHLER: ${msg}`)
  process.exit(1)
}

/** npm-/npx-CLI-Skript finden (npm_execpath, wenn via `npm run` gestartet). */
function npmCliPath(name) {
  const fromEnv = process.env.npm_execpath
  if (fromEnv && existsSync(join(dirname(fromEnv), name))) return join(dirname(fromEnv), name)
  const base = dirname(process.execPath)
  const candidates = [
    join(base, 'node_modules', 'npm', 'bin', name), // Windows-Layout
    join(base, '..', 'lib', 'node_modules', 'npm', 'bin', name) // Linux/macOS/nvm
  ]
  const hit = candidates.find(existsSync)
  if (!hit) fail(`${name} nicht gefunden -- bitte über "npm run ndi:setup" starten.`)
  return hit
}

function run(title, cmd, args, cwd) {
  console.log(`\n[ndi-setup] ${title}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (r.error || r.status !== 0)
    fail(`Schritt fehlgeschlagen: ${title} (Code ${r.status ?? r.error?.code})`)
}

// Electron-Version der App (dafür wird kompiliert).
let electronVersion
try {
  electronVersion = require('electron/package.json').version
} catch {
  fail('electron nicht installiert -- zuerst "npm ci" im Projekt ausführen.')
}

const builtBinary = join(vendorDir, 'build', 'Release', 'grandiose.node')
if (existsSync(builtBinary) && !force) {
  console.log(`[ndi-setup] ${builtBinary} existiert bereits -- fertig (Neu-Bau mit --force).`)
  process.exit(0)
}

// 1) Quellen holen (git ist eine echte .exe -> ohne Shell + Leerzeichen-sicher)
if (!existsSync(join(vendorDir, 'package.json'))) {
  mkdirSync(join(projectRoot, 'vendor'), { recursive: true })
  run(
    'Quellen holen (github.com/rse/grandiose)',
    'git',
    ['clone', '--depth', '1', 'https://github.com/rse/grandiose', vendorDir],
    projectRoot
  )
} else {
  console.log('[ndi-setup] Quellen vorhanden (vendor/grandiose) -- Clone übersprungen.')
}

// 2) Laufzeit-Abhängigkeiten des Bindings (bindings, got, ...) -- Scripts aus.
run(
  'Abhängigkeiten installieren (--ignore-scripts)',
  process.execPath,
  [npmCliPath('npm-cli.js'), 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
  vendorDir
)

// 3) NDI-SDK laden (das täte sonst der blockierte Install-Script).
if (!existsSync(join(vendorDir, 'ndi', 'include')) || force) {
  run('NDI-SDK laden (ndi.js)', process.execPath, [join(vendorDir, 'ndi.js')], vendorDir)
} else {
  console.log('[ndi-setup] NDI-SDK vorhanden (ndi/) -- Download übersprungen.')
}

// 4) Gegen die Electron-Header kompilieren (ABI der App, nicht des System-Node).
run(
  `Kompilieren für Electron ${electronVersion} (node-gyp)`,
  process.execPath,
  [
    npmCliPath('npx-cli.js'),
    '--yes',
    'node-gyp@11',
    'rebuild',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    '--dist-url=https://electronjs.org/headers'
  ],
  vendorDir
)

if (!existsSync(builtBinary)) fail('Build lief durch, aber build/Release/grandiose.node fehlt.')

const ver = JSON.parse(readFileSync(join(vendorDir, 'package.json'), 'utf8')).version
console.log(
  `\n[ndi-setup] fertig: grandiose ${ver} für Electron ${electronVersion} (${process.arch})` +
    `\n[ndi-setup] -> App neu starten; das Timer-Panel "NDI-Ausgabe" ist dann aktiv.` +
    `\n[ndi-setup] -> "npm run package" nimmt vendor/grandiose automatisch mit.`
)
