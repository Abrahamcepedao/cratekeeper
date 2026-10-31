import React, { useEffect, useRef, useState } from "react";
import { getState, setState, useStore, trackById } from "../store";
import { Artwork, KeyBadge, fmtBpm, fmtDuration } from "./common";

export const audio = new Audio();
audio.preload = "auto";

const peaksCache = new Map<number, number[] | null>();
export async function getPeaks(id: number): Promise<number[] | null> {
  if (peaksCache.has(id)) return peaksCache.get(id)!;
  const r = await fetch(`/api/tracks/${id}/peaks`).then((r) => r.json()).catch(() => null);
  if (r) peaksCache.set(id, r);
  return r;
}
export function invalidatePeaks(id: number) { peaksCache.delete(id); }

export function playTrack(id: number, startFraction?: number) {
  const s = getState();
  if (s.playingId === id && startFraction === undefined) {
    audio.paused ? audio.play() : audio.pause();
    return;
  }
  if (s.playingId !== id) {
    audio.src = `/api/tracks/${id}/audio`;
    setState({ playingId: id });
  }
  const go = () => {
    if (startFraction !== undefined && audio.duration) audio.currentTime = audio.duration * startFraction;
    audio.play().catch(() => {});
  };
  if (audio.readyState >= 1) go(); else audio.addEventListener("loadedmetadata", go, { once: true });
}

export function togglePlay() {
  const s = getState();
  if (s.playingId == null) { if (s.selectedId != null) playTrack(s.selectedId); return; }
  audio.paused ? audio.play() : audio.pause();
}

/** Jump to 1/3 of the track — usually past the intro, where the groove is. */
export function previewMiddle(id: number) { playTrack(id, 0.33); }

export function Waveform({ trackId, progress, onSeek, height = 44, color = "#a78bfa" }: { trackId: number; progress?: number; onSeek?: (f: number) => void; height?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
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
      g.fillStyle = played ? color : "rgba(255,255,255,0.22)";
      g.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.6), bh);
    }
  }, [peaks, progress, color]);
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

  useEffect(() => {
    const u = () => setTime(audio.currentTime);
    const p = () => setPaused(audio.paused);
    audio.addEventListener("timeupdate", u);
    audio.addEventListener("play", p);
    audio.addEventListener("pause", p);
    audio.addEventListener("ended", p);
    return () => { audio.removeEventListener("timeupdate", u); audio.removeEventListener("play", p); audio.removeEventListener("pause", p); audio.removeEventListener("ended", p); };
  }, []);
  useEffect(() => { audio.volume = vol; }, [vol]);

  const dur = audio.duration || track?.duration || 0;
  if (!track) {
    return (
      <footer className="player empty">
        <span className="muted">Select a track and press <kbd>Space</kbd> to preview · <kbd>P</kbd> jumps to the groove</span>
      </footer>
    );
  }
  return (
    <footer className="player">
      <div className="player-track" onClick={() => setState({ selectedId: track.id })}>
        <Artwork trackId={track.id} hasArt={!!track.has_artwork} size={44} />
        <div className="ellipsis">
          <div className="player-title ellipsis">{track.title ?? track.filename}</div>
          <div className="muted ellipsis">{track.artist ?? "Unknown artist"}</div>
        </div>
      </div>
      <div className="player-controls">
        <button className="icon-btn" title="Back 10s" onClick={() => (audio.currentTime = Math.max(0, audio.currentTime - 10))}>⟲</button>
        <button className="play-btn" onClick={() => playTrack(track.id)}>{paused ? "▶" : "❚❚"}</button>
        <button className="icon-btn" title="Forward 30s" onClick={() => (audio.currentTime = Math.min(dur, audio.currentTime + 30))}>⟳</button>
      </div>
      <div className="player-wave">
        <span className="mono muted">{fmtDuration(time)}</span>
        <Waveform trackId={track.id} progress={dur ? time / dur : 0} onSeek={(f) => (audio.currentTime = f * dur)} />
        <span className="mono muted">{fmtDuration(dur)}</span>
      </div>
      <div className="player-meta">
        <KeyBadge code={track.musical_key} notation={notation} />
        <span className="bpm-pill mono">{fmtBpm(track.bpm)} <small>BPM</small></span>
        <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(Number(e.target.value))} className="vol" title="Volume" />
      </div>
    </footer>
  );
}
