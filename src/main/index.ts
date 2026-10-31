import { app, BrowserWindow, protocol } from 'electron'
import { existsSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PREVIOUS_APP_NAMES } from '@shared/brand'
import { FOTO_PROTOCOL } from '@shared/fotos'
import { JINGLE_PROTOCOL, MANUAL_PROTOCOL, MEDIA_PROTOCOL } from '@shared/ipc-contracts'
import { registerFotoProtocol } from './ipc/fotos.handlers'
import {
  registerIpcHandlers,
  registerJingleProtocol,
  registerManualProtocol,
  registerMediaProtocol
} from './ipc/registry'
import { createWindow } from './services/windows/appWindows'
import { installWindowGuards } from './services/windows/windowGuards'
import { closePattern, patternWindow } from './services/pattern/patternWindow'
import { closePlayerOutput, playerOutputWindow } from './services/player/playerWindow'
import { closeSmallToolWindows, smallToolWindowList } from './services/windows/smallToolWindows'
import { closeTimerOutput, timerOutputWindow } from './services/timer/timerWindow'
import {
  beendenFreigegeben,
  installBeendenRueckfrage,
  wacheBeimSchliessen
} from './services/beenden/rueckfrage'
import { killAllFfmpeg } from './services/convert/runFfmpeg'
import { initFfmpegUpdates } from './services/ffmpeg/ffmpegUpdate'
import { logLine } from './services/log'
import { hasRunningWork, stopAllWork } from './services/shutdown'
import { disposeAtem } from './services/atem/atemService'
import { disposeOsc } from './services/osc/oscService'
import { stopJingleRemote } from './services/jingle/jingleRemoteServer'
import { stopOscRemote } from './services/osc/oscRemoteServer'
import { stopRemote } from './services/player/remoteServer'
import { stopRemoteApp } from './services/remote/remoteAppServer'
import { stopTimerRemote } from './services/timer/timerRemoteServer'
import { disposeTimer } from './services/timer/stageTimer'
import { stopTimerNdi } from './services/timer/timerNdi'
import { stopPlayerNdi } from './services/player/playerNdi'
import { checkOnStartup } from './services/ytdlp/ytDlp'

// Globale Auffanglinien: unbehandelte Fehler/Rejections landen im Debug-Log
// (im gepackten Build sonst unsichtbar) statt die App still zu destabilisieren.
process.on('unhandledRejection', (reason) => {
  logLine(
    '[unhandledRejection]',
    reason instanceof Error ? (reason.stack ?? reason.message) : reason
  )
})
process.on('uncaughtException', (err) => {
  logLine('[uncaughtException]', err.stack ?? err.message)
})

// Privilegierte Schemata MÜSSEN vor app.whenReady registriert werden, damit der
// renderer darauf zugreifen darf (pdfjs-fetch bzw. <video src> mit Range/Stream).
protocol.registerSchemesAsPrivileged([
  {
    scheme: MANUAL_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: MEDIA_PROTOCOL,
    // corsEnabled: ohne dieses Privileg sind Custom-Schemes von CORS
    // AUSGESCHLOSSEN -- ein <video crossOrigin="anonymous"> (NDI-Audio-Tap)
    // scheitert dann trotz Access-Control-Allow-Origin-Header komplett
    // (schwarzes Bild). Mit corsEnabled + ACAO-Header ist der Load sauber
    // CORS-freigegeben und MediaElementSource liefert Ton statt Stille.
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  },
  {
    scheme: JINGLE_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  // Fotos der Projektdateien (foto://bild/<hash>), nur für <img>
  { scheme: FOTO_PROTOCOL, privileges: { standard: true, secure: true } }
])

// Einmalige userData-Übernahme nach der Umbenennung: heißt der App-Ordner neu
// (leitet Electron aus dem App-Namen ab) und existiert noch nicht, aber ein
// Ordner eines früheren Namens liegt daneben -> diesen übernehmen. Best effort,
// wirft nie; passiert genau einmal (danach existiert der neue Ordner).
function migrateUserData(): void {
  try {
    const cur = app.getPath('userData')
    if (existsSync(cur)) return
    const parent = dirname(cur)
    for (const old of PREVIOUS_APP_NAMES) {
      const oldPath = join(parent, old)
      if (oldPath !== cur && existsSync(oldPath)) {
        renameSync(oldPath, cur)
        logLine('[migrate] userData übernommen:', oldPath, '->', cur)
        return
      }
    }
  } catch (e) {
    logLine('[migrate] userData-Migration übersprungen:', e instanceof Error ? e.message : e)
  }
}

// Das Hauptfenster nimmt beim Schließen die Vollbild-Ausgaben (Testbild/Player/Timer) mit;
// Zusatzfenster (z.B. parallel geöffnete große Werkzeuge) lassen sie weiterlaufen. Die kleinen
// Werkzeuge gehen mit: Ihre Fenster haben keinen Weg zurück zum Startbildschirm.
let mainWin: BrowserWindow | null = null

function createMainWindow(): void {
  const win = createWindow()
  mainWin = win
  win.on('closed', () => {
    if (mainWin === win) mainWin = null
    closePattern()
    closePlayerOutput()
    closeTimerOutput()
    closeSmallToolWindows()
  })
}

app.whenReady().then(() => {
  migrateUserData() // vor jedem Zugriff auf DB/Settings
  logLine('--- Start ---', `packaged=${app.isPackaged}`)
  // vor jedem ffmpeg-Aufruf: bereitliegenden Build aktivieren, tägliche Prüfung planen
  initFfmpegUpdates()
  logLine('appPath=', app.getAppPath())
  logLine('resourcesPath=', process.resourcesPath)
  logLine('userData=', app.getPath('userData'))
  installWindowGuards() // vor dem ersten Fenster: gilt für alle
  registerManualProtocol()
  registerMediaProtocol()
  registerJingleProtocol()
  registerFotoProtocol()
  registerIpcHandlers()
  createMainWindow()
  checkOnStartup() // yt-dlp im Hintergrund prüfen, sobald das Fenster steht

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 'window-all-closed' feuert NICHT, solange unsichtbare Dienst-Fenster leben
// (NDI-Offscreen-Spiegel von Timer/Player). Die dürfen die App aber nicht am
// Leben halten: schließt das letzte SICHTBARE Fenster, wird beendet -- sonst
// läuft der Prozess (und der NDI-Stream!) unsichtbar weiter.
// Gezählt werden Fenster, die je gezeigt wurden (Haupt-, Werkzeug-, Ausgabefenster, auch
// minimiert); Dienst-Fenster (NDI-Spiegel, PDF-Export) werden nie gezeigt und zählen nie.
// Bewusst NICHT isVisible() der übrigen: Unter Windows meldet ein MINIMIERTES Fenster
// „unsichtbar“ – war die Mottulbox minimiert und schloss man die Vollbild-Ausgabe (Escape im
// Timer-, Player- oder Testbild-Fenster), beendete sich die ganze App.
const shownWindows = new Set<BrowserWindow>()

/**
 * Beendet das Schließen dieses Fensters die App? Ja, wenn danach kein gezeigtes Fenster bleibt –
 * das Hauptfenster nimmt Ausgaben und kleine Werkzeuge mit (createMainWindow). macOS beendet nie.
 */
function wuerdeBeenden(win: BrowserWindow): boolean {
  if (process.platform === 'darwin' || !shownWindows.has(win)) return false
  const mit = new Set<BrowserWindow | null>(
    win === mainWin
      ? [playerOutputWindow(), timerOutputWindow(), patternWindow(), ...smallToolWindowList()]
      : []
  )
  return [...shownWindows].every((w) => w === win || w.isDestroyed() || mit.has(w))
}

app.on('browser-window-created', (_e, win) => {
  if (win.isVisible()) shownWindows.add(win)
  win.on('show', () => shownWindows.add(win))
  wacheBeimSchliessen(win, () => wuerdeBeenden(win))
  win.on('closed', () => {
    const wasShown = shownWindows.delete(win)
    if (process.platform === 'darwin' || !wasShown || shownWindows.size > 0) return
    logLine('[fenster] letztes Fenster geschlossen – beenden')
    app.quit()
  })
})

// Läuft noch etwas, erst fragen („Wirklich beenden?“) – als ERSTER before-quit-Handler: Die
// folgenden stoppen NDI und Aufträge und laufen nur, wenn das Beenden freigegeben ist.
installBeendenRueckfrage(() => mainWin)

// NDI-Sender stoppen, BEVOR die Fenster abgeräumt werden -> die Quelle
// verschwindet sauber aus dem Netz (kein hängender Eintrag bei Empfängern).
app.on('before-quit', () => {
  if (!beendenFreigegeben()) return
  stopTimerNdi(false)
  stopPlayerNdi(false)
})

// Laufende Konvertierungen, Generator-Läufe, Importe und Downloads abbrechen und ihr Aufräumen
// abwarten (höchstens 3 s), erst dann wirklich beenden – sonst schriebe ffmpeg weiter
// (services/shutdown.ts). Der zweite quit() läuft hier durch.
let workStopped = false
app.on('before-quit', (e) => {
  if (!beendenFreigegeben() || workStopped || !hasRunningWork()) return
  e.preventDefault()
  workStopped = true
  void stopAllWork().finally(() => app.quit())
})

// Fernsteuerungs-Server + Timer-Intervall beim Beenden sauber schliessen.
app.on('will-quit', () => {
  // letztes Netz: was jetzt noch an ffmpeg läuft, überlebte sonst die App
  killAllFfmpeg()
  stopRemote()
  stopJingleRemote()
  stopOscRemote()
  stopTimerRemote()
  stopRemoteApp()
  disposeOsc()
  disposeTimer()
  disposeAtem()
})
