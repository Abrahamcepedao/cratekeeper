import React, { useMemo, useState } from "react";
import { useStore, setState, createPlaylist, addToPlaylist, updatePlaylist, deletePlaylist, setDeck, clearSession, type Playlist, type View } from "../store";
import { ContextMenu, KeyBadge, fmtBpm, type MenuItem } from "./common";

function same(a: View, b: View) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function Sidebar() {
  const view = useStore((s) => s.view);
  const tracks = useStore((s) => s.tracks);
  const tags = useStore((s) => s.tags);
  const trackTags = useStore((s) => s.trackTags);
  const playlists = useStore((s) => s.playlists);
  const deck = useStore((s) => s.tracks.find((t) => t.id === s.deckId));
  const played = useStore((s) => s.played);
  const notation = useStore((s) => s.settings.keyNotation);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const unanalyzed = tracks.filter((t) => !t.analyzed_at && !t.missing).length;
  const tagCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const set of trackTags.values()) for (const id of set) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [trackTags]);

  const go = (v: View) => setState({ view: v });
  const Item = ({ v, icon, label, count, extra }: { v: View; icon: string; label: string; count?: number; extra?: React.ReactNode }) => (
    <div className={`nav-item ${same(view, v) ? "active" : ""}`} onClick={() => go(v)}>
      <span className="nav-icon">{icon}</span>
      <span className="ellipsis">{label}</span>
      {extra}
      {count != null && <span className="nav-count">{count}</span>}
    </div>
  );

  const newList = async (kind: Playlist["kind"], parentId: number | null = null) => {
    const name = prompt(kind === "folder" ? "Folder name" : kind === "set" ? "Set name (e.g. ‘Friday warm-up’)" : "Crate name (e.g. ‘Afro grooves’)");
    if (name?.trim()) await createPlaylist(name.trim(), kind, parentId);
  };

  const plMenu = (p: Playlist): MenuItem[] => [
    ...(p.kind === "folder" ? [
      { label: "New crate inside", onClick: () => newList("crate", p.id) },
      { label: "New set inside", onClick: () => newList("set", p.id) },
      { label: "New sub-folder", onClick: () => newList("folder", p.id) },
      { divider: true, label: "" },
    ] : []),
    { label: "Rename", onClick: () => { const n = prompt("Rename", p.name); if (n?.trim()) updatePlaylist(p.id, { name: n.trim() }); } },
    { label: "Move to folder", sub: [
      ...(p.parent_id != null ? [{ label: "↖ Top level", onClick: () => updatePlaylist(p.id, { parentId: null }) }] : []),
      ...playlists.filter((f) => f.kind === "folder" && f.id !== p.id && f.id !== p.parent_id).map((f) => ({ label: `▸ ${f.name}`, onClick: () => updatePlaylist(p.id, { parentId: f.id }) })),
    ] },
    ...(p.kind !== "folder" ? [{ label: "Export for Rekordbox (.m3u8)", onClick: () => { window.location.href = `/api/playlists/${p.id}/export.m3u8`; } }] : []),
    { divider: true, label: "" },
    { label: p.kind === "folder" ? "Delete folder & contents" : "Delete", danger: true, onClick: () => confirm(`Delete “${p.name}”?`) && deletePlaylist(p.id) },
  ];

  const renderTree = (parentId: number | null, depth: number): React.ReactNode =>
    playlists
      .filter((p) => p.parent_id === parentId)
      .map((p) => (
        <React.Fragment key={p.id}>
          <div
            className={`nav-item pl-item ${view.type === "playlist" && view.id === p.id ? "active" : ""}`}
            style={{ paddingLeft: 12 + depth * 14 }}
            onClick={() => (p.kind === "folder" ? setCollapsed((c) => { const n = new Set(c); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; }) : go({ type: "playlist", id: p.id }))}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: plMenu(p) }); }}
            onDragOver={(e) => { if (p.kind !== "folder") { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("drop-target"); } }}
            onDragLeave={(e) => (e.currentTarget as HTMLElement).classList.remove("drop-target")}
            onDrop={(e) => {
              (e.currentTarget as HTMLElement).classList.remove("drop-target");
              const raw = e.dataTransfer.getData("application/x-ck-tracks");
              if (raw && p.kind !== "folder") { e.preventDefault(); addToPlaylist(p.id, JSON.parse(raw)); }
            }}
          >
            <span className="nav-icon">{p.kind === "folder" ? (collapsed.has(p.id) ? "▸" : "▾") : p.kind === "set" ? "◆" : "▤"}</span>
            <span className="ellipsis">{p.name}</span>
            {p.kind !== "folder" && <span className="nav-count">{p.entries.length}</span>}
          </div>
          {p.kind === "folder" && !collapsed.has(p.id) && renderTree(p.id, depth + 1)}
        </React.Fragment>
      ));

  return (
    <nav className="sidebar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="26" height="26"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#f472b6" /></linearGradient></defs><circle cx="16" cy="16" r="14" fill="none" stroke="url(#g)" strokeWidth="3" /><circle cx="16" cy="16" r="5" fill="url(#g)" /><path d="M16 2 A14 14 0 0 1 30 16" stroke="#fff" strokeWidth="3" fill="none" opacity="0.5" /></svg>
        <span>Cratekeeper</span>
      </div>

      {deck && (
        <div className="live-card" onClick={() => setState({ selectedId: deck.id, selection: new Set([deck.id]) })}>
          <div className="live-label"><span className="live-dot" /> LIVE · now playing</div>
          <div className="ellipsis live-title">{deck.title}</div>
          <div className="row live-meta">
            <KeyBadge code={deck.musical_key} notation={notation} size="sm" />
            <span className="mono small">{fmtBpm(deck.bpm)} BPM</span>
            <span className="muted small">{played.length} played</span>
          </div>
          <div className="row">
            <button className="link small" onClick={(e) => { e.stopPropagation(); setDeck(null); }}>Stop live</button>
            <button className="link small" onClick={(e) => { e.stopPropagation(); confirm("Reset tonight's played history?") && clearSession(); }}>Reset session</button>
          </div>
        </div>
      )}

      <div className="nav-section">
        <Item v={{ type: "library" }} icon="♫" label="All tracks" count={tracks.length} />
        {unanalyzed > 0 && <Item v={{ type: "unanalyzed" }} icon="◌" label="Needs analysis" count={unanalyzed} />}
        <Item v={{ type: "wheel" }} icon="◐" label="Key wheel" />
        <Item v={{ type: "cheatsheet" }} icon="✦" label="Cheat sheet" />
      </div>

      <div className="nav-section">
        <div className="nav-head">
          <span>Crates & sets</span>
          <span className="nav-add">
            <button title="New crate — a bucket of tracks" onClick={() => newList("crate")}>+▤</button>
            <button title="New DJ set — an ordered tracklist" onClick={() => newList("set")}>+◆</button>
            <button title="New folder" onClick={() => newList("folder")}>+▸</button>
          </span>
        </div>
        {playlists.length === 0 && <p className="nav-hint">Crates hold tracks by vibe. Sets are ordered tracklists with transition checks.</p>}
        {renderTree(null, 0)}
      </div>

      <div className="nav-section">
        <div className="nav-head"><span>Tags</span></div>
        {tags.map((t) => (
          <div key={t.id} className={`nav-item ${view.type === "tag" && view.tagId === t.id ? "active" : ""}`} onClick={() => go({ type: "tag", tagId: t.id })}>
            <span className="tag-dot" style={{ background: t.color }} />
            <span className="ellipsis">{t.name}</span>
            <span className="nav-count">{tagCounts.get(t.id) ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="nav-section nav-bottom">
        <Item v={{ type: "settings" }} icon="⚙" label="Settings" />
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </nav>
  );
}
