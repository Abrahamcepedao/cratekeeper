import React from "react";
import { formatKey, keyColor, keyRelation, type Notation } from "../keys";

type Props = {
  size?: number;
  current?: string | null; // key of the playing / selected track
  counts?: Map<string, number>;
  selected?: Set<string>;
  onSelect?: (code: string) => void;
  notation?: Notation;
  showRelations?: boolean;
};

const TAU = Math.PI * 2;

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
}

/** Camelot wheel laid out like a clock: 12 at the top, numbers increase clockwise. Outer ring = major (B), inner = minor (A). */
export function KeyWheel({ size = 300, current, counts, selected, onSelect, notation = "camelot", showRelations = true }: Props) {
  const c = size / 2;
  const rOuter = c - 4, rMid = c * 0.68, rInner = c * 0.38;
  const maxCount = counts ? Math.max(1, ...counts.values()) : 1;

  const segs: React.ReactNode[] = [];
  for (let n = 1; n <= 12; n++) {
    const center = ((n % 12) / 12) * TAU;
    const a0 = center - TAU / 24 + 0.012, a1 = center + TAU / 24 - 0.012;
    for (const l of ["B", "A"] as const) {
      const code = `${n}${l}`;
      const [r0, r1] = l === "B" ? [rMid + 1.5, rOuter] : [rInner, rMid - 1.5];
      const rel = current && showRelations ? keyRelation(current, code) : null;
      const isCurrent = current === code;
      const isSel = selected?.has(code);
      const count = counts?.get(code) ?? 0;
      let opacity = counts ? 0.25 + 0.75 * (count / maxCount) : 0.85;
      if (current && showRelations) opacity = isCurrent ? 1 : rel && rel.score >= 0.55 ? 0.85 : 0.12;
      const mid = (r0 + r1) / 2;
      const tx = c + mid * Math.sin(center), ty = c - mid * Math.cos(center);
      segs.push(
        <g key={code} className={`wheel-seg ${onSelect ? "clickable" : ""}`} onClick={() => onSelect?.(code)}>
          <path
            d={arc(c, c, r0, r1, a0, a1)}
            fill={keyColor(code, opacity)}
            stroke={isCurrent ? "#fff" : isSel ? "#fff" : "rgba(0,0,0,0.35)"}
            strokeWidth={isCurrent ? 3 : isSel ? 2 : 1}
          >
            <title>{`${formatKey(code, "camelot")} · ${formatKey(code, "musical")}${counts ? ` · ${count} track${count === 1 ? "" : "s"}` : ""}${rel ? ` · ${rel.label}` : ""}`}</title>
          </path>
          <text x={tx} y={ty - (counts && size > 220 ? 4 : 0)} textAnchor="middle" dominantBaseline="middle" className="wheel-label" style={{ fontSize: size / (l === "B" ? 22 : 24), opacity: current && showRelations && !isCurrent && !(rel && rel.score >= 0.55) ? 0.35 : 1 }}>
            {formatKey(code, notation)}
          </text>
          {counts && size > 220 && (
            <text x={tx} y={ty + size / 30} textAnchor="middle" dominantBaseline="middle" className="wheel-count" style={{ fontSize: size / 34 }}>
              {count || ""}
            </text>
          )}
          {rel && !isCurrent && rel.score >= 0.55 && size > 220 && (
            <text x={c + (l === "B" ? rOuter - 9 : rInner + 9) * Math.sin(center)} y={c - (l === "B" ? rOuter - 9 : rInner + 9) * Math.cos(center)} textAnchor="middle" dominantBaseline="middle" className="wheel-rel" style={{ fontSize: size / 40 }}>
              {rel.short}
            </text>
          )}
        </g>,
      );
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="key-wheel">
      {segs}
      <circle cx={c} cy={c} r={rInner - 3} fill="var(--bg-2)" />
      <text x={c} y={c - size / 40} textAnchor="middle" className="wheel-center" style={{ fontSize: size / 11 }}>{current ? formatKey(current, notation) : "♪"}</text>
      <text x={c} y={c + size / 14} textAnchor="middle" className="wheel-center-sub" style={{ fontSize: size / 30 }}>{current ? formatKey(current, notation === "musical" ? "camelot" : "musical") : "Camelot"}</text>
    </svg>
  );
}
