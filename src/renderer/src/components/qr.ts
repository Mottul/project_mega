// Minimaler, dependency-freier QR-Encoder (Byte-Modus, EC-Level L, Version 1–4,
// Einzelblock). Reicht locker für kurze LAN-URLs (V4-L ~78 Bytes). Bewusst klein
// gehalten: keine Block-Verschachtelung (die gibt es bei V1–4/L nicht). Reed-
// Solomon, BCH-Formatinfo und Maskenwahl werden zur Laufzeit berechnet.

interface VersionSpec {
  size: number
  centers: number[] // Ausrichtungsmuster-Zentren (inkl. 6)
  data: number // Daten-Codewörter (Level L)
  ec: number // EC-Codewörter (Level L)
}

const VERSIONS: Record<number, VersionSpec> = {
  1: { size: 21, centers: [], data: 19, ec: 7 },
  2: { size: 25, centers: [6, 18], data: 34, ec: 10 },
  3: { size: 29, centers: [6, 22], data: 55, ec: 15 },
  4: { size: 33, centers: [6, 26], data: 80, ec: 20 }
}

// ---- Galois-Feld GF(256), primitives Polynom 0x11d ----
const EXP = new Array<number>(512)
const LOG = new Array<number>(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

// Generatorpolynom, Koeffizienten höchster Grad zuerst (Leitkoeffizient gen[0]=1).
function rsGenerator(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    // poly * (x + α^i)
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j] // x·poly
      next[j + 1] ^= gfMul(poly[j], EXP[i]) // α^i·poly
    }
    poly = next
  }
  return poly
}

// Reed-Solomon EC-Codewörter per synthetischer Division (Standardform).
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGenerator(ecLen)
  const res = new Array<number>(data.length + ecLen).fill(0)
  for (let i = 0; i < data.length; i++) res[i] = data[i]
  for (let i = 0; i < data.length; i++) {
    const coef = res[i]
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef)
    }
  }
  return res.slice(data.length)
}

function encodeData(text: string, spec: VersionSpec): number[] {
  const bytes = Array.from(new TextEncoder().encode(text))
  const bits: number[] = []
  const push = (val: number, len: number): void => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  push(0b0100, 4) // Byte-Modus
  push(bytes.length, 8) // Zeichenzahl (Version 1–9: 8 Bit)
  for (const b of bytes) push(b, 8)
  // Terminator + auf volle Bytes auffüllen
  const cap = spec.data * 8
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)
  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]
    codewords.push(byte)
  }
  const pad = [0xec, 0x11]
  let p = 0
  while (codewords.length < spec.data) codewords.push(pad[p++ % 2])
  return codewords
}

type Grid = { m: (number | null)[][]; fn: boolean[][]; size: number }

function newGrid(size: number): Grid {
  return {
    size,
    m: Array.from({ length: size }, () => new Array<number | null>(size).fill(null)),
    fn: Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  }
}

function setFn(g: Grid, r: number, c: number, v: number): void {
  g.m[r][c] = v
  g.fn[r][c] = true
}

function placeFinder(g: Grid, r: number, c: number): void {
  for (let i = -1; i <= 7; i++) {
    for (let j = -1; j <= 7; j++) {
      const rr = r + i
      const cc = c + j
      if (rr < 0 || rr >= g.size || cc < 0 || cc >= g.size) continue
      const inRing = i >= 0 && i <= 6 && j >= 0 && j <= 6
      const dark =
        inRing &&
        (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4))
      setFn(g, rr, cc, dark ? 1 : 0)
    }
  }
}

function placeAlignment(g: Grid, cr: number, cc: number): void {
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const dark = Math.max(Math.abs(i), Math.abs(j)) !== 1
      setFn(g, cr + i, cc + j, dark ? 1 : 0)
    }
  }
}

function buildFunctionPatterns(g: Grid, spec: VersionSpec): void {
  const s = g.size
  placeFinder(g, 0, 0)
  placeFinder(g, 0, s - 7)
  placeFinder(g, s - 7, 0)
  // Timing
  for (let i = 8; i < s - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0
    if (!g.fn[6][i]) setFn(g, 6, i, v)
    if (!g.fn[i][6]) setFn(g, i, 6, v)
  }
  // Ausrichtungsmuster (nicht über Findern)
  const c = spec.centers
  for (const r of c) {
    for (const col of c) {
      if (
        (r === 6 && col === 6) ||
        (r === 6 && col === c[c.length - 1]) ||
        (r === c[c.length - 1] && col === 6)
      )
        continue
      placeAlignment(g, r, col)
    }
  }
  // Dunkelmodul
  setFn(g, s - 8, 8, 1)
  // Formatbereiche reservieren (2×15 Module, exakt nach Standard) – Werte in placeFormat.
  for (let i = 0; i <= 8; i++) {
    if (!g.fn[8][i]) setFn(g, 8, i, 0)
    if (!g.fn[i][8]) setFn(g, i, 8, 0)
  }
  for (let i = 0; i <= 7; i++) {
    if (!g.fn[8][s - 1 - i]) setFn(g, 8, s - 1 - i, 0)
    if (!g.fn[s - 1 - i][8]) setFn(g, s - 1 - i, 8, 0)
  }
}

// Zickzack-Platzierung der Datenbits (Spaltenpaare von rechts, Timing-Spalte 6
// übersprungen) – exakt nach Standardreihenfolge (Nayuki-Referenz).
function placeData(g: Grid, bits: number[]): void {
  const s = g.size
  let idx = 0
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < s; vert++) {
      for (let t = 0; t < 2; t++) {
        const cc = right - t
        const upward = ((right + 1) & 2) === 0
        const row = upward ? s - 1 - vert : vert
        if (g.fn[row][cc]) continue
        g.m[row][cc] = idx < bits.length ? bits[idx] : 0
        idx++
      }
    }
  }
}

function maskFn(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0
    case 1:
      return r % 2 === 0
    case 2:
      return c % 3 === 0
    case 3:
      return (r + c) % 3 === 0
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function applyMask(g: Grid, mask: number): number[][] {
  const out = g.m.map((row) => row.map((v) => v ?? 0))
  for (let r = 0; r < g.size; r++)
    for (let c = 0; c < g.size; c++) if (!g.fn[r][c] && maskFn(mask, r, c)) out[r][c] ^= 1
  return out
}

// 15-Bit-Formatinfo (Level L=0b01 + Maske), BCH(0x537) + Maske 0x5412.
// Rückgabe LSB-indiziert: arr[i] = Bit i.
function formatBits(mask: number): number[] {
  const data = (0b01 << 3) | mask // 5 Bit
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  const arr: number[] = []
  for (let i = 0; i < 15; i++) arr.push((bits >> i) & 1)
  return arr
}

// Formatinfo in beide Kopien schreiben – exakte Modulzuordnung nach Standard.
function placeFormat(matrix: number[][], size: number, mask: number): void {
  const f = formatBits(mask) // f[i] = Bit i
  for (let i = 0; i < 15; i++) {
    const mod = f[i]
    // vertikale Kopie (Spalte 8)
    if (i < 6) matrix[i][8] = mod
    else if (i < 8) matrix[i + 1][8] = mod
    else matrix[size - 15 + i][8] = mod
    // horizontale Kopie (Reihe 8)
    if (i < 8) matrix[8][size - i - 1] = mod
    else if (i < 9) matrix[8][7] = mod
    else matrix[8][15 - i - 1] = mod
  }
  matrix[size - 8][8] = 1 // Dunkelmodul
}

function penalty(matrix: number[][], size: number): number {
  let score = 0
  // Regel 1: 5+ gleiche in Reihe (horizontal + vertikal)
  for (let r = 0; r < size; r++) {
    for (let dir = 0; dir < 2; dir++) {
      let run = 1
      for (let c = 1; c < size; c++) {
        const a = dir === 0 ? matrix[r][c] : matrix[c][r]
        const b = dir === 0 ? matrix[r][c - 1] : matrix[c - 1][r]
        if (a === b) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else run = 1
      }
    }
  }
  // Regel 2: 2x2-Blöcke
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++) {
      const v = matrix[r][c]
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) score += 3
    }
  // Regel 3: Finder-ähnliche Muster
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
  const check = (line: number[]): number => {
    let s = 0
    for (let i = 0; i + 11 <= line.length; i++) {
      let m1 = true
      let m2 = true
      for (let k = 0; k < 11; k++) {
        if (line[i + k] !== pat1[k]) m1 = false
        if (line[i + k] !== pat2[k]) m2 = false
      }
      if (m1 || m2) s += 40
    }
    return s
  }
  for (let r = 0; r < size; r++) {
    score += check(matrix[r])
    score += check(matrix.map((row) => row[r]))
  }
  // Regel 4: Dunkelanteil
  let dark = 0
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += matrix[r][c]
  const ratio = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10
  return score
}

/** Erzeugt die QR-Matrix (true = dunkel) für kurzen Text, oder null bei zu langem Text. */
export function qrMatrix(text: string): boolean[][] | null {
  const byteLen = new TextEncoder().encode(text).length
  let version = 0
  for (const v of [1, 2, 3, 4]) {
    if (byteLen + 2 <= VERSIONS[v].data) {
      version = v
      break
    }
  }
  if (!version) return null
  const spec = VERSIONS[version]

  const dataCw = encodeData(text, spec)
  const ecCw = rsEncode(dataCw, spec.ec)
  const all = [...dataCw, ...ecCw]
  const bits: number[] = []
  for (const cw of all) for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1)

  const g = newGrid(spec.size)
  buildFunctionPatterns(g, spec)
  placeData(g, bits)

  let best: number[][] | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    const matrix = applyMask(g, mask)
    placeFormat(matrix, spec.size, mask)
    const sc = penalty(matrix, spec.size)
    if (sc < bestScore) {
      bestScore = sc
      best = matrix
    }
  }
  return best ? best.map((row) => row.map((v) => v === 1)) : null
}
