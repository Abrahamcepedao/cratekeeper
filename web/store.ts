import { useSyncExternalStore } from "react";
import type { Notation } from "./keys";

export type Track = {
  id: number;
  rel_path: string;
  filename: string;
  ext: string;
  size: number;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  year: number | null;
  label: string | null;
  duration: number | null;
  bitrate: number | null;
  has_artwork: number;
  bpm: number | null;
  bpm_raw: number | null;
  musical_key: string | null;
  key_strength: number | null;
  analyzed_at: string | null;
  analysis_error: string | null;
  energy: number | null;
  rating: number | null;
  notes: string;
  color: string | null;
  locked: string;
  missing: number;
  added_at: string;
};
export type Tag = { id: number; name: string; color: string };
export type Entry = { id?: number; trackId: number; note: string };
export type Playlist = { id: number; name: string; parent_id: number | null; kind: "folder" | "crate" | "set"; position: number; notes: string; entries: Entry[] };
export type Settings = { musicDir: string; keyNotation: Notation; platform: string };

export type View =
  | { type: "library" }
  | { type: "unanalyzed" }
  | { type: "tag"; tagId: number }
  | { type: "playlist"; id: number }
  | { type: "wheel" }
  | { type: "cheatsheet" }
  | { type: "settings" };

export type State = {
  loaded: boolean;
  tracks: Track[];
  tags: Tag[];
  trackTags: Map<number, Set<number>>;
  playlists: Playlist[];
  settings: Settings;
  view: View;
  query: string;
  selectedId: number | null;
  selection: Set<number>;
  playingId: number | null;
  analysis: { running: boolean; done: number; total: number; current: string | null; errors: number };
  toast: string | null;
  /** "Live mode": the track currently playing in Rekordbox. Drives next-track matching. */
  deckId: number | null;
  /** Tracks already played this session (excluded from suggestions). */
  played: number[];
  sort: { col: string; dir: 1 | -1 };
};

let state: State = {
  loaded: false,
  tracks: [],
  tags: [],
  trackTags: new Map(),
  playlists: [],
  settings: { musicDir: "", keyNotation: "camelot", platform: "" },
  view: { type: "library" },
  query: "",
  selectedId: null,
  selection: new Set(),
  playingId: null,
  analysis: { running: false, done: 0, total: 0, current: null, errors: 0 },
  toast: null,
  deckId: null,
  played: [],
  sort: { col: "artist", dir: 1 },
};
try {
  const saved = JSON.parse(localStorage.getItem("ck-session") ?? "{}");
  if (saved.deckId !== undefined) state.deckId = saved.deckId;
  if (Array.isArray(saved.played)) state.played = saved.played;
} catch {}

const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  if ("deckId" in p || "played" in p) {
    try { localStorage.setItem("ck-session", JSON.stringify({ deckId: state.deckId, played: state.played })); } catch {}
  }
  listeners.forEach((l) => l());
}

/** Mark a track as now playing on the decks; the previous one moves to "played". */
export function setDeck(id: number | null) {
  setState((s) => {
    const played = s.deckId != null && s.deckId !== id && !s.played.includes(s.deckId) ? [...s.played, s.deckId] : s.played;
    return { deckId: id, played: id != null ? played.filter((x) => x !== id) : played };
  });
}
export function clearSession() {
  setState({ deckId: null, played: [] });
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => sel(state),
  );
}

let toastTimer: any;
export function toast(msg: string) {
  setState({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: null }), 2600);
}

// ---------- API ----------
async function req<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
  return data;
}

export async function loadLibrary() {
  const d = await req("GET", "/api/library");
  const tt = new Map<number, Set<number>>();
  for (const { track_id, tag_id } of d.trackTags) {
    if (!tt.has(track_id)) tt.set(track_id, new Set());
    tt.get(track_id)!.add(tag_id);
  }
  setState({ loaded: true, tracks: d.tracks, tags: d.tags, trackTags: tt, playlists: d.playlists, settings: d.settings });
}

export function trackById(id: number | null | undefined): Track | undefined {
  if (id == null) return undefined;
  return state.tracks.find((t) => t.id === id);
}

function replaceTrack(t: Track) {
  setState((s) => ({ tracks: s.tracks.map((x) => (x.id === t.id ? t : x)) }));
}

export async function updateTrack(id: number, patch: Partial<Track>) {
  // optimistic
  setState((s) => ({ tracks: s.tracks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  try {
    replaceTrack(await req("PATCH", `/api/tracks/${id}`, patch));
  } catch (e: any) {
    toast(e.message);
    loadLibrary();
  }
}

export async function saveAnalysis(id: number, payload: any) {
  replaceTrack(await req("POST", `/api/tracks/${id}/analysis`, payload));
}

export async function scan() {
  const r = await req("POST", "/api/scan");
  await loadLibrary();
  return r as { found: number; added: number; updated: number; missing: number; errors: number; ms: number };
}

export async function saveSettings(patch: Partial<Settings>) {
  await req("POST", "/api/settings", patch);
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
}

export async function pickFolder(): Promise<string | null> {
  const r = await req("POST", "/api/pick-folder");
  return r.path ?? null;
}

// Tags
export async function createTag(name: string, color?: string): Promise<Tag> {
  const palette = ["#8b5cf6", "#22c55e", "#ef4444", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#a3e635", "#06b6d4"];
  const t: Tag = await req("POST", "/api/tags", { name, color: color ?? palette[state.tags.length % palette.length] });
  if (!state.tags.some((x) => x.id === t.id)) setState((s) => ({ tags: [...s.tags, t].sort((a, b) => a.name.localeCompare(b.name)) }));
  return t;
}
export async function updateTag(id: number, patch: Partial<Tag>) {
  const t: Tag = await req("PATCH", `/api/tags/${id}`, patch);
  setState((s) => ({ tags: s.tags.map((x) => (x.id === id ? t : x)) }));
}
export async function deleteTag(id: number) {
  await req("DELETE", `/api/tags/${id}`);
  setState((s) => {
    const tt = new Map(s.trackTags);
    for (const [k, v] of tt) if (v.has(id)) { const n = new Set(v); n.delete(id); tt.set(k, n); }
    return { tags: s.tags.filter((t) => t.id !== id), trackTags: tt, view: s.view.type === "tag" && s.view.tagId === id ? { type: "library" } : s.view };
  });
}
export async function setTagOnTracks(tagId: number, trackIds: number[], action: "add" | "remove") {
  setState((s) => {
    const tt = new Map(s.trackTags);
    for (const id of trackIds) {
      const n = new Set(tt.get(id) ?? []);
      action === "add" ? n.add(tagId) : n.delete(tagId);
      tt.set(id, n);
    }
    return { trackTags: tt };
  });
  await req("POST", `/api/tags/${tagId}/tracks`, { trackIds, action });
}

// Playlists
export async function createPlaylist(name: string, kind: Playlist["kind"], parentId: number | null) {
  const p: Playlist = await req("POST", "/api/playlists", { name, kind, parentId });
  setState((s) => ({ playlists: [...s.playlists, p], view: kind === "folder" ? s.view : { type: "playlist", id: p.id } }));
  return p;
}
export async function updatePlaylist(id: number, patch: { name?: string; notes?: string; parentId?: number | null }) {
  setState((s) => ({
    playlists: s.playlists.map((p) => (p.id === id ? { ...p, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}), ...(patch.parentId !== undefined ? { parent_id: patch.parentId } : {}) } : p)),
  }));
  await req("PATCH", `/api/playlists/${id}`, patch);
}
export async function deletePlaylist(id: number) {
  await req("DELETE", `/api/playlists/${id}`);
  await loadLibrary();
  setState((s) => ({ view: s.view.type === "playlist" && !s.playlists.some((p) => p.id === (s.view as any).id) ? { type: "library" } : s.view }));
}
export async function addToPlaylist(id: number, trackIds: number[]) {
  const r = await req("POST", `/api/playlists/${id}/tracks`, { trackIds });
  await loadLibrary();
  const p = state.playlists.find((x) => x.id === id);
  toast(r.added ? `Added ${r.added} track${r.added > 1 ? "s" : ""} to ${p?.name}` : `Already in ${p?.name}`);
}
export async function setEntries(id: number, entries: Entry[]) {
  setState((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, entries } : p)) }));
  await req("PUT", `/api/playlists/${id}/entries`, { entries });
}

export function revealInFinder(id: number) {
  req("POST", `/api/tracks/${id}/reveal`).catch((e) => toast(e.message));
}
