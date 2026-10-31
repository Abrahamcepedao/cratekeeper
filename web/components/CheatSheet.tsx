import React, { useState } from "react";
import { CAMELOT_TABLE, compatibleKeys, formatKey, keyColor, type Notation } from "../keys";
import { useStore } from "../store";
import { KeyWheel } from "./KeyWheel";
import { KeyBadge } from "./common";

const MOVES: { from: string; to: string; name: string; feel: string; tone: string }[] = [
  { from: "8A", to: "8A", name: "Same key", feel: "Seamless. Blend for as long as you like.", tone: "perfect" },
  { from: "8A", to: "9A", name: "+1 (clockwise)", feel: "Up a fifth. Subtle lift, the most common move.", tone: "perfect" },
  { from: "8A", to: "7A", name: "−1 (counter-clockwise)", feel: "Down a fifth. Smooth, slightly calmer.", tone: "perfect" },
  { from: "8A", to: "8B", name: "Swap letter (A ↔ B)", feel: "Relative major/minor. Same notes, new mood: A→B brighter, B→A darker.", tone: "good" },
  { from: "8A", to: "9B", name: "Diagonal", feel: "One step around the clock and flip the letter (8A ↔ 9B or 7B). Only one note changes, so it blends with a clear mood shift.", tone: "good" },
  { from: "8A", to: "10A", name: "+2 Energy boost", feel: "Whole step up. Noticeable lift — use it after a breakdown.", tone: "boost" },
  { from: "8A", to: "3A", name: "+7 Semitone lift", feel: "Up one semitone. The classic ‘key change’ boost; do it quick, on a drop.", tone: "boost" },
];

export function CheatSheet() {
  const notation = useStore((s) => s.settings.keyNotation);
  const [focus, setFocus] = useState("8A");
  const compat = compatibleKeys(focus);
  return (
    <div className="cheatsheet">
      <header className="cs-hero">
        <div>
          <h1>Harmonic mixing cheat sheet</h1>
          <p className="muted">Mixing tracks whose keys are related makes blends sound musical instead of muddy. The Camelot wheel turns music theory into a few simple moves.</p>
        </div>
      </header>

      <div className="cs-grid">
        <section className="cs-card cs-wheel">
          <h2>1 · Read the wheel like a clock</h2>
          <div className="cs-wheel-row">
            <KeyWheel size={340} current={focus} onSelect={setFocus} notation={notation} />
            <div>
              <p><b>Number</b> = position on the clock (1–12). Neighbours share almost all their notes.</p>
              <p><b>Letter</b> = mood. <span className="pill pill-a">A</span> inner ring = minor (darker). <span className="pill pill-b">B</span> outer ring = major (brighter).</p>
              <p className="muted small">Click any key on the wheel to see where you can go from it.</p>
              <div className="cs-compat">
                <div className="muted small">From <KeyBadge code={focus} notation={notation} size="sm" /> you can mix into:</div>
                {compat.map(({ code, rel }) => (
                  <div key={code} className="cs-compat-row">
                    <KeyBadge code={code} notation={notation} size="sm" />
                    <span className={`rel rel-${rel.tone}`}>{rel.short}</span>
                    <span className="small">{rel.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="cs-card">
          <h2>2 · The safe moves (example from 8A = A minor)</h2>
          <table className="cs-table">
            <tbody>
              {MOVES.map((m) => (
                <tr key={m.name}>
                  <td className="nowrap"><KeyBadge code={m.from} notation={notation} size="sm" /> → <KeyBadge code={m.to} notation={notation} size="sm" /></td>
                  <td><b className={`rel-text rel-${m.tone}`}>{m.name}</b><div className="muted small">{m.feel}</div></td>
                </tr>
              ))}
              <tr>
                <td className="nowrap"><KeyBadge code="8A" notation={notation} size="sm" /> → <KeyBadge code="2A" notation={notation} size="sm" /></td>
                <td><b className="rel-text rel-clash">Anything else</b><div className="muted small">Likely to clash. Only blend over drums-only intros/outros, or cut quickly.</div></td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">Rule of thumb: <b>stay put, step one number, or flip the letter.</b> Everything else is a deliberate energy move.</p>
        </section>

        <section className="cs-card">
          <h2>3 · Tempo (BPM) rules</h2>
          <ul className="cs-list">
            <li><b>Within ±3%</b> — sounds natural. 124 → 120–128 is comfortable.</li>
            <li><b>Up to ±6%</b> — fine with <b>Master Tempo</b> (key lock) on in Rekordbox. Beyond that vocals and synths start to warp.</li>
            <li><b>Half / double time</b> — 87 BPM can mix with 174 BPM. The app accounts for this in its match score.</li>
            <li><b>Without key lock, pitching changes the key:</b> about every 6% = 1 semitone = <b>7 steps on the wheel</b>. Pitching an 8A track up ~6% makes it sound like 3A.</li>
            <li>Move tempo gradually across a set — a couple of BPM per track, or a deliberate jump during a breakdown.</li>
          </ul>
        </section>

        <section className="cs-card">
          <h2>4 · Energy flow</h2>
          <div className="cs-energy">
            {[[1, 3, "Warm-up / ambient — open the room, deep grooves"], [4, 6, "Building — groovy, steady, keep people moving"], [7, 8, "Peak — driving, big drops, recognisable hooks"], [9, 10, "Climax — save for the very top of the night"]].map(([a, b, t]) => (
              <div key={String(a)} className="cs-energy-row">
                <span className="cs-energy-num" style={{ background: `hsl(${140 - Number(b) * 13}, 75%, 45%)` }}>{a}–{b}</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <ul className="cs-list">
            <li>Build in <b>waves</b>: two or three tracks up, one to breathe, then up again.</li>
            <li>Combine moves: a +1 key step <i>and</i> +1 energy feels like progress; a −1 step is a natural cool-down.</li>
            <li>Rate energy on your own tracks (the bar in the track panel) — the set builder draws your energy curve from it.</li>
          </ul>
        </section>

        <section className="cs-card">
          <h2>5 · Using this app while you play</h2>
          <ol className="cs-list">
            <li>Load the track that's playing in Rekordbox, find it here and press <b>◎ Go live</b> (or <kbd>L</kbd>).</li>
            <li>Every list now ranks by <b>Match</b> — how well each track mixes out of the one on deck (key 55%, tempo 35%, energy 10%).</li>
            <li>Preview candidates with <kbd>P</kbd> (jumps past the intro), pick one, load it in Rekordbox.</li>
            <li>When it's playing, hit <b>Go live</b> on it — the previous track is marked as played and hidden from suggestions.</li>
          </ol>
          <p className="muted small">Search tricks: <code>key:8A+</code> (8A and everything compatible), <code>bpm:122-126</code>, <code>energy:&gt;=7</code>, <code>tag:peak-time -tag:vocal</code>, <code>is:unanalyzed</code>.</p>
        </section>

        <section className="cs-card">
          <h2>6 · Trust your ears</h2>
          <ul className="cs-list">
            <li>Key detection is very good but not perfect — check tracks with low key confidence (under ~0.6) by ear.</li>
            <li>Percussive tools and drum loops are basically key-free; mix them anywhere.</li>
            <li>Two vocals at once rarely works, even in the same key.</li>
            <li>A clash during a 16-bar drum intro is fine; a clash across two melodic breakdowns is not.</li>
          </ul>
        </section>

        <section className="cs-card cs-wide">
          <h2>7 · All 24 keys</h2>
          <div className="cs-keytable">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <div key={n} className="cs-keycol">
                {(["B", "A"] as const).map((l) => {
                  const k = CAMELOT_TABLE.find((x) => x.code === `${n}${l}`)!;
                  return (
                    <div key={l} className="cs-key" style={{ borderColor: keyColor(k.code, 0.6), background: keyColor(k.code, 0.12) }} onClick={() => setFocus(k.code)}>
                      <b style={{ color: keyColor(k.code) }}>{k.code}</b>
                      <span>{k.musical}</span>
                      <small className="muted">Open Key {k.openkey}</small>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="muted small">Rekordbox shows musical keys (e.g. “Am”) by default; you can switch it to Camelot-style alphanumeric in its preferences. Switch this app's display under Settings.</p>
        </section>
      </div>
    </div>
  );
}
