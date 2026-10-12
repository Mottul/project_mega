// yt-dlp der App (im App-Menü, wie ffmpeg): welche Version läuft, ob sie aktuell ist, die
// Prüfung beim Start und „Jetzt prüfen“. Die Binary liegt in userData/bin und wird im
// main-Prozess gegen ihre Prüfsumme getauscht (services/ytdlp). Der YouTube-Downloader nutzt
// denselben Hook für seinen Hinweis, wenn yt-dlp fehlt.

import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { YtToolStatus } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { api } from '@renderer/lib/api'
import { updateSettings, useSettings } from '@renderer/lib/settings'

export interface Ytdlp {
  status: YtToolStatus | null
  /** Prüfung oder Download läuft (von hier oder beim Start) */
  busy: boolean
  /** Fehler der letzten Prüfung, sonst null */
  problem: string | null
  /** prüfen bzw. – fehlt yt-dlp – herunterladen */
  update: () => Promise<void>
}

export function useYtdlp(): Ytdlp {
  const [status, setStatus] = useState<YtToolStatus | null>(null)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.youtube.status().then(setStatus)
    // Die Startprüfung läuft im main-Prozess und kann jederzeit fertig werden.
    return api.youtube.onStatusUpdate(setStatus)
  }, [])

  async function update(): Promise<void> {
    setUpdating(true)
    setError(null)
    try {
      setStatus(await api.youtube.updateTool())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdating(false)
    }
  }

  return {
    status,
    busy: updating || !!status?.checking,
    problem: error ?? status?.lastError ?? null,
    update
  }
}

/** Knopf „Jetzt prüfen“ bzw. „yt-dlp herunterladen“ (fehlt es noch) */
export function YtdlpUpdateButton({ yt }: { yt: Ytdlp }): JSX.Element {
  const available = !!yt.status?.available
  return (
    <Button
      variant={available ? 'outline' : 'default'}
      size="sm"
      disabled={yt.busy}
      onClick={() => void yt.update()}
    >
      {available ? (
        <RefreshCw className={yt.busy ? 'size-4 animate-spin' : 'size-4'} />
      ) : (
        <Download className="size-4" />
      )}
      {available ? 'Jetzt prüfen' : 'yt-dlp herunterladen'}
    </Button>
  )
}

export function YtdlpSettings(): JSX.Element {
  const yt = useYtdlp()
  const auto = useSettings((s) => s.ytdlpAutoUpdate) ?? true
  const st = yt.status

  if (!st) return <p className="text-xs text-muted-foreground">Wird gelesen …</p>

  return (
    <div className="space-y-2" data-testid="ytdlp-settings">
      <p className="break-all text-xs tabular-nums text-muted-foreground">
        {st.available
          ? `${st.version} · ${st.location === 'managed' ? 'von der App verwaltet' : 'aus dem System-PATH'}`
          : 'nicht vorhanden'}
      </p>
      {st.upToDate === true && <p className="text-xs text-success">aktuell</p>}
      {st.upToDate === false && (
        <p className="text-xs text-warning">
          Neuer verfügbar: {st.latest}
          {st.location === 'path' && ' (vom System verwaltet – dort aktualisieren)'}
        </p>
      )}
      <Checkbox
        checked={auto}
        onChange={(on) => void updateSettings({ ytdlpAutoUpdate: on })}
        label="Beim Start auf neue Version prüfen"
        hint="Neue Versionen werden gegen ihre Prüfsumme geprüft. Scheitern Downloads, hilft meist eine neue yt-dlp-Version."
      />
      <YtdlpUpdateButton yt={yt} />
      {yt.problem && <p className="text-xs text-danger">{yt.problem}</p>}
    </div>
  )
}
