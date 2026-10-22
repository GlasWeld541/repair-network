'use client';

/**
 * The customer's windshield photo with the spots they marked in SmartScan drawn on it (numbered
 * when there is more than one), as Rex's old request queue showed it. Marks are fractions (0..1)
 * of the photo's width and height, so the image keeps its own aspect ratio (no cropping) for the
 * pins to land where the customer tapped. Tap the photo to open it full size.
 */
export type DamageMark = { x: number; y: number };

export default function MarkedWindshield({
  url,
  marks,
  className = '',
}: {
  url: string;
  marks: DamageMark[];
  className?: string;
}) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`block ${className}`}>
      {/* Capped height (10/22: a tall phone photo filled the screen). The frame shrinks to the
          photo's own size, so the pins still land where the customer tapped. */}
      <div className="relative inline-block max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 align-top">
        <img
          src={url}
          alt="Customer's windshield with the marked damage"
          className="block h-auto max-h-72 w-auto max-w-full"
        />
        {marks.map((m, i) => (
          <span
            key={i}
            className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-[10px] font-bold text-white shadow"
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          >
            {marks.length > 1 ? i + 1 : ''}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[11px] font-medium text-slate-500">
        {marks.length > 1 ? `Customer marked ${marks.length} spots` : 'Where the customer marked the damage'}
      </div>
    </a>
  );
}
