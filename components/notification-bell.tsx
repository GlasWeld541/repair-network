'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

/**
 * The notification centre (Nayab, 2026-09-15 call: "there's going to be a lot of emails...
 * I want to do a notification center").
 *
 * Six things email someone — job request, provider declined, acceptance window expired, job not
 * repairable, customer matched, certificate earned — and until now none of them left a trace in
 * the app. This bell is the catch-up surface: unread count, what happened, and a link to the job.
 *
 * The feed is audience-scoped server-side (/api/notifications resolves it from the caller's own
 * role), so this component never asks for an audience and cannot be pointed at someone else's.
 */

type Notification = {
  id: string;
  event_type: string;
  subject: string;
  body: string | null;
  job_id: string | null;
  created_at: string;
  read: boolean;
};

const POLL_MS = 60_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return; // signed out or not addressed: stay quiet, never surface an error here
      const json = await res.json();
      setItems(json.notifications || []);
      setUnread(json.unread || 0);
    } catch {
      // A polling failure must never break the header.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Click-away + Escape, so the panel behaves like every other dropdown in the app.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (payload: { ids?: string[]; all?: boolean }) => {
    const ids = payload.all ? items.filter((i) => !i.read).map((i) => i.id) : payload.ids || [];
    if (!ids.length) return;
    // Optimistic: the list is a read-state toggle, and a failed mark just reappears on the
    // next poll.
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)));
    setUnread((prev) => Math.max(0, prev - ids.length));
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      void load();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications (${unread} unread)` : 'Notifications'}
        aria-expanded={open}
        className="relative inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markRead({ all: true })}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {loading && <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>}
            {!loading && items.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-500">Nothing yet.</p>
            )}
            {items.map((n) => {
              const inner = (
                <>
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-600" />
                    )}
                    <div className={n.read ? 'min-w-0 pl-4' : 'min-w-0'}>
                      <p className="text-sm font-medium text-slate-900">{n.subject}</p>
                      {n.body && <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>}
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
                        {n.event_type} · {timeAgo(n.created_at)}
                      </p>
                    </div>
                  </div>
                </>
              );
              const cls = `block w-full px-4 py-3 text-left hover:bg-slate-50 ${
                n.read ? '' : 'bg-brand-50/40'
              }`;
              return n.job_id ? (
                <Link
                  key={n.id}
                  href={`/jobs/${n.job_id}`}
                  className={cls}
                  onClick={() => {
                    void markRead({ ids: [n.id] });
                    setOpen(false);
                  }}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={n.id}
                  type="button"
                  className={cls}
                  onClick={() => void markRead({ ids: [n.id] })}
                >
                  {inner}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
