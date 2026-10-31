import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import { KeyWheel } from "./KeyWheel";
import { TrackTable } from "./TrackTable";
import { keyRelation, formatKey } from "../keys";
import { buildFilter } from "../search";

export function WheelView() {
  const tracks = useStore((s) => s.tracks);
  const notation = useStore((s) => s.settings.keyNotation);
  const query = useStore((s) => s.query);
  const tags = useStore((s) => s.tags);
  const trackTags = useStore((s) => s.trackTags);
  const deck = useStore((s) => s.tracks.find((t) => t.id === s.deckId));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withCompat, setWithCompat] = useState(false);

  const filter = useMemo(() => buildFilter(query, tags, trackTags), [query, tags, trackTags]);
  const base = useMemo(() => tracks.filter((t) => !t.missing).filter(filter), [tracks, filter]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of base) if (t.musical_key) m.set(t.musical_key, (m.get(t.musical_key) ?? 0) + 1);
    return m;
  }, [base]);

  const bpmHist = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of base) if (t.bpm) { const b = Math.round(t.bpm); m.set(b, (m.get(b) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [base]);
  const [bpmSel, setBpmSel] = useState<number | null>(null);

  const shown = useMemo(() => {
    let list = base;
    if (selected.size) {
      list = list.filter((t) => t.musical_key && (selected.has(t.musical_key) || (withCompat && [...selected].some((k) => (keyRelation(k, t.musical_key)?.score ?? 0) >= 0.55))));
    }
    if (bpmSel != null) list = list.filter((t) => t.bpm && Math.abs(t.bpm - bpmSel) <= 3);
    return list;
  }, [base, selected, withCompat, bpmSel]);

  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const maxH = Math.max(1, ...bpmHist.map((x) => x[1]));
  const unkeyed = base.filter((t) => !t.musical_key).length;

  return (
    <div className="wheel-view">
      <div className="wheel-top">
        <div className="wheel-left">
          <KeyWheel size={360} counts={counts} selected={selected} onSelect={toggle} notation={notation} current={selected.size === 0 ? deck?.musical_key : null} showRelations={selected.size === 0 && !!deck} />
        </div>
        <div className="wheel-side">
          <h2>Your library by key</h2>
          <p className="muted">Brighter = more tracks. Click keys to filter{deck && selected.size === 0 ? <> · highlighting what mixes out of the live track (<b>{formatKey(deck.musical_key, notation)}</b>)</> : null}.</p>
          <div className="row">
            <label className="check"><input type="checkbox" checked={withCompat} onChange={(e) => setWithCompat(e.target.checked)} /> Include compatible keys</label>
            {(selected.size > 0 || bpmSel != null) && <button className="btn btn-sm" onClick={() => { setSelected(new Set()); setBpmSel(null); }}>Clear</button>}
          </div>
          <h4>Tempo distribution</h4>
          <div className="bpm-hist">
            {bpmHist.map(([b, c]) => (
              <div key={b} className={`bpm-bar ${bpmSel != null && Math.abs(b - bpmSel) <= 3 ? "on" : ""}`} title={`${b} BPM · ${c} tracks`} onClick={() => setBpmSel(bpmSel === b ? null : b)}>
                <i style={{ height: `${(c / maxH) * 100}%` }} />
                <span>{b % 2 === 0 ? b : ""}</span>
              </div>
            ))}
            {bpmHist.length === 0 && <span className="muted small">Analyze your library to see tempos.</span>}
          </div>
          {unkeyed > 0 && <p className="muted small">{unkeyed} tracks have no key yet.</p>}
        </div>
      </div>
      <TrackTable tracks={shown} reference={deck} emptyHint="Pick a key on the wheel." />
    </div>
  );
}
