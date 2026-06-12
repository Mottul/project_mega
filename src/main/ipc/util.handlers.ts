// HTML -> PDF: window.open ist app-weit verboten (Sicherheits-Default), deshalb
// rendert ein VERSTECKTES BrowserWindow das uebergebene HTML und druckt es per
// printToPDF in die vom Nutzer gewaehlte Datei (z.B. LED-Wall-Projektdoku).

import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { Channels } from '@shared/ipc-contracts'
import { logLine } from '../services/log'

export function registerUtilHandlers(): void {
  ipcMain.handle(Channels.utilExportPdf, async (e, html: string, suggestedName: string, landscape = false) => {
    const parent = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      title: 'Als PDF speichern',
      defaultPath: suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
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
  })
}
