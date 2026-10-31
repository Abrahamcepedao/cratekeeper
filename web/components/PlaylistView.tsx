import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore, setState, updatePlaylist, deletePlaylist, setEntries, addToPlaylist, getState, type Playlist, type Track, type Entry } from "../store";
import { transitionScore, scoreTone, keyColor } from "../keys";
import { suggestNext } from "../suggest";
import { KeyBadge, Editable, EnergyBar, fmtBpm, fmtDuration, Artwork } from "./common";
import { TrackTable } from "./TrackTable";
import { playTrack, previewMiddle } from "./Player";
import { buildFilter } from "../search";

export function PlaylistView({ playlist }: { playlist: Playlist }) {
  const tracks = useStore((s) => s.tracks);
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const items = playlist.entries.map((e) => ({ entry: e, track: byId.get(e.trackId)! })).filter((x) => x.track);
  const total = items.reduce((a, x) => a + (x.track.duration ?? 0), 0);
  const bpms = items.map((x) => x.track.bpm).filter(Boolean) as number[];

  return (
    <div className="playlist-view">
      <div className="pl-header">
        <div>
          <div className="pl-kind">{playlist.kind === "set" ? "◆ DJ SET" : "▤ CRATE"}</div>
          <Editable className="pl-name" value={playlist.name} onSave={(v) => v.trim() && updatePlaylist(playlist.id, { name: v.trim() })} />
          <div className="muted small">
            {items.length} tracks · {fmtDuration(total)}{bpms.length ? ` · ${Math.min(...bpms)}–${Math.max(...bpms)} BPM` : ""}
          </div>
        </div>
        <div className="pl-header-actions">
          {playlist.kind === "set" && items.length > 2 && (
            <button className="btn" title="Keep the first track, then greedily chain each next track by harmonic + tempo match" onClick={() => setEntries(playlist.id, harmonicOrder(items))}>
              ✦ Harmonic auto-order
            </button>
          )}
          <a className="btn" href={`/api/playlists/${playlist.id}/export.m3u8`} download title="Import in Rekordbox: File › Import › Import Playlist">⇩ Export for Rekordbox</a>
          <button className="btn btn-danger-ghost" onClick={() => confirm(`Delete “${playlist.name}”? Tracks stay in your library.`) && deletePlaylist(playlist.id)}>Delete</button>
        </div>
      </div>
      {playlist.kind === "set" ? <SetBuilder playlist={playlist} items={items} /> : <CrateView playlist={playlist} items={items} />}
    </div>
  );
}

function harmonicOrder(items: { entry: Entry; track: Track }[]): Entry[] {
  const rest = items.slice(1);
  const out = [items[0]];
  while (rest.length) {
    const last = out[out.length - 1].track;
    let bi = 0, bs = -1;
    rest.forEach((x, i) => { const s = transitionScore(last, x.track).score; if (s > bs) { bs = s; bi = i; } });
    out.push(rest.splice(bi, 1)[0]);
  }
  return out.map((x) => x.entry);
}

function CrateView({ playlist, items }: { playlist: Playlist; items: { entry: Entry; track: Track }[] }) {
  const query = useStore((s) => s.query);
  const tags = useStore((s) => s.tags);
  const trackTags = useStore((s) => s.trackTags);
  const selection = useStore((s) => s.selection);
  const deckTrack = useStore((s) => s.tracks.find((t) => t.id === s.deckId));
  const filter = useMemo(() => buildFilter(query, tags, trackTags), [query, tags, trackTags]);
  const shown = items.map((x) => x.track).filter(filter);
  const selectedHere = [...selection].filter((id) => playlist.entries.some((e) => e.trackId === id));
  return (
    <>
      {selectedHere.length > 0 && (
        <div className="bulk-bar">
          <span>{selectedHere.length} selected</span>
          <button className="btn" onClick={() => { setEntries(playlist.id, playlist.entries.filter((e) => !selectedHere.includes(e.trackId))); setState({ selection: new Set() }); }}>Remove from crate</button>
        </div>
      )}
      <TrackTable tracks={shown} reference={deckTrack} playlistId={playlist.id} emptyHint={<>This crate is empty. Drag tracks from <b>All tracks</b> onto it in the sidebar, or right-click → Add to playlist.</>} />
    </>
  );
}

function SetBuilder({ playlist, items }: { playlist: Playlist; items: { entry: Entry; track: Track }[] }) {
  const notation = useStore((s) => s.settings.keyNotation);
  const selectedId = useStore((s) => s.selectedId);
  const playingId = useStore((s) => s.playingId);
  const tracks = useStore((s) => s.tracks);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    const list = items.map((x) => x.entry);
    const [m] = list.splice(from, 1);
    list.splice(to > from ? to - 1 : to, 0, m);
    setEntries(playlist.id, list);
  };
  const remove = (i: number) => setEntries(playlist.id, items.filter((_, j) => j !== i).map((x) => x.entry));
  const setNote = (i: number, note: string) => setEntries(playlist.id, items.map((x, j) => (j === i ? { ...x.entry, note } : x.entry)));

  const last = items[items.length - 1]?.track;
  const nextUp = useMemo(() => (last ? suggestNext(last, tracks, new Set(items.map((x) => x.track.id)), 8) : []), [last, tracks, items]);

  const onDropExternal = (e: React.DragEvent, at: number) => {
    const raw = e.dataTransfer.getData("application/x-ck-tracks");
    if (!raw) return false;
    const ids: number[] = JSON.parse(raw);
    const present = new Set(items.map((x) => x.track.id));
    const add = ids.filter((id) => !present.has(id)).map((id) => ({ trackId: id, note: "" }));
    const list = items.map((x) => x.entry);
    list.splice(at, 0, ...add);
    setEntries(playlist.id, list);
    return true;
  };

  return (
    <div className="set-builder" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { if (dragIdx == null) onDropExternal(e, items.length); }}>
      {items.length > 1 && <SetFlowChart items={items} />}
      <div className="set-list">
        {items.length === 0 && (
          <div className="empty-state">
            Your set is empty. Drag tracks here from the library (or onto “{playlist.name}” in the sidebar).<br />
            Then follow the transition badges — green means the keys and tempos blend smoothly.
          </div>
        )}
        {items.map(({ entry, track }, i) => {
          const prev = items[i - 1]?.track;
          const t = prev ? transitionScore(prev, track) : null;
          return (
            <React.Fragment key={`${entry.trackId}-${i}`}>
              {t && (
                <div className={`transition tone-${scoreTone(t.score)}`}>
                  <span className="tr-line" />
                  <span className="tr-score">{Math.round(t.score * 100)}</span>
                  <span className="tr-detail">
                    <b>{t.key?.label ?? "Key unknown"}</b>
                    <span className="mono">{t.bpm ? `${t.bpm.label} tempo` : "BPM unknown"}</span>
                    {t.energyDelta != null && <span>{t.energyDelta > 0 ? `energy +${t.energyDelta}` : t.energyDelta < 0 ? `energy ${t.energyDelta}` : "energy ="}</span>}
                  </span>
                  <Editable className="tr-note" value={entry.note ?? ""} placeholder="+ transition note (e.g. ‘loop outro, bass swap at drop’)" onSave={(v) => setNote(i, v)} />
                </div>
              )}
              <div
                className={`set-row ${selectedId === track.id ? "focused" : ""} ${playingId === track.id ? "playing" : ""} ${overIdx === i ? "drop-before" : ""} ${dragIdx === i ? "dragging" : ""}`}
                draggable
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setOverIdx(null);
                  if (dragIdx != null) { if (dragIdx !== i) move(dragIdx, i); setDragIdx(null); }
                  else onDropExternal(e, i);
                }}
                onClick={() => setState({ selectedId: track.id, selection: new Set([track.id]) })}
                onDoubleClick={() => playTrack(track.id, 0)}
              >
                <span className="set-num">{i + 1}</span>
                <span className="grip" title="Drag to reorder">⋮⋮</span>
                <Artwork trackId={track.id} hasArt={!!track.has_artwork} size={38} />
                <div className="set-main">
                  <div className="ellipsis">{track.title ?? track.filename}</div>
                  <div className="muted small ellipsis">{track.artist}{track.genre ? ` · ${track.genre}` : ""}</div>
                </div>
                <KeyBadge code={track.musical_key} notation={notation} />
                <span className="mono set-bpm">{fmtBpm(track.bpm)}</span>
                <EnergyBar value={track.energy} />
                <span className="mono muted small">{fmtDuration(track.duration)}</span>
                <div className="set-actions">
                  <button className="icon-btn" title="Preview" onClick={(e) => { e.stopPropagation(); previewMiddle(track.id); }}>▶</button>
                  <button className="icon-btn" title="Remove from set" onClick={(e) => { e.stopPropagation(); remove(i); }}>×</button>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        {last && nextUp.length > 0 && (
          <div className="next-up">
            <h4>What could come next after “{last.title}”</h4>
            <div className="next-grid">
              {nextUp.map(({ track: s, t }) => (
                <div key={s.id} className="next-card" onClick={() => setState({ selectedId: s.id, selection: new Set([s.id]) })}>
                  <div className="next-top">
                    <span className={`sugg-score match-${scoreTone(t.score)}`}>{Math.round(t.score * 100)}</span>
                    <KeyBadge code={s.musical_key} notation={notation} size="sm" />
                    <span className="mono small">{fmtBpm(s.bpm)}</span>
                  </div>
                  <div className="ellipsis">{s.title}</div>
                  <div className="muted small ellipsis">{s.artist}</div>
                  <div className="small muted ellipsis">{t.key?.label}</div>
                  <div className="next-actions">
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); previewMiddle(s.id); }}>▶</button>
                    <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); addToPlaylist(playlist.id, [s.id]); }}>+ Add</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Energy + BPM curve across the set, with key-colored dots. */
function SetFlowChart({ items }: { items: { entry: Entry; track: Track }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 900));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = 120, P = 28;
  const n = items.length;
  const x = (i: number) => P + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * P));
  const bpms = items.map((it) => it.track.bpm ?? null);
  const valid = bpms.filter((b): b is number => b != null);
  const bmin = valid.length ? Math.min(...valid) - 2 : 100, bmax = valid.length ? Math.max(...valid) + 2 : 140;
  const yb = (b: number) => H - P / 2 - ((b - bmin) / Math.max(1, bmax - bmin)) * (H - P * 1.5);
  const ye = (e: number) => H - P / 2 - ((e - 1) / 9) * (H - P * 1.5);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const ePts = items.map((it, i) => (it.track.energy != null ? [x(i), ye(it.track.energy)] : null)).filter(Boolean) as [number, number][];
  const bPts = items.map((it, i) => (it.track.bpm != null ? [x(i), yb(it.track.bpm)] : null)).filter(Boolean) as [number, number][];
  return (
    <div className="flow-chart">
      <div className="flow-legend">
        <span><i style={{ background: "#f472b6" }} /> Energy</span>
        <span><i style={{ background: "#60a5fa" }} /> BPM ({Math.round(bmin + 2)}–{Math.round(bmax - 2)})</span>
        <span className="muted">Dots = key color · {ePts.length < n ? "set energy on tracks to complete the curve" : "aim for waves, not a flat line"}</span>
      </div>
      <div ref={box} className="flow-svg"><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        {items.map((_, i) => <line key={i} x1={x(i)} x2={x(i)} y1={8} y2={H - 6} stroke="rgba(255,255,255,0.05)" />)}
        {bPts.length > 1 && <path d={path(bPts)} fill="none" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 4" />}
        {ePts.length > 1 && <path d={path(ePts)} fill="none" stroke="#f472b6" strokeWidth={3} />}
        {items.map((it, i) => (
          <circle key={i} cx={x(i)} cy={it.track.energy != null ? ye(it.track.energy) : H - 10} r={6} fill={keyColor(it.track.musical_key)} stroke="#111" strokeWidth={1.5}>
            <title>{`${i + 1}. ${it.track.title} · ${it.track.musical_key ?? "?"} · ${it.track.bpm ?? "?"} BPM · energy ${it.track.energy ?? "?"}`}</title>
          </circle>
        ))}
      </svg></div>
    </div>
  );
}
