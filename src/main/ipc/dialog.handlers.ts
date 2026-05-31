import { dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import type { SelectPathsOptions } from '@shared/types'

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

  ipcMain.handle(Channels.shellOpenPath, async (_e, target: string) => {
    await shell.openPath(target)
  })

  ipcMain.handle(Channels.shellShowItem, (_e, target: string) => {
    shell.showItemInFolder(target)
  })
}
