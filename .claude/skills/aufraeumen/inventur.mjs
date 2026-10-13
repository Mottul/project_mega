// Bestandsaufnahme vor dem Aufräumen – grob (Textsuche, kein Typsystem), also jeden Treffer
// selbst nachsehen, bevor etwas gelöscht wird:
// - Exporte, die keine andere Datei nennt (NIRGENDS benutzt / nur in Tests);
//   mit --alle auch die, die nur in der eigenen Datei gebraucht werden (viele Typen, harmlos)
// - Dateien, die niemand importiert (ohne Einstiege und Tests)
// - Pakete aus package.json, die im Code nicht vorkommen
// - TODO/FIXME und die größten Dateien
//
//   node .claude/skills/aufraeumen/inventur.mjs [--alle]

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const all = process.argv.includes('--alle')
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const code = tracked.filter((f) => /\.(tsx?|mjs|cjs|js)$/.test(f) && !f.startsWith('.claude/'))
const text = new Map(code.map((f) => [f, readFileSync(join(root, f), 'utf8')]))
const isTest = (f) => /\.test\.tsx?$/.test(f)
const src = code.filter((f) => f.startsWith('src/') && !isTest(f) && !f.endsWith('.d.ts'))

console.log('=== Exporte, die keine andere Datei nennt')
const EXPORT =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([\w$]+)/gm
let quiet = 0
for (const f of src) {
  for (const [, name] of text.get(f).matchAll(EXPORT)) {
    const word = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')
    let other = false
    let tests = false
    for (const [g, t] of text) {
      if (g === f || !t.match(word)) continue
      if (isTest(g)) tests = true
      else other = true
    }
    if (other) continue
    const own = (text.get(f).match(word) ?? []).length > 1
    if (own && !all) {
      quiet++
      continue
    }
    console.log(
      `  ${f}: ${name} – ${own ? 'nur in der eigenen Datei' : tests ? 'nur in Tests' : 'NIRGENDS benutzt'}`
    )
  }
}
if (quiet) console.log(`  (+ ${quiet} nur in der eigenen Datei gebraucht – mit --alle zeigen)`)

console.log('\n=== Dateien, die niemand importiert (ohne Einstiege und Tests)')
const ALIAS = [
  ['@shared/', 'src/shared/'],
  ['@renderer/', 'src/renderer/src/']
]
const imported = new Set()
for (const [g, t] of text) {
  for (const [, spec] of t.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"?]+)/g)) {
    const alias = ALIAS.find(([a]) => spec.startsWith(a))
    let target
    if (alias) target = join(root, alias[1], spec.slice(alias[0].length))
    else if (spec.startsWith('.')) target = resolve(root, dirname(g), spec)
    else continue
    imported.add(target.replace(/\\/g, '/').replace(/\.(tsx?|mjs|js)$/, ''))
  }
}
const ENTRIES = /^src\/(main\/index|preload\/index|renderer\/src\/main|pwa\/main)\.tsx?$/
for (const f of src) {
  if (ENTRIES.test(f)) continue
  const base = join(root, f)
    .replace(/\\/g, '/')
    .replace(/\.(tsx?|mjs)$/, '')
  if (!imported.has(base) && !imported.has(base.replace(/\/index$/, ''))) console.log(`  ${f}`)
}

console.log('\n=== Pakete, die im Code nicht vorkommen (Plugins/Peers prüfen: postcss …)')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const configs = tracked
  .filter(
    (f) => !f.includes('/') && /\.(js|mjs|cjs|ts|ya?ml|json)$/.test(f) && f !== 'package-lock.json'
  )
  .map((f) => readFileSync(join(root, f), 'utf8'))
const corpus = [...text.values(), ...configs].join('\n')
for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (dep.startsWith('@types/')) continue
  const used = [`'${dep}`, `"${dep}`, ` ${dep} `, ` ${dep}\n`].some((s) => corpus.includes(s))
  if (!used) console.log(`  ${dep}`)
}

console.log('\n=== TODO/FIXME')
let todos = 0
for (const [g, t] of text) {
  t.split('\n').forEach((line, i) => {
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line)) {
      todos++
      console.log(`  ${g}:${i + 1}: ${line.trim().slice(0, 100)}`)
    }
  })
}
if (!todos) console.log('  keine')

console.log('\n=== Größte Dateien (Zeilen, ohne Tests)')
src
  .map((f) => [f, text.get(f).split('\n').length])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([f, n]) => console.log(`  ${String(n).padStart(5)}  ${f}`))
