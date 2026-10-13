// Große Datei nach Deklarationsnamen in Module teilen – Code und Kommentare wörtlich, Importe
// genau: Der TypeScript-Checker löst jeden Bezeichner auf (keine Textsuche), jedes neue Modul
// bekommt nur die Importe, die es braucht, Deklarationen, die ein anderes Modul nutzt, ein
// `export`. Die Ausgangsdatei behält ihren Kopfkommentar und alles, was nicht verschoben wird.
//
//   node .claude/skills/aufraeumen/teilen.mjs plan.json            # Vorschau: Module, Bezüge
//   node .claude/skills/aufraeumen/teilen.mjs plan.json --apply    # schreiben
//
// plan.json (Dateien relativ zum Ordner der Quelle):
//   { "source": "src/…/Gross.tsx", "tsconfig": "tsconfig.web.json",
//     "modules": [ { "file": "Teil.tsx", "header": "// Wozu …", "names": ["A", "B"] } ] }
//
// Neue Module dürfen nicht aus der Quelle importieren (Kreis: memo()/createContext() auf
// Modulebene wären beim Laden undefiniert) – solche Namen meldet die Vorschau, dann gehören sie
// mit in ein Modul. Danach: npx prettier --write, typecheck, lint, texte.mjs.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const [planPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const apply = process.argv.includes('--apply')
if (!planPath) {
  console.error('Aufruf: teilen.mjs plan.json [--apply]')
  process.exit(2)
}
const plan = JSON.parse(readFileSync(planPath, 'utf8'))
const srcPath = resolve(root, plan.source)
const srcDir = dirname(srcPath)

const cfg = ts.getParsedCommandLineOfConfigFile(
  join(root, plan.tsconfig ?? 'tsconfig.web.json'),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    }
  }
)
const program = ts.createProgram([srcPath], cfg.options)
const checker = program.getTypeChecker()
const sf = program.getSourceFiles().find((f) => resolve(f.fileName) === srcPath)
if (!sf) throw new Error(`Quelle nicht gefunden: ${srcPath}`)
const text = sf.text

// --- Top-Level: Importe (je Bindung) und Deklarationen (je Name) ---
const imports = new Map() // Symbol -> { local, imported, module, typeOnly, ns }
const sideEffectImports = []
const decls = [] // { st, names, syms, isType }
const ownerOf = new Map() // Symbol -> decl

for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) {
    const module = st.moduleSpecifier.text
    const clause = st.importClause
    if (!clause) {
      sideEffectImports.push(st)
      continue
    }
    const add = (nameNode, info) => imports.set(checker.getSymbolAtLocation(nameNode), info)
    if (clause.name) {
      add(clause.name, {
        local: clause.name.text,
        imported: 'default',
        module,
        typeOnly: clause.isTypeOnly
      })
    }
    const nb = clause.namedBindings
    if (nb && ts.isNamespaceImport(nb))
      add(nb.name, { local: nb.name.text, module, ns: true, typeOnly: clause.isTypeOnly })
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) {
        add(el.name, {
          local: el.name.text,
          imported: el.propertyName?.text ?? el.name.text,
          module,
          typeOnly: clause.isTypeOnly || el.isTypeOnly
        })
      }
    }
    continue
  }
  const nameNodes = []
  if (ts.isVariableStatement(st)) {
    for (const d of st.declarationList.declarations)
      if (ts.isIdentifier(d.name)) nameNodes.push(d.name)
  } else if (st.name && ts.isIdentifier(st.name)) {
    nameNodes.push(st.name)
  }
  const decl = {
    st,
    names: nameNodes.map((n) => n.text),
    syms: nameNodes.map((n) => checker.getSymbolAtLocation(n)),
    isType: ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st),
    exported:
      Boolean(ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Export) ||
      (ts.canHaveModifiers(st) &&
        ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
  }
  decls.push(decl)
  for (const s of decl.syms) if (s) ownerOf.set(s, decl)
}

// Ein Name, der zugleich importiert und deklariert ist (Icon `Send` aus lucide-react neben
// `type Send`): In einer Datei verschmilzt TypeScript beide, getrennt wären es doppelte Namen.
// Vor dem Teilen umbenennen (OSC-Steuerung: `type SendFn`).
const merged = decls.flatMap((d) => d.syms.filter((s) => s && imports.has(s)).map((s) => s.name))
if (merged.length) {
  console.error(`Zugleich importiert und deklariert – erst umbenennen: ${merged.join(', ')}`)
  process.exit(1)
}

// --- Bezüge je Deklaration (über den Checker, nicht über Text) ---
function refsOf(node, own) {
  const out = new Set()
  const visit = (n) => {
    if (ts.isIdentifier(n)) {
      let sym = checker.getSymbolAtLocation(n)
      if (ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n) {
        sym = checker.getShorthandAssignmentValueSymbol(n.parent)
      }
      if (sym && !own.includes(sym) && (imports.has(sym) || ownerOf.has(sym))) out.add(sym)
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}
for (const d of decls) d.refs = refsOf(d.st, d.syms)

// --- Zuordnung ---
const SOURCE = '<quelle>'
const moduleOf = new Map() // decl -> Moduldatei
const byName = new Map(decls.flatMap((d) => d.names.map((n) => [n, d])))
for (const m of plan.modules) {
  for (const name of m.names) {
    const d = byName.get(name)
    if (!d) throw new Error(`${m.file}: „${name}“ gibt es in der Quelle nicht auf oberster Ebene`)
    if (moduleOf.has(d) && moduleOf.get(d) !== m.file)
      throw new Error(`„${name}“ zweimal zugeordnet`)
    moduleOf.set(d, m.file)
  }
}
const modOf = (d) => moduleOf.get(d) ?? SOURCE
const fileOf = (mod) => (mod === SOURCE ? srcPath : join(srcDir, mod))
const specFor = (fromFile, toFile) => {
  let s = relative(dirname(fromFile), toFile)
    .replace(/\\/g, '/')
    .replace(/\.(tsx?|mjs|js)$/, '')
  return s.startsWith('.') ? s : './' + s
}

// --- Module bauen ---
const needsExport = new Set()
const problems = []
const edges = new Map() // mod -> Set(mod)
function build(mod) {
  const file = fileOf(mod)
  const mine = decls.filter((d) => modOf(d) === mod)
  const used = new Set(mine.flatMap((d) => [...d.refs]))
  const groups = new Map() // spec -> { def, ns, named: [] }
  const group = (spec) => {
    if (!groups.has(spec)) groups.set(spec, { def: null, ns: null, named: [], typeOnlyAll: true })
    return groups.get(spec)
  }
  // Reihenfolge der ursprünglichen Importe beibehalten, dann die neuen Module
  for (const [sym, info] of imports) {
    if (!used.has(sym)) continue
    let spec = info.module
    if (spec.startsWith('.')) spec = specFor(file, resolve(srcDir, spec))
    const g = group(spec)
    if (info.ns) g.ns = info.local
    else if (info.imported === 'default') g.def = info.local
    else
      g.named.push({
        text: info.imported === info.local ? info.local : `${info.imported} as ${info.local}`,
        typeOnly: info.typeOnly
      })
    if (!info.typeOnly) g.typeOnlyAll = false
  }
  for (const sym of used) {
    const d = ownerOf.get(sym)
    if (!d || modOf(d) === mod) continue
    const other = modOf(d)
    if (other === SOURCE && mod !== SOURCE)
      problems.push(`${mod} braucht „${sym.name}“ aus der Quelle`)
    if (!edges.has(mod)) edges.set(mod, new Set())
    edges.get(mod).add(other)
    needsExport.add(d)
    const g = group(specFor(file, fileOf(other)))
    g.named.push({ text: sym.name, typeOnly: d.isType })
    g.sorted = true
    if (!d.isType) g.typeOnlyAll = false
  }
  // Importe aus den neuen Modulen alphabetisch (sonst in der Reihenfolge der ersten Nutzung)
  for (const g of groups.values()) {
    if (g.sorted)
      g.named.sort((a, b) => a.text.localeCompare(b.text, 'en', { sensitivity: 'base' }))
  }
  const lines = []
  for (const [spec, g] of groups) {
    const named = g.named.length
      ? `{ ${g.named.map((n) => (n.typeOnly && !g.typeOnlyAll ? `type ${n.text}` : n.text)).join(', ')} }`
      : ''
    const typeKw = g.typeOnlyAll && !g.def && !g.ns ? 'type ' : ''
    const parts = [g.def, g.ns ? `* as ${g.ns}` : null, named || null].filter(Boolean)
    lines.push(`import ${typeKw}${parts.join(', ')} from '${spec}'`)
  }
  return { file, mine, importLines: lines }
}

const mods = [SOURCE, ...plan.modules.map((m) => m.file)]
const built = new Map(mods.map((m) => [m, build(m)]))

function declText(d) {
  let t = text.slice(d.st.getFullStart(), d.st.end)
  if (needsExport.has(d) && !d.exported) {
    const at = d.st.getStart(sf) - d.st.getFullStart()
    t = t.slice(0, at) + 'export ' + t.slice(at)
  }
  return t
}

function render(mod) {
  const { mine, importLines } = built.get(mod)
  if (mod === SOURCE) {
    const first = sf.statements[0]
    const header = text.slice(0, first.getStart(sf))
    const side = sideEffectImports.map((s) => text.slice(s.getStart(sf), s.end))
    const body = mine.map(declText).join('')
    const tail = text.slice(sf.statements[sf.statements.length - 1].end)
    return `${header}${[...importLines, ...side].join('\n')}\n${body}${tail}`
  }
  const m = plan.modules.find((x) => x.file === mod)
  const body = mine
    .map(declText)
    .join('')
    .replace(/^\s*\n/, '')
  return `${m.header ? m.header.trimEnd() + '\n\n' : ''}${importLines.join('\n')}\n\n${body}\n`
}

// --- Bericht ---
for (const mod of mods) {
  const out = render(mod)
  const { mine, file } = built.get(mod)
  const deps = [...(edges.get(mod) ?? [])].map((x) => (x === SOURCE ? 'Quelle' : x))
  console.log(
    `${relative(root, file)}: ${out.split('\n').length} Zeilen, ${mine.length} Deklarationen` +
      (deps.length ? ` – nutzt ${deps.join(', ')}` : '')
  )
}
// Kreise zwischen neuen Modulen
for (const [a, outs] of edges)
  for (const b of outs) if (edges.get(b)?.has(a) && a < b) problems.push(`Kreis: ${a} ↔ ${b}`)
if (problems.length) {
  console.log('\nProbleme:')
  for (const p of [...new Set(problems)]) console.log('  ' + p)
}
if (!apply) {
  console.log('\nNur Vorschau – mit --apply schreiben.')
  process.exit(problems.length ? 1 : 0)
}
if (problems.length) {
  console.error('\nNicht geschrieben – erst die Probleme lösen.')
  process.exit(1)
}
for (const mod of mods) {
  const file = fileOf(mod)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, render(mod))
}
console.log('\ngeschrieben – jetzt prettier, typecheck, lint, texte.mjs')
