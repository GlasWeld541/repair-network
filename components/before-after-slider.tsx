'use client';

import { useRef, useState } from 'react';

/**
 * Draggable before/after comparison. The "after" photo is the base layer; the "before"
 * photo is stacked on top and revealed from the left up to the handle position via
 * clip-path (both images are full-size + object-cover, so nothing squishes). Drag the
 * handle on the image or use the range slider below. No external dependency.
 */
export default function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Before',
  afterLabel = 'After',
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  function moveToClientX(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          moveToClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) moveToClientX(e.clientX);
        }}
      >
        {/* After = base layer */}
        <img
          src={afterUrl}
          alt={afterLabel}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />

        {/* Before = clipped overlay, revealed from the left up to `pos` */}
        <img
          src={beforeUrl}
          alt={beforeLabel}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />

        {/* Labels */}
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs font-medium text-white">
          {afterLabel}
        </span>

        {/* Handle */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
          <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.25)]" />
          <div className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-soft">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
              <polyline points="9 18 15 12 9 6" transform="translate(6 0)" />
            </svg>
          </div>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Reveal before versus after"
        className="mt-3 w-full accent-brand-600"
      />
    </div>
  );
}
