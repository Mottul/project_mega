// Bühne des Video-Players – das Feld „was läuft“ der Arbeitsfläche (components/WorkArea.tsx):
// Vorschau im Seitenverhältnis der Wand, Jetzt-Zeile mit großer Restzeit, Suchleiste, Transport
// mit Ton und Modi, „Danach: …“. Übergang und Bild-Standzeit stehen in der Schublade (Bereich
// „Wiedergabe“ in SetupPanels) – live stellt sie kaum jemand um, sie nahmen der Bühne zwei
// Zeilen. Alle Befehle gehen an den main (autoritativ, spiegelt in alle Fenster und aufs Handy).
//
// Die Vorschau ist so breit wie das Feld und so hoch, wie das Seitenverhältnis der Wand verlangt –
// fehlt die Höhe, schrumpft ihr Rahmen (bis 120 px), und der Kasten darin passt sich ein
// (Container-Einheiten, keine Messung). Die Knöpfe stehen immer direkt darunter; freier Platz
// bleibt unten im Feld.

import type { CSSProperties, ReactNode } from 'react'
import {
  Gauge,
  MonitorPlay,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import { Pane } from '@renderer/components/WorkArea'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { InfoTip } from '@renderer/components/ui/info-tip'
import { api } from '@renderer/lib/api'
import { useElementWidth } from '@renderer/lib/useElementWidth'
import { flag, usePersistentState } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'
import type { LoopMode, PlayerState } from '@shared/types'
import { fmtRest, fmtTime } from './format'
import { danach } from './layout'
import { PlaybackEngine } from './PlaybackEngine'
import { fitKurz } from './SetupPanels'
import type { Playback } from './usePlayback'

/** Ab dieser Breite stehen Ton, Transport und Modi in einer Zeile, darunter in zweien */
const EINZEILIG_AB = 460

const LOOP_FOLGE: LoopMode[] = ['all', 'one', 'none']
const LOOP_NAME: Record<LoopMode, string> = { all: 'Alle', one: 'Eines', none: 'Aus' }

/** Tastenkürzel aus usePlayback – hinter dem ⓘ statt als eigene Zeile */
const KUERZEL = [
  'Leertaste oder K: Play/Pause',
  '← / →: 5 s zurück / vor',
  'J / L: 10 s zurück / vor',
  'Pos1: an den Anfang',
  'P / N: voriger / nächster Titel',
  '↑ / ↓: Lautstärke',
  'M: Stumm',
  'Gilt, solange kein Eingabefeld den Fokus hat.'
].join('\n')

/** Ton links, Transport in der Mitte, Modi rechts – oder Transport oben, beides darunter */
const RASTER_EINZEILIG: CSSProperties = {
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
  gridTemplateAreas: '"ton transport modi"'
}
const RASTER_ZWEIZEILIG: CSSProperties = {
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gridTemplateAreas: '"transport transport" "ton modi"'
}

export function Stage({
  pstate,
  playback,
  wand
}: {
  pstate: PlayerState
  playback: Playback
  /**
   * Wand-Auflösung aus den Einstellungen (VideoPlayer), nicht `pstate.wall`: Die zieht der main
   * erst nach, wenn das Ausgabefenster aufgeht – die Vorschau stünde bis dahin im alten Format.
   */
  wand: { width: number; height: number }
}): JSX.Element {
  const { current, position, duration, seekable } = playback
  const cmd = api.player.command
  // Bewegte Live-Vorschau des Wandbilds AUCH bei offenem Ausgabefenster (passiver
  // Spiegel). Aus = statisches Standbild (spart Decodierung). Wahl wird gemerkt.
  const [previewLive, setPreviewLive] = usePersistentState('player:previewLive', false, flag)
  function togglePreviewLive(): void {
    setPreviewLive((v) => !v)
  }
  // FPS-Anzeige über der Vorschau (an/aus, gemerkt).
  const [showFps, setShowFps] = usePersistentState('player:showFps', false, flag)
  // Breite des Transport-Blocks: Die Spalte der Bühne ist je nach Stufe 400 bis 950 px breit
  const [transportRef, transportBreite] = useElementWidth<HTMLDivElement>()
  const einzeilig = transportBreite === 0 || transportBreite >= EINZEILIG_AB

  const loopNext = LOOP_FOLGE[(LOOP_FOLGE.indexOf(pstate.loop) + 1) % LOOP_FOLGE.length]
  const naechster = danach(pstate)
  const verhaeltnis = wand.width > 0 && wand.height > 0 ? wand.width / wand.height : 16 / 9

  return (
    <Pane area="buehne" label="Bühne" testId="feld-buehne" scroll={false} kappen={false}>
      {/* Vorschau / Monitorhinweis. Bei offenem Ausgabefenster schaltet ein Klick zwischen
      bewegtem Spiegel und Standbild um. Der Rahmen hat das Seitenverhältnis der Wand und darf
      schrumpfen (flex-shrink, höchstens bis 120 px; nie höher als 60 % des Fensters, sonst
      füllte eine Hochkant-Wand in der schmalen Stufe den ganzen Bildschirm); der Kasten darin ist
      so groß, wie Breite und Höhe des Rahmens erlauben (container-type: size). Gleicher Baum in
      jeder Stufe der Arbeitsfläche – sonst lüde die Engine beim Wechsel neu. */}
      <div
        className="mb-2 flex max-h-[60vh] min-h-[120px] w-full shrink items-center justify-center [container-type:size]"
        style={{ aspectRatio: verhaeltnis }}
      >
        <div
          data-testid="vorschau"
          onClick={() => {
            if (pstate.outputOpen) togglePreviewLive()
          }}
          title={pstate.outputOpen ? 'Klick: Live-Vorschau ein/aus' : undefined}
          style={{ aspectRatio: verhaeltnis, width: `min(100cqw, calc(100cqh * ${verhaeltnis}))` }}
          className={cn(
            'group relative overflow-hidden rounded-md border border-border bg-black',
            pstate.outputOpen && 'cursor-pointer'
          )}
        >
          {!pstate.outputOpen || previewLive ? (
            // Kein Ausgabefenster -> aktive Engine (treibt die Wiedergabe);
            // Ausgabefenster offen + Live an -> passiver Spiegel des Wandbilds.
            // key erzwingt sauberen Remount beim Wechsel aktiv <-> Spiegel.
            <PlaybackEngine
              key={pstate.outputOpen ? 'mirror' : 'live'}
              objectFit="contain"
              passive={pstate.outputOpen}
              showFps={showFps}
            />
          ) : (
            <>
              {current?.thumbUrl ? (
                <img
                  src={current.thumbUrl}
                  alt=""
                  className="h-full w-full object-contain opacity-60"
                />
              ) : null}
              <div className="absolute inset-0 flex items-center justify-center">
                <Badge tone="info">Wiedergabe läuft auf dem Monitor</Badge>
              </div>
            </>
          )}
          {/* Selten gebraucht: nur beim Darüberfahren oder mit der Tastatur sichtbar. Oben links,
          weil oben rechts die FPS-Zahl der Engine steht; z-20, weil die Ebenen der Engine (z-index
          bis 10) sonst darüber lägen. Der Klick darf nicht zur Vorschau durchgehen – die schaltet
          sonst Live/Standbild um. */}
          <div className="absolute left-1.5 top-1.5 z-20 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <OverlayKnopf
              an={showFps}
              onClick={() => setShowFps((v) => !v)}
              title="FPS-Anzeige (dargestellte Videobilder/s) über der Vorschau ein-/ausblenden"
            >
              <Gauge className="size-3.5" /> FPS
            </OverlayKnopf>
            {pstate.outputOpen && (
              <OverlayKnopf
                an={previewLive}
                onClick={togglePreviewLive}
                title="Bewegte Live-Vorschau des Wandbilds (stumm) – sonst Standbild"
              >
                <MonitorPlay className="size-3.5" /> Live-Vorschau
              </OverlayKnopf>
            )}
          </div>
          {pstate.outputOpen && (
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90">
              {previewLive ? 'Live · Klick = Standbild' : 'Standbild · Klick = Live'}
            </span>
          )}
        </div>
      </div>

      {/* Jetzt-Zeile: was läuft, und groß, wie lange noch – bei Bildern die Standzeit */}
      <div className="mb-2 flex shrink-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={current?.title}>
            {current?.title ?? 'Nichts ausgewählt'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {current
              ? `${current.width}×${current.height} · ${fitKurz(current.fitMode)}`
              : 'Medien aus der Bibliothek hinzufügen (Doppelklick oder ziehen)'}
          </p>
        </div>
        {current && (
          <span
            data-testid="restzeit"
            title="Restzeit"
            className={cn(
              'shrink-0 text-2xl font-semibold leading-none tabular-nums',
              !pstate.playing && 'text-muted-foreground'
            )}
          >
            {fmtRest(position, duration)}
          </span>
        )}
      </div>

      {/* Suchleiste */}
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {fmtTime(position)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.1}
          value={Math.min(position, duration || 1)}
          disabled={!seekable}
          onChange={(e) => playback.scrubTo(Number(e.target.value))}
          onPointerUp={playback.commitSeek}
          aria-label="Position"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))] disabled:opacity-50"
        />
        <span className="w-10 text-xs tabular-nums text-muted-foreground">{fmtTime(duration)}</span>
      </div>

      {/* Ton · Transport · Modi – die Bereiche wandern, die Reihenfolge im DOM bleibt */}
      <div
        ref={transportRef}
        className="mb-2 grid shrink-0 items-center gap-x-3 gap-y-2"
        style={einzeilig ? RASTER_EINZEILIG : RASTER_ZWEIZEILIG}
      >
        {/* Ton: Stumm-Umschalter, Regler, Pegel. Der Regler zeigt den hörbaren Pegel (0 bei
        stumm); Ziehen hebt die Stummschaltung auf. „Stumm“ steht in Warnfarbe da – der Player
        startet stumm, und ein stummer Einspieler fällt sonst erst in der Show auf. */}
        <div className="flex min-w-0 items-center gap-1.5 justify-self-start [grid-area:ton]">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => void cmd({ type: 'setMuted', muted: !pstate.muted })}
            title={pstate.muted ? 'Ton einschalten (M)' : 'Stummschalten (M)'}
            aria-label={pstate.muted ? 'Ton einschalten' : 'Stummschalten'}
          >
            {pstate.muted || pstate.volume === 0 ? (
              <VolumeX className={cn('size-4', pstate.muted && 'text-warning')} />
            ) : pstate.volume < 0.5 ? (
              <Volume1 className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={pstate.muted ? 0 : pstate.volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              void cmd({ type: 'setVolume', volume: v })
              // Am Regler ziehen hebt Stumm auf (sonst bliebe es lautlos).
              if (pstate.muted && v > 0) void cmd({ type: 'setMuted', muted: false })
            }}
            aria-label="Lautstärke"
            className="h-1.5 w-24 min-w-0 shrink cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))]"
          />
          <span
            data-testid="ton"
            className={cn(
              'w-11 shrink-0 text-right text-xs tabular-nums',
              pstate.muted ? 'font-medium text-warning' : 'text-muted-foreground'
            )}
          >
            {pstate.muted ? 'Stumm' : `${Math.round(pstate.volume * 100)} %`}
          </span>
        </div>

        <div className="flex items-center gap-2 justify-self-center [grid-area:transport]">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void cmd({ type: 'prev' })}
            aria-label="Zurück"
            title="Voriger Titel (P)"
          >
            <SkipBack className="size-5" />
          </Button>
          <Button
            size="icon"
            className="size-12 rounded-full"
            onClick={() => void cmd({ type: 'toggle' })}
            disabled={pstate.index < 0}
            aria-label={pstate.playing ? 'Pause' : 'Play'}
            title="Play/Pause (Leertaste)"
          >
            {pstate.playing ? <Pause className="size-6" /> : <Play className="size-6" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void cmd({ type: 'next' })}
            aria-label="Weiter"
            title="Nächster Titel (N)"
          >
            <SkipForward className="size-5" />
          </Button>
        </div>

        {/* Modi als Symbole wie in jedem Player; an = Akzentfarbe, der Name steht im Tooltip */}
        <div className="flex items-center gap-1 justify-self-end [grid-area:modi]">
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-8', pstate.loop !== 'none' && MODUS_AN)}
            onClick={() => void cmd({ type: 'setLoop', loop: loopNext })}
            aria-label={`Loop: ${LOOP_NAME[pstate.loop]}`}
            title={`Loop: ${LOOP_NAME[pstate.loop]} – Klick: ${LOOP_NAME[loopNext]}`}
          >
            {pstate.loop === 'one' ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-8', pstate.shuffle && MODUS_AN)}
            onClick={() => void cmd({ type: 'setShuffle', shuffle: !pstate.shuffle })}
            aria-label="Zufall"
            aria-pressed={pstate.shuffle}
            title={pstate.shuffle ? 'Zufall: an' : 'Zufall: aus'}
          >
            <Shuffle className="size-4" />
          </Button>
          <InfoTip label="Tastenkürzel" text={KUERZEL} className="ml-1" />
        </div>
      </div>

      {/* Was als Nächstes kommt – gilt auch bei Zufall: der main würfelt den nächsten vorab */}
      {naechster !== null && (
        <p
          data-testid="danach"
          className="shrink-0 truncate text-center text-xs text-muted-foreground"
          title={naechster}
        >
          Danach: <span className="text-foreground/80">{naechster}</span>
        </p>
      )}
    </Pane>
  )
}

/** Eingeschalteter Modus (Loop, Zufall): Akzentfarbe, damit „an“ auch aus Abstand erkennbar ist */
const MODUS_AN = 'bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary'

/** Kleiner Knopf auf dem Videobild (FPS, Live-Vorschau) – auf Schwarz, daher feste Farben */
function OverlayKnopf({
  an,
  onClick,
  title,
  children
}: {
  an: boolean
  onClick: () => void
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={an}
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
        an ? 'text-primary' : 'text-white/90'
      )}
    >
      {children}
    </button>
  )
}
