import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { Channels } from '@shared/ipc-contracts'
import type {
  ColorLoopRequest,
  PatternConfig,
  PatternVideoProgress,
  PatternVideoRequest
} from '@shared/types'
import { exportColorLoop, exportPatternVideo } from '../services/patternVideo'
import {
  closePattern,
  getCurrentConfig,
  listDisplays,
  openPattern,
  updatePattern
} from '../services/patternWindow'

export function registerPatternHandlers(): void {
  ipcMain.handle(Channels.screenList, () => listDisplays())
  ipcMain.handle(Channels.patternOpen, (_e, config: PatternConfig, displayId: number) =>
    openPattern(config, displayId)
  )
  ipcMain.handle(Channels.patternUpdate, (_e, config: PatternConfig) => updatePattern(config))
  ipcMain.handle(Channels.patternClose, () => closePattern())
  ipcMain.handle(Channels.patternCurrent, () => getCurrentConfig())

  ipcMain.handle(Channels.patternSavePng, async (e, bytes: Uint8Array, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      title: 'Testbild als PNG speichern',
      defaultPath: suggestedName,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, Buffer.from(bytes))
    return res.filePath
  })

  ipcMain.handle(Channels.patternExportVideo, async (e, req: PatternVideoRequest) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const ext = req.format === 'hap_q' ? 'mov' : 'mp4'
    const opts = {
      title: 'Testbild als Video speichern',
      defaultPath: `testbild.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null

    const emit = (p: PatternVideoProgress): void => e.sender.send(Channels.patternVideoProgress, p)
    try {
      await exportPatternVideo(req, res.filePath, (progress) => emit({ progress, done: false }))
      emit({ progress: 1, done: true, outputPath: res.filePath })
      return res.filePath
    } catch (err) {
      emit({ progress: 0, done: true, error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  })

  ipcMain.handle(Channels.patternExportColorLoop, async (e, req: ColorLoopRequest) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const ext = req.format === 'hap_q' ? 'mov' : 'mp4'
    const opts = {
      title: 'Pixelcheck-Loop speichern',
      defaultPath: `pixelcheck-loop.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null

    const emit = (p: PatternVideoProgress): void => e.sender.send(Channels.patternVideoProgress, p)
    try {
      await exportColorLoop(req, res.filePath, (progress) => emit({ progress, done: false }))
      emit({ progress: 1, done: true, outputPath: res.filePath })
      return res.filePath
    } catch (err) {
      emit({ progress: 0, done: true, error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  })
}
