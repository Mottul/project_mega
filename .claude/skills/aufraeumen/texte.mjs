// Nach dem Aufteilen einer großen Datei: Sind alle sichtbaren Texte, Titel, Klassen und Befehle
// noch da? Vergleicht die Fassung aus HEAD mit den neuen Dateien (Arbeitskopie) – gezählt werden
// String-Literale und JSX-Text. Erwartete Unterschiede: Importe, aufgeteilte Klassen-Strings.
//
//   node .claude/skills/aufraeumen/texte.mjs <alte/datei.tsx> <neu/a.tsx> <neu/b.tsx> …
//   (die alte Datei darf unter den neuen sein, wenn sie geschrumpft weiterlebt)

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const [oldPath, ...newPaths] = process.argv.slice(2)
if (!oldPath || !newPaths.length) {
  console.error('Aufruf: texte.mjs <alte/datei.tsx> <neu/a.tsx> …')
  process.exit(2)
}
const gitPath = relative(root, join(process.cwd(), oldPath)).replace(/\\/g, '/')
const old = execFileSync('git', ['show', `HEAD:${gitPath}`], { cwd: root, encoding: 'utf8' })
const fresh = newPaths.map((f) => readFileSync(f, 'utf8')).join('\n')

function tokens(src) {
  const out = new Map()
  const add = (t) => {
    t = t.replace(/\s+/g, ' ').trim()
    if (t.length >= 3) out.set(t, (out.get(t) ?? 0) + 1)
  }
  for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) add(m[1] ?? m[2] ?? m[3])
  // JSX-Text; Code zwischen Typ-Klammern (useState<…>(…) const …) ist kein Text
  for (const m of src.matchAll(/>([^<>{}]+)</g)) if (!/[;=(]|const/.test(m[1])) add(m[1])
  return out
}

const a = tokens(old)
const b = tokens(fresh)
const lost = [...a].filter(([t, n]) => (b.get(t) ?? 0) < n)
const added = [...b].filter(([t, n]) => (a.get(t) ?? 0) < n)
console.log(`Fehlt oder seltener (${lost.length}) – jeden Treffer erklären können:`)
for (const [t, n] of lost) console.log(`  -${n - (b.get(t) ?? 0)}  ${t.slice(0, 110)}`)
console.log(`\nNeu oder häufiger (${added.length}):`)
for (const [t, n] of added) console.log(`  +${n - (a.get(t) ?? 0)}  ${t.slice(0, 110)}`)
