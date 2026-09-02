// Erzeugt die PWA-Icons ohne externe Abhängigkeit (eigener Mini-PNG-Encoder).
// So bleibt der Build reproduzierbar und das Repo frei von Binär-Assets, die
// niemand mehr nachbauen kann.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'icons')

// ---------------------------------------------------------------- PNG-Encoder

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // Filter "None"
    rgba.copy
      ? rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------- Mini-Rasterizer

class Canvas {
  constructor(size) {
    this.size = size
    this.data = Buffer.alloc(size * size * 4)
  }

  blend(x, y, [r, g, b], a = 1) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size || a <= 0) return
    const i = (y * this.size + x) * 4
    const inv = 1 - a
    this.data[i] = this.data[i] * inv + r * a
    this.data[i + 1] = this.data[i + 1] * inv + g * a
    this.data[i + 2] = this.data[i + 2] * inv + b * a
    this.data[i + 3] = Math.min(255, this.data[i + 3] * inv + 255 * a)
  }

  /** Füllt eine Fläche über eine Vorzeichen-Distanzfunktion - gratis Antialiasing. */
  fillSdf(sdf, color, alpha = 1) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const d = sdf(x + 0.5, y + 0.5)
        if (d > 1) continue
        const cov = Math.min(1, Math.max(0, 0.5 - d))
        this.blend(x, y, color, cov * alpha)
      }
    }
  }
}

const roundedBox = (s, radius) => (x, y) => {
  const dx = Math.abs(x - s / 2) - (s / 2 - radius)
  const dy = Math.abs(y - s / 2) - (s / 2 - radius)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - radius
}

const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r

const box = (cx, cy, hw, hh) => (x, y) => {
  const dx = Math.abs(x - cx) - hw
  const dy = Math.abs(y - cy) - hh
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
}

/**
 * Motiv: Zielflagge im Hintergrund, davor ein Kart von hinten - erkennbar
 * auch bei 32 px.
 */
function drawIcon(size, { padding = 0 } = {}) {
  const c = new Canvas(size)
  const u = size / 100 // Einheit: Prozent der Kantenlänge
  const inset = padding * size

  // Hintergrund mit vertikalem Verlauf (Nachthimmel über Asphalt).
  const bg = roundedBox(size, padding > 0 ? size / 2 : size * 0.22)
  for (let y = 0; y < size; y++) {
    const t = y / size
    const col = [26 + t * 30, 20 + t * 18, 58 + t * 40]
    for (let x = 0; x < size; x++) {
      const d = bg(x + 0.5, y + 0.5)
      if (d > 1) continue
      c.blend(x, y, col, Math.min(1, Math.max(0, 0.5 - d)))
    }
  }

  // Straße als Trapez in Fluchtpunkt-Perspektive.
  const horizon = inset + size * 0.42
  for (let y = Math.floor(horizon); y < size - inset; y++) {
    const t = (y - horizon) / (size - inset - horizon)
    const halfW = size * (0.06 + t * 0.46)
    const shade = 62 + t * 26
    for (let x = 0; x < size; x++) {
      if (Math.abs(x + 0.5 - size / 2) > halfW) continue
      const inBg = bg(x + 0.5, y + 0.5) <= 0
      if (!inBg) continue
      // Streifen in der Mitte
      const stripe = Math.abs(x + 0.5 - size / 2) < halfW * 0.06 && Math.floor(t * 7) % 2 === 0
      c.blend(x, y, stripe ? [240, 220, 90] : [shade, shade, shade + 8], 1)
    }
  }

  // Zielflagge oberhalb des Horizonts.
  const flagY = inset + size * 0.16
  const cell = Math.max(2, Math.round(size * 0.055))
  for (let y = Math.floor(flagY); y < flagY + cell * 3; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.abs(x + 0.5 - size / 2) > size * 0.28) continue
      if (bg(x + 0.5, y + 0.5) > 0) continue
      const cx = Math.floor((x - size / 2 + size * 0.28) / cell)
      const cy = Math.floor((y - flagY) / cell)
      const light = (cx + cy) % 2 === 0
      c.blend(x, y, light ? [245, 245, 250] : [22, 22, 30], 1)
    }
  }

  // Kart: Karosserie, Spoiler, Reifen, Helm.
  const kx = size / 2
  const ky = size - inset - 26 * u
  c.fillSdf(box(kx - 26 * u, ky + 4 * u, 9 * u, 9 * u), [18, 18, 24])
  c.fillSdf(box(kx + 26 * u, ky + 4 * u, 9 * u, 9 * u), [18, 18, 24])
  c.fillSdf(box(kx, ky, 22 * u, 12 * u), [228, 46, 62])
  c.fillSdf(box(kx, ky - 12 * u, 26 * u, 3.5 * u), [255, 210, 60]) // Spoiler
  c.fillSdf(circle(kx, ky - 4 * u, 9 * u), [250, 236, 210]) // Helm
  c.fillSdf(box(kx, ky - 6 * u, 9 * u, 3 * u), [40, 120, 220]) // Visier
  c.fillSdf(box(kx, ky + 9 * u, 20 * u, 3 * u), [140, 20, 34], 0.9) // Schatten unten

  return encodePng(size, size, c.data)
}

mkdirSync(OUT, { recursive: true })
const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { padding: 0.12 }],
  ['apple-touch-icon.png', 180, {}],
  ['favicon-32.png', 32, {}],
]
for (const [name, size, opts] of jobs) {
  writeFileSync(join(OUT, name), drawIcon(size, opts))
  console.log('icon:', name, `${size}x${size}`)
}
