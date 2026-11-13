// Bühne des Video-Players – das Feld „was läuft“ der Arbeitsfläche (components/WorkArea.tsx):
// Vorschau (aktive Engine oder Spiegel der Ausgabe), Titel, Position, Transport,
// Loop/Zufall/Lautstärke/Übergang und Bild-Standzeit. Alle Befehle gehen an den main
// (autoritativ, spiegelt in alle Fenster).
//
// Die Vorschau ist so breit wie das Feld und 16:9 hoch – fehlt die Höhe, schrumpft ihr Rahmen
// (bis 120 px), und der Kasten darin passt sich ein (Container-Einheiten, keine Messung). Vorher
// wuchs sie nur mit der Breite und schob Transport und Playlist unter den Rand. Die Knöpfe
// stehen immer direkt darunter; freier Platz bleibt unten im Feld.

import {
  Clock,
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
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { flag, usePersistentState } from '@renderer/lib/usePersistentState'
import { cn } from '@renderer/lib/utils'
import type { LoopMode, PlayerState, TransitionMode } from '@shared/types'
import { fmtTime } from './format'
import { PlaybackEngine } from './PlaybackEngine'
import type { Playback } from './usePlayback'

export function Stage({
  pstate,
  playback
}: {
  pstate: PlayerState
  playback: Playback
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
  function toggleFps(): void {
    setShowFps((v) => !v)
  }

  function toggleLoop(): void {
    const order: LoopMode[] = ['all', 'one', 'none']
    const next = order[(order.indexOf(pstate.loop) + 1) % order.length]
    void cmd({ type: 'setLoop', loop: next })
  }
  const loopIcon =
    pstate.loop === 'one' ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />

  return (
    <Pane area="buehne" label="Bühne" testId="feld-buehne" scroll={false} kappen={false}>
      {/* Vorschau / Monitorhinweis. Bei offenem Ausgabefenster schaltet ein
      Klick zwischen bewegtem Spiegel und Standbild um. Der Rahmen ist 16:9 und darf schrumpfen
      (flex-shrink, höchstens bis 120 px); der Kasten darin ist so groß, wie Breite und Höhe des
      Rahmens für 16:9 erlauben (container-type: size). Gleicher Baum in jeder Stufe der
      Arbeitsfläche – sonst lüde die Engine beim Wechsel neu. */}
      <div className="mb-2 flex aspect-video min-h-[120px] w-full shrink items-center justify-center [container-type:size]">
        <div
          data-testid="vorschau"
          onClick={() => {
            if (pstate.outputOpen) togglePreviewLive()
          }}
          title={pstate.outputOpen ? 'Klick: Live-Vorschau ein/aus' : undefined}
          style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))' }}
          className={cn(
            'relative aspect-video overflow-hidden rounded-md border border-border bg-black',
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
          {pstate.outputOpen && (
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90">
              {previewLive ? 'Live · Klick = Standbild' : 'Standbild · Klick = Live'}
            </span>
          )}
        </div>
      </div>
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{current?.title ?? 'Nichts ausgewählt'}</p>
          <p className="truncate text-xs text-muted-foreground">
            {current
              ? `${current.width}×${current.height} · ${current.fitMode}`
              : 'Medien aus der Bibliothek hinzufügen (Doppelklick oder ziehen)'}
          </p>
        </div>
        <Button
          variant={showFps ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleFps}
          title="FPS-Anzeige (dargestellte Videobilder/s) über der Vorschau ein-/ausblenden"
        >
          <Gauge className="size-4" /> FPS
        </Button>
        {pstate.outputOpen ? (
          <Button
            variant={previewLive ? 'secondary' : 'ghost'}
            size="sm"
            onClick={togglePreviewLive}
            title="Bewegte Live-Vorschau des Wandbilds (stumm) – sonst Standbild"
          >
            <MonitorPlay className="size-4" /> Live-Vorschau
          </Button>
        ) : (
          <Badge tone="neutral">Vorschau</Badge>
        )}
      </div>

      {/* Seek */}
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
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))] disabled:opacity-50"
        />
        <span className="w-10 text-xs tabular-nums text-muted-foreground">{fmtTime(duration)}</span>
      </div>

      {/* Transport */}
      <div className="mb-3 flex shrink-0 items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void cmd({ type: 'prev' })}
          aria-label="Zurück"
        >
          <SkipBack className="size-5" />
        </Button>
        <Button
          size="icon"
          className="size-12 rounded-full"
          onClick={() => void cmd({ type: 'toggle' })}
          disabled={pstate.index < 0}
          aria-label={pstate.playing ? 'Pause' : 'Play'}
        >
          {pstate.playing ? <Pause className="size-6" /> : <Play className="size-6" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void cmd({ type: 'next' })}
          aria-label="Weiter"
        >
          <SkipForward className="size-5" />
        </Button>
      </div>

      {/* Tastatur-Kürzel (aktiv, wenn kein Textfeld fokussiert ist) */}
      <p className="mb-3 shrink-0 text-center text-[11px] leading-relaxed text-muted-foreground">
        Leertaste Play/Pause · ←/→ 5 s · J/L 10 s · P/N Titel · ↑/↓ Lautstärke · M Stumm
      </p>

      {/* Modi */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-center gap-2">
        <Button
          variant={pstate.loop !== 'none' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleLoop}
          title={`Loop: ${pstate.loop}`}
        >
          {loopIcon}
          {pstate.loop === 'none' ? 'Kein Loop' : pstate.loop === 'one' ? 'Eines' : 'Alle'}
        </Button>
        <Button
          variant={pstate.shuffle ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => void cmd({ type: 'setShuffle', shuffle: !pstate.shuffle })}
        >
          <Shuffle className="size-4" /> Zufall
        </Button>
        {/* Lautstärke: Stumm-Umschalter + Regler + Pegel. Regler zeigt den
            hörbaren Pegel (0 bei stumm); Ziehen hebt die Stummschaltung auf. */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => void cmd({ type: 'setMuted', muted: !pstate.muted })}
            title={pstate.muted ? 'Ton einschalten' : 'Stummschalten'}
            aria-label={pstate.muted ? 'Ton einschalten' : 'Stummschalten'}
          >
            {pstate.muted || pstate.volume === 0 ? (
              <VolumeX className="size-4" />
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
            className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))]"
          />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round((pstate.muted ? 0 : pstate.volume) * 100)} %
          </span>
        </div>
        <Select
          size="sm"
          value={pstate.transition}
          onChange={(e) =>
            void cmd({
              type: 'setTransition',
              transition: e.target.value as TransitionMode
            })
          }
          title="Übergang zwischen Medien"
        >
          <option value="cut">Schnitt (Cut)</option>
          <option value="crossfade">Überblenden (Overlap)</option>
        </Select>
        {pstate.transition === 'crossfade' && (
          <NumberField
            value={pstate.transitionMs}
            min={100}
            max={5000}
            className="w-20"
            aria-label="Überblenddauer (ms)"
            onCommit={(v) =>
              void cmd({ type: 'setTransition', transition: 'crossfade', transitionMs: v })
            }
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" /> Bild-Standzeit
          <NumberField
            value={pstate.imageDurationSec}
            min={1}
            max={3600}
            className="w-16"
            onCommit={(v) => void cmd({ type: 'setImageDuration', seconds: v })}
          />
          s
        </label>
      </div>
    </Pane>
  )
}
