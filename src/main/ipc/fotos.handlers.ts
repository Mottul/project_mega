// Fotos für Projektdateien einfügen (Dialog mit gemerktem Ordner) und über foto:// anzeigen.
// Dünne Hülle um services/fotos/fotoStore.ts.

import { BrowserWindow, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { Channels } from '@shared/ipc-contracts'
import { FOTO_PROTOCOL } from '@shared/fotos'
import type { FotoImport } from '@shared/types'
import { showOpenDialog } from '../services/fileDialogs'
import { findFoto, importFotoFile } from '../services/fotos/fotoStore'
import { logLine } from '../services/log'
import { handle } from './kanal'

/** höchstens so viele Bilder je Dialog – jedes wird dekodiert und neu kodiert */
const MAX_PICK = 50

export function registerFotosHandlers(): void {
  handle(Channels.fotos.pick, async (e): Promise<FotoImport[] | null> => {
    const res = await showOpenDialog(
      BrowserWindow.fromWebContents(e.sender),
      {
        title: 'Fotos einfügen',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Bilder (JPG, PNG)', extensions: ['jpg', 'jpeg', 'png'] }]
      },
      'fotos'
    )
    if (res.canceled || !res.filePaths.length) return null
    const out: FotoImport[] = []
    // nacheinander: zehn Handyfotos gleichzeitig dekodiert brauchten Hunderte MB
    for (const p of res.filePaths.slice(0, MAX_PICK)) out.push(await importFotoFile(p))
    return out
  })
}

/** Bedient foto://bild/<hash> aus userData/Projektfotos. */
export function registerFotoProtocol(): void {
  protocol.handle(FOTO_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      const found = url.host === 'bild' ? await findFoto(url.pathname.slice(1)) : null
      if (!found) return new Response('Not found', { status: 404 })
      const data = await readFile(found.path)
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': found.ext === 'png' ? 'image/png' : 'image/jpeg',
          'Content-Length': String(data.byteLength),
          // Inhalt hängt nur am Hash – darf ewig im Cache bleiben
          'Cache-Control': 'max-age=31536000, immutable'
        }
      })
    } catch (err) {
      logLine('[foto://] FEHLER', request.url, String(err))
      return new Response('Error', { status: 500 })
    }
  })
}
