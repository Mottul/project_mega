// Übernahme aus anderen Mottulbox-Werkzeugen (Plan Mini-Manual, „Aus Mottulbox“) – rein, getestet:
// Jingle-Player und OSC-Steuerung als Bedienfeld, Video-Player als Text im Kapitel Software. Immer
// eine Kopie: Kennungen der Werkzeuge (Pads, Kacheln, Medien) gelten nur auf diesem Rechner, und
// die Anleitung soll sich nicht still ändern, wenn jemand im Werkzeug weiterarbeitet.

import type { MediaItem, PlayerState, SavedPlaylist } from '@shared/types'
import { HOTKEYS } from '../jingle-player/hotkeys'
import type { Bank } from '../jingle-player/store'
import { NOVA_FN_LABEL, WIDGET_TYPE_LABEL } from '../osc-control/labels'
import type { OscProject, OscSet, OscWidget } from '../osc-control/store'
import { leereTaste, neueSeite, neuesBedienfeld, rasterMax } from './bedienfeld'
import { uid, type Bedienfeld, type Block, type Herkunft, type Taste } from './model'

const HEX = /^#[0-9a-f]{6}$/i
const hex = (c: string): string => (HEX.test(c) ? c.toLowerCase() : '')
const klemme = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)))
const ohneEndung = (n: string | null): string => (n ?? '').replace(/\.[^.]+$/, '')

/** höchstens so viele Seiten wie die Prüfung der Anleitung zulässt */
const SEITEN_MAX = 50

// ---------------------------------------------------------------- Jingle-Player

export const QUELLE_JINGLE = 'jingle'

export interface JingleQuelle {
  banks: Bank[]
  columns: number
  soloMode: boolean
}

/** Bänke als Seiten, belegte Pads als Tasten (Farbe, Tastaturkürzel als Notiz) */
export function ausJingle(j: JingleQuelle): Bedienfeld {
  const max = rasterMax('jingle')
  const spalten = klemme(j.columns || 4, 1, max.spalten)
  const pads = Math.max(1, ...j.banks.map((b) => b.pads.length))
  const zeilen = klemme(Math.ceil(pads / spalten), 1, max.zeilen)
  const seiten = j.banks.slice(0, SEITEN_MAX).map((bank) => ({
    id: uid(),
    name: bank.name.trim(),
    tasten: bank.pads.slice(0, spalten * zeilen).flatMap((p, i): Taste[] => {
      // ein leeres Pad bleibt ein leerer Platz
      if (!p.storedName) return []
      const name = p.label.trim() || ohneEndung(p.originalName) || `Pad ${i + 1}`
      return [
        {
          ...leereTaste(i % spalten, Math.floor(i / spalten)),
          titel: name,
          hintergrund: hex(p.color),
          funktion: `${p.mode === 'toggle' ? 'Startet bzw. stoppt' : 'Spielt'} „${name}“${p.loop ? ' in Schleife' : ''}`,
          notiz: HOTKEYS[i] ? `Tastatur: ${HOTKEYS[i].toUpperCase()}` : ''
        }
      ]
    })
  }))
  return {
    ...neuesBedienfeld('jingle', 'Jingle-Player'),
    spalten,
    zeilen,
    notiz: [
      'Im Jingle-Player oben **Live** wählen – dann spielt ein Klick oder die Taste auf der Tastatur den Jingle; Esc oder die Leertaste stoppt alles.',
      j.soloMode ? 'Es spielt immer nur ein Jingle: Ein neuer beendet den laufenden.' : ''
    ]
      .filter(Boolean)
      .join(' '),
    quelle: QUELLE_JINGLE,
    seiten: seiten.length ? seiten : [neueSeite()]
  }
}

// ---------------------------------------------------------------- OSC-Steuerung

export const quelleOsc = (p: { id: string }, s: { id: string }): string => `osc:${p.id}:${s.id}`

/** Was eine Kachel tut – in Worten für die Bedienung, ohne OSC-Adressen */
export function oscFunktion(w: OscWidget): string {
  const eintraege = w.items
    .map((i) => i.label.trim())
    .filter(Boolean)
    .join(' · ')
  if (w.target === 'nova') {
    const n = w.nova
    const wert =
      n.fn === 'brightnessSet'
        ? ` auf ${n.value} %`
        : n.fn === 'brightnessStep'
          ? ` um ${n.value > 0 ? '+' : ''}${n.value} %`
          : n.fn === 'preset' && eintraege
            ? `: ${eintraege}`
            : ''
    return `LED-Prozessor (NovaStar): ${NOVA_FN_LABEL[n.fn] ?? n.fn}${wert}`
  }
  switch (w.type) {
    case 'fader':
      return 'Regler'
    case 'knob':
      return 'Drehregler'
    case 'button':
      return 'Taster'
    case 'toggle':
      return 'Schalter (an/aus)'
    case 'xy':
      return 'XY-Feld'
    case 'color':
      return 'Farbwahl'
    case 'label':
      return ''
    case 'meter':
      return w.source === 'video' ? 'Zeigt die Restzeit des Videos' : 'Anzeige'
    case 'select':
      return eintraege ? `Auswahl: ${eintraege}` : 'Auswahl'
    case 'bank': {
      const art = w.bankMode === 'toggle' ? 'Schalter' : w.bankMode === 'knob' ? 'Regler' : 'Taster'
      return eintraege ? `${art}: ${eintraege}` : 'Bank'
    }
  }
}

/** Ein Set als Bedienfeld: Kacheln mit Position und Spanne auf dem Raster der OSC-Steuerung */
export function ausOscSet(p: OscProject, s: OscSet): Bedienfeld {
  const max = rasterMax('osc')
  const spalten = klemme(s.columns || 24, 1, max.spalten)
  // noch nicht platzierte Kacheln (gx -1) stehen auf keiner Fläche
  const platziert = s.widgets
    .filter((w) => w.gx >= 0 && w.gy >= 0 && w.gx < spalten)
    .sort((a, b) => a.gy - b.gy || a.gx - b.gx)
  const zeilen = klemme(
    Math.max(1, ...platziert.map((w) => w.gy + Math.max(1, w.ch))),
    1,
    max.zeilen
  )
  const belegt = new Set<string>()
  const tasten: Taste[] = []
  for (const w of platziert) {
    if (w.gy >= zeilen) continue
    const breite = klemme(w.cw, 1, spalten - w.gx)
    const hoehe = klemme(w.ch, 1, zeilen - w.gy)
    const plaetze: string[] = []
    for (let z = w.gy; z < w.gy + hoehe; z++)
      for (let x = w.gx; x < w.gx + breite; x++) plaetze.push(`${x},${z}`)
    if (plaetze.some((k) => belegt.has(k))) continue
    for (const k of plaetze) belegt.add(k)
    const farbe = hex(w.color)
    tasten.push({
      ...leereTaste(w.gx, w.gy),
      breite,
      hoehe,
      titel: w.label.trim() || WIDGET_TYPE_LABEL[w.type],
      // Überschriften in ihrer Farbe als Text, alle anderen Kacheln farbig
      textfarbe: w.type === 'label' ? farbe : '',
      hintergrund: w.type === 'label' ? '' : farbe,
      funktion: oscFunktion(w)
    })
  }
  const name =
    p.sets.length > 1 ? `${p.name.trim()} · ${s.name.trim()}` : s.name.trim() || p.name.trim()
  return {
    ...neuesBedienfeld('osc', name),
    spalten,
    zeilen,
    quelle: quelleOsc(p, s),
    seiten: [{ ...neueSeite(), tasten }]
  }
}

/** Ein Projekt der OSC-Steuerung: je Set ein Bedienfeld (Sets haben eigene Spaltenzahlen) */
export const ausOsc = (p: OscProject): Bedienfeld[] => p.sets.map((s) => ausOscSet(p, s))

// ---------------------------------------------------------------- Video-Player

/** Herkunft der übernommenen Blöcke – erneutes Übernehmen ersetzt genau diese */
export const HERKUNFT_PLAYER: Herkunft = { baustein: 'uebernahme-video-player', version: 1 }

export interface PlayerQuelle {
  playlists: SavedPlaylist[]
  bibliothek: MediaItem[]
  zustand: Pick<
    PlayerState,
    'playlist' | 'transition' | 'transitionMs' | 'idlePattern' | 'imageDurationSec'
  >
  /** Name des Ausgabe-Bildschirms, falls einer gewählt ist */
  ausgabe: string | null
}

const zahl = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',')

function dauer(m: MediaItem, bildSek: number): string {
  if (m.durationSec == null) return `Standbild, ${zahl(bildSek)} s`
  const s = Math.max(0, Math.round(m.durationSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Text für das Kapitel Software: Einstellungen in Sätzen, je Playlist eine nummerierte Liste */
export function ausPlayer(q: PlayerQuelle): Block[] {
  const z = q.zustand
  const leer =
    z.idlePattern === 'off'
      ? 'Läuft nichts, bleibt die Wand schwarz.'
      : z.idlePattern === 'custom'
        ? 'Läuft nichts, zeigt die Wand ein eigenes Standbild.'
        : 'Läuft nichts, zeigt die Wand ein Testbild.'
  const saetze = [
    q.ausgabe ? `Das Bild geht auf den Bildschirm **${q.ausgabe}**.` : '',
    z.transition === 'crossfade'
      ? `Zwischen den Clips wird überblendet (${zahl(z.transitionMs / 1000)} s).`
      : 'Die Clips folgen ohne Überblendung aufeinander.',
    leer
  ].filter(Boolean)
  const byId = new Map(q.bibliothek.map((m) => [m.id, m]))
  // gespeicherte Playlists; ohne sie die gerade geladene
  const listen = q.playlists.length
    ? q.playlists.map((p) => ({
        name: p.name.trim() || 'Playlist',
        clips: p.mediaIds.map((id) => byId.get(id)).filter((m): m is MediaItem => !!m)
      }))
    : z.playlist.length
      ? [{ name: 'Playlist', clips: z.playlist }]
      : []
  const block = (text: string): Block => ({
    id: uid(),
    typ: 'text',
    stufe: 1,
    text,
    herkunft: { ...HERKUNFT_PLAYER }
  })
  return [
    block(`**Mottulbox-Player**\n\n${saetze.join(' ')}`),
    ...listen.map((l) =>
      block(
        `**Playlist „${l.name}“**\n\n${
          l.clips.length
            ? l.clips
                .map(
                  (m, i) =>
                    `${i + 1}. ${m.title || m.originalName} – ${dauer(m, z.imageDurationSec)}`
                )
                .join('\n')
            : 'Noch leer.'
        }`
      )
    )
  ]
}

/** Blöcke einer früheren Übernahme ersetzen (an der Stelle der ersten), sonst anhängen */
export function playerEinsetzen(bloecke: Block[], neu: Block[]): Block[] {
  const alt = (b: Block): boolean =>
    'herkunft' in b && b.herkunft?.baustein === HERKUNFT_PLAYER.baustein
  const i = bloecke.findIndex(alt)
  if (i < 0) return [...bloecke, ...neu]
  const rest = bloecke.filter((b) => !alt(b))
  const vor = bloecke.slice(0, i).filter((b) => !alt(b)).length
  return [...rest.slice(0, vor), ...neu, ...rest.slice(vor)]
}

/** Bedienfelder einer früheren Übernahme (gleiche Quelle) ersetzen, neue anhängen */
export function felderEinsetzen(felder: Bedienfeld[], neu: Bedienfeld[]): Bedienfeld[] {
  const ersetzt = new Set<string>()
  const out = felder.map((b) => {
    // nur das erste Feld je Quelle – ein neues Feld steht nie zweimal (gleiche Kennung) da
    const n =
      b.quelle && !ersetzt.has(b.quelle) ? neu.find((x) => x.quelle === b.quelle) : undefined
    if (!n) return b
    ersetzt.add(n.quelle)
    return n
  })
  return [...out, ...neu.filter((n) => !ersetzt.has(n.quelle))]
}
