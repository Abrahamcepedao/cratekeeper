import { transitionScore, type Transition } from "./keys";
import type { Track } from "./store";

export type Suggestion = { track: Track; t: Transition };

export function suggestNext(from: Track, pool: Track[], exclude: Set<number>, limit = 30): Suggestion[] {
  const out: Suggestion[] = [];
  for (const c of pool) {
    if (c.id === from.id || exclude.has(c.id) || c.missing) continue;
    if (!c.musical_key && !c.bpm) continue;
    out.push({ track: c, t: transitionScore(from, c) });
  }
  out.sort((a, b) => b.t.score - a.t.score || (b.track.rating ?? 0) - (a.track.rating ?? 0));
  return out.slice(0, limit);
}
