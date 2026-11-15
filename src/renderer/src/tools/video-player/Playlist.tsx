// Playlist des Video-Players – ein Feld der Arbeitsfläche (components/WorkArea.tsx). Im Kopf
// Anzahl und Gesamtdauer, rechts „Speichern“ und das Menü „⋯“ mit „Playlist leeren …“: Es fragt
// nach, denn ein Klick daneben nähme in der Show das Bild weg. Darunter die gespeicherten
// Playlists als Reiter und die laufende Liste – nur sie scrollt. Der Zustand bleibt im main
// (api.player.command), das Fenster spiegelt ihn.
//
// Eine Zeile: Griff, Nummer bzw. ▶, Miniatur, Titel, „Danach“ am nächsten Eintrag, Dauer, ✕.
// Umsortiert wird am Griff (components/ui/sortable.tsx) oder mit den Pfeil-Knöpfen, die mit dem
// Tastaturfokus in der Zeile erscheinen. Medien aus der Bibliothek (text/x-media-id) nimmt die
// ganze Liste an: auf einer Zeile davor, sonst am Ende.
//
// Der laufende Eintrag bleibt im sichtbaren Teil der Liste: Wechselt er, rückt die Liste nach –
// nur die Liste. Ohne `container: 'nearest'` schiebt scrollIntoView auch die Bereiche darum mit
// (gemessen); in der Stufe schmal liefe die Bühne bei jedem Titelwechsel aus dem Bild. Nicht,
// während die Maus über der Liste arbeitet oder gezogen wird: Die Zeilen rückten sonst unter dem
// Zeiger weg, und ein Klick auf ✕ träfe einen anderen Eintrag. Nachgeholt wird, sobald die Hand
// weg ist – oder die Maus drei Sekunden still über der Liste liegt (in der Show bleibt sie dort
// gern liegen; die Liste folgte sonst nie mehr).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Ellipsis,
  Film,
  Image as ImageIcon,
  Play,
  Save,
  X
} from 'lucide-react'
import { Pane } from '@renderer/components/WorkArea'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Menu, MenuItem } from '@renderer/components/ui/menu'
import { Griff, useSortable } from '@renderer/components/ui/sortable'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import type { MediaItem, PlayerState, SavedPlaylist } from '@shared/types'
import { fmtTime } from './format'
import { danachIndex, gesamtdauer, zeilenSchluessel, zielPlatz } from './layout'

/** Knöpfe im Kopf des Felds: niedrig genug, dass der Kopf 40 px hoch bleibt */
const KOPF_KNOPF = 'h-6 gap-1 px-1.5 text-muted-foreground hover:text-foreground'

/** So lange nach der letzten Mausbewegung über der Liste rückt sie nicht von selbst nach */
const RUHE_MS = 3000

/** Nur die Liste scrollen. `container` kennt Chromium seit Version 140, lib.dom noch nicht. */
const NUR_IN_DER_LISTE = { block: 'nearest', container: 'nearest' } as ScrollIntoViewOptions

/** Das Feld „Playlist“: Kopf mit Anzahl, Gesamtdauer, „Speichern“ und „⋯“; Reiter, Liste */
export function PlaylistFeld({
  pstate,
  saved,
  onSaveSaved
}: {
  pstate: PlayerState
  saved: SavedPlaylist[]
  onSaveSaved: (next: SavedPlaylist[]) => Promise<void>
}): JSX.Element {
  const n = pstate.playlist.length
  return (
    <Pane
      area="playlist"
      testId="feld-playlist"
      title="Playlist"
      count={
        n > 0
          ? `${n} · ${fmtTime(gesamtdauer(pstate.playlist, pstate.imageDurationSec))}`
          : undefined
      }
      actions={
        <>
          <PlaylistSpeichern saved={saved} playlist={pstate.playlist} onSave={onSaveSaved} />
          <Menu
            label="Playlist"
            knopf={<Ellipsis className="size-4" />}
            knopfLabel="Mehr zur Playlist"
            title="Mehr"
            align="end"
            className="size-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <MenuItem
              disabled={n === 0}
              onSelect={() => void leeren(pstate.playlist.map((m) => m.id))}
            >
              Playlist leeren …
            </MenuItem>
          </Menu>
        </>
      }
      scroll={false}
    >
      <PlaylistTabs saved={saved} onSave={onSaveSaved} />
      <Playlist pstate={pstate} />
    </Pane>
  )
}

/**
 * „Playlist leeren …“ – erst nach der Rückfrage. Hat ein anderes Fenster oder das Handy die Liste
 * währenddessen geändert, gilt die Antwort nicht für die neue: dann noch einmal fragen.
 */
async function leeren(ids: string[]): Promise<void> {
  const n = ids.length
  const ok = await api.confirm({
    message: `Playlist leeren (${n === 1 ? 'ein Eintrag' : `${n} Einträge`})?`,
    detail: 'Was gerade läuft, stoppt. Die Medien bleiben in der Bibliothek.',
    confirmLabel: 'Leeren',
    danger: true
  })
  if (!ok) return
  const jetzt = (await api.player.getState()).playlist.map((m) => m.id)
  if (jetzt.join('\n') !== ids.join('\n')) {
    if (jetzt.length > 0) await leeren(jetzt)
    return
  }
  await api.player.command({ type: 'clear' })
}

/** „Speichern“ im Kopf: fragt im Kopf nach dem Namen; ein gleichnamiger Stand wird ersetzt */
function PlaylistSpeichern({
  saved,
  playlist,
  onSave
}: {
  saved: SavedPlaylist[]
  playlist: MediaItem[]
  /** neue Liste merken (settings.json) */
  onSave: (next: SavedPlaylist[]) => Promise<void>
}): JSX.Element {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  function speichern(): void {
    const n = name.trim()
    setNaming(false)
    if (!n) return
    const next = [
      ...saved.filter((p) => p.name !== n),
      { name: n, mediaIds: playlist.map((m) => m.id) }
    ].sort((a, b) => a.name.localeCompare(b.name))
    void onSave(next)
  }

  if (!naming)
    return (
      <Button
        variant="ghost"
        size="sm"
        className={KOPF_KNOPF}
        disabled={playlist.length === 0}
        title="Playlist unter einem Namen speichern"
        onClick={() => {
          setName('')
          setNaming(true)
        }}
      >
        <Save className="size-3.5" /> Speichern
      </Button>
    )
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        aria-label="Name der Playlist"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') speichern()
          else if (e.key === 'Escape') setNaming(false)
        }}
        placeholder="Name…"
        className="h-6 w-32 rounded border border-border bg-background px-2 text-xs"
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Unter diesem Namen speichern"
        title="Unter diesem Namen speichern (Enter)"
        onClick={speichern}
      >
        <Check className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Nicht speichern"
        title="Nicht speichern (Esc)"
        onClick={() => setNaming(false)}
      >
        <X className="size-3.5" />
      </Button>
    </span>
  )
}

/**
 * Gespeicherte Playlists als Reiter (prominent mit Akzentfarbe + Anzahl) – in EINER Zeile, bei
 * vielen waagrecht scrollbar: Brächen sie um, nähmen sie der Liste darunter Zeilen weg. Ohne
 * gespeicherte Playlists fehlt die Zeile ganz.
 */
export function PlaylistTabs({
  saved,
  onSave
}: {
  saved: SavedPlaylist[]
  /** neue Liste merken (settings.json) */
  onSave: (next: SavedPlaylist[]) => Promise<void>
}): JSX.Element | null {
  async function loadSaved(p: SavedPlaylist): Promise<void> {
    // Atomar ersetzen statt clear + add: kein Zwischenstopp über eine leere Liste
    // -> der Wechsel pausiert nicht und blendet nicht kurz aufs Idle-Bild.
    await api.player.command({ type: 'replace', mediaIds: p.mediaIds })
  }

  if (saved.length === 0) return null
  return (
    <div className="mb-2 flex shrink-0 items-center gap-2 overflow-x-auto pb-1">
      {saved.map((p) => (
        <span
          key={p.name}
          className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 py-1 pl-3 pr-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/70 hover:bg-primary/20"
        >
          <button
            onClick={() => void loadSaved(p)}
            title={`Playlist „${p.name}" laden (${p.mediaIds.length} Medien)`}
            className="flex items-center gap-1.5"
          >
            {p.name}
            <span className="rounded-full bg-primary/25 px-1.5 text-xs tabular-nums text-primary">
              {p.mediaIds.length}
            </span>
          </button>
          <button
            onClick={() =>
              void api
                .confirm({
                  message: `Playlist „${p.name}“ löschen?`,
                  detail: 'Die Medien bleiben in der Bibliothek.',
                  confirmLabel: 'Löschen',
                  danger: true
                })
                // erst nach der Rückfrage den aktuellen Stand lesen: Während der
                // Dialog offen war, kann ein anderes Fenster eine Playlist gespeichert
                // haben – die alte Liste würde sie wieder löschen
                .then(async (ok) => {
                  if (!ok) return
                  const cur = (await api.getSettings()).player.savedPlaylists ?? []
                  await onSave(cur.filter((x) => x.name !== p.name))
                })
            }
            className="text-muted-foreground hover:text-danger"
            title="Playlist löschen"
            aria-label={`Playlist „${p.name}“ löschen`}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  )
}

/** Die laufende Playlist – füllt das Feld unter den Reitern und scrollt in sich */
export function Playlist({ pstate }: { pstate: PlayerState }): JSX.Element {
  const cmd = api.player.command
  const liste = pstate.playlist
  const schluessel = zeilenSchluessel(liste)
  const naechster = danachIndex(pstate)
  const listeRef = useRef<HTMLDivElement>(null)

  // Am Griff ziehen: Zeile `von` vor bzw. hinter `ziel` – der main rechnet mit Plätzen
  const sort = useSortable((von, ziel, hinter) => {
    const from = schluessel.indexOf(von)
    const to = zielPlatz(from, schluessel.indexOf(ziel), hinter)
    if (to >= 0 && to !== from) void cmd({ type: 'move', from, to })
  })

  // Die Hand an der Liste: Die Maus bewegt sich darüber (`bewegt`: Zeitpunkt, 0 = nicht über der
  // Liste) oder ein Ziehen läuft (auch aus der Bibliothek). Eine Maus, die nur über der Liste
  // liegen bleibt, hält das Nachrücken nicht auf – nach RUHE_MS rückt die Liste trotzdem nach.
  // `offen`: Der laufende Eintrag hat gewechselt, die Liste ist noch nicht nachgerückt.
  const hand = useRef({ bewegt: 0, x: -1, y: -1, zieht: false, offen: false, timer: 0 })
  const holeHeran = useCallback((): void => {
    const h = hand.current
    window.clearTimeout(h.timer)
    const ruhe = h.bewegt ? RUHE_MS - (Date.now() - h.bewegt) : 0
    if (h.zieht || ruhe > 0) {
      h.offen = true
      if (!h.zieht) h.timer = window.setTimeout(holeHeran, ruhe + 50)
      return
    }
    h.offen = false
    listeRef.current
      ?.querySelector<HTMLElement>(':scope > [aria-current="true"]')
      ?.scrollIntoView(NUR_IN_DER_LISTE)
  }, [])

  // Neuer laufender Eintrag – auch derselbe Platz mit einem anderen Medium (Playlist geladen)
  const aktuell = schluessel[pstate.index] ?? ''
  useLayoutEffect(() => holeHeran(), [pstate.index, aktuell, holeHeran])

  useEffect(() => {
    const h = hand.current
    const an = (): void => {
      hand.current.zieht = true
    }
    // Nach einem Ziehen (oder spätestens beim nächsten Klick, falls das Ende nicht ankam)
    const aus = (): void => {
      if (!hand.current.zieht) return
      hand.current.zieht = false
      if (hand.current.offen) holeHeran()
    }
    window.addEventListener('dragstart', an)
    window.addEventListener('dragend', aus)
    window.addEventListener('drop', aus)
    window.addEventListener('pointerdown', aus)
    return () => {
      window.clearTimeout(h.timer)
      window.removeEventListener('dragstart', an)
      window.removeEventListener('dragend', aus)
      window.removeEventListener('drop', aus)
      window.removeEventListener('pointerdown', aus)
    }
  }, [holeHeran])

  // Pfeil-Knöpfe: Die Zeile, die nach unten wandert, setzt React neu ins DOM, ihr Knopf verliert
  // dabei den Fokus. Ist der Platz im main umgesetzt, bekommt ihn derselbe Knopf zurück.
  // Nur kurz nach dem Klick: Lehnt der main den Befehl ab, griffe der Merker sonst Minuten später
  // bei einer ganz anderen Verschiebung derselben Zeile.
  const fokus = useRef<{
    key: string
    von: number
    richtung: 'hoch' | 'runter'
    zeit: number
  } | null>(null)
  useLayoutEffect(() => {
    const f = fokus.current
    if (!f) return
    if (Date.now() - f.zeit > 2000) {
      fokus.current = null
      return
    }
    const i = schluessel.indexOf(f.key)
    if (i === f.von) return
    fokus.current = null
    if (i < 0 || (document.activeElement && document.activeElement !== document.body)) return
    const zeile = listeRef.current?.children[i]
    const knopf =
      zeile?.querySelector<HTMLElement>(`[data-pfeil="${f.richtung}"]:not(:disabled)`) ??
      zeile?.querySelector<HTMLElement>('[data-pfeil]:not(:disabled)')
    knopf?.focus()
  })

  function verschiebe(i: number, richtung: 'hoch' | 'runter'): void {
    const to = richtung === 'hoch' ? i - 1 : i + 1
    if (to < 0 || to >= liste.length) return
    fokus.current = { key: schluessel[i], von: i, richtung, zeit: Date.now() }
    void cmd({ type: 'move', from: i, to })
  }

  // Medien aus der Bibliothek: auf einer Zeile davor, sonst ans Ende. Zeilen, die gerade zum
  // Sortieren gezogen werden, halten das Ereignis selbst an (sortable.tsx) – es kommt nur einmal
  // hier an. Die alte Fassung nahm es an der Zeile UND an der Liste an: zwei Einträge je Ziehen.
  function onDrop(e: DragEvent): void {
    e.preventDefault()
    const mediaId = e.dataTransfer.getData('text/x-media-id')
    if (!mediaId) return
    const zeile = (e.target as Element).closest<HTMLElement>('[data-sort-id]')
    const at = zeile ? schluessel.indexOf(zeile.dataset.sortId ?? '') : -1
    void cmd(
      at >= 0 ? { type: 'add', mediaIds: [mediaId], at } : { type: 'add', mediaIds: [mediaId] }
    )
  }

  return (
    <div
      ref={listeRef}
      data-testid="playlist-liste"
      className="min-h-0 flex-1 select-none space-y-1 overflow-auto"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPointerMove={(e) => {
        // Nur echte Bewegung: Chromium schickt nach Änderungen an der Seite (die Restzeit tickt)
        // Mausereignisse ohne neue Lage – sonst gälte eine ruhende Maus nie als ruhend
        const h = hand.current
        if (e.clientX === h.x && e.clientY === h.y) return
        h.x = e.clientX
        h.y = e.clientY
        h.bewegt = Date.now()
      }}
      onPointerLeave={() => {
        hand.current.bewegt = 0
        hand.current.x = hand.current.y = -1
        if (hand.current.offen) holeHeran()
      }}
    >
      {liste.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Playlist leer. Medien aus der Bibliothek doppelklicken oder herziehen.
        </p>
      ) : (
        liste.map((m, i) => {
          const key = schluessel[i]
          const ziel = sort.item(key)
          const laeuft = i === pstate.index
          return (
            <div
              key={key}
              {...ziel}
              aria-current={laeuft ? 'true' : undefined}
              // relative: Die versteckten Pfeile (sr-only = absolut) blieben sonst nicht in der
              // Liste – Zeilen unter ihrem Rand machten die ganze Seite höher (1024 × 600: +40 px)
              className={cn(
                'group relative flex items-center gap-2 rounded-md border px-2 py-0.5 text-sm',
                laeuft ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted/40',
                ziel.className
              )}
            >
              <Griff sort={sort} id={key} was="Eintrag" />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => void cmd({ type: 'goto', index: i })}
              >
                <span className="flex w-6 shrink-0 justify-end text-xs tabular-nums text-muted-foreground">
                  {laeuft && pstate.playing ? <Play className="size-3.5 text-primary" /> : i + 1}
                </span>
                <Miniatur m={m} />
                <span className="truncate" title={m.title}>
                  {m.title}
                </span>
              </button>
              {i === naechster && (
                <Badge
                  tone="neutral"
                  data-testid="playlist-danach"
                  className="shrink-0 px-1.5 py-0 text-[10px]"
                >
                  Danach
                </Badge>
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {m.durationSec ? fmtTime(m.durationSec) : 'Bild'}
              </span>
              {/* Für die Tastatur: unsichtbar, bis ein Element der Zeile den Tastaturfokus hat –
              mit der Maus wird am Griff gezogen, und die Zeile springt beim Klicken nicht */}
              <span className="sr-only flex shrink-0 items-center group-has-[:focus-visible]:not-sr-only">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 text-muted-foreground"
                  data-pfeil="hoch"
                  disabled={i === 0}
                  aria-label="Eintrag nach oben"
                  title="nach oben"
                  onClick={() => verschiebe(i, 'hoch')}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 text-muted-foreground"
                  data-pfeil="runter"
                  disabled={i === liste.length - 1}
                  aria-label="Eintrag nach unten"
                  title="nach unten"
                  onClick={() => verschiebe(i, 'runter')}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </span>
              <button
                type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => void cmd({ type: 'remove', index: i })}
                aria-label="Entfernen"
                title="Aus der Playlist entfernen"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

/** Miniatur 40 × 22 px – ohne Vorschaubild das Symbol der Art */
function Miniatur({ m }: { m: MediaItem }): JSX.Element {
  return m.thumbUrl ? (
    <img
      src={m.thumbUrl}
      alt=""
      // sonst zöge ein Druck aufs Bild das Bild statt nichts (gezogen wird am Griff)
      draggable={false}
      loading="lazy"
      className="h-[22px] w-10 shrink-0 rounded-sm bg-black object-cover"
    />
  ) : (
    <span className="flex h-[22px] w-10 shrink-0 items-center justify-center rounded-sm bg-black text-muted-foreground">
      {m.kind === 'image' ? <ImageIcon className="size-3" /> : <Film className="size-3" />}
    </span>
  )
}
