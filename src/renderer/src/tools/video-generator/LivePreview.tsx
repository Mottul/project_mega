// Live-Vorschau des Video-Generators: spielt das Projekt in der App ab – ohne zu rechnen. Welche
// Elemente ein Ausgabebild zeigt, kommt aus derselben Zeitachse wie die Datei (frameAt), Ken
// Burns aus kenBurnsRect, die Übergänge als CSS-Nachbau von xfade (transitionCss), die Musik aus
// musicAt (Titelfolge, Überblendungen, Blenden, Absenken). Exakt wie das Ergebnis ist
// „Vorschau rechnen“; hier zählt, dass man Tempo, Reihenfolge und Wirkung sofort sieht.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import type { VgenElement } from '@shared/types'
import { frameAt, musicAt, outputSegments, type VgenPlan } from '@shared/videoGenPlan'
import { sourceUrl } from './meta'
import { basename, fmtDuration } from './presets'
import { ElementLayer } from './Stage'
import { transitionAudio, transitionLook } from './transitionCss'

/** Musik der Vorschau: ein <audio> je gerade klingendem Titel-Eintrag, nachgeführt je Bild. */
class MusicPreview {
  private els = new Map<number, HTMLAudioElement>()

  update(plan: VgenPlan, t: number, playing: boolean, muted: boolean): void {
    const { gain, parts } = musicAt(plan, t)
    const active = new Set(parts.map((p) => p.entry))
    for (const [k, el] of this.els) {
      if (active.has(k)) continue
      el.pause()
      el.removeAttribute('src')
      this.els.delete(k)
    }
    for (const p of parts) {
      let el = this.els.get(p.entry)
      if (!el) {
        const audio = new Audio()
        audio.preload = 'auto'
        void sourceUrl(p.path).then((u) => {
          if (u && this.els.get(p.entry) === audio) audio.src = u
        })
        this.els.set(p.entry, audio)
        el = audio
      }
      // HTMLMediaElement kann nicht lauter als 1 – Pegel über 0 dB klingt hier wie 0 dB
      el.volume = Math.min(1, Math.max(0, gain * p.weight))
      el.muted = muted
      if (playing && el.src) {
        if (Math.abs(el.currentTime - p.offsetSec) > 0.3) el.currentTime = p.offsetSec
        if (el.paused) void el.play().catch(() => {})
      } else if (!el.paused) el.pause()
    }
  }

  stop(): void {
    for (const el of this.els.values()) el.pause()
  }

  dispose(): void {
    for (const el of this.els.values()) {
      el.pause()
      el.removeAttribute('src')
    }
    this.els.clear()
  }
}

export function LivePreview({
  plan,
  elements,
  selectedId,
  sourceOverride
}: {
  plan: VgenPlan
  elements: VgenElement[]
  /** Auswahl: der Abspielkopf springt an den Anfang des Elements */
  selectedId: string | null
  /** Bereichsregler: Quelle eines Videos zu einem Zeitpunkt statt der Zeitachse */
  sourceOverride: { id: string; time: number } | null
}): JSX.Element {
  const total = plan.totalFrames
  const segs = useMemo(() => outputSegments(plan), [plan])
  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements])
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const frameRef = useRef(0)
  frameRef.current = frame
  const music = useRef<MusicPreview | null>(null)
  music.current ??= new MusicPreview()

  // Auswahl -> Abspielkopf an den ersten Abschnitt des Elements; auch, sobald ein gerade
  // gewähltes Element nach seiner Analyse im Plan auftaucht
  const selIndex = selectedId ? plan.elements.findIndex((e) => e.id === selectedId) : -1
  const selInPlan = selIndex >= 0
  useEffect(() => {
    if (!selInPlan) return
    const seg =
      segs.find((s) => s.index === selIndex && s.kind === 'element') ??
      segs.find((s) => s.index === selIndex)
    if (seg) setFrame(seg.at)
    // nur bei neuer Auswahl, nicht bei jeder Änderung am Plan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selInPlan])

  // Uhr: Echtzeit ab Startpunkt, je Bildschirmbild
  useEffect(() => {
    if (!playing || total <= 0) return
    const t0 = performance.now()
    const f0 = frameRef.current >= total - 1 && !plan.loop ? 0 : frameRef.current
    let raf = 0
    const tick = (now: number): void => {
      let f = f0 + ((now - t0) / 1000) * plan.fps
      if (f >= total) {
        if (!plan.loop) {
          setFrame(total - 1)
          setPlaying(false)
          return
        }
        f %= total
      }
      setFrame(f)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, total, plan.fps, plan.loop])

  // Musik je Bild nachführen
  useEffect(() => {
    music.current?.update(plan, frame / plan.fps, playing && !sourceOverride, muted)
  }, [plan, frame, playing, muted, sourceOverride])
  useEffect(() => {
    const m = music.current
    return () => m?.dispose()
  }, [])
  useEffect(() => {
    if (!playing) music.current?.stop()
  }, [playing])

  const f = Math.min(Math.max(0, Math.floor(frame)), Math.max(0, total - 1))
  const state = frameAt(plan, f, segs)
  const look = state.transition
    ? transitionLook(state.transition.kind, state.transition.progress)
    : null
  const vol = state.transition ? transitionAudio(state.transition.progress) : { a: 1, b: 0 }
  const current = state.layers[state.layers.length - 1]
  const currentEl = current ? byId.get(plan.elements[current.index].id) : undefined
  const override = sourceOverride
    ? plan.elements.find((e) => e.id === sourceOverride.id)
    : undefined
  const overrideEl = override ? byId.get(override.id) : undefined
  const bg = look?.under ?? plan.background.replace(/^0x/, '#')

  return (
    <div className="space-y-2">
      <div
        className="relative mx-auto w-full overflow-hidden rounded border border-border"
        style={{
          aspectRatio: `${plan.width} / ${plan.height}`,
          maxWidth: `calc(45vh * ${plan.width / plan.height})`,
          background: bg
        }}
        data-testid="vgen-stage"
      >
        {override && overrideEl ? (
          <ElementLayer
            el={overrideEl}
            ep={override}
            plan={plan}
            local={0}
            playing={false}
            volume={0}
            sourceTime={sourceOverride?.time}
          />
        ) : (
          state.layers.map((layer, i) => {
            const ep = plan.elements[layer.index]
            const el = byId.get(ep.id)
            if (!el) return null
            const isB = i === 1
            // Schlüssel nur die Element-id: nach dem Übergang rückt b an Platz 0 – mit Platz im
            // Schlüssel würde sein Video neu geladen und hakte an jeder Naht
            return (
              <ElementLayer
                key={ep.id}
                el={el}
                ep={ep}
                plan={plan}
                local={layer.local}
                playing={playing}
                volume={muted || !el.audio ? 0 : isB ? vol.b : state.layers.length > 1 ? vol.a : 1}
                style={look ? (isB ? look.b : look.a) : undefined}
              />
            )
          })
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zum Anfang"
          title="Zum Anfang"
          onClick={() => setFrame(0)}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={playing ? 'Pause' : 'Abspielen'}
          title={playing ? 'Pause (Leertaste)' : 'Abspielen (Leertaste)'}
          disabled={total <= 0}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <input
          type="range"
          aria-label="Abspielposition"
          className="min-w-0 flex-1 accent-primary"
          min={0}
          max={Math.max(0, total - 1)}
          step={1}
          value={f}
          onChange={(e) => setFrame(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault()
              setPlaying((p) => !p)
            }
          }}
        />
        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {fmtDuration(f / plan.fps)} / {fmtDuration(plan.durationSec)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={muted ? 'Ton an' : 'Ton aus'}
          title={muted ? 'Ton an' : 'Ton aus'}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {overrideEl
          ? `Quelle: ${basename(overrideEl.path)} bei ${fmtDuration(sourceOverride?.time ?? 0)}`
          : currentEl
            ? `${(current?.index ?? 0) + 1}: ${basename(currentEl.path)}${state.transition ? ' (Übergang)' : ''}`
            : ''}
        {' · '}Live-Vorschau: Übergänge nachgebildet – exakt zeigt es „Vorschau rechnen“.
      </p>
    </div>
  )
}
