// PDF-Export der Projektdoku über den main-Prozess (window.open ist app-weit verboten). Das HTML
// baut printHtml.ts – rein, damit es sich testen lässt und das Mini-Manual es mitnutzen kann.

import { api } from '@renderer/lib/api'
import type { PdfExportResult } from '@shared/types'
import { ledWallPrintHtml, type PrintData } from './printHtml'

export type { PrintData } from './printHtml'

export async function exportLedWallPdf(d: PrintData): Promise<PdfExportResult | null> {
  const { html, fileName } = ledWallPrintHtml(d)
  return api.util.exportPdf(html, fileName, { landscape: d.landscape })
}
