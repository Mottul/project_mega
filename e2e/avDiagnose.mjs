// Kein Skript: Diagnose für den Ton im Player-Stream (stream.mjs). Misst jede Teilstrecke für
// sich, damit ein Versatz Ton − Bild im Strom eine Ursache bekommt:
// - Spiegel: wann zeigt das Offscreen-Fenster den Blitz (requestVideoFrameCallback, Medien-Uhr)
// - Bild: wann kommt dieses Bild als paint im main an (Helligkeit eines kleinen Ausschnitts)
// - Ton: wann kommt der Block mit dem Piep im main an, und wie laufen die Sample-Nummern gegen
//   die Uhr (die Uhr der Soundkarte ist nicht die des Rechners)
// Alles nur im Test eingehängt (app.evaluate, executeJavaScript) – der Produktcode bleibt frei.

const SR = 48000

/** Spiegelfenster des Players im main finden (Offscreen, Route #/player-ndi) */
const SPIEGEL = `(BrowserWindow) =>
  BrowserWindow.getAllWindows().find(
    (w) => !w.isDestroyed() && w.webContents.isOffscreen() && w.webContents.getURL().includes('player-ndi')
  )`

/** Messung einhängen. Muss laufen, während der Player spielt und der Spiegel offen ist. */
export async function starteDiagnose(app) {
  const ok = await app.evaluate(({ BrowserWindow, ipcMain }, finde) => {
    const win = eval(finde)(BrowserWindow)
    if (!win) return false
    const d = { paints: [], ton: [] }
    globalThis.__avDiag = d
    win.webContents.on('paint', (_e, _dirty, image) => {
      if (d.paints.length > 5000) return
      const { width, height } = image.getSize()
      const px = image
        .crop({ x: Math.floor(width / 2) - 2, y: Math.floor(height / 2) - 2, width: 4, height: 4 })
        .toBitmap()
      let summe = 0
      for (let i = 0; i < px.length; i += 4) summe += (px[i] + px[i + 1] + px[i + 2]) / 3
      d.paints.push({ t: Date.now(), hell: summe / (px.length / 4) })
    })
    ipcMain.on('player:ndiAudio', (_e, chunk) => {
      if (d.ton.length > 5000 || !chunk?.channels?.[0]) return
      const ch = chunk.channels[0]
      let onset = -1
      for (let i = 0; i < ch.length; i++) {
        if (Math.abs(ch[i]) > 0.05) {
          onset = i
          break
        }
      }
      d.ton.push({
        t: Date.now(),
        gerendert: chunk.gerendert,
        frame: chunk.frame ?? -1,
        len: ch.length,
        onset
      })
    })
    return true
  }, SPIEGEL)
  if (!ok) return false
  // Im Spiegel: jedes angezeigte Bild mit Medienzeit und erwarteter Anzeigezeit (Wanduhr)
  await app.evaluate(async ({ BrowserWindow }, finde) => {
    const win = eval(finde)(BrowserWindow)
    await win.webContents.executeJavaScript(`(() => {
        window.__rvfc = []
        for (const v of document.querySelectorAll('video')) {
          const cb = (now, meta) => {
            if (window.__rvfc.length < 5000) {
              window.__rvfc.push({
                m: meta.mediaTime,
                anz: performance.timeOrigin + meta.expectedDisplayTime,
                jetzt: performance.timeOrigin + now,
                praes: performance.timeOrigin + meta.presentationTime,
                uhr: v.currentTime
              })
            }
            v.requestVideoFrameCallback(cb)
          }
          v.requestVideoFrameCallback(cb)
        }
      })()`)
  }, SPIEGEL)
  return true
}

/** Messwerte einsammeln */
export async function holeDiagnose(app) {
  return app.evaluate(async ({ BrowserWindow }, finde) => {
    const win = eval(finde)(BrowserWindow)
    const rvfc = win ? await win.webContents.executeJavaScript('window.__rvfc || []') : []
    return { ...(globalThis.__avDiag ?? { paints: [], ton: [] }), rvfc }
  }, SPIEGEL)
}

/** Steigung einer Ausgleichsgeraden y über x */
function steigung(xs, ys) {
  const n = xs.length
  if (n < 2) return NaN
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return num / den
}

const median = (a) => {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

/**
 * Auswertung: je Blitz die Übergabe des Bildes im Spiegel (presentationTime) als Bezug.
 * Bild = paint im main − Übergabe; Ton = Platz des Piep-Samples, eingeordnet wie im Ton-Takt
 * (Anker am pünktlichsten Block der ersten 2 s, danach nach Sample-Nummer) − Übergabe. Dazu die
 * Gänge der Uhren gegen die Wanduhr in ppm.
 */
export function werteDiagnoseAus(d, { bildwegMs = 0 } = {}) {
  // Medien-Uhr des Spiegels (Sekunden Medienzeit je Sekunde Wanduhr)
  const rv = d.rvfc.filter((x) => Number.isFinite(x.m) && Number.isFinite(x.praes))
  const medienPpm =
    (steigung(
      rv.map((x) => x.praes / 1000),
      rv.map((x) => x.m)
    ) -
      1) *
    1e6
  const anzeigeNachUebergabe = median(rv.map((x) => x.anz - x.praes))
  // Verzögerung der Übergabe gegen die Medien-Uhr: Medien-Uhr zum Übergabezeitpunkt − Medienzeit
  // des Bildes (die Uhr läuft im Callback weiter: um jetzt − Übergabe zurückrechnen)
  const verzug = rv
    .filter((x) => Number.isFinite(x.uhr))
    .map((x) => (x.uhr - x.m) * 1000 - (x.jetzt - x.praes))
  const verzugMs = median(verzug)
  const verzugSpanne = verzug.length
    ? [Math.round(Math.min(...verzug)), Math.round(Math.max(...verzug))]
    : []
  // Ton-Uhr über die pünktlichsten Blöcke je Sekunde (Schübe nach Hängern zählen so nicht):
  // Verspätung = Ankunft − Zeit des Blockendes nach Sample-Nummer
  const ton = d.ton.filter((x) => x.frame >= 0)
  // wie der Ton-Takt: Zeit des Blockendes = Renderzeit aus dem Spiegel, sonst die Ankunft
  const zeit = (x) => (Number.isFinite(x.gerendert) ? x.gerendert : x.t)
  const spaet = (x) => zeit(x) - ((x.frame + x.len) * 1000) / SR
  // Verzug bis zur Ankunft im main (Median), nur zur Auskunft
  const ankunftNachRender = median(
    ton.filter((x) => Number.isFinite(x.gerendert)).map((x) => x.t - x.gerendert)
  )
  // Renderzeit gegen die Sample-Nummer: Blöcke, die der Spiegel deutlich zu früh meldet (Schub
  // des Ton-Threads nach einem Stocken), gemessen am Median der Blöcke ringsum
  const versatz = ton
    .filter((x) => Number.isFinite(x.gerendert))
    .map((x) => x.gerendert - ((x.frame + x.len) * 1000) / SR)
  const zuFrueh = versatz
    .map((w, i) => median(versatz.slice(Math.max(0, i - 22), i + 23)) - w)
    .filter((vorMedian) => vorMedian >= 25)
  const puenktlich = []
  for (const x of ton) {
    const s = Math.floor(x.t / 1000)
    const p = puenktlich.at(-1)
    if (!p || p.s !== s) puenktlich.push({ s, x })
    else if (spaet(x) < spaet(p.x)) p.x = x
  }
  const tonPpm =
    (steigung(
      puenktlich.map((p) => p.x.t / 1000),
      puenktlich.map((p) => (p.x.frame + p.x.len) / SR)
    ) -
      1) *
    1e6
  // wie der Ton-Takt: Anker am pünktlichsten Block der ersten 2 s
  const anker = ton.length ? Math.min(...ton.filter((x) => x.t < ton[0].t + 2000).map(spaet)) : 0
  // dazu der Weg des Bildes, um den der Sender den Ton später legt
  const platz = (f) => (f * 1000) / SR + anker + bildwegMs
  const paintAbstand = median(d.paints.slice(1).map((p, i) => p.t - d.paints[i].t))
  // genaue Zeichenrate: Zahl der paints über die ganze Zeit (der Median rundet auf ganze ms)
  const paintHz =
    d.paints.length > 1 ? ((d.paints.length - 1) * 1000) / (d.paints.at(-1).t - d.paints[0].t) : NaN
  const spiegelHz = rv.length > 1 ? ((rv.length - 1) * 1000) / (rv.at(-1).praes - rv[0].praes) : NaN
  const tonAbstand = median(ton.slice(1).map((x, i) => x.t - ton[i].t))

  // Blitze im Spiegel: erstes Bild mit Medienzeit 1, 3, 5 … s
  const blitze = []
  rv.forEach((x, i) => {
    const r = (x.m - 1) % 2
    const hell = r >= -0.001 && r < 0.09
    const vorher = i > 0 && (rv[i - 1].m - 1) % 2 >= -0.001 && (rv[i - 1].m - 1) % 2 < 0.09
    if (hell && !vorher) blitze.push(x)
  })
  // Blitz-paints: erstes helles Bild nach einer dunklen Folge
  const paintBlitze = d.paints.filter(
    (p, i) => p.hell > 128 && (i === 0 || d.paints[i - 1].hell <= 128)
  )
  // Pieps: erstes lautes Sample nach mindestens 0,5 s Ruhe, eingeordnet wie im Ton-Takt
  const pieps = []
  let letzterPiep = -Infinity
  for (const b of ton) {
    if (b.onset < 0) continue
    const f = b.frame + b.onset
    if (f - letzterPiep < SR / 2) continue
    letzterPiep = f
    pieps.push({ t: platz(f) })
  }
  const paare = []
  for (const b of blitze) {
    const p = paintBlitze.find((x) => x.t >= b.praes - 50 && x.t < b.praes + 500)
    const s = pieps.find((x) => Math.abs(x.t - b.praes) < 500)
    paare.push({
      bildMs: p ? Math.round(p.t - b.praes) : null,
      tonMs: s ? Math.round(s.t - b.praes) : null
    })
  }
  return {
    medienPpm: Math.round(medienPpm),
    tonPpm: Math.round(tonPpm),
    anzeigeNachUebergabeMs: Math.round(anzeigeNachUebergabe),
    ankunftNachRenderMs: Number.isFinite(ankunftNachRender) ? Math.round(ankunftNachRender) : null,
    renderZuFrueh: zuFrueh.length,
    renderZuFruehMaxMs: zuFrueh.length ? Math.round(Math.max(...zuFrueh)) : 0,
    verzugMs: Math.round(verzugMs),
    verzugSpanne,
    paintAbstandMs: paintAbstand,
    paintHz: Math.round(paintHz * 1000) / 1000,
    spiegelHz: Math.round(spiegelHz * 1000) / 1000,
    tonAbstandMs: tonAbstand,
    bilder: rv.length,
    paints: d.paints.length,
    bloecke: ton.length,
    paare
  }
}

/** Zeitstempel im Strom (PTS in s) -> Wanduhr (ms): ffmpeg stempelt mit der Wanduhr in 90 kHz
 *  (alle 2^33 Ticks von vorn), der MPEG-TS-Muxer schiebt Bild und Ton um 1,4 s (Skill ffmpeg-labor) */
const UMLAUF_S = 2 ** 33 / 90000
const MUX_S = 1.4
function wanduhrAusPts(pts) {
  const roh = pts - MUX_S
  return (roh + Math.round((Date.now() / 1000 - roh) / UMLAUF_S) * UMLAUF_S) * 1000
}

/**
 * Je Paar aus dem Strom (`blitzUndPiep`): wie lange nach seinem paint im main das Blitzbild im
 * Strom liegt, und wie lange nach seiner Renderzeit der Piep. Daran steht, auf welcher Seite ein
 * Ausreißer entsteht: Bild spät an ffmpeg (Pipe, main beschäftigt) oder Ton falsch eingeordnet
 * (Ton-Takt). Ruhig erwartet: Bild etwa der Weg zu ffmpeg ± ein halbes Raster, Ton etwa der Weg
 * des Bildes, den der Sender ausgleicht.
 */
export function streamZuordnung(d, paare) {
  const hell = d.paints.filter((p, i) => p.hell > 128 && (i === 0 || d.paints[i - 1].hell <= 128))
  const pieps = []
  let letzter = -Infinity
  for (const b of d.ton) {
    if (b.onset < 0 || b.frame < 0 || !Number.isFinite(b.gerendert)) continue
    const f = b.frame + b.onset
    if (f - letzter < SR / 2) continue
    letzter = f
    pieps.push(b.gerendert - ((b.len - b.onset) * 1000) / SR)
  }
  return paare.map((p) => {
    const bild = wanduhrAusPts(p.blitz)
    const ton = wanduhrAusPts(p.blitz + p.versatzMs / 1000)
    const paint = hell.filter((x) => x.t <= bild + 50 && x.t > bild - 500).at(-1)
    const piep = pieps.find((t) => Math.abs(t - ton) < 300)
    return {
      bildMs: paint ? Math.round(bild - paint.t) : null,
      tonMs: piep === undefined ? null : Math.round(ton - piep)
    }
  })
}

/** Eine Zeile für das Protokoll des Tests */
export function diagnoseZeile(a) {
  const p = a.paare.map((x) => `${x.bildMs ?? '?'}/${x.tonMs ?? '?'}`).join(' ')
  return (
    `Uhren gegen die Wanduhr: Medien ${a.medienPpm} ppm, Ton ${a.tonPpm} ppm; ` +
    `paint ${a.paintHz} Hz (Bilder im Spiegel ${a.spiegelHz} Hz), Tonblock alle ${a.tonAbstandMs} ms ` +
    `(Ankunft ${a.ankunftNachRenderMs ?? '?'} ms nach dem Rendern; Renderzeit ` +
    `${a.renderZuFrueh} Blöcke ≥ 25 ms zu früh, bis ${a.renderZuFruehMaxMs} ms), ` +
    `Anzeige ${a.anzeigeNachUebergabeMs} ms nach Übergabe, Übergabe ${a.verzugMs} ms nach der Medien-Uhr ` +
    `(${a.verzugSpanne.join(' … ')}) ` +
    `(${a.bilder} Bilder im Spiegel, ${a.paints} paints, ${a.bloecke} Blöcke); ` +
    `je Blitz Bild/Ton nach der Übergabe im Spiegel (ms): ${p}`
  )
}
