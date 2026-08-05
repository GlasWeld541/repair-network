// Skeleton loaders — lightweight shimmer placeholders shown while a page's
// Supabase data is still fetching. They mirror the real layout (page header,
// stat tiles, cards, table rows) so content swaps in without a jarring reflow,
// replacing the old bare "Loading..." text and the empty-table-then-pop flash.
import type { CSSProperties } from 'react';

/**
 * Base shimmer block that everything else is composed from.
 *
 * Defaults to a slate fill + small radius. Pass any `bg-*` (e.g. `bg-white/20`
 * on a dark surface) or `rounded-*` in `className` to override — the defaults
 * step aside so the override wins. `animate-pulse` is dropped automatically for
 * visitors who prefer reduced motion.
 */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  const hasBg = /(?:^|\s)bg-/.test(className);

  return (
    <div
      aria-hidden
      style={style}
      className={`animate-pulse rounded ${hasBg ? '' : 'bg-slate-200'} motion-reduce:animate-none ${className}`}
    />
  );
}

/** Page title + subtitle, with an optional right-aligned action button. */
export function SkeletonPageHeader({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-2.5">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      {withAction ? <Skeleton className="h-10 w-28 rounded-xl" /> : null}
    </div>
  );
}

/** The row of small stat tiles used on the jobs ledger and a few admin pages. */
export function SkeletonStatCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-6 w-28" />
        </div>
      ))}
    </div>
  );
}

/** A generic white info card: a heading followed by a few text lines. */
export function SkeletonCard({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-soft ${className}`}
    >
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-1/2' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * Just the shimmer `<tr>` rows — drop straight into an existing `<tbody>` so a
 * list keeps its real table chrome (header, column widths) while data loads.
 */
export function SkeletonRows({
  columns,
  rows = 6,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t border-slate-100">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton
                className={`h-4 ${c === 0 ? 'w-24' : c === columns - 1 ? 'w-10' : 'w-16'}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A full table card (header + shimmer rows) for pages that gate entirely. */
export function SkeletonTable({
  columns = 6,
  rows = 6,
  minWidth,
}: {
  columns?: number;
  rows?: number;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft">
      <table
        className="w-full text-sm"
        style={minWidth ? { minWidth } : undefined}
      >
        <thead className="bg-slate-50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SkeletonRows columns={columns} rows={rows} />
        </tbody>
      </table>
    </div>
  );
}

/**
 * Whole-page preset for list screens: header → optional filter bar → optional
 * stat tiles → table.
 */
export function ListPageSkeleton({
  columns = 6,
  rows = 8,
  minWidth,
  withAction = false,
  withFilters = false,
  withStats = false,
  statCount = 3,
}: {
  columns?: number;
  rows?: number;
  minWidth?: number;
  withAction?: boolean;
  withFilters?: boolean;
  withStats?: boolean;
  statCount?: number;
}) {
  return (
    <div className="space-y-6">
      <SkeletonPageHeader withAction={withAction} />
      {withFilters ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-lg" />
            ))}
          </div>
        </div>
      ) : null}
      {withStats ? <SkeletonStatCards count={statCount} /> : null}
      <SkeletonTable columns={columns} rows={rows} minWidth={minWidth} />
    </div>
  );
}

/**
 * Whole-page preset for detail screens: back link + title, then a stack of
 * info cards.
 */
export function DetailPageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-8 w-64" />
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} lines={i === 0 ? 4 : 3} />
      ))}
    </div>
  );
}
