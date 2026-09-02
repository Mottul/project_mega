/**
 * Rauchtest im echten Browser: startet den Build, klickt sich durch Titel und
 * Menü in ein Rennen und prüft, dass nichts in der Konsole explodiert und
 * tatsächlich Bild entsteht. Fängt genau die Fehler, die ein Typcheck nicht
 * sieht (Canvas-APIs, Audio, Renderschleife).
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const SHOTS = join(ROOT, 'screenshots')
const PORT = 4173

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

if (!existsSync(DIST)) {
  console.error('dist/ fehlt - zuerst "npm run build" ausführen.')
  process.exit(1)
}

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  const rel = url === '/' ? '/index.html' : url
  const file = normalize(join(DIST, rel))
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end()
    return
  }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
})

await new Promise((resolve) => server.listen(PORT, resolve))

// PLAYWRIGHT_CHROMIUM_PATH erlaubt es, einen bereits vorhandenen Browser zu
// nutzen (CI-Images, Sandboxes) statt einen eigenen herunterzuladen.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'] }
    : {}
)
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })

const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(String(err)))

mkdirSync(SHOTS, { recursive: true })

async function shot(name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

// Zwischen zwei Tastendrücken muss mindestens ein Frame liegen, sonst fasst
// das Menü sie zu einer Eingabe zusammen.
const tap = async (key) => {
  await page.keyboard.press(key)
  await page.waitForTimeout(90)
}

const step = async (label, fn) => {
  await fn()
  console.log('  ✓', label)
}

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  await step('Titelbild', () => shot('01-titel'))

  await step('Menü öffnen', async () => {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    await shot('02-menue')
  })

  await step('Rennen starten', async () => {
    // "RENNEN STARTEN" ist der fünfte Eintrag.
    for (let i = 0; i < 4; i++) await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(1200)
    await shot('03-start')
  })

  await step('Fahren', async () => {
    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(3500)
    await shot('04-rennen')
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(1200)
    await page.keyboard.up('ArrowRight')
    await page.keyboard.up('ArrowUp')
    await shot('05-kurve')
  })

  // Prüfen, dass wirklich gerendert wird (nicht nur schwarzes Bild).
  const variety = await page.evaluate(() => {
    const canvas = document.getElementById('screen')
    const ctx = canvas.getContext('2d')
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const seen = new Set()
    for (let i = 0; i < data.length; i += 4 * 997) {
      seen.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`)
    }
    return seen.size
  })
  if (variety < 12) throw new Error(`Bild wirkt leer (nur ${variety} Farbklassen)`)
  console.log('  ✓ Bildinhalt vorhanden:', variety, 'Farbklassen')

  await step('2-Spieler-Splitscreen', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await tap('ArrowDown')
    await tap('ArrowDown')
    await tap('Enter') // Hauptmenü
    await page.waitForTimeout(300)
    await tap('ArrowRight') // Spieler = 2
    for (let i = 0; i < 4; i++) await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(2000)
    await shot('06-splitscreen')
  })

  await step('4-Spieler-Viererraster', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await tap('ArrowDown')
    await tap('ArrowDown')
    await tap('Enter') // Hauptmenü
    await page.waitForTimeout(300)
    await tap('ArrowRight')
    await tap('ArrowRight') // Spieler = 4
    for (let i = 0; i < 4; i++) await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(2200)
    await shot('07-vier-spieler')
  })

  await step('Zufallsstrecke', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await tap('ArrowDown')
    await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(300)
    await tap('ArrowLeft')
    await tap('ArrowLeft')
    await tap('ArrowLeft') // zurück auf 1 Spieler
    await tap('ArrowDown')
    await tap('ArrowDown')
    await tap('ArrowDown') // Strecke wählen
    await tap('Enter')
    await page.waitForTimeout(300)
    // Hinter der Streckenliste liegt die Zufallsstrecke.
    for (let i = 0; i < 6; i++) await tap('ArrowRight')
    await tap('ArrowDown')
    await tap('ArrowDown')
    await tap('Enter') // neu würfeln
    await page.waitForTimeout(200)
    await shot('08-zufallsstrecke-menue')
    await tap('ArrowDown')
    await tap('Enter') // starten
    await page.waitForTimeout(2500)
    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(2000)
    await page.keyboard.up('ArrowUp')
    await shot('09-zufallsstrecke')
  })

  await step('Controller-Seite', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await tap('ArrowDown')
    await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(300)
    for (let i = 0; i < 7; i++) await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(300)
    await shot('10-controller')

    // Ein Gamepad lässt sich hier nicht anstecken - also eins vortäuschen.
    // Bewusst ohne Standard-Layout und mit Hat-Achse, wie viele USB-Pads.
    await page.evaluate(() => {
      const pad = {
        index: 0,
        id: 'Test USB Pad (Vendor: 0001 Product: 0002)',
        mapping: '',
        connected: true,
        timestamp: 0,
        axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3.28],
        buttons: Array.from({ length: 12 }, () => ({ pressed: false, touched: false, value: 0 })),
      }
      window.__pad = pad
      navigator.getGamepads = () => [pad]
    })
    await page.waitForTimeout(300)
    await shot('11-controller-pad')

    const detected = await page.evaluate(() => document.title !== '')
    if (!detected) throw new Error('Seite reagiert nicht mehr')

    await step('Belegung anlernen', async () => {
      await tap('Enter') // BELEGUNG ANLERNEN
      await page.waitForTimeout(200)
      for (const button of [3, 2, 1, 0]) {
        await page.evaluate((b) => {
          window.__pad.buttons[b].pressed = true
        }, button)
        await page.waitForTimeout(120)
        await page.evaluate((b) => {
          window.__pad.buttons[b].pressed = false
        }, button)
        await page.waitForTimeout(120)
      }
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('super-kart:settings') ?? '{}')
      )
      const learned = stored.padBindings?.['Test USB Pad']
      const expected = { accel: 3, brake: 2, drift: 1, item: 0 }
      if (JSON.stringify(learned) !== JSON.stringify(expected)) {
        throw new Error(`Belegung nicht gespeichert: ${JSON.stringify(learned)}`)
      }
    })

    await page.evaluate(() => {
      navigator.getGamepads = () => []
    })
    await tap('Escape')
  })

  await step('Battle-Modus', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await tap('ArrowDown')
    await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(300)
    await tap('ArrowDown') // Modus
    await tap('ArrowRight') // Battle
    for (let i = 0; i < 3; i++) await tap('ArrowDown')
    await tap('Enter')
    await page.waitForTimeout(2500)
    await shot('12-battle')
  })
} catch (err) {
  errors.push(`Ablauf abgebrochen: ${err.message}`)
} finally {
  await browser.close()
  server.close()
}

if (errors.length) {
  console.error('\nFehler im Rauchtest:')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}
console.log('\nRauchtest bestanden. Screenshots in screenshots/')
