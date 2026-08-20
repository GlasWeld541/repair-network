'use client';

import { useEffect, useMemo, useState } from 'react';
import { distanceMiles } from '@/lib/geo';

// A provider can hold several jobs at once — assignment is not one-at-a-time. "Busy" is a
// soft caution, not a block: only providers at/over this active-job count are hidden by
// default (still revealable), so an admin doesn't over-load one shop without meaning to.
// Below it, the current load shows as an informational count.
const BUSY_THRESHOLD = 3;

// "Coverage first, quality next" (Derek): the default ranking prefers the most QUALIFIED shop
// within this radius of the customer, so we ensure someone can actually reach the job before
// optimizing for certification — a certified shop 180 mi away shouldn't beat a closer one.
// Shops beyond it fall back to nearest-first. Tune as the network densifies.
const COVERAGE_RADIUS_MILES = 50;

export type ProviderAccount = {
  id: string;
  account_name: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  company_phone: string | null;
  company_email: string | null;
  glasweld_certified: string | null;
  uses_onyx: string | null;
  uses_zoom_injector: string | null;
  repair_only: string | null;
  provider_type: string | null;
};

type Origin = { latitude: number; longitude: number } | null;

function certBadges(a: ProviderAccount) {
  const out: string[] = [];
  if (a.glasweld_certified === 'Yes') out.push('Certified');
  if (a.uses_onyx === 'Yes') out.push('Onyx/Emerald');
  if (a.uses_zoom_injector === 'Yes') out.push('Zoom');
  if (a.repair_only === 'Yes') out.push('Repair-only');
  return out;
}

/**
 * Location-aware provider (shop account) picker, rendered as a modal so it has room to
 * breathe (the earlier inline version overflowed the cramped triage grid cell). Cards show
 * name, location, distance, certifications, contact, and current job load; sorted by
 * distance when the customer's coordinates are known. A provider can take several jobs at
 * once; only those at/over the busy threshold (3+ active jobs) are hidden by default (toggle
 * to override). Clicking a card selects it; Done/backdrop closes.
 */
export default function ProviderPickerModal({
  open,
  onClose,
  accounts,
  activeCounts,
  ratings = {},
  origin,
  selectedId,
  onSelect,
  geocoding = false,
  customerLocation,
}: {
  open: boolean;
  onClose: () => void;
  accounts: ProviderAccount[];
  activeCounts: Record<string, number>;
  // Rolled-up Rex repair scores per provider (admin-approved only). Optional — call sites
  // without score data (e.g. job reassignment) simply don't offer the "Top rated" sort.
  ratings?: Record<string, { avg: number; count: number }>;
  origin: Origin;
  selectedId: string;
  onSelect: (id: string) => void;
  geocoding?: boolean;
  customerLocation?: string;
}) {
  const [search, setSearch] = useState('');
  const [showBusy, setShowBusy] = useState(false);
  // Geography is the primary metric (Shiloh: don't route a customer to a certified shop
  // 180 mi away over a closer one). Default "nearest"; admins can flip to "certified" to
  // lead with certification when distances are comparable. "Top rated" (when rating data is
  // present) leads with each provider's rolled-up Rex repair score — Nayab's 3rd sort dimension.
  const [sortMode, setSortMode] = useState<'best' | 'nearest' | 'rated'>('best');

  const hasRatings = useMemo(
    () => accounts.some((a) => (ratings[a.id]?.count ?? 0) > 0),
    [accounts, ratings],
  );

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const ranked = useMemo(() => {
    const withMeta = accounts.map((a, i) => {
      const dist =
        origin && a.latitude != null && a.longitude != null
          ? distanceMiles(origin.latitude, origin.longitude, a.latitude, a.longitude)
          : null;
      const r = ratings[a.id];
      return {
        a,
        dist,
        active: activeCounts[a.id] || 0,
        order: i,
        certified: a.glasweld_certified === 'Yes',
        rating: r && r.count > 0 ? r.avg : null,
        ratingCount: r?.count ?? 0,
      };
    });
    // Geography-first (default): nearest leads, with certification the tiebreaker between
    // equidistant providers — so a customer is never routed to a far certified shop over a
    // closer one. "Certified" mode restores certified-leads-everyone (nearest within tier)
    // for when the admin wants to prioritize certification. Unknown distance sinks to the
    // bottom; with no origin at all this falls back to the incoming (proximity-scored) order.
    const cert = (x: (typeof withMeta)[number], y: (typeof withMeta)[number]) =>
      x.certified === y.certified ? null : x.certified ? -1 : 1;
    const nearer = (x: (typeof withMeta)[number], y: (typeof withMeta)[number]) => {
      if (x.dist == null && y.dist == null) return x.order - y.order;
      if (x.dist == null) return 1;
      if (y.dist == null) return -1;
      return x.dist - y.dist;
    };
    const covered = (m: (typeof withMeta)[number]) =>
      m.dist != null && m.dist <= COVERAGE_RADIUS_MILES;
    // Higher Rex repair score leads; an unrated provider (no approved scores) sinks below every
    // rated one, then falls back to the incoming proximity order.
    const byRating = (x: (typeof withMeta)[number], y: (typeof withMeta)[number]) => {
      if (x.rating == null && y.rating == null) return nearer(x, y);
      if (x.rating == null) return 1;
      if (y.rating == null) return -1;
      if (y.rating !== x.rating) return y.rating - x.rating;
      return nearer(x, y);
    };
    withMeta.sort((x, y) => {
      if (sortMode === 'rated') return byRating(x, y); // top-rated first
      if (sortMode === 'nearest') return nearer(x, y); // pure distance
      // 'best' (default): coverage first (within radius), then quality (certified), then nearest.
      const xc = covered(x);
      const yc = covered(y);
      if (xc !== yc) return xc ? -1 : 1; // a reachable shop always leads an out-of-range one
      if (xc && yc) return cert(x, y) ?? nearer(x, y); // both reachable -> most qualified, then nearest
      return nearer(x, y); // neither reachable -> nearest fallback
    });
    return withMeta;
  }, [accounts, activeCounts, ratings, origin, sortMode]);

  if (!open) return null;

  const term = search.trim().toLowerCase();
  const visible = ranked.filter(({ a, active }) => {
    if (term) {
      const hay = `${a.account_name || ''} ${a.city || ''} ${a.state || ''} ${a.postal_code || ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (a.id === selectedId) return true; // always keep the selected one visible
    if (!showBusy && active >= BUSY_THRESHOLD) return false;
    return true;
  });

  const hiddenBusy = ranked.filter(
    ({ a, active }) => active >= BUSY_THRESHOLD && a.id !== selectedId,
  ).length;

  const sortLabel =
    sortMode === 'rated'
      ? 'Top rated first (Rex repair score)'
      : geocoding
        ? 'Locating…'
        : !origin
          ? 'By region'
          : sortMode === 'nearest'
            ? 'Nearest first'
            : `Most qualified within ${COVERAGE_RADIUS_MILES} mi, then nearest`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">Assign a provider</h3>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {customerLocation ? `Customer: ${customerLocation} · ` : ''}
              {sortLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search + sort */}
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers by name, city, ZIP…"
            className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            autoFocus
          />
          {origin || hasRatings ? (
            <div className="flex shrink-0 rounded-lg border border-slate-300 p-0.5 text-sm">
              {(
                [
                  ...(origin ? (['best', 'nearest'] as const) : []),
                  ...(hasRatings ? (['rated'] as const) : []),
                ] as ('best' | 'nearest' | 'rated')[]
              ).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    sortMode === mode
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {mode === 'best' ? 'Best match' : mode === 'nearest' ? 'Nearest' : 'Top rated'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* List */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {visible.map(({ a, dist, active, rating, ratingCount }) => {
            const selected = a.id === selectedId;
            const badges = certBadges(a);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selected
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-slate-900">
                        {a.account_name || 'Unnamed provider'}
                      </span>
                      {a.provider_type === 'independent_tech' ? (
                        <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                          Ind. tech
                        </span>
                      ) : null}
                      {selected ? (
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {[a.city, a.state, a.postal_code].filter(Boolean).join(', ') || 'Location unknown'}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {rating != null ? (
                      <span
                        className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200"
                        title={`Average Rex repair score across ${ratingCount} approved repair${ratingCount === 1 ? '' : 's'}`}
                      >
                        ★ {rating.toFixed(1)} · {ratingCount}
                      </span>
                    ) : null}
                    {dist != null ? (
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {dist < 10 ? dist.toFixed(1) : Math.round(dist)} mi
                      </span>
                    ) : null}
                    {active >= BUSY_THRESHOLD ? (
                      <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                        Busy · {active}
                      </span>
                    ) : active > 0 ? (
                      <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
                        {active} active
                      </span>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        Available
                      </span>
                    )}
                  </div>
                </div>

                {badges.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {badges.map((b) => (
                      <span key={b} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">
                        {b}
                      </span>
                    ))}
                  </div>
                ) : null}

                {a.company_phone || a.company_email ? (
                  <div className="mt-2 truncate text-xs text-slate-500">
                    {[a.company_phone, a.company_email].filter(Boolean).join(' · ')}
                  </div>
                ) : null}
              </button>
            );
          })}

          {!visible.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              No matching providers.
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          {hiddenBusy > 0 ? (
            <button
              type="button"
              onClick={() => setShowBusy((v) => !v)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              {showBusy ? 'Hide busy providers' : `Show ${hiddenBusy} busy provider${hiddenBusy === 1 ? '' : 's'}`}
            </button>
          ) : (
            <span className="text-xs text-slate-400">{visible.length} shown</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
