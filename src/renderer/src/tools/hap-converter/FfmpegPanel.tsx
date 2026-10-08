// ffmpeg der App (Seitenpanel des Video-Konverters): welcher Build läuft, ob ein neuerer geprüft
// bereitliegt, automatische Aktualisierung. Ein neuer Build gilt erst ab dem nächsten Start –
// mitten in der Sitzung (in der Show) wechselt ffmpeg nie (main: services/ffmpeg/ffmpegUpdate).

import { useEffect, useState } from 'react'
import { Cpu, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Progress } from '@renderer/components/ui/progress'
import { PanelSection } from '@renderer/components/ToolShell'
import { api } from '@renderer/lib/api'
import { updateSettings, useSettings } from '@renderer/lib/settings'
import type { FfmpegToolStatus } from '@shared/types'

const SOURCE: Record<FfmpegToolStatus['active']['source'], string> = {
  mitgeliefert: 'Mitgeliefert',
  aktualisiert: 'In der App aktualisiert',
  system: 'Aus dem System-PATH'
}

/** „ffmpeg version N-127252-ga25ba44c0c-20261008 Copyright …“ -> „N-127252-ga25ba44c0c-20261008“ */
const shortVersion = (v: string | null): string =>
  v ? (/^ffmpeg version (\S+)/.exec(v)?.[1] ?? v) : 'nicht gefunden'

const date = (iso: string): string =>
  new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })

export function FfmpegPanel(): JSX.Element {
  const [st, setSt] = useState<FfmpegToolStatus | null>(null)
  const auto = useSettings((s) => s.ffmpegAutoUpdate) ?? true

  useEffect(() => {
    void api.ffmpeg.status().then(setSt)
    return api.ffmpeg.onStatus(setSt)
  }, [])

  return (
    <PanelSection id="ffmpeg" title="ffmpeg" icon={Cpu} defaultOpen={false}>
      {st ? (
        <>
          <div className="space-y-0.5">
            <p className="text-sm">{SOURCE[st.active.source]}</p>
            <p className="break-all text-xs tabular-nums text-muted-foreground">
              {shortVersion(st.active.version)}
            </p>
          </div>
          {st.ready && (
            <p className="text-xs text-primary">
              Neuer Build {st.ready.build} (vom {date(st.ready.publishedAt)}) ist geprüft und wird
              beim nächsten Start verwendet.
            </p>
          )}
          {st.supported ? (
            <>
              <Checkbox
                checked={auto}
                onChange={(on) => void updateSettings({ ffmpegAutoUpdate: on })}
                label="Automatisch aktuell halten"
                hint="Einmal am Tag; nur Builds, die mindestens 7 Tage alt sind; geprüft und erst ab dem nächsten Start verwendet."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={st.checking}
                  onClick={() => void api.ffmpeg.checkUpdate().then(setSt)}
                >
                  <RefreshCw className={st.checking ? 'size-4 animate-spin' : 'size-4'} /> Jetzt
                  prüfen
                </Button>
                {(st.active.source === 'aktualisiert' || st.ready) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Falls ein neuer Build Ärger macht: ab dem nächsten Start wieder das mitgelieferte ffmpeg"
                    onClick={() => void api.ffmpeg.useBundled().then(setSt)}
                  >
                    <RotateCcw className="size-4" /> Mitgeliefertes verwenden
                  </Button>
                )}
              </div>
              {st.progress !== null && <Progress value={st.progress} />}
              {st.lastError ? (
                <p className="text-xs text-destructive">{st.lastError}</p>
              ) : (
                st.lastResult && <p className="text-xs text-muted-foreground">{st.lastResult}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{st.unsupportedReason}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Wird gelesen …</p>
      )}
    </PanelSection>
  )
}
