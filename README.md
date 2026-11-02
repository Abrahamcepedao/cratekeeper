# Cratekeeper 🎧

A local app for curating your DJ library: browse and search your MP3/WAV folder, detect **key & BPM**, add tags, notes, energy and ratings, organize **crates** and ordered **DJ sets**, and get **next-track suggestions** based on harmonic mixing (Camelot wheel) and tempo. It runs next to Rekordbox: Rekordbox does the mixing, Cratekeeper helps you pick the next track.

Everything stays on your Mac. Your audio files are **never modified**. Tags, notes and playlists live in `data/cratekeeper.db`.

## Run it

**Easiest:** double-click `start.command` in Finder. The first time, it installs [Bun](https://bun.sh) and the dependencies, then opens the app at http://localhost:4747.

> If macOS blocks it ("unidentified developer"): right-click `start.command` → **Open** → **Open**.

**From Terminal:**

```bash
curl -fsSL https://bun.sh/install | bash   # once, if you don't have Bun
cd cratekeeper
bun install
bun start                                   # → http://localhost:4747
```

**Shortcut:** link `bin/crate` onto your PATH (`ln -s "$PWD/bin/crate" ~/.local/bin/crate`), then just type `crate`. It starts the server in the background if needed and opens the app. Also: `crate stop`, `crate restart` (after code changes), `crate status`.

On first launch, pick your music folder with **Browse…** or paste its path. Sub-folders are included. Analysis starts automatically and runs in the browser tab: roughly 1–3 seconds per track, two or three at a time. Keep the tab open until it's done. New files are picked up with **↻ Rescan**.

## What's inside

| Area | What it does |
|---|---|
| **Library** | Fast table (handles thousands of tracks), sortable columns, artwork, ⌘/⇧ multi-select, right-click menu, drag tracks onto crates/sets |
| **Search** | Free text plus filters: `bpm:120-126`, `key:8A`, `key:8A+` (compatible keys), `tag:peak-time -tag:vocal`, `energy:>=7`, `rating:>=4`, `genre:techno`, `is:unanalyzed`, `has:notes` |
| **Track panel** | Edit title/artist/genre/etc., fix key/BPM (with ÷2 / ×2 for half-time errors), energy 1–10, stars, tags, notes, waveform, a mini Camelot wheel and a "Mix next" list |
| **Live mode** | Press **◎ Go live** (or `L`) on the track playing in Rekordbox. Every list gets a **Match** score (key 55%, tempo 35%, energy 10%), and played tracks are dimmed and left out of suggestions |
| **Crates & sets** | Nested folders. Crates are buckets of tracks. Sets are ordered tracklists with a transition badge between every pair, notes on each transition, an energy/BPM flow chart, harmonic auto-order and "what could come next" |
| **Rekordbox export** | Export any crate or set as `.m3u8`, then in Rekordbox use *File › Import › Import Playlist* |
| **Key wheel** | Your library mapped on the Camelot wheel plus a tempo histogram. Click keys or BPM bars to filter |
| **Cheat sheet** | How the Camelot wheel works, the safe moves, tempo and pitch rules, energy flow, and all 24 keys in Camelot / musical / Open Key |

### Keyboard

`Space` play/pause · `↑↓` move · `Enter` play from start · `P` preview the groove (jumps to ⅓) · `L` go live · `/` search · `Esc` clear search

## How detection works

[Essentia](https://essentia.upf.edu/) (WebAssembly) runs in a web worker. The browser decodes each file, then:

- **Key**: `KeyExtractor` with the `edma` profile, which is tuned for electronic dance music, on up to 6 minutes from the middle of the track. *Key confidence* below about 0.6 means you should check it by ear.
- **BPM**: `PercivalBpmEstimator` on 90 seconds from the middle, folded into 85–175 BPM and snapped to whole numbers when close. Use ÷2 / ×2 for drum & bass, dubstep and other cases where the range is ambiguous.

Any key or BPM you edit by hand is locked, so automatic analysis won't overwrite it. A forced re-analyze from the right-click menu does replace it.

**AIFF:** Chrome can't decode AIFF, but Safari can. If AIFF files fail, open the app in Safari once and click *Settings › Retry failed*.

## Notes

- Data lives in `./data`. Back up `data/cratekeeper.db` to keep your tags, notes and sets.
- Use a different port with `PORT=5000 bun start`. Stop the browser from opening automatically with `NO_OPEN=1 bun start`.
- Run `bun run dev` for hot reload while you hack on it. The code is in `server/` (Bun + Hono + SQLite) and `web/` (React).
- Essentia.js is AGPL-3.0, which is fine for personal use. Check the license if you ever distribute the app.
