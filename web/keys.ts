// Camelot / musical key helpers and mix-compatibility scoring.

export type Camelot = string; // e.g. "8A"
export type Notation = "camelot" | "musical" | "openkey";

export const CAMELOT_TABLE: { code: Camelot; musical: string; short: string; openkey: string }[] = [];
const MINOR = ["G# / Ab", "D# / Eb", "A# / Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C# / Db"];
const MINOR_SHORT = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "Dbm"];
const MAJOR = ["B", "F# / Gb", "Db / C#", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
const MAJOR_SHORT = ["B", "F#", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E"];
for (let n = 1; n <= 12; n++) {
  const ok = ((n - 8 + 12) % 12) + 1;
  CAMELOT_TABLE.push({ code: `${n}A`, musical: `${MINOR[n - 1]} minor`, short: MINOR_SHORT[n - 1], openkey: `${ok}m` });
  CAMELOT_TABLE.push({ code: `${n}B`, musical: `${MAJOR[n - 1]} major`, short: MAJOR_SHORT[n - 1], openkey: `${ok}d` });
}
const BY_CODE = new Map(CAMELOT_TABLE.map((k) => [k.code, k]));

export function parseCamelot(k: string | null | undefined): { n: number; l: "A" | "B" } | null {
  if (!k) return null;
  const m = k.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 12) return null;
  return { n, l: m[2] as "A" | "B" };
}

/** Accepts "8A", "Am", "A minor", "C#m", "1m"/"1d" (Open Key) → Camelot code. */
export function normalizeKey(input: string): Camelot | null {
  const s = input.trim();
  if (!s) return null;
  if (parseCamelot(s)) return s.toUpperCase();
  const ok = s.toLowerCase().match(/^(\d{1,2})([md])$/);
  if (ok) {
    const n = ((Number(ok[1]) - 1 + 7) % 12) + 1;
    return `${n}${ok[2] === "m" ? "A" : "B"}`;
  }
  const m = s.match(/^([A-Ga-g])([#b♯♭]?)\s*(m|min|minor|maj|major)?$/);
  if (!m) return null;
  const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = PC[m[1].toUpperCase()];
  if (m[2] === "#" || m[2] === "♯") pc += 1;
  if (m[2] === "b" || m[2] === "♭") pc -= 1;
  pc = (pc + 12) % 12;
  const minor = !!m[3] && m[3].startsWith("m") && !m[3].startsWith("maj");
  const MAJ = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
  const MIN = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
  return minor ? `${MIN[pc]}A` : `${MAJ[pc]}B`;
}

export function formatKey(code: string | null | undefined, notation: Notation): string {
  if (!code) return "—";
  const k = BY_CODE.get(code);
  if (!k) return code;
  if (notation === "musical") return k.short;
  if (notation === "openkey") return k.openkey;
  return k.code;
}

export function keyInfo(code: string) {
  return BY_CODE.get(code);
}

/** Color per Camelot position (Mixed-In-Key-style rainbow wheel). */
export function keyColor(code: string | null | undefined, alpha = 1): string {
  const c = parseCamelot(code);
  if (!c) return `rgba(120,120,140,${alpha})`;
  const hue = (((c.n - 1) * 30 + 165) % 360);
  const light = c.l === "B" ? 62 : 52;
  return `hsla(${hue}, 78%, ${light}%, ${alpha})`;
}

const wrap = (n: number) => ((n - 1 + 120) % 12) + 1;

export type KeyRelation = { label: string; short: string; score: number; tone: "perfect" | "good" | "boost" | "risky" | "clash" };

/** How does mixing FROM key a INTO key b sound? */
export function keyRelation(a: string | null | undefined, b: string | null | undefined): KeyRelation | null {
  const x = parseCamelot(a), y = parseCamelot(b);
  if (!x || !y) return null;
  const diff = (y.n - x.n + 12) % 12; // steps clockwise
  if (x.l === y.l) {
    if (diff === 0) return { label: "Same key", short: "Same", score: 1, tone: "perfect" };
    if (diff === 1) return { label: "+1 · Up a fifth (energy lift)", short: "+1", score: 0.92, tone: "perfect" };
    if (diff === 11) return { label: "−1 · Down a fifth (relaxing)", short: "−1", score: 0.9, tone: "perfect" };
    if (diff === 2) return { label: "+2 · Energy boost (whole step up)", short: "+2", score: 0.62, tone: "boost" };
    if (diff === 7) return { label: "+7 · Semitone up (big lift)", short: "+7", score: 0.55, tone: "boost" };
    if (diff === 5) return { label: "−7 · Semitone down", short: "−7", score: 0.4, tone: "risky" };
    if (diff === 10) return { label: "−2 · Whole step down", short: "−2", score: 0.4, tone: "risky" };
    return { label: "Key clash", short: "✕", score: 0, tone: "clash" };
  }
  if (diff === 0) return { label: x.l === "A" ? "Relative major (brighter)" : "Relative minor (darker)", short: "A↔B", score: 0.86, tone: "good" };
  // Diagonal: one step around + flip the letter (8A ↔ 9B, 8A ↔ 7B). Only one note differs.
  if (diff === 1 || diff === 11) return { label: "Diagonal mood shift", short: diff === 1 ? "↗" : "↖", score: 0.6, tone: "good" };
  if ((x.l === "A" && diff === 3) || (x.l === "B" && diff === 9)) return { label: "Parallel major/minor (same root)", short: "∥", score: 0.35, tone: "risky" };
  return { label: "Key clash", short: "✕", score: 0, tone: "clash" };
}

/** Keys that mix well from `code`, ordered best first. */
export function compatibleKeys(code: string | null | undefined): { code: Camelot; rel: KeyRelation }[] {
  const out: { code: Camelot; rel: KeyRelation }[] = [];
  for (const k of CAMELOT_TABLE) {
    const rel = keyRelation(code, k.code);
    if (rel && rel.score >= 0.55) out.push({ code: k.code, rel });
  }
  return out.sort((p, q) => q.rel.score - p.rel.score);
}

export type BpmRelation = { pct: number; factor: number; score: number; label: string };

/** Tempo distance accounting for half/double time. pct is how far you'd pitch track b. */
export function bpmRelation(a: number | null | undefined, b: number | null | undefined): BpmRelation | null {
  if (!a || !b) return null;
  let best = { pct: Infinity, factor: 1 };
  for (const f of [1, 2, 0.5]) {
    const pct = ((a - b * f) / (b * f)) * 100;
    if (Math.abs(pct) < Math.abs(best.pct)) best = { pct, factor: f };
  }
  const d = Math.abs(best.pct);
  const score = d <= 1.5 ? 1 : d <= 3 ? 0.85 : d <= 5 ? 0.6 : d <= 8 ? 0.3 : 0.05;
  const sign = best.pct >= 0 ? "+" : "−";
  const label = `${sign}${Math.abs(best.pct).toFixed(1)}%${best.factor !== 1 ? (best.factor === 2 ? " (double-time)" : " (half-time)") : ""}`;
  return { pct: best.pct, factor: best.factor, score, label };
}

export type Transition = { key: KeyRelation | null; bpm: BpmRelation | null; energyDelta: number | null; score: number };

export function transitionScore(
  from: { musical_key: string | null; bpm: number | null; energy: number | null },
  to: { musical_key: string | null; bpm: number | null; energy: number | null },
): Transition {
  const key = keyRelation(from.musical_key, to.musical_key);
  const bpm = bpmRelation(from.bpm, to.bpm);
  const energyDelta = from.energy != null && to.energy != null ? to.energy - from.energy : null;
  const eScore = energyDelta == null ? 0.6 : energyDelta >= 0 && energyDelta <= 2 ? 1 : energyDelta === -1 ? 0.75 : energyDelta > 2 ? 0.4 : 0.3;
  const score = 0.55 * (key?.score ?? 0.3) + 0.35 * (bpm?.score ?? 0.3) + 0.1 * eScore;
  return { key, bpm, energyDelta, score };
}

export function scoreTone(score: number): "perfect" | "good" | "boost" | "risky" | "clash" {
  if (score >= 0.85) return "perfect";
  if (score >= 0.68) return "good";
  if (score >= 0.5) return "boost";
  if (score >= 0.3) return "risky";
  return "clash";
}
