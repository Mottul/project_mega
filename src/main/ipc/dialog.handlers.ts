import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type MessageBoxOptions,
  type OpenDialogOptions
} from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { ConfirmOptions, NotifyOptions, SelectPathsOptions } from '@shared/types'

export function registerDialogHandlers(): void {
  ipcMain.handle(Channels.dialogSelect, async (_e, options: SelectPathsOptions) => {
    const properties: NonNullable<OpenDialogOptions['properties']> = [
      options.directories ? 'openDirectory' : 'openFile'
    ]
    if (options.multi) properties.push('multiSelections')
    const res = await dialog.showOpenDialog({
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

  ipcMain.handle(Channels.shellOpenPath, async (_e, target: string) => {
    await shell.openPath(target)
  })

  ipcMain.handle(Channels.shellShowItem, (_e, target: string) => {
    shell.showItemInFolder(target)
  })
}
