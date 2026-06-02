import { app } from 'electron'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  type Dirent
} from 'node:fs'
import { basename, extname, join } from 'node:path'
import { MANUAL_PROTOCOL } from '@shared/ipc-contracts'
import type {
  ImportProgress,
  ImportSummary,
  ManualDetail,
  ManualMeta,
  ManualPatch,
  ManualSearchHit
} from '@shared/types'
import { getDb } from '../db'
import { logLine } from '../log'
import { extractPdfText } from './pdfText'

interface ManualRow {
  id: number
  title: string
  manufacturer: string | null
  category: string | null
  tags: string | null
  filename: string
  stored_path: string
  file_hash: string
  page_count: number | null
  size_bytes: number | null
  added_at: number
}

type ProgressCb = (p: ImportProgress) => void

const HASH_FILE_RE = /^[a-f0-9]{64}\.pdf$/i

function manualsDir(): string {
  const dir = join(app.getPath('userData'), 'manuals')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function rowToMeta(r: ManualRow): ManualMeta {
  return {
    id: r.id,
    title: r.title,
    manufacturer: r.manufacturer,
    category: r.category,
    tags: r.tags,
    filename: r.filename,
    pageCount: r.page_count,
    sizeBytes: r.size_bytes,
    addedAt: r.added_at
  }
}

function metadataText(title: string, manufacturer?: string | null, tags?: string | null): string {
  return [title, manufacturer ?? '', tags ?? ''].filter(Boolean).join(' ').trim()
}

function readEntries(dir: string): Dirent<string>[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function collectPdfs(paths: string[]): string[] {
  const out = new Set<string>()
  const walk = (dir: string): void => {
    for (const e of readEntries(dir)) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) walk(fp)
      else if (extname(e.name).toLowerCase() === '.pdf') out.add(fp)
    }
  }
  for (const p of paths) {
    try {
      if (statSync(p).isDirectory()) walk(p)
      else if (extname(p).toLowerCase() === '.pdf') out.add(p)
    } catch {
      // ignorieren
    }
  }
  return [...out]
}

/** Loest einen relativen Pfad aus einer manual://-URL sicher in einen absoluten auf. */
export function resolveManualFile(relative: string): string | null {
  const name = basename(decodeURIComponent(relative))
  if (!HASH_FILE_RE.test(name)) return null
  const abs = join(manualsDir(), name)
  return existsSync(abs) ? abs : null
}

/** Importiert PDFs in die verwaltete Bibliothek (Dedup per SHA-256, Text-Index). */
export async function importManuals(paths: string[], onProgress: ProgressCb): Promise<ImportSummary> {
  const db = getDb()
  const files = collectPdfs(paths)
  const summary: ImportSummary = { imported: 0, skipped: 0, failed: [] }

  const existsStmt = db.prepare<[string]>('SELECT id FROM manuals WHERE file_hash = ?')
  const insertManual = db.prepare(
    `INSERT INTO manuals (title, manufacturer, category, tags, filename, stored_path, file_hash, page_count, size_bytes, added_at)
     VALUES (@title, @manufacturer, @category, @tags, @filename, @stored_path, @file_hash, @page_count, @size_bytes, @added_at)`
  )
  const insertPage = db.prepare(
    'INSERT INTO manual_pages (manual_id, page_no, content) VALUES (?, ?, ?)'
  )

  for (let i = 0; i < files.length; i++) {
    const src = files[i]
    const fileIndex = i + 1
    const fileCount = files.length
    const emit = (p: Partial<ImportProgress>): void =>
      onProgress({ phase: 'extracting', file: src, fileIndex, fileCount, ...p } as ImportProgress)

    try {
      emit({ phase: 'hashing' })
      const buf = readFileSync(src)
      const hash = createHash('sha256').update(buf).digest('hex')

      if (existsStmt.get(hash)) {
        summary.skipped++
        emit({ phase: 'skipped' })
        logLine('[import] uebersprungen (bereits in der Bibliothek, gleicher SHA-256):', src)
        continue
      }

      emit({ phase: 'copying' })
      const storedName = `${hash}.pdf`
      writeFileSync(join(manualsDir(), storedName), buf)

      emit({ phase: 'extracting', page: 0 })
      // Textextraktion ist best effort: schlaegt sie fehl (z.B. beschaedigtes/
      // passwortgeschuetztes PDF), wird das Manual trotzdem aufgenommen -- nur ohne
      // Volltext (Titel/Metadaten bleiben durchsuchbar). So geht keine Datei verloren.
      let pageCount = 0
      let pages: { pageNo: number; text: string }[] = []
      try {
        const res = await extractPdfText(buf, (page, total) =>
          emit({ phase: 'extracting', page, pageCount: total })
        )
        pageCount = res.pageCount
        pages = res.pages
        const withText = pages.filter((p) => p.text).length
        logLine(`[import] extrahiert: ${src} -> ${pageCount} Seiten, ${withText} mit Text`)
      } catch (exErr) {
        const msg = exErr instanceof Error ? exErr.message : String(exErr)
        logLine(`[import] Textextraktion FEHLGESCHLAGEN fuer ${src}: ${msg}`)
      }

      emit({ phase: 'indexing' })
      const title = basename(src, extname(src))
      const insertAll = db.transaction(() => {
        const info = insertManual.run({
          title,
          manufacturer: null,
          category: null,
          tags: null,
          filename: basename(src),
          stored_path: storedName,
          file_hash: hash,
          page_count: pageCount,
          size_bytes: buf.byteLength,
          added_at: Date.now()
        })
        const manualId = Number(info.lastInsertRowid)
        // page_no = 0: synthetische Metadaten-Seite (Titel/Hersteller/Tags durchsuchbar)
        insertPage.run(manualId, 0, metadataText(title))
        for (const pg of pages) {
          if (pg.text) insertPage.run(manualId, pg.pageNo, pg.text)
        }
      })
      insertAll()

      summary.imported++
      emit({ phase: 'done', pageCount })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      summary.failed.push({ path: src, error: message })
      onProgress({ phase: 'error', file: src, fileIndex, fileCount, message })
      logLine(`[import] FEHLER bei ${src}: ${message}`)
    }
  }
  logLine(
    `[import] fertig: ${summary.imported} importiert, ${summary.skipped} uebersprungen, ${summary.failed.length} fehlgeschlagen`
  )
  return summary
}

export function listManuals(query?: string): ManualMeta[] {
  const db = getDb()
  const q = (query ?? '').trim()
  if (!q) {
    const rows = db
      .prepare('SELECT * FROM manuals ORDER BY added_at DESC')
      .all() as ManualRow[]
    return rows.map(rowToMeta)
  }
  const like = `%${q}%`
  const rows = db
    .prepare(
      `SELECT * FROM manuals
       WHERE title LIKE ? OR manufacturer LIKE ? OR tags LIKE ? OR category LIKE ?
       ORDER BY added_at DESC`
    )
    .all(like, like, like, like) as ManualRow[]
  return rows.map(rowToMeta)
}

function toMatchQuery(input: string): string {
  const tokens = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (tokens.length === 0) return ''
  return tokens.map((t) => `"${t}"*`).join(' ')
}

export function searchManuals(query: string): ManualSearchHit[] {
  const match = toMatchQuery(query)
  if (!match) return []
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT m.id AS manualId, m.title AS title, m.manufacturer AS manufacturer,
              mp.page_no AS pageNo,
              snippet(pages_fts, 0, '<mark>', '</mark>', '…', 12) AS snippet,
              bm25(pages_fts) AS score
       FROM pages_fts
       JOIN manual_pages mp ON mp.id = pages_fts.rowid
       JOIN manuals m ON m.id = mp.manual_id
       WHERE pages_fts MATCH ?
       ORDER BY score
       LIMIT 200`
    )
    .all(match) as ManualSearchHit[]
  return rows
}

export function getManual(id: number): ManualDetail {
  const db = getDb()
  const row = db.prepare('SELECT * FROM manuals WHERE id = ?').get(id) as ManualRow | undefined
  if (!row) throw new Error(`Manual ${id} nicht gefunden`)
  return {
    ...rowToMeta(row),
    fileUrl: `${MANUAL_PROTOCOL}://library/${row.stored_path}`
  }
}

export function updateManual(id: number, patch: ManualPatch): ManualMeta {
  const db = getDb()
  const row = db.prepare('SELECT * FROM manuals WHERE id = ?').get(id) as ManualRow | undefined
  if (!row) throw new Error(`Manual ${id} nicht gefunden`)

  const next = {
    title: patch.title ?? row.title,
    manufacturer: patch.manufacturer !== undefined ? patch.manufacturer : row.manufacturer,
    category: patch.category !== undefined ? patch.category : row.category,
    tags: patch.tags !== undefined ? patch.tags : row.tags
  }

  const apply = db.transaction(() => {
    db.prepare(
      'UPDATE manuals SET title = ?, manufacturer = ?, category = ?, tags = ? WHERE id = ?'
    ).run(next.title, next.manufacturer, next.category, next.tags, id)
    // Metadaten-Seite aktualisieren, damit die Suche konsistent bleibt
    db.prepare('UPDATE manual_pages SET content = ? WHERE manual_id = ? AND page_no = 0').run(
      metadataText(next.title, next.manufacturer, next.tags),
      id
    )
  })
  apply()

  const updated = db.prepare('SELECT * FROM manuals WHERE id = ?').get(id) as ManualRow
  return rowToMeta(updated)
}

export function deleteManual(id: number): void {
  const db = getDb()
  const row = db.prepare('SELECT stored_path FROM manuals WHERE id = ?').get(id) as
    | { stored_path: string }
    | undefined
  if (!row) return
  db.prepare('DELETE FROM manuals WHERE id = ?').run(id) // CASCADE -> manual_pages -> FTS-Trigger
  try {
    const abs = join(manualsDir(), row.stored_path)
    if (existsSync(abs)) rmSync(abs)
  } catch {
    // Datei-Cleanup ist best effort
  }
}
