import React, { useEffect, useRef, useState } from "react";
import { setState, useStore, trackById } from "../store";
import { Artwork, KeyBadge, fmtBpm, fmtDuration } from "./common";
import { Icon } from "./Icon";
import { keyColor, keyRelation, bpmRelation } from "../keys";
import {
  deck, allDecks, playTrack, playNext, playPrev, seek, stopAll, getPeaks, invalidatePeaks, nextStep,
  autoplay, setAutoplay, crossfade, setCrossfade, setVolume, upcomingBlend, isBlending, FADE_SECONDS,
} from "../playback";
import { QueuePanel, queueDropProps } from "./QueuePanel";

/** Matches --accent in styles.css (canvas can't read CSS variables cheaply per frame). */
export const ACCENT = "#8bc0ea";

// Playback lives in ../playback; these re-exports keep existing imports working.
export { playTrack, togglePlay, previewMiddle, playNext, playPrev, setVisibleList, getPeaks, invalidatePeaks } from "../playback";

export function Waveform({ trackId, progress, onSeek, height = 44, color = ACCENT }: { trackId: number; progress?: number; onSeek?: (f: number) => void; height?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  // Redraw when the canvas changes size (e.g. dragging the panel wider), so bars stay crisp.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setWidth(c.clientWidth));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  const analyzedAt = useStore((s) => s.tracks.find((t) => t.id === trackId)?.analyzed_at);
  useEffect(() => {
    let alive = true;
    invalidatePeaks(trackId);
    getPeaks(trackId).then((p) => alive && setPeaks(p));
    return () => { alive = false; };
  }, [trackId, analyzedAt]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    if (!peaks) {
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(0, h / 2 - 1, w, 2);
      if (progress != null) { g.fillStyle = color; g.fillRect(0, h / 2 - 1, w * progress, 2); }
      return;
    }
    const bars = Math.min(peaks.length, Math.floor(w / 2));
    const bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const p = peaks[Math.floor((i / bars) * peaks.length)] / 100;
      const bh = Math.max(1, p * (h - 2));
      const played = progress != null && i / bars < progress;
      g.fillStyle = played ? color : "rgba(255,255,255,0.18)";
      g.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.6), bh);
    }
  }, [peaks, progress, color, width]);
  return (
    <canvas
      ref={ref}
      className="waveform"
      style={{ height, cursor: onSeek ? "pointer" : "default" }}
      onClick={(e) => {
        if (!onSeek) return;
        const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
        onSeek((e.clientX - r.left) / r.width);
      }}
    />
  );
}

export function Player() {
  const playingId = useStore((s) => s.playingId);
  const notation = useStore((s) => s.settings.keyNotation);
  const track = useStore((s) => s.tracks.find((t) => t.id === s.playingId));
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [vol, setVol] = useState(0.9);
  const [auto, setAuto] = useState(autoplay);
  const [blend, setBlend] = useState(crossfade);
  const [queueOpen, setQueueOpen] = useState(false);
  const queueBtn = useRef<HTMLButtonElement>(null);
  const queued = useStore((s) => s.upNext.length);

  useEffect(() => {
    // Both decks report in; the UI always reads the live one.
    const u = () => setTime(deck().currentTime);
    // The brand record spins while audio plays; CSS reads this flag.
    const p = () => { const d = deck(); setPaused(d.paused); document.documentElement.dataset.playing = String(!d.paused); };
    const events = ["timeupdate", "play", "pause", "ended"] as const;
    for (const d of allDecks) for (const ev of events) d.addEventListener(ev, ev === "timeupdate" ? u : p);
    // Hardware media keys and macOS Now Playing.
    const ms = navigator.mediaSession;
    ms?.setActionHandler("nexttrack", playNext);
    ms?.setActionHandler("previoustrack", playPrev);
    return () => { for (const d of allDecks) for (const ev of events) d.removeEventListener(ev, ev === "timeupdate" ? u : p); };
  }, []);
  useEffect(() => { setVolume(vol); }, [vol]);
  // The playing track was removed (e.g. moved to the Trash): stop instead of playing a ghost.
  useEffect(() => {
    if (playingId != null && !track) stopAll();
  }, [playingId, track]);
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title ?? track.filename,
      artist: track.artist ?? "",
      album: "Cratekeeper",
      artwork: track.has_artwork ? [{ src: `/api/tracks/${track.id}/art` }] : [],
    });
  }, [track?.id, track?.title, track?.artist]);

  const dur = deck().duration || track?.duration || 0;
  const next = upcomingBlend();
  const nextTrack = next ? trackById(next.toId) : undefined;
  if (!track) {
    return (
      <footer className="player empty">
        <span className="muted player-hint"><Icon name="waveform" size={16} /> Select a track and press <kbd>Space</kbd> to preview · <kbd>P</kbd> jumps to the groove</span>
      </footer>
    );
  }
  return (
    <footer className="player">
      <div className="player-track" onClick={() => setState({ selectedId: track.id })}>
        <Artwork trackId={track.id} hasArt={!!track.has_artwork} size={44} keyCode={track.musical_key} />
        <div className="ellipsis">
          <div className="player-title ellipsis">{track.title ?? track.filename}</div>
          <div className="muted ellipsis">{track.artist ?? "Unknown artist"}</div>
        </div>
      </div>
      <div className="player-controls">
        <button className="icon-btn" title="Previous track (⇧←)" aria-label="Previous track" onClick={playPrev}><Icon name="skipPrev" size={17} /></button>
        <button className="icon-btn skip" title="Back 10s" aria-label="Back 10 seconds" onClick={() => seek(deck().currentTime - 10)}><Icon name="back" size={18} /><small>10</small></button>
        <button className="play-btn" aria-label={paused ? "Play" : "Pause"} onClick={() => playTrack(track.id)}><Icon name={paused ? "play" : "pause"} size={18} /></button>
        <button className="icon-btn skip" title="Forward 30s" aria-label="Forward 30 seconds" onClick={() => seek(deck().currentTime + 30)}><Icon name="forward" size={18} /><small>30</small></button>
        <button className="icon-btn" title="Next track (⇧→)" aria-label="Next track" disabled={nextStep() == null} onClick={playNext}><Icon name="skipNext" size={17} /></button>
        <button
          className={`icon-btn autoplay-toggle ${auto ? "on" : ""}`}
          title={auto ? "Autoplay is on: the next track starts when this one ends" : "Autoplay is off"}
          aria-label="Autoplay next track"
          aria-pressed={auto}
          onClick={() => { setAutoplay(!auto); setAuto(!auto); }}
        ><Icon name="autoplay" size={17} /></button>
        <button
          className={`icon-btn autoplay-toggle ${blend && auto ? "on" : ""}`}
          title={!auto ? "Crossfade needs autoplay on" : blend ? `Crossfade is on: harmonic + tempo matches blend over ${FADE_SECONDS}s` : "Crossfade is off"}
          aria-label="Crossfade into matching tracks"
          aria-pressed={blend}
          disabled={!auto}
          onClick={() => { setCrossfade(!blend); setBlend(!blend); }}
        ><Icon name="crossfade" size={17} /></button>
      </div>
      <div className="player-wave">
        <span className="mono muted">{fmtDuration(time)}</span>
        <Waveform trackId={track.id} progress={dur ? time / dur : 0} onSeek={(f) => seek(f * dur)} color={track.musical_key ? keyColor(track.musical_key) : ACCENT} />
        <span className="mono muted">{fmtDuration(dur)}</span>
      </div>
      <div className="player-meta">
        {isBlending() ? (
          <span className="blend-chip active" title="Crossfading into this track"><Icon name="crossfade" size={13} />Blending</span>
        ) : next && nextTrack && blend && auto ? (
          <span className="blend-chip" title={`Blends into “${nextTrack.title ?? nextTrack.filename}” · ${keyRelation(track.musical_key, nextTrack.musical_key)?.label} · ${bpmRelation(track.bpm, nextTrack.bpm)?.label}`}>
            <Icon name="crossfade" size={13} />Blend in {fmtDuration(Math.max(0, next.fadeAt - time))}
          </span>
        ) : null}
        <KeyBadge code={track.musical_key} notation={notation} />
        <span className="bpm-pill mono">{fmtBpm(track.bpm)} <small>BPM</small></span>
        <button
          ref={queueBtn}
          className={`icon-btn queue-btn ${queueOpen ? "on" : ""}`}
          title="Queue (drop tracks here to add them)"
          aria-label="Queue"
          aria-expanded={queueOpen}
          onClick={() => setQueueOpen((o) => !o)}
          {...queueDropProps()}
        >
          <Icon name="queue" size={17} />
          {queued > 0 && <b className="queue-count">{queued}</b>}
        </button>
        <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(Number(e.target.value))} className="vol" title="Volume" />
      </div>
      {queueOpen && <QueuePanel anchor={queueBtn.current} onClose={() => setQueueOpen(false)} />}
    </footer>
  );
}
