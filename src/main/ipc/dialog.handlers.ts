import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type MessageBoxOptions,
  type OpenDialogOptions
} from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type {
  ChooseOptions,
  ConfirmOptions,
  NotifyOptions,
  SelectPathsOptions
} from '@shared/types'
import { stat } from 'node:fs/promises'
import { showOpenDialog } from '../services/fileDialogs'
import { logLine } from '../services/log'
import { shellTarget } from '../services/windows/windowPolicy'

export function registerDialogHandlers(): void {
  ipcMain.handle(Channels.dialogSelect, async (_e, options: SelectPathsOptions) => {
    const properties: NonNullable<OpenDialogOptions['properties']> = [
      options.directories ? 'openDirectory' : 'openFile'
    ]
    if (options.multi) properties.push('multiSelections')
    const res = await showOpenDialog(null, {
      title: options.title,
      filters: options.filters,
      properties
    })
    return res.canceled ? [] : res.filePaths
  })

  // Ja/Nein-Rückfrage als natives Dialogfenster. Bewusst NICHT window.confirm()
  // im Renderer: dessen blockierender Dialog killt in Electron danach die
  // Tastatureingabe in allen Textfeldern, bis das Fenster neu fokussiert wird.
  ipcMain.handle(Channels.dialogConfirm, async (event, options: ConfirmOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    // Reihenfolge der Knöpfe: [Bestätigen, Abbrechen]. defaultId zeigt auf den
    // Bestätigen-Knopf, cancelId auf Abbrechen (Esc/Fenster-schließen = Abbruch).
    const boxOptions: MessageBoxOptions = {
      type: options.danger ? 'warning' : 'question',
      buttons: [options.confirmLabel ?? 'OK', options.cancelLabel ?? 'Abbrechen'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      message: options.message,
      detail: options.detail
    }
    const res = win
      ? await dialog.showMessageBox(win, boxOptions)
      : await dialog.showMessageBox(boxOptions)
    // Nach dem Dialog den Renderer wieder fokussieren -> Tastatur bleibt aktiv.
    if (win && !win.isDestroyed()) win.webContents.focus()
    return res.response === 0
  })

  // Rückfrage mit 2–4 Antworten. Knöpfe und Indizes werden geprüft (Eingabe aus dem Renderer).
  ipcMain.handle(Channels.dialogChoose, async (event, options: ChooseOptions) => {
    const buttons = Array.isArray(options?.buttons)
      ? options.buttons.filter((b): b is string => typeof b === 'string').map((b) => b.slice(0, 60))
      : []
    if (buttons.length < 2 || buttons.length > 4 || typeof options.message !== 'string') return -1
    const idx = (v: unknown, fb: number): number =>
      Number.isInteger(v) && (v as number) >= 0 && (v as number) < buttons.length
        ? (v as number)
        : fb
    const cancelId = idx(options.cancelId, buttons.length - 1)
    const win = BrowserWindow.fromWebContents(event.sender)
    const boxOptions: MessageBoxOptions = {
      type: options.danger ? 'warning' : 'question',
      buttons,
      defaultId: idx(options.defaultId, 0),
      cancelId,
      noLink: true,
      message: options.message.slice(0, 500),
      detail: typeof options.detail === 'string' ? options.detail.slice(0, 2000) : undefined
    }
    const res = win
      ? await dialog.showMessageBox(win, boxOptions)
      : await dialog.showMessageBox(boxOptions)
    if (win && !win.isDestroyed()) win.webContents.focus()
    return res.response
  })

  // Hinweis-Meldung (ein OK-Knopf). Gleicher Grund wie oben: kein window.alert().
  ipcMain.handle(Channels.dialogNotify, async (event, options: NotifyOptions) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const boxOptions: MessageBoxOptions = {
      type: options.kind ?? 'info',
      buttons: ['OK'],
      defaultId: 0,
      noLink: true,
      message: options.message,
      detail: options.detail
    }
    if (win) await dialog.showMessageBox(win, boxOptions)
    else await dialog.showMessageBox(boxOptions)
    if (win && !win.isDestroyed()) win.webContents.focus()
  })

  // openPath öffnet eine DATEI mit ihrem Standardprogramm – bei .exe, .bat, .lnk … startet es
  // also ein Programm. Deshalb nur lokale Ordner (heute: der Medienordner des Players).
  ipcMain.handle(Channels.shellOpenPath, async (_e, target: unknown) => {
    const dir = shellTarget(target, { network: false })
    const isDir = dir
      ? await stat(dir).then(
          (s) => s.isDirectory(),
          () => false
        )
      : false
    if (!dir || !isDir) {
      logLine('[shell] Ordner öffnen abgelehnt:', String(target).slice(0, 200))
      return
    }
    await shell.openPath(dir)
  })

  // „Im Ordner zeigen“ startet nichts – auch für Dateien auf dem NAS (Netzwerkpfade erlaubt).
  ipcMain.handle(Channels.shellShowItem, (_e, target: unknown) => {
    const path = shellTarget(target, { network: true })
    if (!path) {
      logLine('[shell] Im Ordner zeigen abgelehnt:', String(target).slice(0, 200))
      return
    }
    shell.showItemInFolder(path)
  })
}
