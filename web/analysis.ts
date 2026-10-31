import { getState, setState, saveAnalysis, toast, type Track } from "./store";

const SR = 44100;
const POOL = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 4) / 3)));

let workers: Worker[] = [];
let queue: number[] = [];
let cancelled = false;
let forceIds = new Set<number>();
const pending = new Map<string, (v: any) => void>();

function getWorkers() {
  if (!workers.length) {
    workers = Array.from({ length: POOL }, () => {
      const w = new Worker("/static/analysis-worker.js");
      w.onmessage = (e) => {
        const cb = pending.get(e.data.id);
        if (cb) { pending.delete(e.data.id); cb(e.data); }
      };
      return w;
    });
  }
  return workers;
}

async function decode(trackId: number): Promise<Float32Array> {
  const res = await fetch(`/api/tracks/${trackId}/audio`);
  if (!res.ok) throw new Error("Could not load audio file");
  const buf = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, SR);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(buf);
  } catch {
    throw new Error("This browser can't decode this file format");
  }
  const ch = audio.numberOfChannels;
  const out = new Float32Array(audio.length);
  for (let c = 0; c < ch; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / ch;
  }
  return out;
}

async function analyzeOne(worker: Worker, track: Track) {
  setState((s) => ({ analysis: { ...s.analysis, current: `${track.artist ?? ""} — ${track.title ?? track.filename}` } }));
  try {
    const pcm = await decode(track.id);
    const id = `${track.id}-${Date.now()}`;
    const result: any = await new Promise((resolve) => {
      pending.set(id, resolve);
      worker.postMessage({ id, pcm: pcm.buffer, bpmMin: 85, bpmMax: 175 }, [pcm.buffer]);
    });
    if (!result.ok) throw new Error(result.error);
    await saveAnalysis(track.id, { ...result.result, force: forceIds.has(track.id) });
  } catch (e: any) {
    await saveAnalysis(track.id, { error: e.message ?? String(e) }).catch(() => {});
    setState((s) => ({ analysis: { ...s.analysis, errors: s.analysis.errors + 1 } }));
  } finally {
    forceIds.delete(track.id);
    setState((s) => ({ analysis: { ...s.analysis, done: s.analysis.done + 1 } }));
  }
}

export function analyzeTracks(ids: number[], force = false) {
  const s = getState();
  const add = ids.filter((id) => !queue.includes(id));
  if (force) add.forEach((id) => forceIds.add(id));
  queue.push(...add);
  setState({ analysis: { ...s.analysis, total: (s.analysis.running ? s.analysis.total : 0) + add.length, done: s.analysis.running ? s.analysis.done : 0, errors: s.analysis.running ? s.analysis.errors : 0, running: true } });
  if (!s.analysis.running) run();
}

export function analyzeUnanalyzed() {
  const ids = getState().tracks.filter((t) => !t.analyzed_at && !t.missing).map((t) => t.id);
  if (!ids.length) return toast("Everything is already analyzed ✓");
  analyzeTracks(ids);
}

export function stopAnalysis() {
  cancelled = true;
  queue = [];
}

async function run() {
  cancelled = false;
  const pool = getWorkers();
  await Promise.all(
    pool.map(async (w) => {
      while (queue.length && !cancelled) {
        const id = queue.shift()!;
        const t = getState().tracks.find((x) => x.id === id);
        if (t) await analyzeOne(w, t);
      }
    }),
  );
  const a = getState().analysis;
  setState({ analysis: { ...a, running: false, current: null } });
  if (a.done) toast(`Analysis finished — ${a.done - a.errors} tracks${a.errors ? `, ${a.errors} failed` : ""}`);
}
