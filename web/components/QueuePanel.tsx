import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore, type Track } from "../store";
import { Artwork, KeyBadge, fmtBpm } from "./common";
import { Icon } from "./Icon";
import {
  contextInfo, playQueued, playFromContext, removeFromQueue, clearQueue, moveInQueue, queueTracks,
  blendable, autoplay, crossfade,
} from "../playback";

/** Accepts tracks dragged from any list ("application/x-ck-tracks") and adds them to the end of the queue. */
export function queueDropProps(onDone?: () => void) {
  return {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("application/x-ck-tracks")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } },
    onDrop: (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData("application/x-ck-tracks");
      if (!raw) return;
      e.preventDefault();
      queueTracks(JSON.parse(raw), "end");
      onDone?.();
    },
  };
}

/** Popover above the player: now playing, "Next in queue" (yours), then "Next from" the list you started from. */
export function QueuePanel({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const tracks = useStore((s) => s.tracks);
  const upNext = useStore((s) => s.upNext);
  const playingId = useStore((s) => s.playingId);
  const notation = useStore((s) => s.settings.keyNotation);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; origin: string } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const byId = new Map(tracks.map((t) => [t.id, t]));
  const now = playingId != null ? byId.get(playingId) : undefined;
  const queued = upNext.map((id) => byId.get(id)).filter(Boolean) as Track[];
  const ctx = contextInfo();
  const later = ctx.upcoming.slice(0, 25).map((id) => byId.get(id)!).filter(Boolean);

  // Anchor to the queue button so the panel grows out of it.
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = 400;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    setPos({ left, origin: `${r.left + r.width / 2 - left}px 100%` });
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [anchor, onClose]);

  // A small crossfade mark on every transition that will blend.
  const willBlend = (a: Track | undefined, b: Track) => autoplay && crossfade && !!a && blendable(a, b);

  const row = (t: Track, prev: Track | undefined, opts: { onPlay: () => void; index?: number }) => (
    <div
      key={`${opts.index ?? "c"}-${t.id}`}
      className={`q-row ${opts.index != null ? "q-draggable" : ""} ${overIdx === opts.index && dragIdx !== null ? "drop-before" : ""} ${dragIdx === opts.index ? "dragging" : ""}`}
      onDoubleClick={opts.onPlay}
      draggable={opts.index != null}
      onDragStart={opts.index != null ? (e) => { setDragIdx(opts.index!); e.dataTransfer.setData("application/x-ck-queue", String(opts.index)); e.dataTransfer.effectAllowed = "move"; } : undefined}
      onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
      onDragOver={opts.index != null ? (e) => { if (dragIdx != null) { e.preventDefault(); setOverIdx(opts.index!); } } : undefined}
      onDrop={opts.index != null ? (e) => { if (dragIdx != null) { e.preventDefault(); e.stopPropagation(); moveInQueue(dragIdx, opts.index!); setDragIdx(null); setOverIdx(null); } } : undefined}
    >
      <span className="q-blend" title={willBlend(prev, t) ? "Blends in from the track before" : undefined}>
        {willBlend(prev, t) ? <Icon name="crossfade" size={13} /> : null}
      </span>
      <Artwork trackId={t.id} hasArt={!!t.has_artwork} size={32} keyCode={t.musical_key} />
      <div className="q-main">
        <div className="ellipsis">{t.title ?? t.filename}</div>
        <div className="muted small ellipsis">{t.artist ?? "Unknown artist"}</div>
      </div>
      <KeyBadge code={t.musical_key} notation={notation} size="sm" />
      <span className="mono small muted q-bpm">{fmtBpm(t.bpm)}</span>
      <span className="q-actions">
        <button className="icon-btn" title="Play now" aria-label="Play now" onClick={opts.onPlay}><Icon name="play" size={12} /></button>
        {opts.index != null && <button className="icon-btn" title="Remove from queue" aria-label="Remove from queue" onClick={() => removeFromQueue(opts.index!)}><Icon name="close" size={13} /></button>}
      </span>
    </div>
  );

  let prev = now;
  return createPortal(
    <div ref={ref} className="queue-panel" style={pos ? { left: pos.left, transformOrigin: pos.origin } : { visibility: "hidden" }} {...queueDropProps()}>
      <div className="q-head">
        <h3>Queue</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close queue"><Icon name="close" /></button>
      </div>
      <div className="q-scroll">
        {now && (
          <section>
            <h4>Now playing</h4>
            <div className="q-row q-now">
              <span className="q-blend"><span className="eq"><i /><i /><i /></span></span>
              <Artwork trackId={now.id} hasArt={!!now.has_artwork} size={32} keyCode={now.musical_key} />
              <div className="q-main">
                <div className="ellipsis">{now.title ?? now.filename}</div>
                <div className="muted small ellipsis">{now.artist ?? "Unknown artist"}</div>
              </div>
              <KeyBadge code={now.musical_key} notation={notation} size="sm" />
              <span className="mono small muted q-bpm">{fmtBpm(now.bpm)}</span>
              <span className="q-actions" />
            </div>
          </section>
        )}
        <section>
          <div className="q-section-head">
            <h4>Next in queue</h4>
            {queued.length > 0 && <button className="link small" onClick={clearQueue}>Clear</button>}
          </div>
          {queued.length === 0 ? (
            <p className="q-empty">Nothing queued yet. Right-click a track and choose <b>Add to queue</b>, press <kbd>Q</kbd> (<kbd>⇧Q</kbd> to play next), or drag tracks here.</p>
          ) : (
            queued.map((t, i) => { const r = row(t, prev, { onPlay: () => playQueued(i), index: i }); prev = t; return r; })
          )}
        </section>
        {later.length > 0 && (
          <section>
            <h4>Next from {ctx.label ? <span className="q-context">{ctx.label}</span> : "your list"}</h4>
            {later.map((t) => { const r = row(t, prev, { onPlay: () => playFromContext(t.id) }); prev = t; return r; })}
            {ctx.upcoming.length > later.length && <p className="muted small q-more">+ {ctx.upcoming.length - later.length} more</p>}
          </section>
        )}
      </div>
    </div>,
    document.body,
  );
}
