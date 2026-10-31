import { Hono } from "hono";
import { existsSync, statSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { parseFile } from "music-metadata";
import { db, DATA_DIR, getSetting, setSetting } from "./db";
import { scanLibrary } from "./scan";
import index from "../web/index.html";

const PORT = Number(process.env.PORT ?? 4747);
const ROOT = join(import.meta.dir, "..");
const VENDOR_DIR = join(ROOT, "node_modules", "essentia.js", "dist");
const PUBLIC_DIR = join(ROOT, "public");

if (process.env.MUSIC_DIR && !getSetting("musicDir")) setSetting("musicDir", process.env.MUSIC_DIR);

const api = new Hono().basePath("/api");

const TRACK_COLS = `id, rel_path, filename, ext, size, title, artist, album, genre, year, label, duration, bitrate,
  has_artwork, bpm, bpm_raw, musical_key, key_strength, analyzed_at, analysis_error, energy, rating, notes, color,
  locked, missing, added_at`;

function loadPlaylists() {
  const lists = db.query("SELECT * FROM playlists ORDER BY parent_id IS NOT NULL, position, id").all() as any[];
  const entries = db.query("SELECT id, playlist_id, track_id, position, note FROM playlist_entries ORDER BY playlist_id, position").all() as any[];
  const byList = new Map<number, any[]>();
  for (const e of entries) {
    if (!byList.has(e.playlist_id)) byList.set(e.playlist_id, []);
    byList.get(e.playlist_id)!.push({ id: e.id, trackId: e.track_id, note: e.note ?? "" });
  }
  return lists.map((p) => ({ ...p, entries: byList.get(p.id) ?? [] }));
}

api.get("/library", (c) => {
  const tracks = db.query(`SELECT ${TRACK_COLS} FROM tracks ORDER BY artist COLLATE NOCASE, title COLLATE NOCASE`).all();
  const tags = db.query("SELECT * FROM tags ORDER BY name COLLATE NOCASE").all();
  const trackTags = db.query("SELECT track_id, tag_id FROM track_tags").all();
  return c.json({
    tracks,
    tags,
    trackTags,
    playlists: loadPlaylists(),
    settings: {
      musicDir: getSetting("musicDir") ?? "",
      keyNotation: getSetting("keyNotation") ?? "camelot",
      platform: process.platform,
    },
  });
});

api.post("/scan", async (c) => {
  const dir = getSetting("musicDir");
  if (!dir) return c.json({ error: "Set your music folder first." }, 422);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return c.json({ error: `Folder not found: ${dir}` }, 422);
  const result = await scanLibrary(dir);
  return c.json(result);
});

api.post("/settings", async (c) => {
  const body = await c.req.json();
  if (typeof body.musicDir === "string") {
    let dir = body.musicDir.trim();
    if (dir.startsWith("~")) dir = join(homedir(), dir.slice(1));
    dir = resolve(dir);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return c.json({ error: `Folder not found: ${dir}` }, 422);
    setSetting("musicDir", dir);
  }
  if (body.keyNotation === "camelot" || body.keyNotation === "musical" || body.keyNotation === "openkey") setSetting("keyNotation", body.keyNotation);
  return c.json({ ok: true, musicDir: getSetting("musicDir") });
});

// macOS native folder picker (runs on the machine hosting the app).
api.post("/pick-folder", async (c) => {
  if (process.platform !== "darwin") return c.json({ error: "Folder picker is only available on macOS — paste the path instead." }, 422);
  const proc = Bun.spawn(["osascript", "-e", 'POSIX path of (choose folder with prompt "Choose your music folder")'], { stdout: "pipe", stderr: "pipe" });
  const out = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  if (!out) return c.json({ cancelled: true });
  return c.json({ path: out.replace(/\/$/, "") });
});

const EDITABLE = new Set(["title", "artist", "album", "genre", "year", "label", "bpm", "musical_key", "energy", "rating", "notes", "color"]);
const TAG_FIELDS = new Set(["title", "artist", "album", "genre", "year", "label"]);

api.patch("/tracks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json();
  const row = db.query("SELECT locked FROM tracks WHERE id = ?").get(id) as { locked: string } | null;
  if (!row) return c.json({ error: "Track not found" }, 404);
  const locked = new Set<string>(JSON.parse(row.locked || "[]"));
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    sets.push(`${k} = ?`);
    vals.push(v === "" && k !== "notes" ? null : v);
    if (TAG_FIELDS.has(k) || k === "bpm" || k === "musical_key") locked.add(k);
  }
  if (!sets.length) return c.json({ error: "Nothing to update" }, 422);
  sets.push("locked = ?", "updated_at = datetime('now')");
  vals.push(JSON.stringify([...locked]));
  db.query(`UPDATE tracks SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  return c.json(db.query(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(id));
});

api.post("/tracks/:id/analysis", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json();
  const row = db.query("SELECT locked FROM tracks WHERE id = ?").get(id) as { locked: string } | null;
  if (!row) return c.json({ error: "Track not found" }, 404);
  if (b.error) {
    db.query("UPDATE tracks SET analysis_error = ?, analyzed_at = datetime('now') WHERE id = ?").run(String(b.error).slice(0, 300), id);
  } else {
    const locked = new Set<string>(JSON.parse(row.locked || "[]"));
    const sets = ["bpm_raw = ?", "key_strength = ?", "peaks = ?", "analyzed_at = datetime('now')", "analysis_error = NULL"];
    const vals: any[] = [b.bpmRaw ?? null, b.keyStrength ?? null, b.peaks ? JSON.stringify(b.peaks) : null];
    if (!locked.has("bpm") || b.force) { sets.push("bpm = ?"); vals.push(b.bpm ?? null); }
    if (!locked.has("musical_key") || b.force) { sets.push("musical_key = ?"); vals.push(b.key ?? null); }
    if (b.force) { locked.delete("bpm"); locked.delete("musical_key"); sets.push("locked = ?"); vals.push(JSON.stringify([...locked])); }
    db.query(`UPDATE tracks SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  }
  return c.json(db.query(`SELECT ${TRACK_COLS} FROM tracks WHERE id = ?`).get(id));
});

api.post("/tracks/reset-analysis", async (c) => {
  const { trackIds } = await c.req.json();
  const q = db.query("UPDATE tracks SET analyzed_at = NULL, analysis_error = NULL WHERE id = ?");
  for (const id of trackIds ?? []) q.run(id);
  return c.json({ ok: true });
});

/** Move tracks' files to the macOS Trash (recoverable with Put Back), then drop them from the library.
 *  Tags, notes and playlist entries go with them. Only files inside the music folder are ever touched. */
api.post("/tracks/trash", async (c) => {
  const { trackIds } = await c.req.json();
  if (!Array.isArray(trackIds) || !trackIds.length) return c.json({ error: "No tracks given" }, 422);
  if (process.platform !== "darwin") return c.json({ error: "Moving files to the Trash is only supported on macOS." }, 422);
  const root = resolve(getSetting("musicDir") ?? "");
  const rows = trackIds
    .map((id: number) => db.query("SELECT id, path FROM tracks WHERE id = ?").get(Number(id)) as { id: number; path: string } | null)
    .filter(Boolean) as { id: number; path: string }[];
  const failed: { id: number; error: string }[] = [];
  const toTrash: { id: number; path: string }[] = [];
  const removed: number[] = [];
  for (const r of rows) {
    if (!existsSync(r.path)) removed.push(r.id); // already gone from disk: just forget it
    else if (!resolve(r.path).startsWith(root + sep)) failed.push({ id: r.id, error: "File is outside your music folder" });
    else toTrash.push(r);
  }
  if (toTrash.length) {
    const paths = toTrash.map((r) => r.path);
    const cmd = existsSync("/usr/bin/trash")
      ? ["/usr/bin/trash", ...paths]
      : ["osascript", "-e", `tell application "Finder" to delete {${paths.map((p) => `POSIX file ${JSON.stringify(p)}`).join(", ")}}`];
    const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
    const err = (await new Response(proc.stderr).text()).trim();
    await proc.exited;
    // Trust the disk, not the exit code: a track leaves the library only if its file is really gone.
    for (const r of toTrash) {
      if (existsSync(r.path)) failed.push({ id: r.id, error: err || "Could not move the file to the Trash" });
      else removed.push(r.id);
    }
  }
  const del = db.query("DELETE FROM tracks WHERE id = ?");
  db.transaction(() => { for (const id of removed) del.run(id); })();
  for (const id of removed) for (const f of [`${id}.bin`, `${id}.bin.type`]) rmSync(join(DATA_DIR, "art", f), { force: true });
  return c.json({ removed, failed });
});

api.get("/tracks/:id/peaks", (c) => {
  const row = db.query("SELECT peaks FROM tracks WHERE id = ?").get(Number(c.req.param("id"))) as { peaks: string | null } | null;
  return c.json(row?.peaks ? JSON.parse(row.peaks) : null);
});

function trackPath(id: number): string | null {
  const row = db.query("SELECT path FROM tracks WHERE id = ?").get(id) as { path: string } | null;
  return row && existsSync(row.path) ? row.path : null;
}

const MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", aiff: "audio/aiff", aif: "audio/aiff", flac: "audio/flac",
  m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg",
};

api.get("/tracks/:id/audio", (c) => {
  const p = trackPath(Number(c.req.param("id")));
  if (!p) return c.json({ error: "File missing" }, 404);
  const file = Bun.file(p);
  const size = file.size;
  const type = MIME[p.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  const range = c.req.header("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    return new Response(file.slice(start, end + 1), {
      status: 206,
      headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(file, { headers: { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": String(size) } });
});

api.get("/tracks/:id/art", async (c) => {
  const id = Number(c.req.param("id"));
  const cached = join(DATA_DIR, "art", `${id}.bin`);
  if (existsSync(cached)) {
    const f = Bun.file(cached);
    const mime = (await Bun.file(cached + ".type").text().catch(() => "image/jpeg")) || "image/jpeg";
    return new Response(f, { headers: { "Content-Type": mime, "Cache-Control": "max-age=86400" } });
  }
  const p = trackPath(id);
  if (!p) return c.body(null, 404);
  try {
    const meta = await parseFile(p, { duration: false });
    const pic = meta.common.picture?.[0];
    if (!pic) return c.body(null, 404);
    await Bun.write(cached, pic.data);
    await Bun.write(cached + ".type", pic.format);
    return new Response(new Uint8Array(pic.data) as any, { headers: { "Content-Type": pic.format, "Cache-Control": "max-age=86400" } });
  } catch {
    return c.body(null, 404);
  }
});

api.post("/tracks/:id/reveal", (c) => {
  const p = trackPath(Number(c.req.param("id")));
  if (!p) return c.json({ error: "File missing" }, 404);
  if (process.platform === "darwin") Bun.spawn(["open", "-R", p]);
  return c.json({ ok: true, path: p });
});

// ---- Tags ----
api.post("/tags", async (c) => {
  const { name, color } = await c.req.json();
  if (!name?.trim()) return c.json({ error: "Name required" }, 422);
  const existing = db.query("SELECT * FROM tags WHERE name = ?").get(name.trim());
  if (existing) return c.json(existing);
  const r = db.query("INSERT INTO tags (name, color) VALUES (?, ?) RETURNING *").get(name.trim(), color ?? "#8b5cf6");
  return c.json(r);
});
api.patch("/tags/:id", async (c) => {
  const { name, color } = await c.req.json();
  const id = Number(c.req.param("id"));
  if (name) db.query("UPDATE tags SET name = ? WHERE id = ?").run(name.trim(), id);
  if (color) db.query("UPDATE tags SET color = ? WHERE id = ?").run(color, id);
  return c.json(db.query("SELECT * FROM tags WHERE id = ?").get(id));
});
api.delete("/tags/:id", (c) => {
  db.query("DELETE FROM tags WHERE id = ?").run(Number(c.req.param("id")));
  return c.json({ ok: true });
});
/** Bulk add/remove a tag on tracks. */
api.post("/tags/:id/tracks", async (c) => {
  const tagId = Number(c.req.param("id"));
  const { trackIds, action } = await c.req.json();
  const q = action === "remove"
    ? db.query("DELETE FROM track_tags WHERE track_id = ? AND tag_id = ?")
    : db.query("INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?, ?)");
  db.transaction(() => { for (const t of trackIds) q.run(t, tagId); })();
  return c.json({ ok: true });
});

// ---- Playlists (folders, crates, sets) ----
api.post("/playlists", async (c) => {
  const { name, kind, parentId } = await c.req.json();
  const pos = (db.query("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM playlists WHERE parent_id IS ?").get(parentId ?? null) as any).p;
  const r = db.query("INSERT INTO playlists (name, kind, parent_id, position) VALUES (?, ?, ?, ?) RETURNING *").get(name || "Untitled", kind ?? "crate", parentId ?? null, pos);
  return c.json({ ...(r as any), entries: [] });
});
api.patch("/playlists/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json();
  if (b.name !== undefined) db.query("UPDATE playlists SET name = ? WHERE id = ?").run(b.name, id);
  if (b.notes !== undefined) db.query("UPDATE playlists SET notes = ? WHERE id = ?").run(b.notes, id);
  if (b.parentId !== undefined && b.parentId !== id) db.query("UPDATE playlists SET parent_id = ? WHERE id = ?").run(b.parentId, id);
  return c.json({ ok: true });
});
api.delete("/playlists/:id", (c) => {
  db.query("DELETE FROM playlists WHERE id = ?").run(Number(c.req.param("id")));
  return c.json({ ok: true });
});
/** Append tracks. */
api.post("/playlists/:id/tracks", async (c) => {
  const id = Number(c.req.param("id"));
  const { trackIds, allowDuplicates } = await c.req.json();
  const present = new Set((db.query("SELECT track_id FROM playlist_entries WHERE playlist_id = ?").all(id) as any[]).map((r) => r.track_id));
  let pos = (db.query("SELECT COALESCE(MAX(position), 0) AS p FROM playlist_entries WHERE playlist_id = ?").get(id) as any).p;
  const ins = db.query("INSERT INTO playlist_entries (playlist_id, track_id, position) VALUES (?, ?, ?)");
  let added = 0;
  db.transaction(() => {
    for (const t of trackIds) {
      if (!allowDuplicates && present.has(t)) continue;
      ins.run(id, t, ++pos);
      present.add(t);
      added++;
    }
  })();
  return c.json({ added });
});
/** Replace the full ordered entry list (used for reorder / remove / notes). */
api.put("/playlists/:id/entries", async (c) => {
  const id = Number(c.req.param("id"));
  const { entries } = await c.req.json();
  db.transaction(() => {
    db.query("DELETE FROM playlist_entries WHERE playlist_id = ?").run(id);
    const ins = db.query("INSERT INTO playlist_entries (playlist_id, track_id, position, note) VALUES (?, ?, ?, ?)");
    entries.forEach((e: any, i: number) => ins.run(id, e.trackId, i + 1, e.note ?? ""));
  })();
  return c.json({ ok: true });
});

/** M3U8 export — import into Rekordbox via File › Import › Import Playlist. */
api.get("/playlists/:id/export.m3u8", (c) => {
  const id = Number(c.req.param("id"));
  const pl = db.query("SELECT name FROM playlists WHERE id = ?").get(id) as { name: string } | null;
  if (!pl) return c.body(null, 404);
  const rows = db.query(`SELECT t.path, t.title, t.artist, t.duration FROM playlist_entries e JOIN tracks t ON t.id = e.track_id
    WHERE e.playlist_id = ? ORDER BY e.position`).all(id) as any[];
  const lines = ["#EXTM3U", `#PLAYLIST:${pl.name}`];
  for (const r of rows) {
    lines.push(`#EXTINF:${Math.round(r.duration ?? -1)},${r.artist ?? ""} - ${r.title ?? ""}`);
    lines.push(r.path);
  }
  const safe = pl.name.replace(/[^\w\- ]+/g, "").trim() || "playlist";
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.m3u8"` },
  });
});

// ---- Static: analysis worker + essentia vendor files ----
function serveFrom(dir: string, name: string) {
  const p = join(dir, name);
  if (!p.startsWith(dir) || !existsSync(p)) return new Response("Not found", { status: 404 });
  const type = name.endsWith(".js") ? "text/javascript" : name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".svg") ? "image/svg+xml" : undefined;
  return new Response(Bun.file(p), { headers: type ? { "Content-Type": type } : {} });
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,
  development: process.env.NODE_ENV !== "production" && process.argv.includes("--dev"),
  routes: {
    "/": index,
    "/vendor/:file": (req) => serveFrom(VENDOR_DIR, req.params.file),
    "/static/:file": (req) => serveFrom(PUBLIC_DIR, req.params.file),
    "/api/*": (req) => api.fetch(req),
  },
  fetch: () => new Response("Not found", { status: 404 }),
});

const url = `http://localhost:${server.port}`;
console.log(`\n  🎧 Cratekeeper running → ${url}\n     Library data: ${DATA_DIR}\n     Press Ctrl+C to stop.\n`);
if (process.platform === "darwin" && !process.env.NO_OPEN && !process.argv.includes("--dev")) Bun.spawn(["open", url]);
