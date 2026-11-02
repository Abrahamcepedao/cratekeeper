import React, { useRef } from "react";

const KEY = "ck-panel-w";
const DEFAULT = 368;
const MIN = 300;
const maxWidth = () => Math.min(760, window.innerWidth * 0.5);

/** Width lives in a CSS variable on <html>, so dragging never re-renders React. */
function apply(w: number) { document.documentElement.style.setProperty("--panel-w", `${Math.round(w)}px`); }
try { const saved = Number(localStorage.getItem(KEY)); if (saved) apply(saved); } catch {}

/** Past a limit the edge follows less and less, like iOS rubber-banding, instead of stopping dead. */
function rubberband(overshoot: number, dimension = 220, c = 0.55) {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/** Animate the last step into place (used on release and reset). */
function settle(w: number) {
  const root = document.documentElement;
  root.classList.add("panel-settling");
  apply(w);
  setTimeout(() => root.classList.remove("panel-settling"), 320);
}

function save(w: number | null) {
  try { w == null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, String(Math.round(w))); } catch {}
}

/** Drag handle on the details panel's left edge. Double-click resets; ←/→ nudge when focused. */
export function PanelResizer() {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const current = () => document.querySelector(".panel")?.getBoundingClientRect().width ?? DEFAULT;
  const clamp = (w: number) => Math.min(maxWidth(), Math.max(MIN, w));

  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details panel"
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: current() };
        document.documentElement.classList.add("panel-resizing");
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const raw = drag.current.w + (drag.current.x - e.clientX); // the panel grows as the edge moves left
        const lo = MIN, hi = maxWidth();
        apply(raw < lo ? lo - rubberband(lo - raw) : raw > hi ? hi + rubberband(raw - hi) : raw);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const w = clamp(drag.current.w + (drag.current.x - e.clientX));
        drag.current = null;
        document.documentElement.classList.remove("panel-resizing");
        settle(w);
        save(w);
      }}
      onPointerCancel={() => {
        drag.current = null;
        document.documentElement.classList.remove("panel-resizing");
        settle(clamp(current()));
      }}
      onDoubleClick={() => { settle(DEFAULT); save(null); }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        const step = (e.shiftKey ? 64 : 16) * (e.key === "ArrowLeft" ? 1 : -1);
        const w = clamp(current() + step);
        settle(w);
        save(w);
      }}
    />
  );
}
