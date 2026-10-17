// Kleine Helfer ohne eigenes Werkzeug: Log, Text speichern/öffnen und HTML -> PDF in die vom
// Nutzer gewählte Datei (z.B. LED-Wall-Projektdoku; Druck in services/pdf/htmlToPdf.ts).

import { BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { Channels } from '@shared/ipc-contracts'
import type { PdfPageOptions } from '@shared/types'
import { showOpenDialog, showSaveDialog } from '../services/fileDialogs'
import { logLine } from '../services/log'
import { htmlToPdf } from '../services/pdf/htmlToPdf'

/** Seitenangaben vom Renderer feldweise übernehmen; Unbekanntes fällt auf A4 hoch zurück. */
function pageOptions(raw: unknown): PdfPageOptions {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { pageSize: p.pageSize === 'A5' ? 'A5' : 'A4', landscape: p.landscape === true }
}

export function registerUtilHandlers(): void {
  // Renderer-seitige Fehler ins gemeinsame Debug-Log spiegeln (Einweg).
  ipcMain.on(Channels.utilLog, (_e, message: unknown) => {
    logLine(typeof message === 'string' ? message : String(message))
  })

  // Beliebigen Text (z.B. JSON, CSV) über einen Speichern-Dialog schreiben.
  ipcMain.handle(
    Channels.utilSaveText,
    async (
      e,
      text: string,
      suggestedName: string,
      filters?: { name: string; extensions: string[] }[]
    ) => {
      const parent = BrowserWindow.fromWebContents(e.sender)
      const opts = {
        title: 'Speichern',
        defaultPath: suggestedName,
        filters: [
          ...(Array.isArray(filters) && filters.length
            ? filters
            : [{ name: 'JSON', extensions: ['json'] }]),
          { name: 'Alle Dateien', extensions: ['*'] }
        ]
      }
      const res = await showSaveDialog(parent, opts)
      if (res.canceled || !res.filePath) return null
      await writeFile(res.filePath, text, 'utf8')
      logLine('[util] Text gespeichert ->', res.filePath, `${text.length} Zeichen`)
      return res.filePath
    }
  )

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
    const res = await showOpenDialog(parent, opts)
    if (res.canceled || !res.filePaths[0]) return null
    return readFile(res.filePaths[0], 'utf8')
  })

  ipcMain.handle(
    Channels.utilExportPdf,
    async (e, html: string, suggestedName: string, page: unknown) => {
      if (typeof html !== 'string') throw new Error('PDF-Export: HTML fehlt')
      const parent = BrowserWindow.fromWebContents(e.sender)
      const opts = {
        title: 'Als PDF speichern',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      }
      const res = await showSaveDialog(parent, opts)
      if (res.canceled || !res.filePath) return null

      const pdf = await htmlToPdf(html, pageOptions(page))
      await writeFile(res.filePath, pdf)
      logLine('[pdf] exportiert ->', res.filePath, `${pdf.byteLength} bytes`)
      return res.filePath
    }
  )
}
