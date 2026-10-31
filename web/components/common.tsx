import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatKey, keyColor, type Notation } from "../keys";
import type { Tag } from "../store";
import { Icon } from "./Icon";

export function KeyBadge({ code, notation, size = "md", dim }: { code: string | null | undefined; notation: Notation; size?: "sm" | "md" | "lg"; dim?: boolean }) {
  if (!code) return <span className={`key-badge key-${size} key-empty`}>—</span>;
  return (
    <span className={`key-badge key-${size}`} style={{ background: keyColor(code, dim ? 0.18 : 0.22), color: keyColor(code), borderColor: keyColor(code, 0.55) }}>
      {formatKey(code, notation)}
    </span>
  );
}

export function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const v = hover ?? value ?? 0;
  return (
    <span className={`stars ${onChange ? "editable" : ""}`} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= v ? "on" : ""}
          onMouseEnter={() => onChange && setHover(i)}
          onClick={(e) => { e.stopPropagation(); onChange?.(value === i ? null : i); }}
        >★</span>
      ))}
    </span>
  );
}

export function EnergyBar({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const v = hover ?? value ?? 0;
  return (
    <span className={`energy ${onChange ? "editable" : ""}`} onMouseLeave={() => setHover(null)} title={value ? `Energy ${value}/10` : "Set energy"}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => (
        <span
          key={i}
          className={i <= v ? "on" : ""}
          style={i <= v ? { background: `hsl(${140 - i * 13}, 68%, 56%)` } : undefined}
          onMouseEnter={() => onChange && setHover(i)}
          onClick={(e) => { e.stopPropagation(); onChange?.(value === i ? null : i); }}
        />
      ))}
      {onChange && <b>{value ?? "–"}</b>}
    </span>
  );
}

export function TagChip({ tag, onRemove, onClick, active }: { tag: Tag; onRemove?: () => void; onClick?: () => void; active?: boolean }) {
  return (
    <span className={`tag-chip ${active ? "active" : ""}`} style={{ ["--tag" as any]: tag.color }} onClick={onClick}>
      {tag.name}
      {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
    </span>
  );
}

export function fmtDuration(s: number | null | undefined) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function fmtBpm(b: number | null | undefined) {
  if (!b) return "—";
  return Number.isInteger(b) ? String(b) : b.toFixed(1);
}

/** Cover art, or a small record whose label takes the track's key color. */
export function Artwork({ trackId, hasArt, size = 40, keyCode }: { trackId: number; hasArt: boolean; size?: number; keyCode?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [trackId]);
  if (!hasArt || failed)
    return (
      <div className={`art art-empty ${keyCode ? "keyed" : ""}`} style={{ width: size, height: size, ["--label" as any]: keyCode ? keyColor(keyCode) : undefined }}>
        <i />
      </div>
    );
  return <img className="art" src={`/api/tracks/${trackId}/art`} width={size} height={size} onError={() => setFailed(true)} loading="lazy" alt="" />;
}

/** Inline-editable text. */
export function Editable({ value, onSave, placeholder, className, multiline }: { value: string; onSave: (v: string) => void; placeholder?: string; className?: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const ref = useRef<any>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const commit = () => { setEditing(false); if (v !== value) onSave(v); };
  if (!editing)
    return (
      <span className={`editable ${className ?? ""} ${!value ? "placeholder" : ""}`} onClick={() => setEditing(true)} title="Click to edit">
        {value || placeholder || "—"}
      </span>
    );
  const props = {
    ref, value: v, className: `editable-input ${className ?? ""}`,
    onChange: (e: any) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (!multiline || e.metaKey)) { e.preventDefault(); commit(); }
      if (e.key === "Escape") { setV(value); setEditing(false); }
    },
  };
  return multiline ? <textarea {...props} rows={4} /> : <input {...props} />;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  // Portaled: glass surfaces use backdrop-filter, which would otherwise trap fixed-position overlays.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export type MenuItem = { label: string; onClick?: () => void; danger?: boolean; sub?: MenuItem[]; divider?: boolean; hint?: string };

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  useEffect(() => {
    const h = () => onClose();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => window.addEventListener("mousedown", h), 0);
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - items.length * 32 - 20);
  // Grow out of the click point, even when the menu had to shift to stay on screen.
  const origin = `${x - left}px ${y - top}px`;
  return createPortal(
    <div className="ctx-menu ctx-root" style={{ left, top, transformOrigin: origin }} onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it, i) =>
        it.divider ? <div key={i} className="ctx-divider" /> : (
          <div
            key={i}
            className={`ctx-item ${it.danger ? "danger" : ""}`}
            onMouseEnter={() => setOpenSub(it.sub ? i : null)}
            onClick={() => { if (!it.sub) { it.onClick?.(); onClose(); } }}
          >
            <span>{it.label}</span>
            {it.hint && <small>{it.hint}</small>}
            {it.sub && <span className="ctx-arrow"><Icon name="chevronRight" size={14} /></span>}
            {it.sub && openSub === i && (
              <div className="ctx-menu ctx-sub">
                {it.sub.length === 0 && <div className="ctx-item muted">Nothing here yet</div>}
                {it.sub.map((s, j) => (
                  <div key={j} className="ctx-item" onClick={(e) => { e.stopPropagation(); s.onClick?.(); onClose(); }}>{s.label}</div>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </div>,
    document.body,
  );
}
