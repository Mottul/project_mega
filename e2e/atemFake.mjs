// Schein-Mischer für die E2E-Tests: spricht das echte UDP-Protokoll des ATEM (Handshake, Pakete mit
// Bestätigung, Lebenszeichen), kennt aber nur, was die Tests brauchen. So läuft in der CI ohne Gerät
// der ganze echte Weg: atem-connection, ihr Socket-Thread, die Befehle, die Rückmeldung. Der
// AtemSimulator der App ersetzt diesen Weg, er prüft ihn nicht – dafür ist dieser Mischer da.
//
// Formate: Kopf 12 Byte, Kommandos je Länge (2), 2 frei, Name (4), Nutzlast; abgeleitet aus
// atem-connection (lib/atemSocketChild.js, commands/*).

import dgram from 'node:dgram'

const NEU_ACK = 1 // AckRequest: Gegenseite soll bestätigen
const NEUE_SITZUNG = 2
const ACK = 16 // AckReply
const SITZUNG = 0x8001
const V9_6 = 131104
/** Pakete bleiben unter der MTU wie am Gerät */
const MAX_NUTZLAST = 1300

function kommando(name, nutzlast) {
  const b = Buffer.alloc(8 + nutzlast.length)
  b.writeUInt16BE(b.length, 0)
  b.write(name, 4, 4, 'ascii')
  nutzlast.copy(b, 8)
  return b
}

function bytes(n, f) {
  const b = Buffer.alloc(n)
  f(b)
  return b
}

const u16 = (a) => bytes(4, (b) => b.writeUInt16BE(a, 2))

/** Stand des Mischers – was die Befehle ändern und die Meldungen zurückgeben */
function startZustand() {
  return {
    programm: 1,
    vorschau: 2,
    stil: 0,
    raten: { mix: 25, dip: 25, wipe: 25, dve: 25 },
    hebel: 0,
    inUebergang: false,
    schwarz: false,
    ftbRate: 25
  }
}

/**
 * @param {{ produkt?: string, modell?: number, eingaenge?: number, version?: number }} [opt]
 *   Vorgabe ATEM Mini Extreme (16) mit 8 Eingängen. `version` für eine unbekannte Firmware.
 */
export async function startAtemFake(opt = {}) {
  const produkt = opt.produkt ?? 'ATEM Mini Extreme'
  const modell = opt.modell ?? 16
  const eingaenge = opt.eingaenge ?? 8
  const version = opt.version ?? V9_6

  const sock = dgram.createSocket('udp4')
  let client = null
  let nextId = 1
  let verbunden = false
  let hellos = 0
  let stumm = false
  let zurueckhalten = false
  let zurueckgehalten = []
  const st = startZustand()
  /** Alle Befehle des Clients, älteste zuerst: { name, ...Felder } */
  const empfangen = []

  const senden = (
    flags,
    { ack = 0, id = 0, nutzlast = Buffer.alloc(0), sitzung = SITZUNG } = {}
  ) => {
    if (!client || stumm) return
    const b = Buffer.alloc(12 + nutzlast.length)
    b.writeUInt16BE((flags << 11) | b.length, 0)
    b.writeUInt16BE(sitzung, 2)
    b.writeUInt16BE(ack, 4)
    b.writeUInt16BE(id, 10)
    nutzlast.copy(b, 12)
    sock.send(b, client.port, client.address)
  }

  /** Kommandos in Pakete packen, jedes mit eigener fortlaufender Nummer */
  const melde = (kommandos) => {
    let block = []
    let groesse = 0
    const raus = () => {
      if (!block.length) return
      senden(NEU_ACK, { id: nextId++, nutzlast: Buffer.concat(block) })
      block = []
      groesse = 0
    }
    for (const k of kommandos) {
      if (groesse + k.length > MAX_NUTZLAST) raus()
      block.push(k)
      groesse += k.length
    }
    raus()
  }

  /** Rückmeldung eines Befehls: hält der Test sie zurück, kommt sie erst bei `freigeben()` */
  const antworte = (kommandos) => {
    if (zurueckhalten) zurueckgehalten.push(...kommandos)
    else melde(kommandos)
  }

  const programmMeldung = () => kommando('PrgI', u16(st.programm))
  const vorschauMeldung = () =>
    kommando(
      'PrvI',
      bytes(8, (b) => b.writeUInt16BE(st.vorschau, 2))
    )
  const hebelMeldung = () =>
    kommando(
      'TrPs',
      bytes(8, (b) => {
        b.writeUInt8(st.inUebergang ? 1 : 0, 1)
        b.writeUInt16BE(st.hebel, 4)
      })
    )
  const stilMeldung = () =>
    kommando(
      'TrSS',
      bytes(8, (b) => {
        b.writeUInt8(st.stil, 1)
        b.writeUInt8(1, 2)
        b.writeUInt8(st.stil, 3)
        b.writeUInt8(1, 4)
      })
    )
  const mixMeldung = () =>
    kommando(
      'TMxP',
      bytes(4, (b) => b.writeUInt8(st.raten.mix, 1))
    )
  const dipMeldung = () =>
    kommando(
      'TDpP',
      bytes(4, (b) => b.writeUInt8(st.raten.dip, 1))
    )
  const wipeMeldung = () =>
    kommando(
      'TWpP',
      bytes(20, (b) => b.writeUInt8(st.raten.wipe, 1))
    )
  const dveMeldung = () =>
    kommando(
      'TDvP',
      bytes(20, (b) => b.writeUInt8(st.raten.dve, 1))
    )
  const ftbMeldung = () =>
    kommando(
      'FtbS',
      bytes(4, (b) => b.writeUInt8(st.schwarz ? 1 : 0, 1))
    )
  const ftbRateMeldung = () =>
    kommando(
      'FtbP',
      bytes(4, (b) => b.writeUInt8(st.ftbRate, 1))
    )

  const eingang = (id, lang, kurz, intern, me = 0x0f) =>
    kommando(
      'InPr',
      bytes(36, (b) => {
        b.writeUInt16BE(id, 0)
        b.write(lang, 2, 20, 'latin1')
        b.write(kurz, 22, 4, 'latin1')
        b.writeUInt8(1, 26)
        b.writeUInt8(intern, 32)
        b.writeUInt8(0xff, 34)
        b.writeUInt8(me, 35)
      })
    )

  /** Was ein ATEM beim Verbinden meldet (nur die Teile, die App und Bibliothek auswerten) */
  const anfangsZustand = () => [
    kommando(
      '_ver',
      bytes(4, (b) => b.writeUInt32BE(version, 0))
    ),
    kommando(
      '_pin',
      bytes(44, (b) => {
        b.write(produkt, 0, 40, 'latin1')
        b.writeUInt8(modell, 40)
      })
    ),
    kommando(
      '_top',
      bytes(24, (b) => {
        b.writeUInt8(1, 0) // M/Es
        b.writeUInt8(eingaenge + 5, 1) // Quellen
        b.writeUInt8(2, 2) // DSKs
        b.writeUInt8(1, 3) // AUX
        b.writeUInt8(2, 5) // Media-Player
        b.writeUInt8(1, 6) // Multiview
        b.writeUInt8(1, 9) // DVEs
        b.writeUInt8(0, 10) // Stinger
        b.writeUInt8(1, 11) // SuperSources
      })
    ),
    kommando(
      '_MeC',
      bytes(4, (b) => b.writeUInt8(4, 1))
    ),
    kommando(
      'VidM',
      bytes(4, (b) => b.writeUInt8(12, 0))
    ), // 1080p50
    ...Array.from({ length: eingaenge }, (_, i) =>
      eingang(i + 1, `Kamera ${i + 1}`, `CAM${i + 1}`, 0)
    ),
    eingang(0, 'Schwarz', 'BLK', 1),
    eingang(1000, 'Farbbalken', 'BARS', 2),
    eingang(2001, 'Farbe 1', 'COL1', 3),
    eingang(3010, 'Media-Player 1', 'MP1', 4),
    // nur für den Multiview, nie für Programm/Vorschau – die Seite darf sie nicht zeigen
    eingang(9001, 'Multiview', 'MV', 131, 0),
    programmMeldung(),
    vorschauMeldung(),
    stilMeldung(),
    hebelMeldung(),
    mixMeldung(),
    dipMeldung(),
    wipeMeldung(),
    dveMeldung(),
    ftbMeldung(),
    ftbRateMeldung(),
    kommando('InCm', Buffer.alloc(4))
  ]

  const tausche = () => {
    ;[st.programm, st.vorschau] = [st.vorschau, st.programm]
    return [programmMeldung(), vorschauMeldung()]
  }

  /** Ein Befehl vom Client: merken und antworten wie das Gerät */
  const verarbeite = (name, n) => {
    switch (name) {
      case 'CPgI':
        st.programm = n.readUInt16BE(2)
        empfangen.push({ name, me: n.readUInt8(0), quelle: st.programm })
        return antworte([programmMeldung()])
      case 'CPvI':
        st.vorschau = n.readUInt16BE(2)
        empfangen.push({ name, me: n.readUInt8(0), quelle: st.vorschau })
        return antworte([vorschauMeldung()])
      case 'DCut':
      case 'DAut':
        empfangen.push({ name, me: n.readUInt8(0) })
        return antworte(tausche())
      case 'FtbA':
        empfangen.push({ name, me: n.readUInt8(0) })
        st.schwarz = !st.schwarz
        return antworte([ftbMeldung()])
      case 'FtbC':
        st.ftbRate = n.readUInt8(2)
        empfangen.push({ name, rate: st.ftbRate })
        return antworte([ftbRateMeldung()])
      case 'CTTp':
        st.stil = n.readUInt8(2)
        empfangen.push({ name, stil: st.stil })
        return antworte([stilMeldung()])
      case 'CTMx':
        st.raten.mix = n.readUInt8(1)
        empfangen.push({ name, rate: st.raten.mix })
        return antworte([mixMeldung()])
      case 'CTDp':
        st.raten.dip = n.readUInt8(2)
        empfangen.push({ name, rate: st.raten.dip })
        return antworte([dipMeldung()])
      case 'CTWp':
        st.raten.wipe = n.readUInt8(3)
        empfangen.push({ name, rate: st.raten.wipe })
        return antworte([wipeMeldung()])
      case 'CTDv':
        st.raten.dve = n.readUInt8(4)
        empfangen.push({ name, rate: st.raten.dve })
        return antworte([dveMeldung()])
      case 'CTPs': {
        const wert = n.readUInt16BE(2)
        empfangen.push({ name, wert })
        // Wie am Gerät: Der Hebel läuft 0…10000, am Ende tauschen die Busse und er steht wieder auf 0
        if (wert >= 10000) {
          st.inUebergang = false
          st.hebel = 0
          return antworte([hebelMeldung(), ...tausche()])
        }
        st.inUebergang = wert > 0
        st.hebel = wert
        return antworte([hebelMeldung()])
      }
      default:
        empfangen.push({ name })
    }
  }

  sock.on('message', (msg, rinfo) => {
    if (stumm || msg.length < 12) return
    const flags = msg.readUInt8(0) >> 3
    if (flags & NEUE_SITZUNG) {
      hellos++
      client = { address: rinfo.address, port: rinfo.port }
      nextId = 1
      verbunden = false
      // Antwort auf das Hello trägt noch die Start-Sitzung, Nutzlast wie am Gerät
      senden(NEUE_SITZUNG, {
        sitzung: 0x53ab,
        nutzlast: Buffer.from([2, 0, 0, 1, 0, 0, 0, 0])
      })
      return
    }
    if (flags & ACK && !verbunden) {
      verbunden = true
      melde(anfangsZustand())
    }
    if (flags & NEU_ACK) {
      senden(ACK, { ack: msg.readUInt16BE(10) })
      let rest = msg.subarray(12)
      while (rest.length >= 8) {
        const laenge = rest.readUInt16BE(0)
        if (laenge < 8) break
        verarbeite(rest.toString('ascii', 4, 8), rest.subarray(8, laenge))
        rest = rest.subarray(laenge)
      }
    }
  })

  await new Promise((resolve) => sock.bind(0, '127.0.0.1', resolve))
  // Lebenszeichen: Ohne meldet die Bibliothek nach 5 s die Verbindung als verloren
  const puls = setInterval(() => {
    if (verbunden) senden(NEU_ACK, { id: nextId++ })
  }, 500)

  return {
    port: sock.address().port,
    /** Adresse wie im Feld „Adresse“ */
    get host() {
      return `127.0.0.1:${sock.address().port}`
    },
    empfangen,
    get verbunden() {
      return verbunden
    },
    /** Wie oft sich ein Client angemeldet hat: Das Werkzeug belegt immer nur einen Platz */
    get anmeldungen() {
      return hellos
    },
    /** Rückmeldungen zurückhalten (langsamer Mischer) */
    halteZurueck() {
      zurueckhalten = true
    },
    freigeben() {
      zurueckhalten = false
      melde(zurueckgehalten)
      zurueckgehalten = []
    },
    /** Änderung, die nicht von der App kommt: Hardware-Panel oder ATEM Software Control */
    fremdesProgramm(quelle) {
      st.programm = quelle
      melde([programmMeldung()])
    },
    /** Kabel gezogen: keine Antwort mehr, bis `wieder()` */
    verstummen() {
      stumm = true
      verbunden = false
    },
    wieder() {
      stumm = false
    },
    async close() {
      clearInterval(puls)
      await new Promise((resolve) => sock.close(resolve))
    }
  }
}
