// Video-Player: Bibliothek (Import auf Wand-Auflösung), Playlist und Wiedergabe, Ausgabe auf
// einem Monitor, als NDI-Quelle und per Handy. Hier stehen Zustand, Einstellungen und das
// Zusammensetzen; die Teile liegen daneben (Library, PlaybackPanel, Playlist, SetupPanels,
// NdiPanel, usePlayback). Der Wiedergabezustand tickt im main, das Fenster spiegelt ihn.

import { useEffect, useState } from 'react'
import { useKiosk } from '@renderer/launcher/kiosk'
import { AlertTriangle, MonitorPlay, MonitorX, Pause, Play } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { BarDivider, BarToggle, ToolBar, ToolShell } from '@renderer/components/ToolShell'
import { RemoteSection, RemoteToggle, useRemoteControl } from '@renderer/components/RemoteControl'
import { Alert } from '@renderer/components/ui/alert'
import { Select } from '@renderer/components/ui/select'
import { api } from '@renderer/lib/api'
import { useElementWidth } from '@renderer/lib/useElementWidth'
import { EMPTY_PLAYER_STATE } from '@shared/player'
import type {
  AppSettings,
  DisplayInfo,
  FitMode,
  MediaItem,
  PlayerEncoderStatus,
  PlayerState,
  SavedPlaylist,
  SettingsPatch
} from '@shared/types'
import { fmtTime } from './format'
import { Library } from './Library'
import { NdiSection, usePlayerNdi } from './NdiPanel'
import { PlaybackPanel } from './PlaybackPanel'
import { FitSection, IdleSection, ImportSection, WallSection } from './SetupPanels'
import { usePlayback } from './usePlayback'

export function VideoPlayer(): JSX.Element {
  // Kundenansicht: technische Setup-Optionen ausblenden (Wand/Auflösung, Encoder,
  // Idle-Bild). Bibliothek, Import, Fit-Modus, Fernsteuerung, Ausgabe und Playlist
  // bleiben voll bedienbar.
  const locked = useKiosk()
  // Container-basiertes Layout: Bibliothek neben den Player, sobald genug Breite da
  // ist (auch nach dem Einklappen der Einstellungen) -> die Vorschau wird dann kleiner.
  const [mainRef, mainW] = useElementWidth<HTMLDivElement>()
  const wide = mainW >= 900
  const [enc, setEnc] = useState<PlayerEncoderStatus | null>(null)
  const [library, setLibrary] = useState<MediaItem[]>([])
  const [pstate, setPstate] = useState<PlayerState>(EMPTY_PLAYER_STATE)
  const [displays, setDisplays] = useState<DisplayInfo[]>([])

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
  const [displayId, setDisplayId] = useState<number | null>(null)

  const rc = useRemoteControl(api.player, 8088)
  const [saved, setSaved] = useState<SavedPlaylist[]>([])

  function loadLibrary(): void {
    void api.player.libraryList().then(setLibrary)
  }

  useEffect(() => {
    void api.player.encoders().then(setEnc)
    loadLibrary()
    void api.player.getState().then(setPstate)
    void api.screen.list().then((list) => {
      setDisplays(list)
      setDisplayId((cur) => cur ?? (list.find((d) => !d.primary) ?? list[0])?.id ?? null)
    })
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
      if (s.player.outputDisplayId != null) setDisplayId(s.player.outputDisplayId)
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
  }, [])

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

  function fromMonitor(): void {
    const d = displays.find((x) => x.id === displayId)
    if (d) setWall(Math.round(d.width * d.scaleFactor), Math.round(d.height * d.scaleFactor))
  }

  async function openOutput(): Promise<void> {
    if (displayId == null) return
    await api.player.openOutput(displayId)
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
          <Select
            size="sm"
            className="w-64 max-w-full"
            aria-label="Ausgabe-Monitor"
            value={displayId ?? ''}
            onChange={(e) => setDisplayId(Number(e.target.value))}
          >
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
          {pstate.outputOpen ? (
            <>
              <Button size="sm" variant="destructive" onClick={() => void api.player.closeOutput()}>
                <MonitorX className="size-4" /> Vollbild beenden
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void openOutput()}
                disabled={displayId == null}
                title="Ausgabe auf den gewählten Monitor legen"
              >
                Monitor wechseln
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => void openOutput()} disabled={displayId == null}>
              <MonitorPlay className="size-4" /> Vollbild starten
            </Button>
          )}
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
              canFromMonitor={displayId != null}
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
          {!locked && <IdleSection pstate={pstate} />}
          <NdiSection wallW={wallW} wallH={wallH} status={ndi.status} />
          <RemoteSection
            rc={rc}
            hint="Das Handy steuert die Wiedergabe und lädt Medien hoch. Ein/Aus mit „Handy“ in der Ausgabe-Leiste."
          />
        </>
      }
      main={
        <div ref={mainRef} className="space-y-6 p-6">
          {ffmpegMissing && (
            <Alert tone="warning" icon={AlertTriangle} title="ffmpeg nicht gefunden">
              Zum Konvertieren der Medien wird das gebündelte ffmpeg benötigt. Im Dev-Modus über
              <code className="mx-1 rounded bg-muted px-1">npm run ff:fetch</code> bereitstellen; im
              fertigen Paket ist es enthalten.
              {enc?.error ? ` (${enc.error})` : ''}
            </Alert>
          )}

          <div className={`flex gap-6 ${wide ? 'flex-row' : 'flex-col'}`}>
            {/* Bibliothek – bei genug Breite links, beim Stapeln NACH dem Player
            (order-2): schmal soll zuerst der Player kommen, nicht die Bibliothek. */}
            <Library
              library={library}
              fit={fit}
              wallW={wallW}
              wallH={wallH}
              onReload={loadLibrary}
              className={wide ? 'order-1 flex-1' : 'order-2'}
            />
            {/* Wiedergabe – beim Stapeln zuerst (order-1), bei genug Breite rechts. */}
            <PlaybackPanel
              pstate={pstate}
              playback={playback}
              saved={saved}
              onSaveSaved={persistSaved}
              className={wide ? 'order-2 flex-1' : 'order-1'}
            />
          </div>
        </div>
      }
    />
  )
}
