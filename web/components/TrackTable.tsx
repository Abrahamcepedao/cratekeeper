import React, { useEffect, useMemo, useRef, useState } from "react";
import { setState, useStore, getState, setDeck, setTagOnTracks, addToPlaylist, revealInFinder, confirmTrash, viewLabel, type Track } from "../store";
import { transitionScore, scoreTone, type Transition } from "../keys";
import { KeyBadge, Stars, EnergyBar, TagChip, fmtBpm, fmtDuration, Artwork, ContextMenu, type MenuItem } from "./common";
import { playTrack, previewMiddle, setVisibleList } from "./Player";
import { queueTracks } from "../playback";
import { Icon } from "./Icon";
import { analyzeTracks } from "../analysis";

const ROW_H = 46;

export type Column = { id: string; label: string; width: string; sort?: (a: Track, b: Track) => number };

const str = (v: string | null) => (v ?? "").toLowerCase();
export const COLUMNS: Column[] = [
  { id: "title", label: "Title", width: "minmax(190px, 2.6fr)", sort: (a, b) => str(a.title).localeCompare(str(b.title)) },
  { id: "artist", label: "Artist", width: "0", sort: (a, b) => str(a.artist).localeCompare(str(b.artist)) || str(a.title).localeCompare(str(b.title)) },
  { id: "key", label: "Key", width: "50px", sort: (a, b) => keyOrder(a.musical_key) - keyOrder(b.musical_key) },
  { id: "bpm", label: "BPM", width: "46px", sort: (a, b) => (a.bpm ?? 999) - (b.bpm ?? 999) },
  { id: "energy", label: "Energy", width: "84px", sort: (a, b) => (b.energy ?? -1) - (a.energy ?? -1) },
  { id: "rating", label: "Rating", width: "76px", sort: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) },
  { id: "genre", label: "Genre", width: "minmax(70px, 0.9fr)", sort: (a, b) => str(a.genre).localeCompare(str(b.genre)) },
  { id: "tags", label: "Tags", width: "minmax(80px, 1.1fr)" },
  { id: "time", label: "Time", width: "40px", sort: (a, b) => (a.duration ?? 0) - (b.duration ?? 0) },
];

function keyOrder(k: string | null) {
  if (!k) return 999;
  const m = k.match(/^(\d+)([AB])$/);
  return m ? Number(m[1]) * 2 + (m[2] === "B" ? 1 : 0) : 999;
}

type Props = {
  tracks: Track[];
  reference?: Track | null; // when set, show match column and allow sort by match
  playlistId?: number | null;
  emptyHint?: React.ReactNode;
};

export function TrackTable({ tracks, reference, playlistId, emptyHint }: Props) {
  const sort = useStore((s) => s.sort);
  const selectedId = useStore((s) => s.selectedId);
  const selection = useStore((s) => s.selection);
  const playingId = useStore((s) => s.playingId);
  const deckId = useStore((s) => s.deckId);
  const played = useStore((s) => s.played);
  const notation = useStore((s) => s.settings.keyNotation);
  const tags = useStore((s) => s.tags);
  const trackTags = useStore((s) => s.trackTags);
  const playlists = useStore((s) => s.playlists);
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [menu, setMenu] = useState<{ x: number; y: number; ids: number[] } | null>(null);
  const anchor = useRef<number | null>(null);

  const matches = useMemo(() => {
    if (!reference) return null;
    const m = new Map<number, Transition>();
    for (const t of tracks) if (t.id !== reference.id) m.set(t.id, transitionScore(reference, t));
    return m;
  }, [reference, tracks]);

  const sorted = useMemo(() => {
    if (sort.col === "match" && matches) {
      return [...tracks].sort((a, b) => (matches.get(b.id)?.score ?? -1) - (matches.get(a.id)?.score ?? -1));
    }
    if (sort.col === "order") return tracks;
    const col = COLUMNS.find((c) => c.id === sort.col);
    if (!col?.sort) return tracks;
    return [...tracks].sort((a, b) => col.sort!(a, b) * sort.dir);
  }, [tracks, sort, matches]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // What "next track" means: this list, in the order shown.
  const label = useStore(viewLabel);
  useEffect(() => setVisibleList(sorted.map((t) => t.id), label), [sorted, label]);

  // When the selection jumps (e.g. "Back to now playing"), bring that row into view if it's off screen.
  useEffect(() => {
    const el = scroller.current;
    const i = sorted.findIndex((t) => t.id === selectedId);
    if (!el || i < 0) return;
    const top = i * ROW_H;
    const visibleBottom = el.scrollTop + el.clientHeight - 92; // the floating dock covers the last ~92px
    if (top < el.scrollTop || top + ROW_H > visibleBottom) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3), behavior: smooth ? "smooth" : "auto" });
    }
  }, [selectedId]);

  // Keyboard navigation
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const s = getState();
      const idx = sorted.findIndex((t) => t.id === s.selectedId);
      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return; // track skipping, handled globally
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const ni = Math.max(0, Math.min(sorted.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
        const t = sorted[ni];
        if (t) {
          setState({ selectedId: t.id, selection: new Set([t.id]) });
          const el = scroller.current!;
          const top = ni * ROW_H;
          if (top < el.scrollTop) el.scrollTop = top;
          else if (top + ROW_H > el.scrollTop + el.clientHeight - ROW_H) el.scrollTop = top - el.clientHeight + ROW_H * 2;
        }
      } else if (e.key === "Backspace" && e.metaKey && s.selection.size) {
        e.preventDefault();
        confirmTrash([...s.selection]);
      } else if (e.key === "Enter" && s.selectedId != null) {
        playTrack(s.selectedId, 0);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [sorted]);

  const visible = COLUMNS.filter((c) => c.id !== "artist");
  const cols = matches ? [{ id: "match", label: "Match", width: "70px" } as Column, ...visible] : visible;
  const grid = `22px 36px ${cols.map((c) => c.width).join(" ")}`;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 8);
  const end = Math.min(sorted.length, Math.ceil((scrollTop + height) / ROW_H) + 8);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const onRowClick = (e: React.MouseEvent, t: Track, i: number) => {
    const s = getState();
    if (e.metaKey || e.ctrlKey) {
      const sel = new Set(s.selection);
      sel.has(t.id) ? sel.delete(t.id) : sel.add(t.id);
      setState({ selection: sel, selectedId: t.id });
      anchor.current = i;
    } else if (e.shiftKey && anchor.current != null) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      setState({ selection: new Set(sorted.slice(a, b + 1).map((x) => x.id)), selectedId: t.id });
    } else {
      setState({ selection: new Set([t.id]), selectedId: t.id });
      anchor.current = i;
    }
  };

  const openMenu = (e: React.MouseEvent, t: Track) => {
    e.preventDefault();
    const s = getState();
    const ids = s.selection.has(t.id) ? [...s.selection] : [t.id];
    if (!s.selection.has(t.id)) setState({ selection: new Set([t.id]), selectedId: t.id });
    setMenu({ x: e.clientX, y: e.clientY, ids });
  };

  const menuItems = (ids: number[]): MenuItem[] => {
    const one = ids.length === 1 ? ids[0] : null;
    const allTagged = (tagId: number) => ids.every((id) => trackTags.get(id)?.has(tagId));
    const pls = playlists.filter((p) => p.kind !== "folder");
    const items: MenuItem[] = [];
    if (one != null) {
      items.push({ label: "Play from start", hint: "↵", onClick: () => playTrack(one, 0) });
      items.push({ label: "Preview the groove", hint: "P", onClick: () => previewMiddle(one) });
      items.push({ label: deckId === one ? "✓ Now playing on deck" : "Set as now playing (live)", hint: "L", onClick: () => setDeck(one) });
      items.push({ divider: true, label: "" });
    }
    items.push({ label: ids.length > 1 ? `Play ${ids.length} tracks next` : "Play next", hint: "⇧Q", onClick: () => queueTracks(ids, "next") });
    items.push({ label: ids.length > 1 ? `Add ${ids.length} tracks to queue` : "Add to queue", hint: "Q", onClick: () => queueTracks(ids, "end") });
    items.push({ divider: true, label: "" });
    items.push({ label: `Add ${ids.length > 1 ? ids.length + " tracks " : ""}to playlist`, sub: pls.map((p) => ({ label: `${p.kind === "set" ? "◆" : "▤"} ${p.name}`, onClick: () => addToPlaylist(p.id, ids) })) });
    items.push({ label: "Tag", sub: tags.map((tg) => ({ label: `${allTagged(tg.id) ? "✓ " : "  "}${tg.name}`, onClick: () => setTagOnTracks(tg.id, ids, allTagged(tg.id) ? "remove" : "add") })) });
    items.push({ label: ids.length > 1 ? `Re-analyze ${ids.length} tracks` : "Re-analyze key & BPM", onClick: () => analyzeTracks(ids, true) });
    if (one != null) items.push({ label: "Reveal in Finder", onClick: () => revealInFinder(one) });
    items.push({ divider: true, label: "" });
    items.push({ label: ids.length > 1 ? `Move ${ids.length} tracks to Trash…` : "Move to Trash…", hint: "⌘⌫", danger: true, onClick: () => confirmTrash(ids) });
    return items;
  };

  const header = (
    <div className="tt-row tt-head" style={{ gridTemplateColumns: grid }}>
      <span /><span />
      {cols.map((c) => c.id === "title" ? (
        <span key="title" className="tt-h">
          {(["title", "artist"] as const).map((id, i) => (
            <React.Fragment key={id}>
              {i ? <span className="tt-h-sep"> · </span> : null}
              <span className={`sortable ${sort.col === id ? "sorted" : ""}`} onClick={() => setState({ sort: { col: id, dir: sort.col === id ? (-sort.dir as 1 | -1) : 1 } })}>
                {id === "title" ? "Title" : "Artist"}{sort.col === id ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
              </span>
            </React.Fragment>
          ))}
        </span>
      ) : (
        <span
          key={c.id}
          className={`tt-h ${c.sort || c.id === "match" ? "sortable" : ""} ${sort.col === c.id ? "sorted" : ""}`}
          onClick={() => (c.sort || c.id === "match") && setState({ sort: { col: c.id, dir: sort.col === c.id ? (-sort.dir as 1 | -1) : 1 } })}
        >
          {c.label}{sort.col === c.id && c.id !== "match" ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
        </span>
      ))}
    </div>
  );

  return (
    <div className="track-table">
      {header}
      <div className="tt-body" ref={scroller} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
        {sorted.length === 0 && <div className="empty-state">{emptyHint ?? "No tracks match."}</div>}
        <div style={{ height: sorted.length * ROW_H, position: "relative" }}>
          {sorted.slice(start, end).map((t, k) => {
            const i = start + k;
            const m = matches?.get(t.id);
            const tIds = [...(trackTags.get(t.id) ?? [])];
            const isPlayed = played.includes(t.id);
            return (
              <div
                key={t.id}
                className={`tt-row ${selection.has(t.id) ? "selected" : ""} ${selectedId === t.id ? "focused" : ""} ${playingId === t.id ? "playing" : ""} ${t.missing ? "missing" : ""} ${isPlayed ? "played" : ""} ${deckId === t.id ? "on-deck" : ""}`}
                style={{ gridTemplateColumns: grid, top: i * ROW_H, height: ROW_H }}
                onClick={(e) => onRowClick(e, t, i)}
                onDoubleClick={() => playTrack(t.id, 0)}
                onContextMenu={(e) => openMenu(e, t)}
                draggable
                onDragStart={(e) => {
                  const s = getState();
                  const ids = s.selection.has(t.id) ? [...s.selection] : [t.id];
                  e.dataTransfer.setData("application/x-ck-tracks", JSON.stringify(ids));
                  e.dataTransfer.effectAllowed = "copy";
                  const ghost = document.createElement("div");
                  ghost.className = "drag-ghost";
                  ghost.textContent = ids.length > 1 ? `${ids.length} tracks` : (t.title ?? t.filename);
                  document.body.appendChild(ghost);
                  e.dataTransfer.setDragImage(ghost, 10, 10);
                  setTimeout(() => ghost.remove(), 0);
                }}
              >
                <span className="tt-play" onClick={(e) => { e.stopPropagation(); playTrack(t.id); }}>
                  {playingId === t.id ? <span className="eq" aria-label="Playing"><i /><i /><i /></span> : <Icon name={deckId === t.id ? "live" : "play"} size={13} />}
                </span>
                <Artwork trackId={t.id} hasArt={!!t.has_artwork} size={34} keyCode={t.musical_key} />
                {matches && m === undefined && <span className="match-self">{deckId === t.id ? "LIVE" : "—"}</span>}
                {m !== undefined && (
                  <span className={`match match-${scoreTone(m.score)}`} title={`${m.key?.label ?? "No key"} · ${m.bpm?.label ?? "No BPM"}`}>
                    <i style={{ width: `${Math.round(m.score * 100)}%` }} />
                    <b>{Math.round(m.score * 100)}</b>
                  </span>
                )}
                {cols.filter((c) => c.id !== "match").map((c) => {
                  switch (c.id) {
                    case "title": return (
                      <span key="title" className="tt-titlecell">
                        <span className="ellipsis tt-title">{t.title ?? t.filename}{t.notes?.trim() ? <em className="note-dot" title={t.notes}><Icon name="note" size={12} /></em> : null}</span>
                        <span className="ellipsis muted tt-artist">{t.artist ?? "Unknown artist"}</span>
                      </span>
                    );
                    case "key": return <span key="key">{t.analysis_error && !t.musical_key ? <span className="err" title={t.analysis_error}>!</span> : <KeyBadge code={t.musical_key} notation={notation} size="sm" />}</span>;
                    case "bpm": return <span key="bpm" className="mono">{fmtBpm(t.bpm)}</span>;
                    case "energy": return <span key="energy"><EnergyBar value={t.energy} /></span>;
                    case "rating": return <span key="rating"><Stars value={t.rating} /></span>;
                    case "genre": return <span key="genre" className="ellipsis muted">{t.genre ?? ""}</span>;
                    case "tags": return <span key="tags" className="tt-tags">{tIds.map((id) => tagById.get(id)).filter(Boolean).map((tg) => <TagChip key={tg!.id} tag={tg!} />)}</span>;
                    case "time": return <span key="time" className="mono muted">{fmtDuration(t.duration)}</span>;
                  }
                })}
              </div>
            );
          })}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.ids)} onClose={() => setMenu(null)} />}
    </div>
  );
}
