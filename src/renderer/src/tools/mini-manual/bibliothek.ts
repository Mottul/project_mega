// Mitgelieferte Bausteine und Fehlerfälle (nur lesen, mit Version). Eine Anleitung bekommt beim
// Einfügen eine Kopie mit Herkunft – ändert sich die Bibliothek, bleibt die Kunden-Anleitung
// stehen. Regeln fürs Schreiben: Skill `anleitung-inhalte` („du“, kurze Sätze, eine Handlung je
// Schritt, erst eingrenzen, dann beheben, jeder Fall endet in Gelöst, Lösung oder Anrufen).
//
// Fälle aus der Praxis (Matthias, 16.10.2026) und der Recherche (Hersteller-Hilfen), mit der
// Praxis abgeglichen – Nummern im Plan: docs/PLAN-MINI-MANUAL.md, „Startkatalog Fehlerfälle“.

import {
  uid,
  type Block,
  type Fehlerfall,
  type FSchritt,
  type KapitelId,
  type Stufe,
  type Ziel
} from './model'

export interface Baustein {
  id: string
  version: number
  titel: string
  kapitel: KapitelId
  /** für Vorschläge: Software, Gerät, Modul … (klein) */
  stichworte: string[]
  bloecke: Block[]
}

// ---------------------------------------------------------------- Helfer

const OK: Ziel = { art: 'geloest' }
const RUF: Ziel = { art: 'anrufen' }
const zu = (id: string): Ziel => ({ art: 'schritt', id })
const L = (text: string): Ziel => ({ art: 'loesung', text })
const FALL = (id: string): Ziel => ({ art: 'fall', id })

/** Frage mit Ja/Nein; `nein: null` = Anweisung mit „Weiter“ */
function q(
  id: string,
  stufe: Stufe,
  text: string,
  ja: Ziel,
  nein: Ziel | null,
  extra: Partial<Pick<FSchritt, 'hinweis' | 'ruecksprache' | 'stufeAus' | 'antwortAus'>> = {}
): FSchritt {
  return {
    id,
    stufe,
    text,
    hinweis: extra.hinweis ?? '',
    foto: null,
    ruecksprache: extra.ruecksprache ?? false,
    stufeAus: extra.stufeAus ?? null,
    antwortAus: extra.antwortAus ?? null,
    ja,
    nein
  }
}

const schritte = (
  id: string,
  titel: string,
  stufe: Stufe,
  texte: (string | [string, Stufe])[]
): Block => ({
  id,
  typ: 'schritte',
  stufe,
  titel,
  schritte: texte.map((t, i) => ({
    id: `${id}-${i + 1}`,
    text: Array.isArray(t) ? t[0] : t,
    stufe: Array.isArray(t) ? t[1] : stufe,
    foto: null
  }))
})

const text = (id: string, stufe: Stufe, t: string): Block => ({ id, typ: 'text', stufe, text: t })
const hinweis = (id: string, stufe: Stufe, art: 'info' | 'warnung', t: string): Block => ({
  id,
  typ: 'hinweis',
  stufe,
  art,
  text: t
})

// ---------------------------------------------------------------- Bausteine

export const BAUSTEINE: Baustein[] = [
  {
    id: 'lib-ein-aus',
    version: 1,
    titel: 'LED-Wand ein- und ausschalten',
    kapitel: 'einAus',
    stichworte: ['led-wand'],
    bloecke: [
      schritte('lib-ein-aus-ein', 'Einschalten', 1, [
        'Im Verteiler die Stromkreise der LED-Wand einschalten – nacheinander, nicht alle auf einmal.',
        'Prozessor {prozessor.name} einschalten.',
        'Zuspieler {pc.name} einschalten. Die Software startet von selbst.',
        'Nach etwa einer Minute erscheint das Bild.'
      ]),
      schritte('lib-ein-aus-aus', 'Ausschalten', 1, [
        'Inhalt auf Schwarz schalten.',
        'Stromkreise der LED-Wand im Verteiler ausschalten.',
        'Prozessor und Zuspieler dürfen anbleiben – außer es ist anders vereinbart.'
      ])
    ]
  },
  {
    id: 'lib-stromausfall',
    version: 1,
    titel: 'Nach einem Stromausfall',
    kapitel: 'einAus',
    stichworte: ['led-wand'],
    bloecke: [
      schritte('lib-stromausfall-s', 'Nach einem Stromausfall', 1, [
        'Warten, bis der Strom wieder da ist.',
        'Schauen, ob der Zuspieler von selbst startet – sonst einschalten.',
        'Kommt kein Bild: Kapitel Fehlersuche.'
      ])
    ]
  },
  {
    id: 'lib-autostart',
    version: 1,
    titel: 'Einrichtung: alles startet nach Stromausfall selbst',
    kapitel: 'einAus',
    stichworte: ['pc', 'laptop', 'mac', 'windows'],
    bloecke: [
      text(
        'lib-autostart-t',
        3,
        [
          '**Einrichtung (Technik):** Damit nach einem Stromausfall alles von selbst startet:',
          '- Desktop/NUC: im BIOS „After Power Failure“ bzw. „AC Recovery“ auf „Power On“.',
          '- Laptop: „Power On with AC Attach“ – nicht jedes Modell kann das.',
          '- Mac: „Nach Stromausfall automatisch starten“. Mit FileVault klappt die Anmeldung danach nicht.',
          '- Windows: automatische Anmeldung, Autostart der Software, Energiesparen aus.'
        ].join('\n')
      )
    ]
  },
  {
    id: 'lib-nacht',
    version: 1,
    titel: 'Nachtabschaltung',
    kapitel: 'einAus',
    stichworte: ['led-wand'],
    bloecke: [
      text(
        'lib-nacht-t',
        1,
        'Wird nachts der Strom abgeschaltet, startet am Morgen alles von selbst. Bleibt die Wand schwarz: Kapitel Fehlersuche, „Morgens bleibt die Wand schwarz“.'
      )
    ]
  },
  {
    id: 'lib-madmapper',
    version: 1,
    titel: 'MadMapper',
    kapitel: 'software',
    stichworte: ['madmapper'],
    bloecke: [
      text(
        'lib-madmapper-t',
        1,
        'MadMapper bringt die Inhalte auf die Wand. Inhalte wählst du über das Bedienfeld.'
      ),
      hinweis(
        'lib-madmapper-h',
        1,
        'warnung',
        'Das MadMapper-Fenster nicht schließen und den Rechner nicht zuklappen – die Wand wird sonst schwarz.'
      )
    ]
  },
  {
    id: 'lib-mottulbox-player',
    version: 1,
    titel: 'Mottulbox-Player',
    kapitel: 'software',
    stichworte: ['mottulbox', 'player'],
    bloecke: [
      schritte('lib-mottulbox-player-s', 'Inhalte abspielen', 1, [
        'Nach dem Einschalten die gewünschte Playlist antippen – sie startet nicht von selbst.',
        'Für einen anderen Inhalt den Clip in der Playlist antippen.'
      ]),
      text(
        'lib-mottulbox-player-t',
        2,
        'Vom Handy aus geht das auch über die Fernsteuerung der Mottulbox (Adresse im Kapitel Kontakt und Support).'
      )
    ]
  },
  {
    id: 'lib-obs',
    version: 1,
    titel: 'OBS',
    kapitel: 'software',
    stichworte: ['obs'],
    bloecke: [
      schritte('lib-obs-s', 'Szene wechseln', 1, [
        'In OBS in der Liste „Szenen“ die gewünschte Szene anklicken.',
        'Die Wand zeigt sofort die neue Szene.'
      ])
    ]
  },
  {
    id: 'lib-stream-deck',
    version: 1,
    titel: 'Stream Deck',
    kapitel: 'bedienfeld',
    stichworte: ['stream deck', 'streamdeck', 'elgato'],
    bloecke: [
      text(
        'lib-stream-deck-t',
        1,
        'Jede Taste startet einen Inhalt. Die Beschriftung steht auf der Taste. Reagiert keine Taste: Kapitel Fehlersuche, „Stream Deck reagiert nicht“.'
      )
    ]
  },
  {
    id: 'lib-inhalte',
    version: 1,
    titel: 'Neue Videos zuspielen',
    kapitel: 'inhalte',
    stichworte: ['video', 'inhalte'],
    bloecke: [
      text(
        'lib-inhalte-t',
        2,
        [
          'Neue Videos genau in der Auflösung der Wand anlegen: **{wand.aufloesung} Pixel**.',
          '- Bildrate wie der Rest der Show (meist 50 Bilder je Sekunde).',
          '- Am besten mit dem Video-Konverter der Mottulbox umwandeln.',
          '- Dateinamen ohne Umlaute und Sonderzeichen, mit Nummer vorne (01_Intro.mp4).',
          '- Ablage im vereinbarten Ordner auf dem Zuspieler {pc.name}.'
        ].join('\n')
      )
    ]
  },
  {
    id: 'lib-pflege',
    version: 1,
    titel: 'Pflege und Verbote',
    kapitel: 'pflege',
    stichworte: ['led-wand'],
    bloecke: [
      text(
        'lib-pflege-t',
        1,
        [
          '- Die LED-Fläche nicht berühren – die LEDs brechen leicht ab.',
          '- Nur trocken reinigen: weicher Pinsel oder Druckluft, nie Glasreiniger.',
          '- Nichts an die Wand lehnen, nichts daraufkleben.',
          '- Die Helligkeit nicht über das vereinbarte Preset stellen.',
          '- Die Rückseite frei lassen: Die Module werden warm.'
        ].join('\n')
      ),
      hinweis(
        'lib-pflege-h',
        1,
        'warnung',
        'Outdoor: bei Gewitter und Sturm abschalten und den Anweisungen des Veranstalters folgen.'
      )
    ]
  },
  {
    id: 'lib-ersatzteile',
    version: 1,
    titel: 'Ersatzteile vor Ort',
    kapitel: 'ersatzteile',
    stichworte: ['led-wand'],
    bloecke: [
      text(
        'lib-ersatzteile-t',
        2,
        [
          'Ersatzteile liegen hier:',
          '- Ersatz-IMs: …',
          '- Datenkabel: …',
          '- Stromkabel: …',
          '- Sicherungen: …'
        ].join('\n')
      )
    ]
  },
  {
    id: 'lib-status-leds',
    version: 1,
    titel: 'Status-LEDs der Module',
    kapitel: 'ledWall',
    stichworte: ['brompton', 'us2+', 'novastar', '496-2,0', 'rx3iobf'],
    bloecke: [
      text(
        'lib-status-leds-t',
        2,
        [
          '**Brompton (uS2+), LED an der Backbox:**',
          '- rot länger als 1 Minute nach dem Einschalten: Startfehler',
          '- grün: läuft, aber keine Verbindung zum Prozessor',
          '- blau: verbunden',
          '- gelb blinkend: Beacon (Modul wird gesucht) · gelb: Testbild',
          '',
          '**NovaStar-Empfangskarte:** rot dauerhaft = Strom, grün blinkend = Daten.',
          '',
          '**496-2,0, Anzeige am Modul:** blau = Main-Leitung, leicht violett = Backup-Leitung.'
        ].join('\n')
      )
    ]
  }
]

// ---------------------------------------------------------------- Fehlerfälle

const fall = (f: Omit<Fehlerfall, 'herkunft'>): Fehlerfall => ({
  ...f,
  herkunft: { baustein: f.id, version: 1 }
})

export const FEHLERFAELLE: Fehlerfall[] = [
  fall({
    id: 'lib-wand-dunkel',
    titel: 'Die ganze Wand ist dunkel',
    symptom: 'Die ganze Wand zeigt nichts – kein Bild, kein Testbild.',
    bereich: 'strom',
    stufe: 1,
    schritte: [
      q('w1', 1, 'Leuchten hinten an den Modulen die kleinen Status-LEDs?', zu('w5'), zu('w2'), {
        hinweis: 'Brompton (uS2+): LED an der Backbox. NovaStar: LEDs an der Empfangskarte.'
      }),
      q('w2', 1, 'Leuchtet am Stromverteiler die Kontrollleuchte?', zu('w3'), RUF),
      q(
        'w3',
        2,
        'Ist im Verteiler eine Sicherung oder der FI ausgelöst?',
        L('Einmal wieder einschalten. Fliegt sie wieder raus: nicht nochmal versuchen, anrufen.'),
        zu('w4'),
        { hinweis: 'Welche Sicherung zu welcher Stromkette gehört, steht im Kapitel LED-Wall.' }
      ),
      q(
        'w4',
        2,
        'Sind die Stromkabel am Verteiler und am ersten Modul jeder Kette fest gesteckt?',
        RUF,
        L('Stecker fest einstecken und einrasten lassen.')
      ),
      q('w5', 1, 'Leuchtet das Display des Prozessors?', zu('w6'), FALL('lib-prozessor-aus')),
      q(
        'w6',
        1,
        'Ist am Prozessor „Blackout“ oder „Freeze“ eingeschaltet?',
        L('Blackout bzw. Freeze am Prozessor ausschalten.'),
        zu('w7')
      ),
      q(
        'w7',
        2,
        'Testbild am Prozessor auslösen. Zeigt die Wand das Testbild?',
        FALL('lib-kein-signal'),
        zu('w8')
      ),
      q(
        'w8',
        2,
        'Steckt das Datenkabel vom Prozessor zum ersten Modul (bzw. zur Glasfaser-Box) fest?',
        zu('w9'),
        L('Stecker fest einstecken.')
      ),
      q('w9', 2, 'Läuft das Signal über Glasfaser (Breakout-Box CVT10)?', zu('w10'), RUF, {
        antwortAus: 'glasfaser'
      }),
      q(
        'w10',
        2,
        'Hat die Breakout-Box Strom – leuchten ihre LEDs?',
        zu('w11'),
        L('Strom der Breakout-Box einschalten bzw. Netzteil stecken. Bleibt sie dunkel: anrufen.')
      ),
      q('w11', 3, 'Glasfaserkabel tauschen. Läuft es wieder?', OK, RUF, {
        hinweis: 'Hilft das nicht, ist vermutlich die Breakout-Box defekt: Ersatz einsetzen.'
      })
    ]
  }),
  fall({
    id: 'lib-teil-dunkel',
    titel: 'Ein Teil der Wand ist dunkel',
    symptom:
      'Ein Block, eine Reihe oder ein Bereich zeigt nichts, Rauschen oder ein stehendes Bild.',
    bereich: 'signal',
    stufe: 1,
    schritte: [
      q('t1', 1, 'Ist die ganze Wand dunkel?', FALL('lib-wand-dunkel'), zu('t2')),
      q(
        't2',
        1,
        'Passt der dunkle Bereich genau zu einer Stromkette im Plan?',
        zu('t3'),
        zu('t5'),
        { hinweis: 'Die Stromketten (P1, P2 …) stehen im Kapitel LED-Wall.' }
      ),
      q(
        't3',
        2,
        'Ist im Verteiler die Sicherung dieser Kette ausgelöst?',
        L('Sicherung einschalten. Fliegt sie wieder raus: nicht nochmal, anrufen.'),
        zu('t4')
      ),
      q(
        't4',
        3,
        'Leuchtet am ersten dunklen Modul die Strom-LED?',
        RUF,
        L('Stecker neu stecken oder das Stromkabel davor tauschen.')
      ),
      q(
        't5',
        1,
        'Ist es ab einem Modul in Richtung der Signalkette dunkel, verrauscht oder eingefroren?',
        zu('t6'),
        zu('t8'),
        {
          hinweis:
            'Alles danach fällt mit aus. Mit Backup-Leitung bleibt die Kette bei einem Bruch hell – dann siehe „Prozessor meldet Backup“.'
        }
      ),
      q(
        't6',
        2,
        'Datenkabel zwischen dem letzten guten und dem ersten gestörten Modul tauschen. Läuft es wieder?',
        OK,
        zu('t7')
      ),
      q(
        't7',
        3,
        'Backbox (Netzteil und Empfangskarte) des ersten gestörten Moduls tauschen. Läuft es wieder?',
        OK,
        RUF
      ),
      q('t8', 1, 'Ist nur ein Viertel oder die Hälfte eines Moduls betroffen?', zu('t9'), RUF, {
        hinweis: 'Dann ist meist ein IM (Paneel im Modul) defekt.'
      }),
      q('t9', 3, 'IM stromlos neu einsetzen, sonst tauschen. Läuft es wieder?', OK, RUF, {
        stufeAus: 'im-tausch'
      })
    ]
  }),
  fall({
    id: 'lib-sicherung-fliegt',
    titel: 'Die Sicherung fliegt beim Einschalten',
    symptom: 'Beim Einschalten der Wand löst eine Sicherung oder der FI aus.',
    bereich: 'strom',
    stufe: 2,
    schritte: [
      q('s1', 2, 'Fliegt die Sicherung sofort beim Einschalten?', zu('s2'), zu('s3')),
      q(
        's2',
        2,
        'Die Stromkreise nacheinander einschalten, einige Sekunden Abstand. Hält die Sicherung?',
        L(
          'Künftig nacheinander einschalten und Bescheid geben – die Aufteilung der Stromkreise wird geprüft.'
        ),
        zu('s4'),
        { hinweis: 'Viele Netzteile zugleich ziehen beim Einschalten kurz sehr viel Strom.' }
      ),
      q(
        's3',
        2,
        'Fliegt sie erst später, bei hellen Inhalten?',
        L('Helligkeit verringern und anrufen – zu viele Module an einem Stromkreis.'),
        RUF
      ),
      q(
        's4',
        3,
        'Stromkreise aufteilen bzw. Sicherung mit C-Charakteristik einsetzen (nur Elektrofachkraft). Hält sie jetzt?',
        OK,
        RUF
      )
    ]
  }),
  fall({
    id: 'lib-kein-signal',
    titel: 'Testbild geht, der Inhalt nicht',
    symptom: 'Das Testbild des Prozessors erscheint, aber nicht das Bild vom Zuspieler.',
    bereich: 'zuspieler',
    stufe: 1,
    schritte: [
      q(
        'k1',
        1,
        'Ist der Zuspieler eingeschaltet und wach (Bildschirm an)?',
        zu('k2'),
        FALL('lib-rechner-aus')
      ),
      q('k2', 1, 'Läuft die Software im Vollbild auf der Wand?', zu('k3'), FALL('lib-vollbild')),
      q(
        'k3',
        2,
        'Ist am Prozessor der richtige Eingang gewählt?',
        zu('k4'),
        L('Den richtigen Eingang wählen (laut Geräteliste).')
      ),
      q(
        'k4',
        2,
        'Videokabel zwischen Zuspieler und Prozessor neu stecken oder tauschen. Kommt das Bild?',
        OK,
        zu('k5')
      ),
      q(
        'k5',
        3,
        'Passt die Auflösung des Zuspielers zum Eingang des Prozessors (EDID)?',
        RUF,
        L('Auflösung am Zuspieler bzw. EDID am Prozessor anpassen.'),
        { hinweis: 'Auflösung der Wand: {wand.aufloesung}.' }
      )
    ]
  }),
  fall({
    id: 'lib-rechner-aus',
    titel: 'Morgens bleibt die Wand schwarz',
    symptom: 'Nach der Nacht (Strom aus) zeigt die Wand nichts – der Zuspieler ist aus.',
    bereich: 'zuspieler',
    stufe: 1,
    schritte: [
      q(
        'r1',
        1,
        'Ist der Zuspieler aus (Einschaltknopf dunkel, Lüfter still)?',
        zu('r2'),
        FALL('lib-kein-signal')
      ),
      q(
        'r2',
        1,
        'Zuspieler einschalten und zwei Minuten warten. Startet die Software von selbst und kommt das Bild?',
        L(
          'Gelöst. Bitte trotzdem Bescheid geben: Der Rechner sollte nach Stromausfall selbst starten.'
        ),
        RUF
      )
    ]
  }),
  fall({
    id: 'lib-vollbild',
    titel: 'Software nicht im Vollbild',
    symptom:
      'Die Software läuft im Fenster oder auf dem Bildschirm des Laptops statt auf der Wand.',
    bereich: 'zuspieler',
    stufe: 1,
    schritte: [
      q(
        'v1',
        1,
        'Ist die Software gestartet?',
        zu('v2'),
        L('Software über die Verknüpfung am Desktop starten.')
      ),
      q(
        'v2',
        2,
        'Steht die Bildschirm-Einstellung auf „Erweitern“ (nicht „Duplizieren“)?',
        zu('v3'),
        L('Windows: Win+P drücken, „Erweitern“ wählen, Software neu starten.')
      ),
      q(
        'v3',
        2,
        'Software beenden und neu starten. Läuft sie jetzt im Vollbild auf der Wand?',
        OK,
        RUF,
        {
          hinweis:
            'Startet die Software, bevor Windows die Wand erkannt hat, landet sie auf dem falschen Bildschirm.'
        }
      )
    ]
  }),
  fall({
    id: 'lib-modul-farbe',
    titel: 'Ein Modul hat eine andere Farbe oder Helligkeit',
    symptom: 'Ein Modul – oft nach einem Tausch – ist heller, dunkler oder hat einen Farbstich.',
    bereich: 'module',
    stufe: 2,
    schritte: [
      q(
        'm1',
        2,
        'Am Prozessor die Helligkeit einmal ändern und wieder zurückstellen. Passt das Modul jetzt?',
        OK,
        zu('m2'),
        { hinweis: 'Das schickt die Helligkeit neu an alle Module – das erledigt es meist.' }
      ),
      q(
        'm2',
        3,
        'Konfiguration der Empfangskarten aus der Projektdatei neu senden (alle Module dieselbe rcfgx- bzw. npm-Datei). Passt es jetzt?',
        OK,
        zu('m3'),
        {
          hinweis: 'Konfiguration nur aus der Datei senden, nie von einem anderen Modul übernehmen.'
        }
      ),
      q('m3', 3, 'Module Flash ausführen (Kalibrierdaten). Passt es jetzt?', OK, RUF)
    ]
  }),
  fall({
    id: 'lib-bild-verschoben',
    titel: 'Bild verschoben, vertauscht oder „kariert“',
    symptom: 'Teile des Bildes sitzen an der falschen Stelle oder sind vertauscht.',
    bereich: 'signal',
    stufe: 2,
    schritte: [
      q(
        'b1',
        2,
        'Stecken die Datenkabel am Prozessor an den Ports laut Kabelplan?',
        zu('b2'),
        L('Kabel nach dem Plan stecken.'),
        { hinweis: 'Ports und Ketten stehen im Kapitel LED-Wall.' }
      ),
      q(
        'b2',
        2,
        'Stimmt das Bild am Zuspieler selbst (Software-Ausgabe, Anordnung der Bildschirme)?',
        zu('b3'),
        L('Ausgabe in der Software bzw. Anordnung der Bildschirme richtigstellen.')
      ),
      q(
        'b3',
        3,
        'Preset bzw. Bildschirm-Konfiguration am Prozessor neu laden. Passt das Bild?',
        OK,
        RUF
      )
    ]
  }),
  fall({
    id: 'lib-helligkeit',
    titel: 'Die Helligkeit stimmt nicht',
    symptom: 'Die Wand ist zu hell oder zu dunkel.',
    bereich: 'prozessor',
    stufe: 2,
    schritte: [
      q(
        'h1',
        2,
        'Ist am Prozessor das vereinbarte Helligkeits-Preset gewählt?',
        zu('h2'),
        L('Das vereinbarte Preset wählen.')
      ),
      q(
        'h2',
        3,
        'Läuft ein Zeitplan oder ein Helligkeitssensor? Abschalten oder anpassen – passt es jetzt?',
        OK,
        RUF
      )
    ]
  }),
  fall({
    id: 'lib-modul-rot',
    titel: 'Ein Modul bleibt dunkel und hat keine Verbindung',
    symptom:
      'Ein einzelnes Modul zeigt nichts; seine Status-LED leuchtet rot oder es meldet keine Verbindung.',
    bereich: 'module',
    stufe: 1,
    schritte: [
      q('e1', 1, 'Leuchtet die LED an der Backbox länger als eine Minute rot?', zu('e2'), RUF, {
        hinweis: 'Brompton (uS2+): rot nach dem Einschalten = Empfangskarte startet nicht.'
      }),
      q(
        'e2',
        2,
        'Modul stromlos machen (Stromstecker ab), 10 Sekunden warten, wieder anstecken. Läuft es?',
        OK,
        zu('e3')
      ),
      q('e3', 3, 'Backbox des Moduls tauschen. Läuft es?', OK, RUF)
    ]
  }),
  fall({
    id: 'lib-backup-aktiv',
    titel: 'Prozessor meldet Backup',
    symptom:
      'Das Bild ist in Ordnung, aber der Prozessor meldet Backup bzw. Redundanz – beim 496-2,0 leuchten Module leicht violett statt blau.',
    bereich: 'signal',
    stufe: 1,
    schritte: [
      q(
        'p1',
        1,
        'Leuchten an der Wand einige Module leicht violett statt blau (496-2,0)?',
        L(
          'Nicht sofort gefährlich. Kette und erstes violettes Modul notieren und Bescheid geben – vor der nächsten Show wird gesucht.'
        ),
        zu('p2'),
        {
          hinweis:
            'Blau = Main-Leitung, violett = Backup-Leitung. Die Unterbrechung liegt zwischen dem letzten blauen und dem ersten violetten Modul der Kette.'
        }
      ),
      q(
        'p2',
        2,
        'Datenkabel der gemeldeten Kette an der Bruchstelle tauschen. Meldet der Prozessor wieder Main?',
        OK,
        zu('p3'),
        { hinweis: 'Welche Module zu welcher Kette gehören, steht im Kapitel LED-Wall.' }
      ),
      q(
        'p3',
        3,
        'Empfangskarte bzw. Backbox an der Bruchstelle tauschen. Meldet er wieder Main?',
        OK,
        RUF
      )
    ]
  }),
  fall({
    id: 'lib-prozessor-aus',
    titel: 'Prozessor ohne Strom',
    symptom: 'Display und LEDs des Prozessors sind aus.',
    bereich: 'prozessor',
    stufe: 1,
    schritte: [
      q(
        'c1',
        1,
        'Ist der Netzschalter am Prozessor eingeschaltet?',
        zu('c2'),
        L('Einschalten und eine Minute warten.')
      ),
      q(
        'c2',
        2,
        'Netzkabel, Steckdosenleiste und deren Schalter prüfen. Geht der Prozessor an?',
        OK,
        zu('c3')
      ),
      q(
        'c3',
        2,
        'Ist die Sicherung des Racks ausgelöst?',
        L('Einmal wieder einschalten. Fliegt sie wieder: anrufen.'),
        RUF
      )
    ]
  }),
  fall({
    id: 'lib-bedienfeld',
    titel: 'Stream Deck reagiert nicht',
    symptom: 'Die Tasten des Bedienfelds tun nichts.',
    bereich: 'bedienfeld',
    stufe: 1,
    schritte: [
      q('d1', 1, 'Leuchten die Tasten des Stream Decks?', zu('d2'), zu('d3')),
      q(
        'd2',
        1,
        'Ist der Steuer-Rechner an und wach (Bildschirm an)?',
        zu('d4'),
        L('Rechner aufwecken bzw. einschalten.')
      ),
      q(
        'd3',
        1,
        'USB-Kabel am Stream Deck und am Rechner neu stecken. Leuchten die Tasten jetzt?',
        zu('d2'),
        RUF
      ),
      q(
        'd4',
        2,
        'Läuft die Stream-Deck-Software und ist das richtige Profil gewählt?',
        RUF,
        L('Software starten bzw. das richtige Profil wählen.')
      )
    ]
  }),
  fall({
    id: 'lib-netzwerk',
    titel: 'Steuer-Rechner erreicht den Prozessor nicht',
    symptom: 'NovaLCT, Tessera oder die OSC-Steuerung findet den Prozessor nicht.',
    bereich: 'netzwerk',
    stufe: 2,
    schritte: [
      q(
        'n1',
        2,
        'Steckt das Netzwerkkabel an Rechner und Switch – leuchten die LEDs an der Buchse?',
        zu('n2'),
        L('Kabel stecken bzw. tauschen.')
      ),
      q(
        'n2',
        3,
        'Ist der Rechner per LAN (nicht WLAN) im selben IP-Bereich wie der Prozessor ({prozessor.ip})?',
        RUF,
        L('IP-Adresse des Rechners passend einstellen bzw. WLAN ausschalten.')
      )
    ]
  }),
  fall({
    id: 'lib-ruckeln',
    titel: 'Das Bild ruckelt oder reißt',
    symptom: 'Bewegungen laufen nicht flüssig, das Bild zeigt Risse.',
    bereich: 'zuspieler',
    stufe: 2,
    schritte: [
      q('j1', 2, 'Ruckelt nur ein bestimmtes Video?', zu('j2'), zu('j3')),
      q(
        'j2',
        2,
        'Das Video mit dem Video-Konverter der Mottulbox umwandeln (z. B. HAP). Läuft es jetzt flüssig?',
        OK,
        RUF,
        { hinweis: 'Codec oder Auflösung sind dann zu schwer für den Rechner.' }
      ),
      q(
        'j3',
        3,
        'Haben Zuspieler, Software und Prozessor dieselbe Bildrate (z. B. alle 50 Hz)?',
        RUF,
        L('Bildraten angleichen.')
      )
    ]
  })
]

/** Fälle, die eine neue Anleitung schon enthält */
export const START_FAELLE = ['lib-wand-dunkel', 'lib-teil-dunkel', 'lib-kein-signal']
/** Bausteine einer neuen Anleitung (Kapitel Ein- und Ausschalten) */
export const START_BAUSTEINE = ['lib-ein-aus']

export const bausteinById = (id: string): Baustein | undefined => BAUSTEINE.find((b) => b.id === id)
export const fallById = (id: string): Fehlerfall | undefined =>
  FEHLERFAELLE.find((f) => f.id === id)

/** Blöcke eines Bausteins als Kopie mit Herkunft; `frisch`: neue Kennungen (Einfügen) */
export function kopiereBaustein(b: Baustein, frisch = true): Block[] {
  return b.bloecke.map((x) => {
    const her = { herkunft: { baustein: b.id, version: b.version } }
    const id = frisch ? uid() : x.id
    if (x.typ === 'schritte') {
      return {
        ...x,
        id,
        schritte: x.schritte.map((s) => ({ ...s, id: frisch ? uid() : s.id })),
        ...her
      }
    }
    if (x.typ === 'foto') return { ...x, id }
    return { ...x, id, ...her }
  })
}

/** Ein Fall samt allen Fällen, auf die er (auch über Umwege) verweist – als tiefe Kopie */
export function fallMitVerweisen(id: string): Fehlerfall[] {
  const out: Fehlerfall[] = []
  const seen = new Set<string>()
  const add = (fid: string): void => {
    if (seen.has(fid)) return
    seen.add(fid)
    const f = fallById(fid)
    if (!f) return
    out.push(structuredClone(f))
    for (const s of f.schritte) for (const z of [s.ja, s.nein]) if (z?.art === 'fall') add(z.id)
  }
  add(id)
  return out
}
