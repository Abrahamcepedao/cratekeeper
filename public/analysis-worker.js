/* Cratekeeper analysis worker — key + BPM detection with Essentia (WASM).
 * Receives mono 44.1 kHz PCM, returns { bpm, bpmRaw, key, keyStrength, peaks }. */
// The WASM build ends with `exports.EssentiaWASM = Module`, so give it an exports object.
self.exports = {};
importScripts("/vendor/essentia-wasm.umd.js", "/vendor/essentia.js-core.umd.js");

let essentia = null;

async function getEssentia() {
  if (essentia) return essentia;
  const W = self.exports.EssentiaWASM || self.Module;
  for (let i = 0; i < 200 && !W.EssentiaJS; i++) await new Promise((r) => setTimeout(r, 25));
  essentia = new self.Essentia(W);
  return essentia;
}

const SR = 44100;
// Essentia key names → Camelot
const PC = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1]; // index = pitch class
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

function toCamelot(key, scale) {
  const pc = PC[key];
  if (pc === undefined) return null;
  return scale === "minor" ? `${CAMELOT_MINOR[pc]}A` : `${CAMELOT_MAJOR[pc]}B`;
}

function middle(signal, seconds, rate) {
  const n = Math.floor(seconds * rate);
  if (signal.length <= n) return signal;
  const start = Math.floor((signal.length - n) / 2);
  return signal.subarray(start, start + n);
}

function downsample2(sig) {
  const out = new Float32Array(sig.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (sig[2 * i] + sig[2 * i + 1]) * 0.5;
  return out;
}

/** Fold half/double-time readings into a DJ-friendly range and snap near-integers. */
function foldBpm(bpm, min = 85, max = 175) {
  if (!bpm || !isFinite(bpm)) return null;
  while (bpm < min) bpm *= 2;
  while (bpm >= max) bpm /= 2;
  const r = Math.round(bpm);
  return Math.abs(bpm - r) < 0.35 ? r : Math.round(bpm * 10) / 10;
}

function computePeaks(sig, bins = 600) {
  const step = Math.max(1, Math.floor(sig.length / bins));
  const peaks = new Array(bins).fill(0);
  let max = 0;
  for (let b = 0; b < bins; b++) {
    let m = 0;
    const end = Math.min(sig.length, (b + 1) * step);
    for (let i = b * step; i < end; i += 4) {
      const v = Math.abs(sig[i]);
      if (v > m) m = v;
    }
    peaks[b] = m;
    if (m > max) max = m;
  }
  return peaks.map((p) => Math.round((p / (max || 1)) * 100));
}

self.onmessage = async (e) => {
  const { id, pcm, bpmMin, bpmMax } = e.data;
  try {
    const ess = await getEssentia();
    const signal = new Float32Array(pcm);
    if (signal.length < SR * 5) throw new Error("Track too short to analyze");

    // BPM: 90 s from the middle at full rate (best tempo precision).
    const bpmSig = middle(signal, 90, SR);
    const bv = ess.arrayToVector(bpmSig);
    const rhythm = ess.PercivalBpmEstimator(bv, 1024, 2048, 128, 128, 210, 50, SR);
    bv.delete && bv.delete();

    // Key: up to 6 min from the middle at 22.05 kHz using the EDM key profile.
    const keySig = downsample2(middle(signal, 360, SR));
    const kv = ess.arrayToVector(keySig);
    const k = ess.KeyExtractor(kv, true, 4096, 4096, 12, 3500, 60, 25, 0.2, "edma", SR / 2, 0.0001, 440, "cosine", "hann");
    kv.delete && kv.delete();

    self.postMessage({
      id,
      ok: true,
      result: {
        bpmRaw: Math.round(rhythm.bpm * 100) / 100,
        bpm: foldBpm(rhythm.bpm, bpmMin, bpmMax),
        key: toCamelot(k.key, k.scale),
        keyStrength: Math.round(k.strength * 100) / 100,
        peaks: computePeaks(signal),
      },
    });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
