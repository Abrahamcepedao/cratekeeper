import { readdir, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { parseFile } from "music-metadata";
import { db } from "./db";

export const AUDIO_EXTS = new Set([".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a", ".aac", ".ogg"]);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && AUDIO_EXTS.has(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

/** "Artist - Title.mp3" → { artist, title } when tags are missing. */
function guessFromFilename(file: string) {
  const name = basename(file, extname(file)).replace(/_/g, " ");
  const m = name.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: null, title: name.trim() };
}

const FIELDS = ["title", "artist", "album", "genre", "year", "label"] as const;

export type ScanResult = { found: number; added: number; updated: number; missing: number; errors: number; ms: number };

export async function scanLibrary(root: string): Promise<ScanResult> {
  const t0 = Date.now();
  const files = await walk(root);
  const existing = new Map<string, { id: number; size: number; mtime: number; locked: string }>();
  for (const r of db.query("SELECT id, path, size, mtime, locked FROM tracks").all() as any[]) existing.set(r.path, r);

  const res: ScanResult = { found: files.length, added: 0, updated: 0, missing: 0, errors: 0, ms: 0 };
  const seen = new Set<string>();

  const insert = db.query(`INSERT INTO tracks (path, rel_path, filename, ext, size, mtime, title, artist, album, genre, year, label, duration, bitrate, sample_rate, has_artwork)
    VALUES ($path, $rel, $filename, $ext, $size, $mtime, $title, $artist, $album, $genre, $year, $label, $duration, $bitrate, $sr, $art)`);

  const queue = [...files];
  const worker = async () => {
    while (queue.length) {
      const file = queue.shift()!;
      seen.add(file);
      try {
        const st = await stat(file);
        const prev = existing.get(file);
        const mtime = Math.floor(st.mtimeMs);
        if (prev && prev.size === st.size && prev.mtime === mtime) {
          db.query("UPDATE tracks SET missing = 0 WHERE id = ?").run(prev.id);
          continue;
        }
        let meta: any = null;
        try {
          meta = await parseFile(file, { duration: true, skipCovers: false });
        } catch {
          meta = null;
        }
        const c = meta?.common ?? {};
        const f = meta?.format ?? {};
        const guess = guessFromFilename(file);
        const row = {
          title: c.title || guess.title,
          artist: c.artist || c.albumartist || guess.artist,
          album: c.album ?? null,
          genre: c.genre?.[0] ?? null,
          year: c.year ?? null,
          label: c.label?.[0] ?? null,
        };
        const duration = f.duration ?? null;
        const bitrate = f.bitrate ? Math.round(f.bitrate / 1000) : null;
        const sr = f.sampleRate ?? null;
        const art = c.picture?.length ? 1 : 0;
        if (!prev) {
          insert.run({
            $path: file, $rel: relative(root, file), $filename: basename(file), $ext: extname(file).slice(1).toLowerCase(),
            $size: st.size, $mtime: mtime, $title: row.title, $artist: row.artist, $album: row.album, $genre: row.genre,
            $year: row.year, $label: row.label, $duration: duration, $bitrate: bitrate, $sr: sr, $art: art,
          });
          res.added++;
        } else {
          // File changed on disk: refresh tag fields the user hasn't edited by hand.
          const locked = new Set<string>(JSON.parse(prev.locked || "[]"));
          const sets = ["size = ?", "mtime = ?", "duration = ?", "bitrate = ?", "sample_rate = ?", "has_artwork = ?", "missing = 0", "updated_at = datetime('now')"];
          const vals: any[] = [st.size, mtime, duration, bitrate, sr, art];
          for (const k of FIELDS) if (!locked.has(k)) { sets.push(`${k} = ?`); vals.push(row[k]); }
          db.query(`UPDATE tracks SET ${sets.join(", ")} WHERE id = ?`).run(...vals, prev.id);
          res.updated++;
        }
      } catch (e) {
        res.errors++;
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  for (const [path, r] of existing) {
    if (!seen.has(path)) {
      db.query("UPDATE tracks SET missing = 1 WHERE id = ?").run(r.id);
      res.missing++;
    }
  }
  res.ms = Date.now() - t0;
  return res;
}
