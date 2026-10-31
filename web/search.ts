import { normalizeKey, keyRelation } from "./keys";
import type { Track, Tag } from "./store";

/**
 * Search syntax (combine freely):
 *   free text           matches title, artist, album, genre, label, notes, tags, filename
 *   "exact phrase"
 *   -word               exclude
 *   bpm:124  bpm:120-128  bpm:>125  bpm:<=122
 *   key:8A   key:Am   key:8A+  (8A plus every compatible key)
 *   tag:peak-time  -tag:vocal
 *   energy:>=7   rating:>=4   year:2024   genre:techno   artist:kairo
 *   is:unanalyzed  is:analyzed  is:missing  is:untagged  has:notes
 */
type Pred = (t: Track) => boolean;

function numCmp(spec: string): ((v: number | null) => boolean) | null {
  const range = spec.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const a = Number(range[1]), b = Number(range[2]);
    return (v) => v != null && v >= Math.min(a, b) && v <= Math.max(a, b);
  }
  const op = spec.match(/^(>=|<=|>|<|=)?\s*(\d+(?:\.\d+)?)$/);
  if (!op) return null;
  const n = Number(op[2]);
  switch (op[1]) {
    case ">": return (v) => v != null && v > n;
    case "<": return (v) => v != null && v < n;
    case ">=": return (v) => v != null && v >= n;
    case "<=": return (v) => v != null && v <= n;
    default: return (v) => v != null && Math.round(v) === Math.round(n);
  }
}

function tokenize(q: string): string[] {
  const out: string[] = [];
  const re = /(-?\w+:"[^"]*"|-?"[^"]*"|\S+)/g;
  let m;
  while ((m = re.exec(q))) out.push(m[1]);
  return out;
}

export function buildFilter(query: string, tags: Tag[], trackTags: Map<number, Set<number>>): Pred {
  const preds: Pred[] = [];
  const tagName = new Map(tags.map((t) => [t.id, t.name.toLowerCase()]));
  const tagsOf = (t: Track) => [...(trackTags.get(t.id) ?? [])].map((id) => tagName.get(id) ?? "");

  for (let tok of tokenize(query.trim())) {
    let neg = false;
    if (tok.startsWith("-") && tok.length > 1) { neg = true; tok = tok.slice(1); }
    const unq = (s: string) => s.replace(/^"|"$/g, "").toLowerCase();
    let p: Pred | null = null;
    const field = tok.match(/^(\w+):(.*)$/);
    if (field) {
      const [, f, rawV] = field;
      const v = unq(rawV);
      switch (f.toLowerCase()) {
        case "bpm": { const c = numCmp(v); if (c) p = (t) => c(t.bpm); break; }
        case "energy": { const c = numCmp(v); if (c) p = (t) => c(t.energy); break; }
        case "rating": { const c = numCmp(v); if (c) p = (t) => c(t.rating); break; }
        case "year": { const c = numCmp(v); if (c) p = (t) => c(t.year); break; }
        case "key": {
          const plus = v.endsWith("+");
          const k = normalizeKey(plus ? v.slice(0, -1) : v);
          if (k) p = plus ? (t) => (keyRelation(k, t.musical_key)?.score ?? 0) >= 0.55 : (t) => t.musical_key === k;
          break;
        }
        case "tag": p = (t) => tagsOf(t).some((n) => n === v || n.startsWith(v)); break;
        case "genre": p = (t) => (t.genre ?? "").toLowerCase().includes(v); break;
        case "artist": p = (t) => (t.artist ?? "").toLowerCase().includes(v); break;
        case "title": p = (t) => (t.title ?? "").toLowerCase().includes(v); break;
        case "album": p = (t) => (t.album ?? "").toLowerCase().includes(v); break;
        case "label": p = (t) => (t.label ?? "").toLowerCase().includes(v); break;
        case "ext": case "type": p = (t) => t.ext === v; break;
        case "is":
          if (v === "unanalyzed") p = (t) => !t.analyzed_at;
          else if (v === "analyzed") p = (t) => !!t.analyzed_at && !t.analysis_error;
          else if (v === "missing") p = (t) => !!t.missing;
          else if (v === "untagged") p = (t) => !(trackTags.get(t.id)?.size);
          else if (v === "error") p = (t) => !!t.analysis_error;
          break;
        case "has":
          if (v === "notes") p = (t) => !!t.notes?.trim();
          else if (v === "art" || v === "artwork") p = (t) => !!t.has_artwork;
          else if (v === "energy") p = (t) => t.energy != null;
          break;
      }
    }
    if (!p) {
      const needle = unq(tok);
      if (!needle) continue;
      p = (t) =>
        [t.title, t.artist, t.album, t.genre, t.label, t.notes, t.filename, ...tagsOf(t)]
          .some((s) => (s ?? "").toLowerCase().includes(needle));
    }
    const fp = p;
    preds.push(neg ? (t) => !fp(t) : fp);
  }
  return (t) => preds.every((p) => p(t));
}
