// Kein Skript: Empfänger für den Heimnetz-Stream (stream.mjs). Liest MPEG-TS über HTTP wie die
// Heimkino-Box und schreibt je Bild bzw. Tonblock die Ankunftszeit und den Zeitstempel (PTS) mit.
// Daraus ergibt sich, ob die Zeit im Strom mit der Uhr läuft: Fehlt dem Sender Zeit (Bilder
// ausgelassen, Hänger), kommen die Bilder danach dauerhaft später an, als ihr PTS sagt – der
// Puffer des Empfängers läuft leer, er stockt (Fehler aus Stufe 1, gemeldet am 21.11.2026).

import { spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import http from 'node:http'

const TS = 188
const PTS_WRAP = 2 ** 33

/** PTS (33 Bit, 90 kHz) aus den fünf Bytes des PES-Kopfs – ohne Bit-Operatoren über 32 Bit. */
function readPts(b, o) {
  return (
    ((b[o] >> 1) & 0x07) * 2 ** 30 +
    b[o + 1] * 2 ** 22 +
    (b[o + 2] >> 1) * 2 ** 15 +
    b[o + 3] * 2 ** 7 +
    (b[o + 4] >> 1)
  )
}

/**
 * Zerlegt TS-Pakete: PAT -> PMT -> Video- und Ton-PID, je PES-Beginn der PTS. `onPes(art, pts)`
 * mit art 'video' | 'audio'. Liefert eine Funktion, die Datenstücke beliebiger Größe annimmt.
 */
export function tsParser(onPes) {
  let rest = Buffer.alloc(0)
  let pmtPid = -1
  const art = new Map() // PID -> 'video' | 'audio'

  function section(payload, pusi) {
    // Tabellen beginnen hinter dem pointer_field; ffmpeg schreibt jede in ein Paket.
    if (!pusi) return null
    const start = 1 + payload[0]
    return payload.subarray(start)
  }

  function packet(p) {
    const pusi = (p[1] & 0x40) !== 0
    const pid = ((p[1] & 0x1f) << 8) | p[2]
    const afc = (p[3] >> 4) & 0x03
    if (afc === 0 || afc === 2) return // kein Inhalt
    const offset = afc === 3 ? 5 + p[4] : 4
    if (offset >= TS) return
    const payload = p.subarray(offset)
    if (pid === 0) {
      const s = section(payload, pusi)
      if (!s || s[0] !== 0x00) return
      const len = ((s[1] & 0x0f) << 8) | s[2]
      for (let i = 8; i + 4 <= 3 + len - 4; i += 4) {
        const program = (s[i] << 8) | s[i + 1]
        if (program !== 0) pmtPid = ((s[i + 2] & 0x1f) << 8) | s[i + 3]
      }
      return
    }
    if (pid === pmtPid) {
      const s = section(payload, pusi)
      if (!s || s[0] !== 0x02) return
      const len = ((s[1] & 0x0f) << 8) | s[2]
      const infoLen = ((s[10] & 0x0f) << 8) | s[11]
      let i = 12 + infoLen
      const ende = 3 + len - 4 // ohne CRC
      while (i + 5 <= ende) {
        const typ = s[i]
        const esPid = ((s[i + 1] & 0x1f) << 8) | s[i + 2]
        const esInfo = ((s[i + 3] & 0x0f) << 8) | s[i + 4]
        // 0x1b H.264, 0x24 HEVC; 0x0f AAC (ADTS), 0x11 AAC (LATM), 0x03/0x04 MPEG-Audio
        if (typ === 0x1b || typ === 0x24) art.set(esPid, 'video')
        else if ([0x0f, 0x11, 0x03, 0x04].includes(typ)) art.set(esPid, 'audio')
        i += 5 + esInfo
      }
      return
    }
    const a = art.get(pid)
    if (!a || !pusi) return
    if (payload[0] !== 0 || payload[1] !== 0 || payload[2] !== 1) return
    if ((payload[7] & 0x80) === 0) return // ohne PTS
    onPes(a, readPts(payload, 9))
  }

  return (chunk) => {
    let buf = rest.length ? Buffer.concat([rest, chunk]) : chunk
    let i = 0
    while (i + TS <= buf.length) {
      if (buf[i] !== 0x47) {
        i++ // aus dem Tritt: bis zum nächsten Sync-Byte suchen
        continue
      }
      packet(buf.subarray(i, i + TS))
      i += TS
    }
    rest = buf.subarray(i)
  }
}

/** Fortlaufender PTS in Sekunden (der 33-Bit-Zähler läuft nach gut 26 Stunden über). */
function entfalter() {
  let last = null
  let plus = 0
  return (pts) => {
    if (last != null && pts < last - PTS_WRAP / 2) plus += PTS_WRAP
    last = pts
    return (pts + plus) / 90000
  }
}

/**
 * Schneidet `ms` Millisekunden des Stroms unter `url` mit. Liefert je Art die Liste
 * `{ ankunft, pts }` (Ankunft in ms seit Beginn, PTS in Sekunden), Bytes und `start` (Wanduhr).
 * `waehrend()` läuft unterwegs (z. B. den main-Prozess blockieren); `datei` speichert den Strom
 * zusätzlich, etwa für `blitzUndPiep`.
 */
export function mitschneiden(url, ms, { waehrend, datei } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    const ergebnis = { video: [], audio: [], bytes: 0, start: Date.now() }
    const pts = { video: entfalter(), audio: entfalter() }
    const ablage = datei ? createWriteStream(datei) : null
    let jetzt = 0
    const parse = tsParser((art, roh) => {
      ergebnis[art].push({ ankunft: jetzt, pts: pts[art](roh) })
    })
    const req = http.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        res.resume()
        return
      }
      res.on('data', (chunk) => {
        jetzt = performance.now() - t0
        ergebnis.bytes += chunk.length
        ablage?.write(chunk)
        parse(chunk)
      })
      res.on('error', () => {})
      setTimeout(() => {
        req.destroy()
        if (ablage) ablage.end(() => resolve(ergebnis))
        else resolve(ergebnis)
      }, ms)
      waehrend?.().catch(reject)
    })
    req.on('error', (err) => {
      if (performance.now() - t0 < ms) reject(err)
    })
  })
}

/**
 * Lippensynchron? Wertet einen mitgeschnittenen Strom eines Testclips aus, in dem Blitz (weißes
 * Bild) und Piep zur selben Zeit kommen: Blitze über die mittlere Helligkeit (signalstats),
 * Pieps über das Ende der Stille davor (silencedetect), beides in der Zeit des Stroms (PTS in s).
 * `paare`: je Blitz mit Piep in der Nähe `{ blitz, versatzMs, hell }`, Ton − Bild (positiv = Ton
 * zu spät; `hell`: mittlere Helligkeit der Bilder um den Blitz, zur Diagnose). `ende`: PTS des
 * letzten Bildes – ein Blitz kurz davor kann angeschnitten sein.
 */
export function blitzUndPiep(datei, ffmpeg) {
  const lauf = (args) =>
    spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-copyts', '-i', datei, ...args], {
      encoding: 'utf8',
      maxBuffer: 1e8
    })
  const v = lauf([
    ...['-map', '0:v', '-vf', 'signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-'],
    ...['-f', 'null', '-']
  ])
  const bilder = [] // [pts, YAVG]
  let t = null
  for (const zeile of v.stdout.split(/\r?\n/)) {
    const m = zeile.match(/pts_time:([\d.]+)/)
    if (m) t = Number(m[1])
    const y = zeile.match(/YAVG=([\d.]+)/)
    if (y) bilder.push([t, Number(y[1])])
  }
  const blitze = []
  const verlauf = new Map() // Blitz -> Helligkeit der Bilder drumherum (Diagnose)
  bilder.forEach(([pts, y], i) => {
    if (y > 128 && (i === 0 || bilder[i - 1][1] <= 128)) {
      blitze.push(pts)
      verlauf.set(
        pts,
        bilder.slice(Math.max(0, i - 2), i + 3).map(([, yy]) => Math.round(yy))
      )
    }
  })
  const a = lauf(['-map', '0:a', '-af', 'silencedetect=n=-30dB:d=0.3', '-f', 'null', '-'])
  const pieps = [...a.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))
  const paare = []
  for (const b of blitze) {
    const p = pieps.find((x) => Math.abs(x - b) < 0.5)
    if (p != null) {
      paare.push({ blitz: b, versatzMs: Math.round((p - b) * 1000), hell: verlauf.get(b) })
    }
  }
  const ende = bilder.length ? bilder[bilder.length - 1][0] : 0
  return { blitze, pieps, paare, ende }
}

/**
 * Läuft die Zeit im Strom mit der Uhr? Je Eintrag der Versatz Ankunft − PTS. Bleibt er gleich,
 * hält der Sender Schritt. `rueckstand`: wie weit die Bilder am Ende später ankommen als am
 * frühesten Punkt (das hat der Empfänger dauerhaft verloren, bei Stufe 1 wächst es mit jedem
 * Hänger). `puffer`: der größte Versatz zwischendurch – so viel Puffer bräuchte ein Empfänger,
 * um nie zu stocken. `bilderJeSekunde`: Bildzahl je Sekunde Strom-Zeit.
 */
export function zeitachse(eintraege) {
  if (eintraege.length < 2) return null
  const v0 = eintraege[0]
  let minVersatz = Infinity
  let puffer = 0
  const versatz = eintraege.map((e) => e.ankunft / 1000 - (e.pts - v0.pts))
  for (const v of versatz) {
    minVersatz = Math.min(minVersatz, v)
    puffer = Math.max(puffer, v - minVersatz)
  }
  // Ende über die letzten Einträge gemittelt: ein einzelnes spätes Paket ist kein Rückstand.
  const tail = versatz.slice(-Math.min(15, versatz.length))
  const ende = tail.reduce((a, b) => a + b, 0) / tail.length
  const last = eintraege[eintraege.length - 1]
  const dauer = last.pts - v0.pts
  // Diagnose: üblicher Abstand zweier Bilder im PTS und Sprünge (rückwärts oder über 0,5 s) –
  // ein Neustart von ffmpeg fängt wieder vorn an, ein falscher Takt zeigt sich am Abstand.
  const schritte = eintraege.slice(1).map((e, i) => e.pts - eintraege[i].pts)
  const sortiert = [...schritte].sort((a, b) => a - b)
  const spruenge = []
  schritte.forEach((d, i) => {
    if (d < 0 || d > 0.5) {
      spruenge.push({ beiS: eintraege[i + 1].ankunft / 1000, umS: d })
    }
  })
  return {
    rueckstand: ende - minVersatz,
    puffer,
    dauer,
    bilderJeSekunde: dauer > 0 ? (eintraege.length - 1) / dauer : 0,
    schrittMs: sortiert.length ? sortiert[Math.floor(sortiert.length / 2)] * 1000 : 0,
    spruenge
  }
}
