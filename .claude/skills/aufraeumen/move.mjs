// Dateien verschieben und alle Importe neu ausrechnen (relativ und @shared/@renderer, auch
// import(), vi.mock, require). Tests neben der Datei (x.test.ts, x.lab.test.ts) ziehen mit.
// Erst ohne --apply laufen lassen: zeigt jede Änderung, schreibt nichts.
//
//   node .claude/skills/aufraeumen/move.mjs [--apply] alt/pfad.ts=neu/pfad.ts …
//   (Pfade relativ zum Repository; ein Ziel mit „/“ am Ende = gleicher Name in diesem Ordner)
//
// Danach: npm run typecheck, typecheck:test, die Tests – und npm run check:refs für die Doku.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const apply = process.argv.includes('--apply')
const pairs = process.argv.slice(2).filter((a) => a !== '--apply')
if (!pairs.length) {
  console.error('Aufruf: move.mjs [--apply] alt/pfad.ts=neu/pfad.ts …')
  process.exit(2)
}

const ALIAS = [
  ['@shared/', join(root, 'src/shared')],
  ['@renderer/', join(root, 'src/renderer/src')]
]
const EXT = /\.(tsx?|mjs|cjs|js)$/
const strip = (p) => p.replace(EXT, '')

// alt -> neu (absolut, ohne Endung) und die eigentlichen Umzüge
const moves = new Map()
const fileMoves = []
function plan(from, to) {
  if (!existsSync(from)) throw new Error(`fehlt: ${relative(root, from)}`)
  if (existsSync(to)) throw new Error(`schon da: ${relative(root, to)}`)
  fileMoves.push([from, to])
  moves.set(strip(from), strip(to))
}
for (const pair of pairs) {
  const [a, b] = pair.split('=')
  if (!a || !b) throw new Error(`kein Paar alt=neu: ${pair}`)
  const from = resolve(root, a)
  const to = resolve(root, b.endsWith('/') ? join(b, basename(a)) : b)
  plan(from, to)
  // Tests neben der Datei ziehen mit, sofern nicht selbst genannt
  const ext = from.match(EXT)?.[0] ?? ''
  for (const kind of ['.test', '.lab.test']) {
    const t = strip(from) + kind + ext
    const named = pairs.some((p) => resolve(root, p.split('=')[0]) === t)
    if (existsSync(t) && !named) plan(t, strip(to) + kind + ext)
  }
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter((f) => EXT.test(f) && !f.startsWith('node_modules/'))
  .map((f) => join(root, f))

const newPathOf = (abs) => {
  const ext = abs.match(EXT)?.[0] ?? ''
  const hit = moves.get(strip(abs)) ?? moves.get(abs)
  return hit ? hit + ext : abs
}
const SPEC =
  /((?:from|import)\s*\(?\s*|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*|require\(\s*)(['"])([^'"]+)\2/g

let specs = 0
const touched = []
for (const file of tracked) {
  const oldDir = dirname(file)
  const newDir = dirname(newPathOf(file))
  const src = readFileSync(file, 'utf8')
  let n = 0
  const out = src.replace(SPEC, (all, pre, q, spec) => {
    const [path, query] = spec.split('?')
    const alias = ALIAS.find(([a]) => path.startsWith(a))
    let target
    if (alias) target = join(alias[1], path.slice(alias[0].length))
    else if (path.startsWith('.')) target = resolve(oldDir, path)
    else return all // Paket
    const moved = newPathOf(target)
    let next
    if (alias) {
      if (moved === target) return all
      next = alias[0] + relative(alias[1], moved).replace(/\\/g, '/')
    } else {
      next = relative(newDir, moved).replace(/\\/g, '/')
      if (!next.startsWith('.')) next = './' + next
    }
    if (query) next += `?${query}`
    if (next === spec) return all
    n++
    console.log(`${relative(root, file)}: ${spec} -> ${next}`)
    return `${pre}${q}${next}${q}`
  })
  if (n) {
    specs += n
    touched.push([file, out])
  }
}

console.log(`\n${fileMoves.length} Dateien, ${specs} Importe in ${touched.length} Dateien`)
for (const [from, to] of fileMoves)
  console.log(`  ${relative(root, from)} -> ${relative(root, to)}`)
if (!apply) {
  console.log('\nNur Vorschau – mit --apply ausführen.')
  process.exit(0)
}
for (const [file, out] of touched) writeFileSync(file, out)
for (const [from, to] of fileMoves) {
  mkdirSync(dirname(to), { recursive: true })
  execFileSync('git', ['mv', relative(root, from), relative(root, to)], { cwd: root })
}
console.log('verschoben – jetzt typecheck, Tests und npm run check:refs')
