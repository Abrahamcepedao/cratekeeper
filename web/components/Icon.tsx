import React from "react";

/** Small hand-drawn icon set (24px grid, 1.75 stroke). Filled shapes are marked with `f`. */
const PATHS: Record<string, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  play: <path className="f" d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7z" />,
  pause: <><rect className="f" x="6" y="5" width="4" height="14" rx="1.2" /><rect className="f" x="14" y="5" width="4" height="14" rx="1.2" /></>,
  back: <><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4.5V9h4.5" /></>,
  forward: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4.5V9h-4.5" /></>,
  refresh: <><path d="M19.5 10.5A7.5 7.5 0 0 0 5.6 7.5" /><path d="M5 4v4h4" /><path d="M4.5 13.5a7.5 7.5 0 0 0 13.9 3" /><path d="M19 20v-4h-4" /></>,
  analyze: <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3" />,
  library: <><path d="M9 17.5V6.2l10-2v11.3" /><circle cx="6.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="15.5" r="2.5" /></>,
  pending: <><circle cx="12" cy="12" r="8" strokeDasharray="2.6 3.2" /><circle className="f" cx="12" cy="12" r="1.6" /></>,
  wheel: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="M12 3.5v4.5M12 16v4.5M3.5 12H8M16 12h4.5" /></>,
  book: <><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v14.5H6.8A1.8 1.8 0 0 0 5 19.3z" /><path d="M5 19.3A1.8 1.8 0 0 0 6.8 21H19v-3.5" /><path d="M9 7.5h6" /></>,
  sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  crate: <><rect x="3" y="4" width="18" height="5" rx="1.2" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 13h4" /></>,
  set: <><path d="M10 6.5h10M10 12h10M10 17.5h10" /><circle className="f" cx="5" cy="6.5" r="1.4" /><circle className="f" cx="5" cy="12" r="1.4" /><circle className="f" cx="5" cy="17.5" r="1.4" /></>,
  folder: <path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  export: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></>,
  sparkle: <path className="f" d="M12 3.5l1.7 5 5 1.7-5 1.7-1.7 5-1.7-5-5-1.7 5-1.7zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  live: <><circle className="f" cx="12" cy="12" r="2" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></>,
  bolt: <path className="f" d="M13.2 2.8L5 13.5h6.2l-1 7.7 8.3-10.8h-6.3z" />,
  note: <path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5z" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  waveform: <path d="M3 12h2l2-5 3 10 3-13 3 11 2-5h3" />,
  skipNext: <><path className="f" d="M5.5 6.3v11.4a.8.8 0 0 0 1.2.7l8.6-5.7a.8.8 0 0 0 0-1.4L6.7 5.6a.8.8 0 0 0-1.2.7z" /><rect className="f" x="16.5" y="5.5" width="2.6" height="13" rx="1.1" /></>,
  skipPrev: <><path className="f" d="M18.5 6.3v11.4a.8.8 0 0 1-1.2.7l-8.6-5.7a.8.8 0 0 1 0-1.4l8.6-5.7a.8.8 0 0 1 1.2.7z" /><rect className="f" x="4.9" y="5.5" width="2.6" height="13" rx="1.1" /></>,
  queue: <><rect x="4" y="9.5" width="16" height="10.5" rx="2" /><path d="M6.5 6h11M9 2.75h6" /></>,
  queueAdd: <><path d="M4 6.5h11M4 11.5h11M4 16.5h6.5" /><path d="M17.5 13.5v7M14 17h7" /></>,
  crossfade: <path d="M3 7.5c5.5 0 9.5 9 18 9M3 16.5c5.5 0 9.5-9 18-9" />,
  autoplay: <><path d="M4 6.5h12M4 11.5h12M4 16.5h5.5" /><path className="f" d="M13 14.3v5.4a.6.6 0 0 0 .9.5l4.5-2.7a.6.6 0 0 0 0-1l-4.5-2.7a.6.6 0 0 0-.9.5z" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = "", title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}

/** Spinning record: the brand mark. Rotates while audio plays (see [data-playing]). */
export function BrandMark({ size = 26 }: { size?: number }) {
  return <span className="brand-mark" style={{ width: size, height: size }} aria-hidden />;
}
