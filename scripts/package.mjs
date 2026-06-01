// Ruft electron-builder (on-demand via npx) auf und deaktiviert dabei die
// Code-Signierung.
//
// Grund: Ohne Zertifikat versucht electron-builder auf Windows trotzdem zu
// signieren und laedt dafuer winCodeSign-*.7z. Dessen Entpacken scheitert auf
// Windows an enthaltenen macOS-Symlinks ("Dem Client fehlt ein erforderliches
// Recht"), solange nicht der Windows-Entwicklermodus aktiv ist. Fuer eine private,
// unsignierte App brauchen wir das Tool gar nicht -> CSC_IDENTITY_AUTO_DISCOVERY=false
// schaltet die Signatur-Suche ab, damit winCodeSign nie geladen/entpackt wird.
//
// Zusaetzliche Argumente werden durchgereicht (z.B. --dir fuer package:dir).

import { spawnSync } from 'node:child_process'

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

const passthrough = process.argv.slice(2)
const isWin = process.platform === 'win32'

const r = spawnSync('npx', ['--yes', 'electron-builder@26', ...passthrough], {
  stdio: 'inherit',
  // npx ist auf Windows npx.cmd -> braucht die Shell zum Aufloesen. Befehl/Args
  // enthalten keine Pfade mit Leerzeichen, daher hier unkritisch.
  shell: isWin,
  env: process.env
})

process.exit(r.status ?? 1)
