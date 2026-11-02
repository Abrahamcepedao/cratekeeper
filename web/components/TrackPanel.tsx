import React, { useMemo, useState } from "react";
import { useStore, updateTrack, setState, setDeck, createTag, setTagOnTracks, revealInFinder, addToPlaylist, confirmTrash, type Track } from "../store";
import { KeyBadge, Stars, EnergyBar, TagChip, Editable, Artwork, fmtBpm, fmtDuration } from "./common";
import { KeyWheel } from "./KeyWheel";
import { Waveform, playTrack, previewMiddle } from "./Player";
import { suggestNext } from "../suggest";
import { analyzeTracks } from "../analysis";
import { queueTracks } from "../playback";
import { Icon } from "./Icon";
import { keyColor, normalizeKey, keyInfo, scoreTone, compatibleKeys, formatKey } from "../keys";

export function TrackPanel() {
  const track = useStore((s) => s.tracks.find((t) => t.id === s.selectedId));
  const selection = useStore((s) => s.selection);
  if (selection.size > 1) return <BulkPanel ids={[...selection]} />;
  if (!track) {
    return (
      <aside className="panel panel-empty">
        <KeyWheel size={220} showRelations={false} />
        <p className="muted">Select a track to see its details, tags, notes and the best tracks to mix in next.</p>
      </aside>
    );
  }
  // Keyed so the panel resets and eases in for each track.
  return <TrackDetail key={track.id} track={track} />;
}

/** Hopping through "Mix next": where the chain started and where it is now (so Back can return to the start). */
let explore: { origin: number; current: number } | null = null;

/** The key move picked in "Mix next" (e.g. "+1"), kept as you click through tracks; null = best overall. */
let lastMove: string | null = null;

function TrackDetail({ track }: { track: Track }) {
  const notation = useStore((s) => s.settings.keyNotation);
  const tags = useStore((s) => s.tags);
  const trackTags = useStore((s) => s.trackTags);
  const playlists = useStore((s) => s.playlists);
  const tracks = useStore((s) => s.tracks);
  const deckId = useStore((s) => s.deckId);
  const played = useStore((s) => s.played);
  const playingId = useStore((s) => s.playingId);
  const view = useStore((s) => s.view);
  const [tagInput, setTagInput] = useState("");
  const [editKey, setEditKey] = useState(false);
  const [scope, setScope] = useState<"library" | "playlist">("library");
  const [move, setMoveState] = useState<string | null>(lastMove);
  const setMove = (m: string | null) => { lastMove = m; setMoveState(m); };
  const moves = useMemo(() => compatibleKeys(track.musical_key), [track.musical_key]);
  const target = moves.find((m) => m.rel.short === move)?.code ?? null;
  const keyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tracks) if (t.id !== track.id && t.musical_key) m.set(t.musical_key, (m.get(t.musical_key) ?? 0) + 1);
    return m;
  }, [tracks, track.id]);

  const myTags = [...(trackTags.get(track.id) ?? [])].map((id) => tags.find((t) => t.id === id)).filter(Boolean) as typeof tags;
  const inLists = playlists.filter((p) => p.entries.some((e) => e.trackId === track.id));
  const activeList = view.type === "playlist" ? playlists.find((p) => p.id === view.id) : undefined;

  const suggestions = useMemo(() => {
    const exclude = new Set<number>(played);
    if (deckId != null) exclude.add(deckId);
    if (activeList?.kind === "set") activeList.entries.forEach((e) => exclude.add(e.trackId));
    let pool = tracks;
    if (scope === "playlist" && activeList && activeList.kind !== "set") {
      const ids = new Set(activeList.entries.map((e) => e.trackId));
      pool = tracks.filter((t) => ids.has(t.id));
    }
    if (target) pool = pool.filter((t) => t.musical_key === target);
    return suggestNext(track, pool, exclude, 15);
  }, [track, tracks, played, deckId, activeList, scope, target]);

  const suggestions1 = suggestions;
  const tagMatches = tagInput.trim() ? tags.filter((t) => t.name.toLowerCase().includes(tagInput.toLowerCase()) && !myTags.some((m) => m.id === t.id)).slice(0, 6) : [];

  const addTag = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    const t = tags.find((x) => x.name.toLowerCase() === n.toLowerCase()) ?? (await createTag(n));
    await setTagOnTracks(t.id, [track.id], "add");
    setTagInput("");
  };

  const ki = track.musical_key ? keyInfo(track.musical_key) : null;
  const dur = track.duration;

  return (
    <aside className="panel" style={{ ["--key" as any]: track.musical_key ? keyColor(track.musical_key) : undefined }}>
      <BackPill track={track} />
      <div className="panel-head">
        <Artwork trackId={track.id} hasArt={!!track.has_artwork} size={88} keyCode={track.musical_key} />
        <div className="panel-titles">
          <Editable className="panel-title" value={track.title ?? ""} placeholder={track.filename} onSave={(v) => updateTrack(track.id, { title: v })} />
          <Editable className="panel-artist" value={track.artist ?? ""} placeholder="Unknown artist" onSave={(v) => updateTrack(track.id, { artist: v })} />
          <div className="panel-actions">
            <button className="btn btn-primary" onClick={() => playTrack(track.id, 0)}><Icon name="play" size={13} />Play</button>
            <button className="btn" onClick={() => previewMiddle(track.id)} title="Jump past the intro"><Icon name="waveform" size={14} />Groove</button>
            <button className={`btn ${deckId === track.id ? "btn-live" : ""}`} onClick={() => setDeck(deckId === track.id ? null : track.id)} title="Mark as the track playing in Rekordbox — the library will rank everything by how well it mixes out of this one">
              <Icon name="live" size={14} />{deckId === track.id ? "Live" : "Go live"}
            </button>
          </div>
        </div>
      </div>

      {track.missing ? <div className="warn">File not found on disk — rescan or check the folder.</div> : null}

      <div className="panel-keybpm">
        <div className="big-key" onClick={() => setEditKey(true)} title="Click to override">
          {editKey ? (
            <input
              autoFocus
              defaultValue={track.musical_key ?? ""}
              placeholder="8A / Am"
              onBlur={(e) => { const k = normalizeKey(e.target.value); if (k) updateTrack(track.id, { musical_key: k }); setEditKey(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditKey(false); }}
            />
          ) : (
            <KeyBadge code={track.musical_key} notation={notation} size="lg" />
          )}
          <small>{ki ? (notation === "camelot" ? ki.musical : `${ki.code} · ${ki.musical}`) : "No key yet"}</small>
        </div>
        <div className="big-bpm">
          <Editable className="mono bpm-value" value={track.bpm ? fmtBpm(track.bpm) : ""} placeholder="—" onSave={(v) => { const n = parseFloat(v); updateTrack(track.id, { bpm: isFinite(n) && n > 0 ? n : null }); }} />
          <small>BPM</small>
          {track.bpm ? (
            <span className="bpm-fix">
              <button onClick={() => updateTrack(track.id, { bpm: Math.round(track.bpm! / 2 * 10) / 10 })} title="Halve">÷2</button>
              <button onClick={() => updateTrack(track.id, { bpm: Math.round(track.bpm! * 2 * 10) / 10 })} title="Double">×2</button>
            </span>
          ) : null}
        </div>
        <div className="analysis-meta">
          {track.analyzed_at ? (
            track.analysis_error ? <span className="err-text" title={track.analysis_error}>Analysis failed</span> :
            <span className="muted" title="How clearly the key came through (0–1). Under ~0.6 → double-check by ear.">
              Key confidence <b className={track.key_strength && track.key_strength < 0.6 ? "low" : ""}>{track.key_strength?.toFixed(2) ?? "—"}</b>
            </span>
          ) : <span className="muted">Not analyzed</span>}
          <button className="link" onClick={() => analyzeTracks([track.id], true)}>{track.analyzed_at ? "Re-analyze" : "Analyze now"}</button>
        </div>
      </div>

      <Waveform trackId={track.id} height={40} onSeek={(f) => playTrack(track.id, f)} color={track.musical_key ? keyColor(track.musical_key) : undefined} />

      <div className="panel-grid">
        <label>Energy</label><EnergyBar value={track.energy} onChange={(v) => updateTrack(track.id, { energy: v })} />
        <label>Rating</label><Stars value={track.rating} onChange={(v) => updateTrack(track.id, { rating: v })} />
        <label>Genre</label><Editable value={track.genre ?? ""} placeholder="Add genre" onSave={(v) => updateTrack(track.id, { genre: v })} />
        <label>Album</label><Editable value={track.album ?? ""} placeholder="—" onSave={(v) => updateTrack(track.id, { album: v })} />
        <label>Label</label><Editable value={track.label ?? ""} placeholder="—" onSave={(v) => updateTrack(track.id, { label: v })} />
        <label>Year</label><Editable value={track.year ? String(track.year) : ""} placeholder="—" onSave={(v) => updateTrack(track.id, { year: v ? Number(v) || null : null } as any)} />
        <label>File</label><span className="muted file-line" title={track.rel_path}>{track.ext.toUpperCase()} · {track.bitrate ? `${track.bitrate} kbps · ` : ""}{fmtDuration(dur)} <button className="link" onClick={() => revealInFinder(track.id)}>Reveal</button> · <button className="link danger" onClick={() => confirmTrash([track.id])} title="Move the file to the Trash and remove it from Cratekeeper (⌘⌫)">Move to Trash</button></span>
      </div>

      <section>
        <h4>Tags</h4>
        <div className="tag-row">
          {myTags.map((t) => <TagChip key={t.id} tag={t} onRemove={() => setTagOnTracks(t.id, [track.id], "remove")} />)}
          <div className="tag-input-wrap">
            <input
              className="tag-input"
              placeholder="+ add tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTag(tagMatches[0]?.name ?? tagInput); }}
            />
            {tagMatches.length > 0 && (
              <div className="tag-suggest">
                {tagMatches.map((t) => <div key={t.id} onMouseDown={() => addTag(t.name)}><TagChip tag={t} /></div>)}
              </div>
            )}
          </div>
        </div>
        {tags.filter((t) => !myTags.some((m) => m.id === t.id)).length > 0 && (
          <div className="tag-quick">
            {tags.filter((t) => !myTags.some((m) => m.id === t.id)).slice(0, 10).map((t) => (
              <button key={t.id} className="tag-ghost" style={{ ["--tag" as any]: t.color }} onClick={() => setTagOnTracks(t.id, [track.id], "add")}>+ {t.name}</button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4>Notes</h4>
        <textarea
          key={track.id}
          className="notes"
          defaultValue={track.notes ?? ""}
          placeholder="Cue points, mix-in tips, crowd reaction, what it pairs well with…"
          onBlur={(e) => e.target.value !== (track.notes ?? "") && updateTrack(track.id, { notes: e.target.value })}
        />
      </section>

      {inLists.length > 0 && (
        <section>
          <h4>In playlists</h4>
          <div className="tag-row">
            {inLists.map((p) => <button key={p.id} className="pl-chip" onClick={() => setState({ view: { type: "playlist", id: p.id } })}><Icon name={p.kind === "set" ? "set" : "crate"} size={13} />{p.name}</button>)}
          </div>
        </section>
      )}

      <section>
        <h4>Harmonic neighbors</h4>
        <div className="wheel-wrap">
          <KeyWheel size={230} current={track.musical_key} notation={notation} onSelect={(k) => setState({ query: `key:${k}`, view: { type: "library" } })} />
        </div>
      </section>

      <section>
        <div className="section-head">
          <h4>Mix next</h4>
          {activeList && activeList.kind !== "set" && (
            <select value={scope} onChange={(e) => setScope(e.target.value as any)} className="mini-select">
              <option value="library">from whole library</option>
              <option value="playlist">from “{activeList.name}”</option>
            </select>
          )}
        </div>
        {!track.musical_key && !track.bpm && <p className="muted small">Analyze this track to get suggestions.</p>}
        {moves.length > 0 && (
          <div className="move-chips" role="radiogroup" aria-label="Key to mix into">
            <button role="radio" aria-checked={!target} className={`move-chip ${!target ? "on" : ""}`} onClick={() => setMove(null)} title="Best matches in any compatible key">Best</button>
            {moves.map(({ code, rel }) => {
              const n = keyCounts.get(code) ?? 0;
              return (
                <button
                  key={code}
                  role="radio"
                  aria-checked={target === code}
                  className={`move-chip ${target === code ? "on" : ""} ${n ? "" : "empty"}`}
                  style={{ ["--k" as any]: keyColor(code) }}
                  title={`${rel.label} → ${formatKey(code, notation)} · ${n} track${n === 1 ? "" : "s"}`}
                  onClick={() => setMove(target === code ? null : rel.short)}
                >
                  <span className="move-rel">{rel.short}</span>
                  <b>{formatKey(code, notation)}</b>
                  <small>{n}</small>
                </button>
              );
            })}
          </div>
        )}
        {target && suggestions1.length === 0 && <p className="muted small">No analyzed tracks in {formatKey(target, notation)} to mix into yet.</p>}
        <div className="suggestions">
          {suggestions1.map(({ track: s, t }) => (
            <div key={s.id} className="sugg" onClick={() => {
              explore = { origin: explore?.current === track.id ? explore.origin : track.id, current: s.id };
              setState({ selectedId: s.id, selection: new Set([s.id]) });
            }}>
              <span className={`sugg-score match-${scoreTone(t.score)}`}>{Math.round(t.score * 100)}</span>
              <div className="sugg-main">
                <div className="ellipsis">{s.title ?? s.filename}</div>
                <div className="muted ellipsis small">{s.artist}</div>
              </div>
              <div className="sugg-why">
                <KeyBadge code={s.musical_key} notation={notation} size="sm" />
                <span className="small muted mono">{fmtBpm(s.bpm)}</span>
                <span className={`small rel rel-${t.key?.tone ?? "clash"}`}>{t.key?.short ?? "?"}</span>
              </div>
              <div className="sugg-actions">
                <button className="icon-btn" title="Preview" aria-label="Preview" onClick={(e) => { e.stopPropagation(); previewMiddle(s.id); }}><Icon name="play" size={13} /></button>
                <button className="icon-btn" title="Add to queue" aria-label="Add to queue" onClick={(e) => { e.stopPropagation(); queueTracks([s.id], "end"); }}><Icon name="queueAdd" size={15} /></button>
                {activeList?.kind === "set" && (
                  <button className="icon-btn" title={`Add to ${activeList.name}`} aria-label={`Add to ${activeList.name}`} onClick={(e) => { e.stopPropagation(); addToPlaylist(activeList.id, [s.id]); }}><Icon name="plus" size={14} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

/** "Back to now playing" after exploring away from the playing song, or back to where a Mix next hop started. */
function BackPill({ track }: { track: Track }) {
  const notation = useStore((s) => s.settings.keyNotation);
  const playing = useStore((s) => s.tracks.find((t) => t.id === s.playingId));
  const origin = useStore((s) => (explore && explore.current === track.id ? s.tracks.find((t) => t.id === explore!.origin) : undefined));
  const target = playing && playing.id !== track.id ? playing : origin && origin.id !== track.id ? origin : undefined;
  if (!target) return null;
  const go = () => {
    explore = null;
    setState({ selectedId: target.id, selection: new Set([target.id]) });
  };
  return (
    <button className="back-pill" onClick={go} title={`Show “${target.title ?? target.filename}”`}>
      <Icon name="back" size={14} />
      <span className="back-label">{target === playing ? "Back to now playing" : "Back to"}</span>
      <span className="ellipsis back-title">{target.title ?? target.filename}</span>
      <KeyBadge code={target.musical_key} notation={notation} size="sm" />
    </button>
  );
}

function BulkPanel({ ids }: { ids: number[] }) {
  const tags = useStore((s) => s.tags);
  const trackTags = useStore((s) => s.trackTags);
  const playlists = useStore((s) => s.playlists);
  const [energy, setEnergy] = useState<number | null>(null);
  const [genre, setGenre] = useState("");
  return (
    <aside className="panel">
      <h3>{ids.length} tracks selected</h3>
      <p className="muted small">⌘-click to add or remove, ⇧-click for a range. Drag them onto a playlist in the sidebar.</p>
      <section>
        <h4>Tags</h4>
        <div className="tag-quick">
          {tags.map((t) => {
            const all = ids.every((id) => trackTags.get(id)?.has(t.id));
            return (
              <button key={t.id} className={`tag-ghost ${all ? "on" : ""}`} style={{ ["--tag" as any]: t.color }} onClick={() => setTagOnTracks(t.id, ids, all ? "remove" : "add")}>
                <Icon name={all ? "check" : "plus"} size={12} />{t.name}
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <h4>Set energy for all</h4>
        <EnergyBar value={energy} onChange={(v) => { setEnergy(v); ids.forEach((id) => updateTrack(id, { energy: v })); }} />
      </section>
      <section>
        <h4>Set genre for all</h4>
        <div className="row">
          <input className="input" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Melodic Techno" />
          <button className="btn" disabled={!genre.trim()} onClick={() => ids.forEach((id) => updateTrack(id, { genre: genre.trim() }))}>Apply</button>
        </div>
      </section>
      <section>
        <h4>Add to playlist</h4>
        <div className="tag-row">
          {playlists.filter((p) => p.kind !== "folder").map((p) => <button key={p.id} className="pl-chip" onClick={() => addToPlaylist(p.id, ids)}><Icon name={p.kind === "set" ? "set" : "crate"} size={13} />{p.name}</button>)}
          {!playlists.some((p) => p.kind !== "folder") && <span className="muted small">Create a crate or set in the sidebar first.</span>}
        </div>
      </section>
      <section>
        <div className="row">
          <button className="btn" onClick={() => queueTracks(ids, "end")}><Icon name="queueAdd" size={15} />Add to queue</button>
          <button className="btn" onClick={() => analyzeTracks(ids, true)}>Re-analyze key & BPM</button>
          <button className="btn btn-danger-ghost" onClick={() => confirmTrash(ids)}>Move {ids.length} to Trash…</button>
        </div>
      </section>
    </aside>
  );
}
