// Eigenständige HTML-Dateien (Handy-Fassung des Mini-Manuals): speichern über den Dialog oder in
// die Online-Ablage. Fotos setzt main ein (services/html) – über IPC gehen nur Hashes im HTML.

import { BrowserWindow } from 'electron'
import { Channels } from '@shared/ipc-contracts'
import { showSaveDialog } from '../services/fileDialogs'
import { writeFileAtomicAsync } from '../services/fsAtomic'
import { HTML_MAX_BYTES, inlineFotos } from '../services/html/inlineFotos'
import { veroeffentlichen } from '../services/html/onlineAblage'
import { logLine } from '../services/log'
import { handle } from './kanal'

/** HTML vom Renderer (Fotos noch als Hash) – größer ist es nie */
const HTML_IN_MAX = 20 * 1024 * 1024

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length <= max ? v : null

export function registerHtmlHandlers(): void {
  handle(Channels.util.exportHtml, async (e, html: unknown, suggestedName: unknown) => {
    const h = text(html, HTML_IN_MAX)
    if (h === null) throw new Error('HTML-Export: HTML fehlt oder ist zu groß')
    const res = await showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Handy-Fassung speichern',
      defaultPath: text(suggestedName, 200) ?? 'Anleitung.html',
      filters: [{ name: 'Webseite (HTML)', extensions: ['html'] }]
    })
    if (res.canceled || !res.filePath) return null
    const voll = await inlineFotos(h)
    if (Buffer.byteLength(voll, 'utf8') > HTML_MAX_BYTES)
      throw new Error('HTML-Export: zu groß (zu viele oder zu große Fotos)')
    await writeFileAtomicAsync(res.filePath, Buffer.from(voll, 'utf8'))
    logLine('[html] gespeichert ->', res.filePath, `${voll.length} Zeichen`)
    return res.filePath
  })

  handle(Channels.online.publish, async (_e, html: unknown, ordner: unknown, name: unknown) => {
    const h = text(html, HTML_IN_MAX)
    if (h === null) return { ok: false, reason: 'fehler' } as const
    return veroeffentlichen(h, text(ordner, 80), text(name, 200) ?? '')
  })
}
