import { BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { ausgabeZiel } from '@shared/ausgabe'
import { Channels } from '@shared/ipc-contracts'
import type {
  ColorLoopRequest,
  PatternConfig,
  PatternVideoProgress,
  PatternVideoRequest
} from '@shared/types'
import { broadcast, sendeAn } from '../services/broadcast'
import { showSaveDialog } from '../services/fileDialogs'
import { exportColorLoop, exportPatternVideo } from '../services/pattern/patternVideo'
import {
  closePattern,
  getCurrentConfig,
  isPatternOpen,
  listDisplays,
  openPattern,
  setPatternOutputSink,
  updatePattern
} from '../services/pattern/patternWindow'
import { handle } from './kanal'

export function registerPatternHandlers(): void {
  handle(Channels.screen.list, () => listDisplays())
  handle(Channels.patterns.open, (_e, config: PatternConfig, z: unknown) => {
    const ziel = ausgabeZiel(z)
    if (ziel != null) openPattern(config, ziel)
  })
  handle(Channels.patterns.update, (_e, config: PatternConfig) => updatePattern(config))
  handle(Channels.patterns.close, () => closePattern())
  handle(Channels.patterns.current, () => getCurrentConfig())
  handle(Channels.patterns.isOpen, () => isPatternOpen())
  setPatternOutputSink((open) => broadcast(Channels.patterns.onOutputChanged, open))

  handle(Channels.patterns.savePng, async (e, bytes: Uint8Array, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      title: 'Testbild als PNG speichern',
      defaultPath: suggestedName,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    }
    const res = await showSaveDialog(win, opts)
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, Buffer.from(bytes))
    return res.filePath
  })

  handle(Channels.patterns.exportVideo, async (e, req: PatternVideoRequest) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const ext = req.format === 'hap_q' ? 'mov' : 'mp4'
    const opts = {
      title: 'Testbild als Video speichern',
      defaultPath: `testbild.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    }
    const res = await showSaveDialog(win, opts)
    if (res.canceled || !res.filePath) return null

    const emit = (p: PatternVideoProgress): void =>
      sendeAn(e.sender, Channels.patterns.onVideoProgress, p)
    try {
      await exportPatternVideo(req, res.filePath, (progress) => emit({ progress, done: false }))
      emit({ progress: 1, done: true, outputPath: res.filePath })
      return res.filePath
    } catch (err) {
      emit({ progress: 0, done: true, error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  })

  handle(Channels.patterns.exportColorLoop, async (e, req: ColorLoopRequest) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const ext = req.format === 'hap_q' ? 'mov' : 'mp4'
    const opts = {
      title: 'Pixelcheck-Loop speichern',
      defaultPath: `pixelcheck-loop.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    }
    const res = await showSaveDialog(win, opts)
    if (res.canceled || !res.filePath) return null

    const emit = (p: PatternVideoProgress): void =>
      sendeAn(e.sender, Channels.patterns.onVideoProgress, p)
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
