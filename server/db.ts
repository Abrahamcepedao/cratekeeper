import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const DATA_DIR = process.env.CRATEKEEPER_DATA ?? join(import.meta.dir, "..", "data");
mkdirSync(join(DATA_DIR, "art"), { recursive: true });

export const db = new Database(join(DATA_DIR, "cratekeeper.db"), { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  rel_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER,
  mtime INTEGER,
  title TEXT,
  artist TEXT,
  album TEXT,
  genre TEXT,
  year INTEGER,
  label TEXT,
  duration REAL,
  bitrate INTEGER,
  sample_rate INTEGER,
  has_artwork INTEGER DEFAULT 0,
  bpm REAL,
  bpm_raw REAL,
  musical_key TEXT,
  key_strength REAL,
  peaks TEXT,
  analyzed_at TEXT,
  analysis_error TEXT,
  energy INTEGER,
  rating INTEGER,
  notes TEXT DEFAULT '',
  color TEXT,
  locked TEXT DEFAULT '[]',
  missing INTEGER DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#8b5cf6'
);
CREATE TABLE IF NOT EXISTS track_tags (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (track_id, tag_id)
);
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'crate' CHECK (kind IN ('folder','crate','set')),
  position INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS playlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_entries_playlist ON playlist_entries(playlist_id, position);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

export function getSetting(key: string): string | null {
  const row = db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

// Seed a few useful starter tags on first run.
const tagCount = (db.query("SELECT COUNT(*) AS n FROM tags").get() as { n: number }).n;
if (tagCount === 0 && !getSetting("seeded")) {
  const seed: [string, string][] = [
    ["warm-up", "#22c55e"],
    ["peak-time", "#ef4444"],
    ["closer", "#f59e0b"],
    ["vocal", "#ec4899"],
    ["tool", "#64748b"],
    ["banger", "#f97316"],
    ["deep", "#3b82f6"],
    ["groovy", "#14b8a6"],
  ];
  const ins = db.query("INSERT INTO tags (name, color) VALUES (?, ?)");
  for (const [n, c] of seed) ins.run(n, c);
  setSetting("seeded", "1");
}
