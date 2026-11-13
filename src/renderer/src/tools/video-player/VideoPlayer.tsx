// Video-Player: Bibliothek (Import auf Wand-Auflösung), Playlist und Bühne, Ausgabe auf einem
// Monitor, als NDI-Quelle und per Handy. Hier stehen Zustand, Einstellungen und das
// Zusammensetzen; die Teile liegen daneben (Library, Playlist, Stage, SetupPanels, NdiPanel,
// usePlayback). Der Wiedergabezustand tickt im main, das Fenster spiegelt ihn.
//
// Die drei Felder stehen in einer Arbeitsfläche (components/WorkArea.tsx, Raster in layout.ts):
// je nach Platz nebeneinander oder übereinander, die Listen scrollen in sich, die Seite nicht.

import { useEffect, useState } from 'react'
import { useKiosk } from '@renderer/launcher/kiosk'
import { AlertTriangle, Pause, Play } from 'lucide-react'
import { OutputControls, useOutputTarget } from '@renderer/components/OutputControl'
import { BarDivider, BarToggle, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { RemoteSection, RemoteToggle, useRemoteControl } from '@renderer/components/RemoteControl'
import { WorkArea } from '@renderer/components/WorkArea'
import { Alert } from '@renderer/components/ui/alert'
import { api } from '@renderer/lib/api'
import { toast } from '@renderer/lib/toast'
import { EMPTY_PLAYER_STATE } from '@shared/player'
import type {
  AppSettings,
  FitMode,
  MediaItem,
  PlayerEncoderStatus,
  PlayerState,
  SavedPlaylist,
  SettingsPatch
} from '@shared/types'
import { fmtTime } from './format'
import { PLAYER_RASTER } from './layout'
import { Library } from './Library'
import { NdiSection, usePlayerNdi } from './NdiPanel'
import { PlaylistFeld } from './Playlist'
import {
  FitSection,
  IdleSection,
  ImportSection,
  WallSection,
  WiedergabeSection
} from './SetupPanels'
import { Stage } from './Stage'
import { usePlayback } from './usePlayback'

export function VideoPlayer(): JSX.Element {
  // Kundenansicht: technische Setup-Optionen ausblenden (Wand/Auflösung, Encoder,
  // Idle-Bild). Bibliothek, Import, Fit-Modus, Fernsteuerung, Ausgabe und Playlist
  // bleiben voll bedienbar.
  const locked = useKiosk()
  const [enc, setEnc] = useState<PlayerEncoderStatus | null>(null)
  const [library, setLibrary] = useState<MediaItem[]>([])
  const [pstate, setPstate] = useState<PlayerState>(EMPTY_PLAYER_STATE)

  const [wallW, setWallW] = useState(1920)
  const [wallH, setWallH] = useState(1080)
  const ndi = usePlayerNdi(wallW, wallH)
  const playback = usePlayback(pstate)
  const [fit, setFit] = useState<FitMode>('blur')
  const [encoder, setEncoder] = useState('auto')
  const [blurStrength, setBlurStrength] = useState(50)
  const [blurDarken, setBlurDarken] = useState(0)
  const [loudnorm, setLoudnorm] = useState(false)
  const [loudnormI, setLoudnormI] = useState(-16)
  const out = useOutputTarget()
  const setZiel = out.setZiel

  const rc = useRemoteControl(api.player, 8088)
  const [saved, setSaved] = useState<SavedPlaylist[]>([])

  function loadLibrary(): void {
    void api.player.libraryList().then(setLibrary)
  }

  useEffect(() => {
    void api.player.encoders().then(setEnc)
    loadLibrary()
    void api.player.getState().then(setPstate)
    // Einstellungen übernehmen – beim Start und wenn ein anderes Fenster oder das Handy sie
    // ändert (z. B. gespeicherte Playlists, Fit-Modus): sonst schriebe dieses Fenster später
    // seinen veralteten Stand zurück.
    const applySettings = (s: AppSettings): void => {
      setWallW(s.player.wallWidth)
      setWallH(s.player.wallHeight)
      setFit(s.player.defaultFit)
      setEncoder(s.player.encoder)
      setBlurStrength(s.player.blurStrength ?? 50)
      setBlurDarken(s.player.blurDarken ?? 0)
      setLoudnorm(s.player.loudnormEnabled ?? false)
      setLoudnormI(s.player.loudnormI ?? -16)
      setSaved(s.player.savedPlaylists ?? [])
      // gemerktes Ziel (Monitor oder „Als Fenster“) gewinnt über die Vorwahl
      if (s.player.outputDisplayId != null) setZiel(s.player.outputDisplayId)
    }
    void api.getSettings().then(applySettings)
    const offSettings = api.onSettingsChanged(applySettings)

    const offLib = api.player.onLibraryChanged(() => loadLibrary())
    const offState = api.player.onState(setPstate)
    return () => {
      offSettings()
      offLib()
      offState()
    }
    // setZiel ist stabil (useState) – die Abhängigkeit löst keinen zweiten Lauf aus
  }, [setZiel])

  const { current, position, duration } = playback

  // Nur die geänderten Felder schicken – main führt sie feldweise zusammen.
  async function persistPlayer(patch: NonNullable<SettingsPatch['player']>): Promise<void> {
    await api.setSettings({ player: patch })
  }

  function setWall(w: number, h: number): void {
    const ww = Math.max(2, w)
    const hh = Math.max(2, h)
    setWallW(ww)
    setWallH(hh)
    void persistPlayer({ wallWidth: ww, wallHeight: hh })
  }

  /** Auflösung der im LED-Wall-Konfigurator gewählten Wand (wie beim Testbild) */
  async function fromLedWall(): Promise<void> {
    const [{ useLedWall }, { computeWall }] = await Promise.all([
      import('../led-wall/store'),
      import('../led-wall/compute')
    ])
    const s = useLedWall.getState()
    const d = computeWall(s)
    setWall(d.resX, d.resY)
    const wand = s.walls.length > 1 ? `${s.walls.find((w) => w.id === s.wallId)?.name ?? ''}: ` : ''
    toast.success(
      'Wand-Auflösung aus dem LED-Wall-Konfigurator',
      `${wand}${d.resX} × ${d.resY} px (${d.cols} × ${d.rows} Module ${d.mod.name})`
    )
  }

  function fromMonitor(): void {
    const d = out.display
    if (d) setWall(Math.round(d.width * d.scaleFactor), Math.round(d.height * d.scaleFactor))
  }

  async function persistSaved(next: SavedPlaylist[]): Promise<void> {
    setSaved(next)
    await api.setSettings({ player: { savedPlaylists: next } })
  }

  const ffmpegMissing = enc && !enc.ffmpegFound

  return (
    <ToolShell
      id="video-player"
      bar={
        <ToolBar
          label="Ausgabe"
          active={pstate.outputOpen || Boolean(ndi.status?.running)}
          status={
            current ? (
              <>
                {pstate.playing ? (
                  <Play className="size-3.5 shrink-0 fill-current text-primary" />
                ) : (
                  <Pause className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="max-w-[18rem] truncate font-medium">{current.title}</span>
                {current.kind !== 'image' && (
                  <span className="text-muted-foreground">
                    {fmtTime(position)} / {fmtTime(duration)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Playlist leer</span>
            )
          }
        >
          <OutputControls
            target={out}
            open={pstate.outputOpen}
            onStart={(ziel) => api.player.openOutput(ziel)}
            onStop={() => api.player.closeOutput()}
          />
          <BarDivider />
          <BarToggle
            on={Boolean(ndi.status?.running)}
            disabled={!ndi.status?.available}
            title={
              ndi.status?.available === false
                ? 'NDI-Modul nicht verfügbar (npm run ndi:setup, siehe docs/NDI.md)'
                : 'Wandbild als NDI-Quelle ins Netz senden'
            }
            onClick={() => void ndi.toggle()}
          >
            NDI
          </BarToggle>
          <RemoteToggle rc={rc} />
        </ToolBar>
      }
      aside={
        <>
          {!locked && (
            <WallSection
              wallW={wallW}
              wallH={wallH}
              onWall={setWall}
              onFromMonitor={fromMonitor}
              onFromLedWall={() => void fromLedWall()}
              canFromMonitor={!!out.display}
            />
          )}
          <FitSection
            fit={fit}
            setFit={setFit}
            blurStrength={blurStrength}
            setBlurStrength={setBlurStrength}
            blurDarken={blurDarken}
            setBlurDarken={setBlurDarken}
            persist={persistPlayer}
            library={library}
            wallW={wallW}
            wallH={wallH}
          />
          {!locked && (
            <ImportSection
              enc={enc}
              encoder={encoder}
              setEncoder={setEncoder}
              loudnorm={loudnorm}
              setLoudnorm={setLoudnorm}
              loudnormI={loudnormI}
              setLoudnormI={setLoudnormI}
              persist={persistPlayer}
              library={library}
              wallW={wallW}
              wallH={wallH}
            />
          )}
          <WiedergabeSection pstate={pstate} />
          {!locked && <IdleSection pstate={pstate} />}
          <NdiSection wallW={wallW} wallH={wallH} status={ndi.status} />
          <RemoteSection
            rc={rc}
            hint="Das Handy steuert die Wiedergabe und lädt Medien hoch. Ein/Aus mit „Handy“ in der Ausgabe-Leiste."
          />
        </>
      }
      main={
        <div className="flex h-full min-h-0 flex-col">
          {ffmpegMissing && (
            <div className="shrink-0 px-3 pt-3">
              <Alert tone="warning" icon={AlertTriangle} title="ffmpeg nicht gefunden">
                Zum Konvertieren der Medien wird das gebündelte ffmpeg benötigt. Im Dev-Modus über
                <code className="mx-1 rounded bg-muted px-1">npm run ff:fetch</code> bereitstellen;
                im fertigen Paket ist es enthalten.
                {enc?.error ? ` (${enc.error})` : ''}
              </Alert>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {/* Reihenfolge der Felder immer gleich – wo sie stehen, sagt das Raster */}
            <WorkArea raster={PLAYER_RASTER}>
              <Library
                library={library}
                fit={fit}
                wallW={wallW}
                wallH={wallH}
                onReload={loadLibrary}
              />
              <PlaylistFeld pstate={pstate} saved={saved} onSaveSaved={persistSaved} />
              <Stage pstate={pstate} playback={playback} wand={{ width: wallW, height: wallH }} />
            </WorkArea>
          </div>
        </div>
      }
    />
  )
}
