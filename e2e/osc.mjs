// OSC-Steuerung in der echten App: Kacheln aller Arten über „+ Widget“ anlegen, Learn (nächste
// eingehende Adresse), Schalter im Live-Modus, Befehle vom Handy und Feedback – gemessen an
// einem lokalen UDP-Empfänger (Ziel der App) und echten UDP-Paketen an den Feedback-Port.
// Zustand der Fläche über die Handy-Fernsteuerung (api/state), wie ihn das Handy sieht.

import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import { launchApp, openBrowserWindow, openRoute, portFree, runSteps, waitFor } from './harness.mjs'

const REMOTE_PORT = 18093
// Beschriftungen im Einfüge-Menü und die Arten dahinter (WIDGET_ORDER)
const LABELS = [
  'Fader',
  'Poti',
  'Schalter',
  'Taster',
  'Bank',
  'Auswahl',
  'Farbe',
  'XY-Pad',
  'Label',
  'Anzeige'
]
const KINDS = [
  'fader',
  'knob',
  'toggle',
  'button',
  'bank',
  'select',
  'color',
  'xy',
  'label',
  'meter'
]

/* ---- OSC lesen/schreiben (nur was die App sendet: f, i, s, T, F; auch #bundle) ---- */

function readStr(buf, at) {
  const end = buf.indexOf(0, at)
  return [buf.toString('utf8', at, end), (end + 4) & ~3]
}
function parseOsc(buf) {
  if (buf.toString('utf8', 0, 7) === '#bundle') {
    const out = []
    for (let at = 16; at < buf.length;) {
      const size = buf.readInt32BE(at)
      out.push(...parseOsc(buf.subarray(at + 4, at + 4 + size)))
      at += 4 + size
    }
    return out
  }
  let [address, at] = readStr(buf, 0)
  let tags
  ;[tags, at] = readStr(buf, at)
  const args = []
  for (const t of tags.slice(1)) {
    if (t === 'f') (args.push(buf.readFloatBE(at)), (at += 4))
    else if (t === 'i') (args.push(buf.readInt32BE(at)), (at += 4))
    else if (t === 's') [args[args.length], at] = readStr(buf, at)
    else if (t === 'T') args.push(true)
    else if (t === 'F') args.push(false)
  }
  return [{ address, args }]
}
function oscPacket(address, value) {
  const pad = (s) => {
    const b = Buffer.from(s + '\0')
    return Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)])
  }
  const f = Buffer.alloc(4)
  f.writeFloatBE(value)
  return Buffer.concat([pad(address), pad(',f'), f])
}

const close = (a, b) => Math.abs(a - b) < 1e-4

/** Potis einer Bank (Rechtecke aus der Seite) liegen in ihrer Kachel und überlappen sich nicht.
 *  Früher wurde ein Poti so breit, wie die Kachel hoch war: in der App ragte es in die
 *  Nachbarn, am Handy schob es die hinteren aus der Kachel. */
function assertKnobsFit({ tile, knobs }, where, count) {
  assert.equal(knobs.length, count, `${where}: ${count} Potis`)
  knobs.forEach((k, i) =>
    assert.ok(
      k.left >= tile.left - 0.5 && k.right <= tile.right + 0.5,
      `${where}: Poti ${i + 1} ragt aus der Kachel (${JSON.stringify({ tile, k })})`
    )
  )
  for (let i = 0; i < knobs.length; i++) {
    for (let j = i + 1; j < knobs.length; j++) {
      const [a, b] = [knobs[i], knobs[j]]
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      assert.ok(w <= 0.5 || h <= 0.5, `${where}: Potis ${i + 1} und ${j + 1} überlappen`)
    }
  }
}

/* ---- Aufbau: Ziel-Empfänger, freier Feedback-Port, App ---- */

const received = []
const rx = dgram.createSocket('udp4')
rx.on('message', (buf) => received.push(...parseOsc(buf)))
await new Promise((r) => rx.bind(0, '127.0.0.1', r))
const tx = dgram.createSocket('udp4')
const probe = dgram.createSocket('udp4')
await new Promise((r) => probe.bind(0, '127.0.0.1', r))
const fbPort = probe.address().port
await new Promise((r) => probe.close(r))

const ctx = await launchApp()
const { page } = ctx
const state = async () => (await fetch(`http://127.0.0.1:${REMOTE_PORT}/api/state`)).json()
const widget = async (type) => (await state()).widgets.find((w) => w.type === type)
const command = (cmd) =>
  fetch(`http://127.0.0.1:${REMOTE_PORT}/api/command`, {
    method: 'POST',
    body: JSON.stringify(cmd)
  })
const sentTo = (address) => received.filter((m) => m.address === address)
const feedback = (address, value) =>
  new Promise((r) => tx.send(oscPacket(address, value), fbPort, '127.0.0.1', r))

try {
  await runSteps('OSC-Steuerung', [
    [
      'Ziel, Feedback-Empfang und Handy-Fernsteuerung einrichten',
      async () => {
        assert.ok(await portFree(REMOTE_PORT), `Port ${REMOTE_PORT} belegt`)
        await page.setViewportSize({ width: 1500, height: 1000 })
        const st = await page.evaluate((c) => window.api.osc.setConfig(c), {
          host: '127.0.0.1',
          outPort: rx.address().port,
          inPort: fbPort,
          feedbackEnabled: true
        })
        assert.equal(st.outPort, rx.address().port)
        await openRoute(page, '/tool/osc-control')
        await page.evaluate((p) => window.api.osc.remoteStart(p), REMOTE_PORT)
        await waitFor(async () => (await state().catch(() => null))?.connected === true)
      }
    ],
    [
      'Neues, leeres Set (das Beispiel-Set hat schon fünf Kacheln)',
      async () => {
        const first = (await state()).currentSetId
        await page.getByRole('button', { name: 'Set hinzufügen' }).click()
        await waitFor(async () => {
          const s = await state()
          return s.currentSetId !== first && s.widgets.length === 0 && s.sets.length === 2
        })
      }
    ],
    [
      'Kacheln aller Arten über „+ Widget“ anlegen',
      async () => {
        for (const label of LABELS) {
          await page.getByRole('button', { name: 'Widget', exact: true }).click()
          const picker = page.getByText('Widget einfügen').locator('..')
          await picker.getByRole('button', { name: label, exact: true }).click()
        }
        await waitFor(async () => (await state()).widgets.length === KINDS.length)
        assert.deepEqual((await state()).widgets.map((w) => w.type).sort(), [...KINDS].sort())
      }
    ],
    [
      'Learn: die nächste eingehende Adresse landet in der gewählten Kachel',
      async () => {
        // zuletzt angelegt = gewählt: die Anzeige
        await page.getByRole('button', { name: 'Learn', exact: true }).click()
        await page.getByRole('button', { name: 'lernt…' }).waitFor()
        await feedback('/gelernt/adresse', 1)
        await waitFor(async () => (await widget('meter')).address === '/gelernt/adresse')
      }
    ],
    [
      'Bank: Hinzufügen-Knopf folgt dem Modus, hohe Potis bleiben in ihrer Spalte (App und Handy)',
      async () => {
        const drawer = page.getByTestId('settings-drawer')
        await page.locator('span[title="Bank"]').click()
        await drawer.getByRole('button', { name: 'Taster hinzufügen' }).waitFor()
        await drawer.getByRole('button', { name: 'Schalter', exact: true }).click()
        await drawer.getByRole('button', { name: 'Schalter hinzufügen' }).click()
        await drawer.getByRole('button', { name: 'Poti', exact: true }).click()
        await drawer.getByRole('button', { name: 'Poti hinzufügen' }).click()
        const height = drawer.getByLabel('Höhe (Zeilen)')
        await height.fill('16')
        await height.press('Enter')
        await waitFor(async () => {
          const b = await widget('bank')
          return b.bankMode === 'knob' && b.items.length === 5 && b.ch === 16
        })
        const { items } = await widget('bank')
        // Neuer Schalter steht auf „aus“ (früher 1 = schon an), neues Poti hat eine Poti-Adresse
        assert.equal(items[3].value, 0, 'neuer Schalter aus')
        assert.match(items[3].address, /\/btn\/4$/)
        assert.match(items[4].address, /\/knob\/5$/)

        const inApp = await page.evaluate(() => {
          const box = (el) => {
            const r = el.getBoundingClientRect()
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
          }
          const tile = document.querySelector('span[title="Bank"]').closest('.group')
          const knobs = [...tile.querySelectorAll('svg[viewBox="0 0 100 100"]')]
          return { tile: box(tile), knobs: knobs.map(box) }
        })
        assertKnobsFit(inApp, 'App', 5)

        const phone = await openBrowserWindow(ctx.app, `http://127.0.0.1:${REMOTE_PORT}/`)
        try {
          await waitFor(() =>
            phone.evaluate(() => document.querySelectorAll('.bknob svg').length === 5)
          )
          const onPhone = await phone.evaluate(() => {
            const box = (el) => {
              const r = el.getBoundingClientRect()
              return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
            }
            const knobs = [...document.querySelectorAll('.bknob svg')]
            return { tile: box(knobs[0].closest('.tile')), knobs: knobs.map(box) }
          })
          assertKnobsFit(onPhone, 'Handy', 5)
        } finally {
          await phone.close()
        }
      }
    ],
    [
      'Live: Schalter in der Oberfläche sendet OSC',
      async () => {
        await page.getByRole('button', { name: 'Live', exact: true }).click()
        const t = await widget('toggle')
        await page.getByRole('button', { name: 'AUS', exact: true }).click()
        await waitFor(() => sentTo(t.address).length > 0)
        assert.ok(close(sentTo(t.address).at(-1).args[0], 1), 'Schalter sendet 1')
        await waitFor(async () => (await widget('toggle')).value === 1)
        await page.getByRole('button', { name: 'AN', exact: true }).waitFor()
      }
    ],
    [
      'Handy: Fader, Taster, XY, Farbe und Auswahl kommen als OSC an',
      async () => {
        const [f, b, xy, c, s] = await Promise.all(
          ['fader', 'button', 'xy', 'color', 'select'].map((k) => widget(k))
        )
        await command({ kind: 'fader', id: f.id, value: 0.25 })
        await command({ kind: 'button', id: b.id, down: true })
        await command({ kind: 'xy', id: xy.id, x: 0.2, y: 0.8 })
        await command({ kind: 'color', id: c.id, r: 1, g: 0.5, b: 0, a: 1 })
        await command({ kind: 'select', id: s.id, index: 1 })
        await waitFor(() => sentTo(f.address).length > 0 && sentTo(s.address).length > 0)
        assert.ok(close(sentTo(f.address).at(-1).args[0], 0.25), 'Fader 0.25')
        assert.ok(close(sentTo(b.address).at(-1).args[0], 1), 'Taster 1')
        assert.ok(close(sentTo(xy.address).at(-1).args[0], 0.2), 'X 0.2')
        assert.ok(close(sentTo(xy.addressY).at(-1).args[0], 0.8), 'Y 0.8')
        assert.deepEqual(
          sentTo(c.address)
            .at(-1)
            .args.map((v) => Math.round(v * 100) / 100),
          [1, 0.5, 0, 1]
        )
        assert.ok(close(sentTo(s.address).at(-1).args[0], 1), 'Auswahl: Wert der Option B')
        // Den Stand fürs Handy meldet der Renderer nach dem OSC-Paket – abwarten statt einmal
        // lesen (macOS-CI, 17.10.2026: die Auswahl stand noch auf 0)
        const amHandy = async () => {
          const w = (await state()).widgets
          return {
            fader: w.find((x) => x.id === f.id).value,
            auswahl: w.find((x) => x.id === s.id).value
          }
        }
        const ok = await waitFor(async () => {
          const v = await amHandy()
          return close(v.fader, 0.25) && v.auswahl === 1
        }, 5000)
        assert.ok(ok, `am Handy: ${JSON.stringify(await amHandy())}`)
      }
    ],
    [
      'Feedback: eingehende Werte spiegeln sich in Fader, Schalter und XY',
      async () => {
        const [f, t, xy] = await Promise.all(['fader', 'toggle', 'xy'].map((k) => widget(k)))
        const before = received.length
        await feedback(f.address, 0.75)
        await feedback(t.address, 0)
        await feedback(xy.addressY, 0.1)
        await waitFor(async () => {
          const w = await state()
          const get = (id) => w.widgets.find((x) => x.id === id)
          return close(get(f.id).value, 0.75) && get(t.id).value === 0 && close(get(xy.id).y, 0.1)
        })
        await page.getByRole('button', { name: 'AUS', exact: true }).waitFor()
        assert.equal(received.length, before, 'Feedback wird nicht erneut gesendet')
      }
    ],
    [
      'Monitor zeigt gesendete und empfangene Adressen',
      async () => {
        const drawer = page.getByTestId('settings-drawer')
        await drawer.getByRole('button', { name: 'OSC-Monitor', exact: true }).click()
        const f = await widget('fader')
        await drawer.getByText(f.address).first().waitFor()
      }
    ]
  ])
} finally {
  await page.evaluate(() => window.api.osc.remoteStop()).catch(() => {})
  await ctx.close()
  rx.close()
  tx.close()
}
