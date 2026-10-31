/* Playback engine: the play queue, autoplay, and harmonic crossfades.
 *
 * Two decks so one track can fade out while the next fades in. `live` is the deck you hear and the UI shows;
 * during a blend the other deck is the outgoing track. Volume goes deck → deck gain → master → speakers through
 * Web Audio, whose scheduled ramps run on the audio thread, so a blend stays smooth even with the tab in the
 * background (where timers are throttled). */
import { getState, setState, trackById, toast, type Track } from "./store";
import { keyRelation, bpmRelation } from "./keys";

export const FADE_SECONDS = 12;
const url = (id: number) => `/api/tracks/${id}/audio`;

// ---- Waveform peaks (also used to find where the music actually starts and stops) ----
const peaksCache = new Map<number, number[] | null>();
export async function getPeaks(id: number): Promise<number[] | null> {
  if (peaksCache.has(id)) return peaksCache.get(id)!;
  const r = await fetch(`/api/tracks/${id}/peaks`).then((r) => r.json()).catch(() => null);
  if (r) peaksCache.set(id, r);
  return r;
}
export function invalidatePeaks(id: number) { peaksCache.delete(id); }

// ---- Decks & audio graph ----
const decks = [new Audio(), new Audio()];
for (const d of decks) d.preload = "auto";
let live = 0;
/** The deck you're hearing. */
export const deck = () => decks[live];
export const allDecks = decks;

let ctx: AudioContext | null = null;
let gains: GainNode[] = [];
let master: GainNode | null = null;
let volume = 0.9;

/** Built lazily from a user gesture (browsers keep audio suspended until one happens). */
function graph(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    gains = decks.map((d) => {
      const g = ctx!.createGain();
      ctx!.createMediaElementSource(d).connect(g);
      g.connect(master!);
      return g;
    });
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setVolume(v: number) {
  volume = v;
  if (ctx && master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.015);
}

/** Glide a deck's gain to a value (short ramp, so taking over mid-blend doesn't click). */
function glide(i: number, v: number, seconds = 0.15) {
  const g = gains[i];
  if (!g || !ctx) return;
  const now = ctx.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(v, now + seconds);
}

/** Equal-power curve: the two decks' combined loudness stays level through the blend. */
function rampCurve(g: GainNode, at: number, len: number, dir: "in" | "out") {
  const n = 64;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (Math.PI / 2);
    curve[i] = dir === "in" ? Math.sin(x) : Math.cos(x);
  }
  g.gain.cancelScheduledValues(at);
  g.gain.setValueCurveAtTime(curve, at, len);
}

// ---- Queue ----
// Like Spotify: "Next in queue" (tracks you add, store.upNext) plays first; then the list you started from
// continues where it left off. That list ("context") is a snapshot of the table/crate/set order taken when you
// pressed play, so browsing elsewhere doesn't change it.
let visibleList: number[] = [];
let visibleLabel = "";
let context: number[] = [];
let contextLabel = "";
let cursor = -1; // position in `context` of the last track played from it
/** Tracks heard since this list started; the list skips them (and anything queued) so nothing plays twice. */
let heard = new Set<number>();
const skipInList = (id: number) => heard.has(id) || getState().upNext.includes(id) || !trackById(id);
/** Played tracks for Previous, with where the list stood at the time (so going back doesn't lose your place). */
const history: { id: number; cursor: number }[] = [];

export function setVisibleList(ids: number[], label: string) { visibleList = ids; visibleLabel = label; }

/** What's left of the list you started from (for the queue panel). */
export function contextInfo() {
  return { label: contextLabel, upcoming: context.slice(cursor + 1).filter((id) => !skipInList(id)) };
}

type Step = { id: number; from: "queue" | "context"; index: number };

/** The track that plays after this one. */
export function nextStep(): Step | null {
  const { upNext } = getState();
  for (let i = 0; i < upNext.length; i++) if (trackById(upNext[i])) return { id: upNext[i], from: "queue", index: i };
  for (let i = cursor + 1; i < context.length; i++) if (!skipInList(context[i])) return { id: context[i], from: "context", index: i };
  return null;
}
export const hasPrevious = () => history.length > 0;

/** Move the playhead of the queue onto `step` (call right before it starts playing). */
function advance(step: Step) {
  remember();
  if (step.from === "queue") setState((s) => ({ upNext: s.upNext.filter((_, i) => i !== step.index) }));
  else cursor = step.index;
}

function remember() {
  const cur = getState().playingId;
  if (cur != null && history[history.length - 1]?.id !== cur) history.push({ id: cur, cursor });
  if (history.length > 200) history.shift();
}

export function queueTracks(ids: number[], where: "next" | "end") {
  if (!ids.length) return;
  setState((s) => {
    const rest = s.upNext.filter((x) => !ids.includes(x));
    return { upNext: where === "next" ? [...ids, ...rest] : [...rest, ...ids] };
  });
  const what = ids.length === 1 ? `“${trackById(ids[0])?.title ?? "Track"}”` : `${ids.length} tracks`;
  toast(where === "next" ? `${what} will play next` : `Added ${what} to the queue`);
}
export function removeFromQueue(index: number) { setState((s) => ({ upNext: s.upNext.filter((_, i) => i !== index) })); }
export function clearQueue() { setState({ upNext: [] }); }
export function moveInQueue(from: number, to: number) {
  setState((s) => {
    const list = [...s.upNext];
    const [m] = list.splice(from, 1);
    list.splice(to > from ? to - 1 : to, 0, m);
    return { upNext: list };
  });
}

/** Jump straight to an item in the queue panel. */
export function playQueued(index: number) {
  const id = getState().upNext[index];
  if (id == null) return;
  advance({ id, from: "queue", index });
  playTrack(id, 0, "step");
}
export function playFromContext(id: number) {
  const index = context.indexOf(id, cursor + 1);
  if (index < 0) return;
  advance({ id, from: "context", index });
  playTrack(id, 0, "step");
}

// ---- Settings ----
function stored(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function store(key: string, v: string) { try { localStorage.setItem(key, v); } catch {} }

export let autoplay = stored("ck-autoplay", "on") !== "off";
export function setAutoplay(on: boolean) { autoplay = on; store("ck-autoplay", on ? "on" : "off"); }

/** Blend into the next track when it's a harmonic + tempo match. */
export let crossfade = stored("ck-crossfade", "on") !== "off";
export function setCrossfade(on: boolean) { crossfade = on; store("ck-crossfade", on ? "on" : "off"); if (!on) endBlend(); }

// ---- Crossfade ----
/** Smooth enough to overlap: a compatible key (same, ±1, relative or diagonal) and within ±3% at the same tempo. */
export function blendable(a: Track, b: Track): boolean {
  const k = keyRelation(a.musical_key, b.musical_key);
  const t = bpmRelation(a.bpm, b.bpm);
  return !!k && (k.tone === "perfect" || k.tone === "good") && !!t && t.factor === 1 && Math.abs(t.pct) <= 3;
}

/** Where the music audibly starts and stops, from the 600-bin peaks, so a blend doesn't fade silence. */
function audibleBounds(peaks: number[] | null, dur: number) {
  if (!peaks?.length || !dur) return { start: 0, end: dur };
  const loud = (p: number) => p > 3; // ~ -30 dB below the track's loudest moment
  const first = peaks.findIndex(loud);
  if (first < 0) return { start: 0, end: dur };
  let last = peaks.length - 1;
  while (last > first && !loud(peaks[last])) last--;
  const bin = dur / peaks.length;
  return { start: Math.max(0, first * bin - 0.25), end: Math.min(dur, (last + 1) * bin) };
}

type Plan = { fromId: number; toId: number; fadeAt: number; startAt: number };
let plan: Plan | null = null;
let planKey = "";
let blending = false;
let blendTimer: ReturnType<typeof setTimeout> | null = null;

/** The blend lined up for the end of the current track, if any. */
export function upcomingBlend(): Plan | null {
  return plan && plan.fromId === getState().playingId && plan.toId === nextStep()?.id ? plan : null;
}
export const isBlending = () => blending;

async function preparePlan() {
  const fromId = getState().playingId;
  const toId = nextStep()?.id ?? null;
  const key = `${fromId}>${toId}>${autoplay}>${crossfade}`;
  if (key === planKey) return;
  planKey = key;
  plan = null;
  if (fromId == null || toId == null || !autoplay || !crossfade) return;
  const a = trackById(fromId), b = trackById(toId);
  if (!a || !b || !blendable(a, b)) return;
  const outDur = deck().duration || a.duration || 0;
  const inDur = b.duration ?? 0;
  if (outDur < FADE_SECONDS * 2.5 || inDur < FADE_SECONDS * 2.5) return; // too short to overlap 12s
  const [pa, pb] = await Promise.all([getPeaks(fromId), getPeaks(toId)]);
  if (planKey !== key) return; // something changed while we waited
  plan = { fromId, toId, fadeAt: audibleBounds(pa, outDur).end - FADE_SECONDS, startAt: audibleBounds(pb, inDur).start };
}

function startBlend(p: Plan) {
  const step = nextStep();
  if (!step || step.id !== p.toId) return;
  const ac = graph();
  const outIdx = live, inIdx = 1 - live;
  const inc = decks[inIdx];
  const len = Math.max(1, Math.min(FADE_SECONDS, p.fadeAt + FADE_SECONDS - decks[outIdx].currentTime));
  blending = true;
  glide(inIdx, 0, 0.01);
  inc.src = url(p.toId);
  const begin = () => {
    if (!blending) return; // cancelled while loading
    inc.play().then(() => {
      if (!blending) return;
      const now = ac.currentTime;
      rampCurve(gains[outIdx], now, len, "out");
      rampCurve(gains[inIdx], now, len, "in");
      advance(step);
      heard.add(step.id);
      live = inIdx; // the incoming track is now "the" track for the UI and controls
      setState({ playingId: p.toId });
      blendTimer = setTimeout(endBlend, len * 1000 + 250);
    }).catch(() => endBlend());
  };
  inc.addEventListener("loadedmetadata", () => {
    if (p.startAt < 0.05) return begin();
    inc.addEventListener("seeked", begin, { once: true });
    inc.currentTime = p.startAt;
  }, { once: true });
}

/** Finish or cancel a blend: silence and unload the other deck, bring the live deck to full volume. */
export function endBlend() {
  if (!blending) return;
  blending = false;
  if (blendTimer) clearTimeout(blendTimer);
  blendTimer = null;
  const other = decks[1 - live];
  other.pause();
  other.removeAttribute("src");
  other.load();
  glide(1 - live, 1, 0.01);
  glide(live, 1);
}

// Live-deck clock: line up the next blend and start it on time.
for (const d of decks) {
  d.addEventListener("timeupdate", () => {
    if (d !== deck() || blending || d.paused) return;
    preparePlan();
    const p = upcomingBlend();
    if (p && d.currentTime >= p.fadeAt && d.currentTime < p.fadeAt + FADE_SECONDS) startBlend(p);
  });
  d.addEventListener("ended", () => {
    if (d === deck() && autoplay) playNext();
  });
}

// ---- Transport ----
/** `how`: "user" (picked from a list: that list becomes what plays next), "step" (the queue already moved),
 *  or "back" (Previous: don't add to history). */
export function playTrack(id: number, startFraction?: number, how: "user" | "step" | "back" = "user") {
  graph();
  const s = getState();
  if (s.playingId === id && startFraction === undefined) {
    endBlend();
    const d = deck();
    d.paused ? d.play() : d.pause();
    return;
  }
  endBlend();
  if (how === "user") {
    remember();
    if (visibleList.includes(id)) { context = visibleList; contextLabel = visibleLabel; }
    else if (!context.includes(id)) { context = [id]; contextLabel = ""; }
    cursor = context.indexOf(id);
    heard = new Set();
    // Playing a queued track by hand counts as playing it from the queue.
    if (getState().upNext.includes(id)) setState((s) => ({ upNext: s.upNext.filter((x) => x !== id) }));
  }
  heard.add(id);
  const d = deck();
  if (s.playingId !== id) {
    d.src = url(id);
    setState({ playingId: id });
  }
  const go = () => {
    if (startFraction !== undefined && d.duration) d.currentTime = d.duration * startFraction;
    d.play().catch(() => {});
  };
  if (d.readyState >= 1) go(); else d.addEventListener("loadedmetadata", go, { once: true });
}

export function togglePlay() {
  const s = getState();
  if (s.playingId == null) { if (s.selectedId != null) playTrack(s.selectedId); return; }
  graph();
  endBlend();
  const d = deck();
  d.paused ? d.play() : d.pause();
}

export function seek(t: number) {
  endBlend();
  const d = deck();
  d.currentTime = Math.max(0, Math.min(d.duration || t, t));
}

export function playNext() {
  const step = nextStep();
  if (!step) return;
  advance(step);
  playTrack(step.id, 0, "step");
}

/** Like a CD player: past the first few seconds, "previous" restarts the current track; otherwise go back in history. */
export function playPrev() {
  if (deck().currentTime > 3 || !history.length) { seek(0); return; }
  const back = history.pop()!;
  cursor = back.cursor;
  playTrack(back.id, 0, "back");
}

/** Jump to 1/3 of the track — usually past the intro, where the groove is. */
export function previewMiddle(id: number) { playTrack(id, 0.33); }

export function stopAll() {
  endBlend();
  const d = deck();
  d.pause();
  d.removeAttribute("src");
  setState({ playingId: null });
}
