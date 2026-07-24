'use client';

import { useMemo, useState } from 'react';
import { distanceMiles } from '@/lib/geo';

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
};

type Origin = { latitude: number; longitude: number } | null;

function certBadges(a: ProviderAccount) {
  const out: string[] = [];
  if (a.glasweld_certified === 'Yes') out.push('Certified');
  if (a.uses_onyx === 'Yes') out.push('Onyx');
  if (a.uses_zoom_injector === 'Yes') out.push('Zoom');
  if (a.repair_only === 'Yes') out.push('Repair-only');
  return out;
}

/**
 * Rich, location-aware provider (shop account) picker. Replaces the bare dropdown: cards
 * show name, location, distance, certifications, contact, and current job load. Sorted by
 * distance when the customer's coordinates are known (else by the fallback order passed in).
 * Providers already busy on an active job are hidden by default (toggle to override).
 */
export default function ProviderPicker({
  accounts,
  activeCounts,
  origin,
  selectedId,
  onSelect,
  geocoding = false,
}: {
  accounts: ProviderAccount[];
  activeCounts: Record<string, number>;
  origin: Origin;
  selectedId: string;
  onSelect: (id: string) => void;
  geocoding?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [showBusy, setShowBusy] = useState(false);

  const ranked = useMemo(() => {
    const withMeta = accounts.map((a, i) => {
      const dist =
        origin && a.latitude != null && a.longitude != null
          ? distanceMiles(origin.latitude, origin.longitude, a.latitude, a.longitude)
          : null;
      return { a, dist, active: activeCounts[a.id] || 0, order: i };
    });

    // Sort by distance when we have an origin (nulls last); otherwise keep incoming order.
    if (origin) {
      withMeta.sort((x, y) => {
        if (x.dist == null && y.dist == null) return x.order - y.order;
        if (x.dist == null) return 1;
        if (y.dist == null) return -1;
        return x.dist - y.dist;
      });
    }
    return withMeta;
  }, [accounts, activeCounts, origin]);

  const term = search.trim().toLowerCase();
  const visible = ranked.filter(({ a, active }) => {
    if (term) {
      const hay = `${a.account_name || ''} ${a.city || ''} ${a.state || ''} ${a.postal_code || ''}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    // Always keep the selected provider visible even if busy/filtered.
    if (a.id === selectedId) return true;
    if (!showBusy && active > 0) return false;
    return true;
  });

  const hiddenBusy = ranked.filter(({ a, active }) => active > 0 && a.id !== selectedId).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search providers by name, city, ZIP…"
          className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
        />
        {origin ? (
          <span className="whitespace-nowrap text-xs text-slate-500">Nearest first</span>
        ) : geocoding ? (
          <span className="whitespace-nowrap text-xs text-slate-400">Locating…</span>
        ) : (
          <span className="whitespace-nowrap text-xs text-slate-400">By match</span>
        )}
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {visible.map(({ a, dist, active }) => {
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
                  <div className="truncate font-semibold text-slate-900">
                    {a.account_name || 'Unnamed provider'}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {[a.city, a.state, a.postal_code].filter(Boolean).join(', ') || 'Location unknown'}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {dist != null ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {dist < 10 ? dist.toFixed(1) : Math.round(dist)} mi
                    </span>
                  ) : null}
                  {active > 0 ? (
                    <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                      Busy · {active} active
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
                    <span
                      key={b}
                      className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700"
                    >
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
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
            No matching providers.
          </div>
        ) : null}
      </div>

      {hiddenBusy > 0 ? (
        <button
          type="button"
          onClick={() => setShowBusy((v) => !v)}
          className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {showBusy ? 'Hide busy providers' : `Show ${hiddenBusy} busy provider${hiddenBusy === 1 ? '' : 's'}`}
        </button>
      ) : null}
    </div>
  );
}
