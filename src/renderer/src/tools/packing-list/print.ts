// Packliste als druckfertiges PDF (helle Tabelle mit Ankreuzkästchen), gruppiert
// nach Kategorie. Nutzt den gemeinsamen util:exportPdf-Kanal; das HTML baut
// packingHtml() in printHtml.ts (rein, getestet).

import { api } from '@renderer/lib/api'
import type { PdfExportResult } from '@shared/types'
import { packingHtml, type PackPdfOptionen } from './printHtml'
import type { PackItem } from './store'

export async function exportPackingPdf(
  projectName: string,
  items: PackItem[],
  o: Omit<PackPdfOptionen, 'datum'>
): Promise<PdfExportResult | null> {
  const html = packingHtml(projectName, items, {
    ...o,
    datum: new Date().toLocaleDateString('de-AT')
  })
  const safe = projectName.replace(/[^\wäöüÄÖÜß -]+/g, '').trim()
  return api.util.exportPdf(html, `Packliste${safe ? '-' + safe : ''}.pdf`)
}
