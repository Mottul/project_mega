import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

export type DB = Database.Database

let db: DB | null = null

/** Oeffnet die SQLite-DB (einmalig) und fuehrt Migrationen aus. */
export function getDb(): DB {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'library.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(d: DB): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS manuals (
      id           INTEGER PRIMARY KEY,
      title        TEXT NOT NULL,
      manufacturer TEXT,
      category     TEXT,
      tags         TEXT,
      filename     TEXT NOT NULL,
      stored_path  TEXT NOT NULL,        -- relativ zu userData/manuals (<hash>.pdf)
      file_hash    TEXT UNIQUE NOT NULL, -- SHA-256, Dedup
      page_count   INTEGER,
      size_bytes   INTEGER,
      added_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manual_pages (
      id        INTEGER PRIMARY KEY,
      manual_id INTEGER NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
      page_no   INTEGER NOT NULL,        -- 0 = synthetische Metadaten-Seite
      content   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pages_manual ON manual_pages(manual_id);

    -- FTS5 external-content Index ueber manual_pages.content
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      content,
      content='manual_pages',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    -- Trigger halten den FTS-Index synchron (Standard-Muster fuer external content)
    CREATE TRIGGER IF NOT EXISTS manual_pages_ai AFTER INSERT ON manual_pages BEGIN
      INSERT INTO pages_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS manual_pages_ad AFTER DELETE ON manual_pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS manual_pages_au AFTER UPDATE ON manual_pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO pages_fts(rowid, content) VALUES (new.id, new.content);
    END;

    -- Video-Player: abspielbereite, auf Wand-Auflösung konvertierte Medien.
    CREATE TABLE IF NOT EXISTS media_items (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL,        -- 'video' | 'image' | 'gif'
      title         TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name   TEXT NOT NULL,        -- konvertierte Datei in userData/player-media
      thumb_name    TEXT,                 -- Vorschaubild (jpg) oder NULL
      width         INTEGER NOT NULL,     -- Ziel-/Wand-Auflösung
      height        INTEGER NOT NULL,
      duration_sec  REAL,                 -- NULL = Standbild
      fit_mode      TEXT NOT NULL,        -- 'blur' | 'bars' | 'stretch'
      has_audio     INTEGER NOT NULL,     -- 0/1
      conv_key      TEXT UNIQUE NOT NULL, -- Quelle+Fit+Auflösung -> Dedup
      size_bytes    INTEGER NOT NULL,
      source_path   TEXT,                 -- Originalquelle (für Neu-Konvertierung)
      added_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_added ON media_items(added_at);
  `)

  // Nachträgliche Spalten für bereits bestehende DBs (idempotent).
  const cols = d.prepare('PRAGMA table_info(media_items)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'source_path')) {
    d.exec('ALTER TABLE media_items ADD COLUMN source_path TEXT')
  }
}
