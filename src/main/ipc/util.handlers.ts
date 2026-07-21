// HTML -> PDF: window.open ist app-weit verboten (Sicherheits-Default), deshalb
// rendert ein VERSTECKTES BrowserWindow das uebergebene HTML und druckt es per
// printToPDF in die vom Nutzer gewaehlte Datei (z.B. LED-Wall-Projektdoku).

import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { Channels } from '@shared/ipc-contracts'
import { logLine } from '../services/log'

export function registerUtilHandlers(): void {
  // Renderer-seitige Fehler ins gemeinsame Debug-Log spiegeln (Einweg).
  ipcMain.on(Channels.utilLog, (_e, message: unknown) => {
    logLine(typeof message === 'string' ? message : String(message))
  })

  // Beliebigen Text (z.B. JSON) über einen Speichern-Dialog schreiben.
  ipcMain.handle(Channels.utilSaveText, async (e, text: string, suggestedName: string) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      title: 'Speichern',
      defaultPath: suggestedName,
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    }
    const res = parent
      ? await dialog.showSaveDialog(parent, opts)
      : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, text, 'utf8')
    logLine('[util] Text gespeichert ->', res.filePath, `${text.length} Zeichen`)
    return res.filePath
  })

  // Textdatei über einen Öffnen-Dialog einlesen.
  ipcMain.handle(Channels.utilOpenText, async (e) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      title: 'Öffnen',
      properties: ['openFile' as const],
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    }
    const res = parent
      ? await dialog.showOpenDialog(parent, opts)
      : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    return readFile(res.filePaths[0], 'utf8')
  })

  ipcMain.handle(
    Channels.utilExportPdf,
    async (e, html: string, suggestedName: string, landscape = false) => {
      const parent = BrowserWindow.fromWebContents(e.sender)
      const opts = {
        title: 'Als PDF speichern',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      }
      const res = parent
        ? await dialog.showSaveDialog(parent, opts)
        : await dialog.showSaveDialog(opts)
      if (res.canceled || !res.filePath) return null

      const win = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
      })
      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          landscape,
          margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
        })
        await writeFile(res.filePath, pdf)
        logLine('[pdf] exportiert ->', res.filePath, `${pdf.byteLength} bytes`)
        return res.filePath
      } finally {
        if (!win.isDestroyed()) win.destroy()
      }
    }
  )
}
