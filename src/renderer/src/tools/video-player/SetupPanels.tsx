// Schublade des Video-Players: Wand-Auflösung, Bild einpassen (Fit, Blur), Import (Encoder,
// Parallelität, Lautheit) und Idle-Bild. Die Werte hält VideoPlayer (aus settings.json, auch von
// anderen Fenstern und dem Handy geändert); hier nur Anzeige und Änderungen.

import { Clock, Gauge, Image as ImageIcon, Ratio } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Field } from '@renderer/components/ui/field'
import { NumberField } from '@renderer/components/ui/number-field'
import { Select } from '@renderer/components/ui/select'
import { PanelSection } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { updateSettings, useSettings } from '@renderer/lib/settings'
import { LOUDNESS_CHOICES } from '@shared/loudness'
import type {
  FitMode,
  MediaItem,
  PatternId,
  PlayerEncoderStatus,
  PlayerState,
  SettingsPatch
} from '@shared/types'
import { PATTERN_OPTIONS } from '../test-patterns/patterns'

/** Nur die geänderten Felder – main führt sie feldweise zusammen. */
export type PersistPlayer = (patch: NonNullable<SettingsPatch['player']>) => Promise<void>

const FIT_OPTIONS: { value: FitMode; label: string; short: string }[] = [
  { value: 'blur', label: 'Blur-Fill (unscharfer Hintergrund)', short: 'Blur-Fill' },
  { value: 'bars', label: 'Schwarze Ränder (Letter-/Pillarbox)', short: 'Schwarze Ränder' },
  { value: 'stretch', label: 'Strecken (auf Wand-Auflösung ziehen)', short: 'Strecken' },
  {
    value: 'original',
    label: 'Unverändert (nicht umrechnen)',
    short: 'Unverändert'
  }
]

const RES_PRESETS = [
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '2560 × 1440', w: 2560, h: 1440 },
  { label: '3840 × 2160', w: 3840, h: 2160 }
]

export function WallSection({
  wallW,
  wallH,
  onWall,
  onFromMonitor,
  canFromMonitor
}: {
  wallW: number
  wallH: number
  onWall: (w: number, h: number) => void
  onFromMonitor: () => void
  canFromMonitor: boolean
}): JSX.Element {
  return (
    <PanelSection id="wall" title="Wand" icon={Ratio} summary={`${wallW} × ${wallH}`}>
      <Field
        label="Wand-Auflösung"
        hint="Auf diese Größe werden neue Medien beim Import gebacken. „Vom Monitor“ übernimmt die Auflösung des Ausgabe-Monitors."
      >
        <div className="flex items-center gap-2">
          <NumberField
            value={wallW}
            min={2}
            max={16384}
            aria-label="Breite"
            onCommit={(v) => onWall(v, wallH)}
          />
          <span className="text-muted-foreground">×</span>
          <NumberField
            value={wallH}
            min={2}
            max={16384}
            aria-label="Höhe"
            onCommit={(v) => onWall(wallW, v)}
          />
        </div>
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {RES_PRESETS.map((r) => (
          <Button key={r.label} variant="outline" size="sm" onClick={() => onWall(r.w, r.h)}>
            {r.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={onFromMonitor}
          disabled={!canFromMonitor}
          title="Auflösung des gewählten Ausgabe-Monitors übernehmen"
        >
          Vom Monitor
        </Button>
      </div>
    </PanelSection>
  )
}

export function FitSection({
  fit,
  setFit,
  blurStrength,
  setBlurStrength,
  blurDarken,
  setBlurDarken,
  persist,
  library,
  wallW,
  wallH
}: {
  fit: FitMode
  setFit: (v: FitMode) => void
  blurStrength: number
  setBlurStrength: (v: number) => void
  blurDarken: number
  setBlurDarken: (v: number) => void
  persist: PersistPlayer
  library: MediaItem[]
  wallW: number
  wallH: number
}): JSX.Element {
  return (
    <PanelSection
      id="prep"
      title="Bild einpassen"
      icon={ImageIcon}
      summary={
        fit === 'blur'
          ? `Blur-Fill · Blur ${blurStrength} % · Abdunkeln ${blurDarken} %`
          : FIT_OPTIONS.find((o) => o.value === fit)?.short
      }
    >
      <Field
        label="Fit-Modus"
        hint="Was mit Medien in einem anderen Seitenverhältnis passiert. Gilt für neue Importe. Unverändert: keine Umrechnung – die Datei wird 1:1 übernommen und beim Abspielen mit Rändern eingepasst; nur Formate, die der Player direkt kann (H.264/H.265 in MP4/MOV, VP9/AV1, Bilder), ohne Deinterlace, HDR-Anpassung und Lautheit."
      >
        <Select
          value={fit}
          onChange={(e) => {
            const v = e.target.value as FitMode
            setFit(v)
            void persist({ defaultFit: v })
          }}
        >
          {FIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {fit === 'blur' && (
        <>
          <Field label="Blur-Stärke" aside={`${blurStrength} %`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={blurStrength}
              onChange={(e) => setBlurStrength(Number(e.target.value))}
              onPointerUp={(e) =>
                void persist({
                  blurStrength: Number((e.target as HTMLInputElement).value)
                })
              }
              className="w-full accent-primary"
            />
          </Field>
          <Field label="Abdunkelung" aside={`${blurDarken} %`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={blurDarken}
              onChange={(e) => setBlurDarken(Number(e.target.value))}
              onPointerUp={(e) =>
                void persist({
                  blurDarken: Number((e.target as HTMLInputElement).value)
                })
              }
              className="w-full accent-primary"
            />
          </Field>
          {library.some((m) => m.fitMode === 'blur') && (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                void api.player.reconvert(
                  library.filter((m) => m.fitMode === 'blur').map((m) => m.id),
                  { width: wallW, height: wallH }
                )
              }
              title="Aktuelle Blur-Einstellungen auf bereits importierte Blur-Medien anwenden (kann dauern)"
            >
              Vorhandene neu einbacken
            </Button>
          )}
        </>
      )}
    </PanelSection>
  )
}

export function ImportSection({
  enc,
  encoder,
  setEncoder,
  loudnorm,
  setLoudnorm,
  loudnormI,
  setLoudnormI,
  persist,
  library,
  wallW,
  wallH
}: {
  enc: PlayerEncoderStatus | null
  encoder: string
  setEncoder: (v: string) => void
  loudnorm: boolean
  setLoudnorm: (v: boolean) => void
  loudnormI: number
  setLoudnormI: (v: number) => void
  persist: PersistPlayer
  library: MediaItem[]
  wallW: number
  wallH: number
}): JSX.Element {
  const importConcurrency = useSettings((s) => s.player.importConcurrency) ?? 2
  const encoderSummary =
    encoder === 'auto'
      ? 'Encoder automatisch'
      : (enc?.available.find((a) => a.id === encoder)?.label ?? encoder)
  return (
    <PanelSection
      id="import"
      title="Import"
      icon={Gauge}
      summary={`${encoderSummary} · ${importConcurrency === 1 ? 'nacheinander' : `${importConcurrency} parallel`} · Lautheit ${loudnorm ? 'an' : 'aus'}`}
    >
      <Field
        label="Encoder"
        hint="Konvertierung nach H.264/MP4 – mit der Grafikkarte, falls verfügbar."
      >
        <Select
          value={encoder}
          onChange={(e) => {
            setEncoder(e.target.value)
            void persist({ encoder: e.target.value })
          }}
        >
          <option value="auto">
            Automatisch
            {enc
              ? ` (${enc.available.find((a) => a.id === enc.recommended)?.label ?? enc.recommended})`
              : ''}
          </option>
          {enc?.available.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Gleichzeitige Importe"
        hint="Mehr parallel lohnt bei vielen kurzen Clips, Bildern und mit GPU – ein langer Clip nutzt auf der CPU ohnehin alle Kerne. Während der Show lieber 1, dann bleiben Reserven für die Wiedergabe."
      >
        <Select
          value={importConcurrency}
          onChange={(e) =>
            updateSettings({ player: { importConcurrency: Number(e.target.value) } })
          }
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? '1 (nacheinander)' : `${n} parallel`}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        checked={loudnorm}
        onChange={(v) => {
          setLoudnorm(v)
          void persist({ loudnormEnabled: v })
        }}
        label="Lautheit angleichen (EBU R128)"
        hint="Gleicht beim Einbacken unterschiedlich laute Clips an: erst messen, dann gleichmäßig verstärken – die Dynamik bleibt erhalten, nur übersteuernde Spitzen werden begrenzt. Wirkt auf neue Importe."
      />
      {loudnorm && (
        <Field label="Ziel-Lautheit">
          <Select
            value={loudnormI}
            onChange={(e) => {
              const v = Number(e.target.value)
              setLoudnormI(v)
              void persist({ loudnormI: v })
            }}
          >
            {LOUDNESS_CHOICES.map((c) => (
              <option key={c.i} value={c.i}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {library.some((m) => m.hasAudio) && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            void api.player.reconvert(
              library.filter((m) => m.hasAudio).map((m) => m.id),
              { width: wallW, height: wallH }
            )
          }
          title="Aktuelle Lautheits-Einstellung auf bereits importierte Medien mit Ton anwenden (bereits passende werden übersprungen)"
        >
          Vorhandene neu einbacken
        </Button>
      )}
    </PanelSection>
  )
}

export function IdleSection({ pstate }: { pstate: PlayerState }): JSX.Element {
  const cmd = api.player.command

  async function pickIdleMedia(): Promise<void> {
    // Das Medium wird auf Wand-Auflösung gebacken (ffmpeg) -> kann je nach Quelle
    // einen Moment dauern und auch fehlschlagen (z.B. exotischer Codec).
    try {
      const r = await api.player.pickIdleMedia()
      if (r) await cmd({ type: 'setIdleMedia', url: r.url, kind: r.kind })
    } catch (e) {
      void api.notify({
        message: 'Idle-Medium konnte nicht aufbereitet werden.',
        detail: e instanceof Error ? e.message : undefined,
        kind: 'error'
      })
    }
  }

  return (
    <PanelSection
      id="idle"
      title="Idle-Bild"
      icon={Clock}
      defaultOpen={false}
      summary={
        pstate.idlePattern === 'off'
          ? 'Aus (schwarz)'
          : pstate.idlePattern === 'custom'
            ? `Eigenes ${pstate.idleMediaKind === 'video' ? 'Video' : 'Bild'}`
            : PATTERN_OPTIONS.find((o) => o.value === pstate.idlePattern)?.label
      }
    >
      <Field
        label="Wenn nichts läuft"
        hint="Testbild oder eigenes Medium als Fallback auf der Ausgabe."
      >
        <Select
          value={pstate.idlePattern}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'custom') void pickIdleMedia()
            else void cmd({ type: 'setIdlePattern', pattern: v as PatternId | 'off' })
          }}
        >
          <option value="off">Aus (schwarz)</option>
          <option value="custom">Eigenes Bild/Video…</option>
          {/* AV-Sync blitzt jede Sekunde – als Ruhebild auf der Wand ungeeignet */}
          {PATTERN_OPTIONS.filter((o) => o.value !== 'avsync').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {pstate.idlePattern === 'custom' && (
        <span className="text-xs text-muted-foreground">
          Eigenes {pstate.idleMediaKind === 'video' ? 'Video' : 'Bild'} aktiv ·{' '}
          <button className="underline" onClick={() => void pickIdleMedia()}>
            ändern
          </button>{' '}
          ·{' '}
          <button
            className="underline"
            onClick={() => void cmd({ type: 'setIdlePattern', pattern: 'off' })}
          >
            entfernen
          </button>
        </span>
      )}
    </PanelSection>
  )
}
