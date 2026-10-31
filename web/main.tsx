import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useStore, setState, getState, loadLibrary, scan, toast, setDeck } from "./store";
import { buildFilter } from "./search";
import { Sidebar } from "./components/Sidebar";
import { TrackTable } from "./components/TrackTable";
import { TrackPanel } from "./components/TrackPanel";
import { Player, togglePlay, previewMiddle, playNext, playPrev } from "./components/Player";
import { PlaylistView } from "./components/PlaylistView";
import { CheatSheet } from "./components/CheatSheet";
import { WheelView } from "./components/WheelView";
import { SettingsView, FolderSetup } from "./components/SettingsView";
import { analyzeUnanalyzed, stopAnalysis } from "./analysis";
import { queueTracks } from "./playback";
import { KeyBadge, fmtBpm } from "./components/common";
import { Icon, BrandMark } from "./components/Icon";
import { keyColor, parseCamelot } from "./keys";

const SEARCH_HELP: [string, string][] = [
  ["kairo", "free text — title, artist, genre, notes, tags…"],
  ["bpm:120-126", "tempo range (also bpm:>125)"],
  ["key:8A", "exact key — also key:Am"],
  ["key:8A+", "8A and every compatible key"],
  ["tag:peak-time", "has tag  ·  -tag:vocal excludes"],
  ["energy:>=7", "energy (also rating:>=4)"],
  ["genre:techno", "field search (artist:, label:, year:)"],
  ["is:unanalyzed", "also is:untagged, has:notes"],
];

function TopBar() {
  const query = useStore((s) => s.query);
  const analysis = useStore((s) => s.analysis);
  const deck = useStore((s) => s.tracks.find((t) => t.id === s.deckId));
  const notation = useStore((s) => s.settings.keyNotation);
  const [focus, setFocus] = useState(false);
  const [scanning, setScanning] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select");
      if ((e.key === "/" && !typing) || (e.key === "f" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="topbar">
      <div className="search">
        <span className="search-icon"><Icon name="search" /></span>
        <input
          ref={input}
          value={query}
          placeholder="Search…  try  key:8A+ bpm:122-126 tag:peak-time"
          onChange={(e) => setState({ query: e.target.value })}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => { if (e.key === "Escape") { setState({ query: "" }); input.current?.blur(); } }}
        />
        {query && <button className="icon-btn clear" onClick={() => setState({ query: "" })} aria-label="Clear search"><Icon name="close" size={14} /></button>}
        {focus && !query && (
          <div className="search-help">
            {SEARCH_HELP.map(([ex, d]) => (
              <div key={ex} onMouseDown={(e) => { e.preventDefault(); setState({ query: ex + " " }); }}>
                <code>{ex}</code><span className="muted">{d}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {deck && (
        <button className="chip-btn" title="Show tracks that mix well out of the live track" onClick={() => setState({ query: `key:${deck.musical_key}+ bpm:${Math.round((deck.bpm ?? 120) * 0.95)}-${Math.round((deck.bpm ?? 120) * 1.05)}`, view: { type: "library" }, sort: { col: "match", dir: 1 } })}>
          <Icon name="bolt" size={14} /> Compatible with <KeyBadge code={deck.musical_key} notation={notation} size="sm" /> {fmtBpm(deck.bpm)}
        </button>
      )}
      <div className="topbar-right">
        {analysis.running ? (
          <div className="analysis-pill" title={analysis.current ?? ""}>
            <span className="spinner" />
            Analyzing {analysis.done}/{analysis.total}
            <i style={{ width: `${(analysis.done / Math.max(1, analysis.total)) * 100}%` }} />
            <button className="link small" onClick={stopAnalysis}>Stop</button>
          </div>
        ) : (
          <button className="btn" onClick={analyzeUnanalyzed} title="Detect key & BPM for tracks that don't have it yet"><Icon name="analyze" size={15} />Analyze</button>
        )}
        <button
          className="btn"
          disabled={scanning}
          onClick={async () => {
            setScanning(true);
            try {
              const r = await scan();
              toast(`Rescanned: ${r.added} new, ${r.updated} changed, ${r.missing} missing`);
              if (r.added) analyzeUnanalyzed();
            } catch (e: any) { toast(e.message); }
            setScanning(false);
          }}
        ><Icon name="refresh" size={15} className={scanning ? "spin" : ""} />{scanning ? "Scanning…" : "Rescan"}</button>
      </div>
    </div>
  );
}

function LibraryView() {
  const view = useStore((s) => s.view);
  const tracks = useStore((s) => s.tracks);
  const tags = useStore((s) => s.tags);
  const trackTags = useStore((s) => s.trackTags);
  const query = useStore((s) => s.query);
  const deck = useStore((s) => s.tracks.find((t) => t.id === s.deckId));
  const filter = useMemo(() => buildFilter(query, tags, trackTags), [query, tags, trackTags]);
  const list = useMemo(() => {
    let base = tracks;
    if (view.type === "unanalyzed") base = base.filter((t) => !t.analyzed_at && !t.missing);
    if (view.type === "tag") base = base.filter((t) => trackTags.get(t.id)?.has(view.tagId));
    return base.filter(filter);
  }, [tracks, view, filter, trackTags]);
  const tag = view.type === "tag" ? tags.find((t) => t.id === view.tagId) : null;
  const title = view.type === "unanalyzed" ? "Needs analysis" : tag ? `#${tag.name}` : "All tracks";
  return (
    <>
      <div className="view-head">
        <h2>{title}</h2>
        <span className="view-count"><b className="mono">{list.length}</b>{list.length !== tracks.length ? ` of ${tracks.length}` : ""} tracks</span>
        {deck && <span className="muted small">· ranked by match with the live track</span>}
      </div>
      <TrackTable tracks={list} reference={deck} emptyHint={query ? "Nothing matches that search." : "No tracks here yet."} />
    </>
  );
}

function Welcome() {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <BrandMark size={72} />
        <h1>Welcome to Cratekeeper</h1>
        <p className="muted">Point it at the folder with your MP3s and WAVs. It reads your tags, then detects the key and BPM of every track right here on your Mac.</p>
        <FolderSetup />
      </div>
    </div>
  );
}

/** The room light: a soft glow in the color of the focused track's key, blended toward its +1 neighbor. */
function Ambient() {
  const code = useStore((s) => {
    const id = s.playingId ?? s.selectedId ?? s.deckId;
    return id != null ? s.tracks.find((t) => t.id === id)?.musical_key ?? null : null;
  });
  const c = parseCamelot(code);
  const style = c
    ? { ["--glow-a" as any]: keyColor(code), ["--glow-b" as any]: keyColor(`${(c.n % 12) + 1}${c.l}`) }
    : undefined;
  return <div className={`ambient ${c ? "keyed" : ""}`} style={style} aria-hidden><i /><i /></div>;
}

function App() {
  const loaded = useStore((s) => s.loaded);
  const view = useStore((s) => s.view);
  const musicDir = useStore((s) => s.settings.musicDir);
  const trackCount = useStore((s) => s.tracks.length);
  const playlist = useStore((s) => (s.view.type === "playlist" ? s.playlists.find((p) => p.id === (s.view as any).id) : undefined));
  const toastMsg = useStore((s) => s.toast);

  useEffect(() => {
    loadLibrary().catch((e) => toast(e.message));
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      const s = getState();
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.shiftKey && e.key === "ArrowRight") { e.preventDefault(); playNext(); }
      else if (e.shiftKey && e.key === "ArrowLeft") { e.preventDefault(); playPrev(); }
      else if (e.key === "p" && s.selectedId != null) previewMiddle(s.selectedId);
      else if (e.key.toLowerCase() === "q" && !e.metaKey && !e.ctrlKey && s.selection.size) queueTracks([...s.selection], e.shiftKey ? "next" : "end");
      else if (e.key === "l" && s.selectedId != null) setDeck(s.deckId === s.selectedId ? null : s.selectedId);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!loaded) return <div className="loading">Loading library…</div>;
  const needsSetup = !musicDir && trackCount === 0;

  let main: React.ReactNode;
  if (needsSetup && view.type !== "cheatsheet") main = <Welcome />;
  else if (view.type === "playlist" && playlist) main = <PlaylistView playlist={playlist} />;
  else if (view.type === "cheatsheet") main = <CheatSheet />;
  else if (view.type === "wheel") main = <WheelView />;
  else if (view.type === "settings") main = <SettingsView />;
  else main = <LibraryView />;

  const showPanel = !needsSetup && view.type !== "cheatsheet" && view.type !== "settings";
  return (
    <div className={`app ${showPanel ? "" : "no-panel"}`}>
      <Ambient />
      <Sidebar />
      <main className="main">
        {!needsSetup && view.type !== "cheatsheet" && view.type !== "settings" && <TopBar />}
        <div className="main-body">{main}</div>
      </main>
      {showPanel && <TrackPanel />}
      <Player />
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
