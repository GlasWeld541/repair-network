'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ListPageSkeleton } from '@/components/ui/skeleton';
import { useConfirm, useToast } from '@/components/ui/notifications';

/**
 * Control centre (10/12 call: the Network is GlasWeld's admin and "controls everything"). Platform
 * switches that used to need a Railway env change and a redeploy: Free vs Pro limits, free uses,
 * shop team limits, the licensed intake price and the testing allow-lists. Saved in Rex
 * (/admin/control-center), which applies them within about 30 seconds.
 */

const REX_API = process.env.NEXT_PUBLIC_REX_BACKEND_URL || 'https://backend-production-ad25.up.railway.app';

type Kind = 'bool' | 'int' | 'cents' | 'emails';
type Setting = {
  key: string;
  group: string;
  kind: Kind;
  label: string;
  help: string;
  min?: number;
  max?: number;
  value: boolean | number | string;
  default: boolean | number | string;
  changed: boolean;
  updated_at: string | null;
  updated_by: string | null;
};
type Payload = { settings: Setting[]; can_edit: boolean };

async function rex<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${REX_API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : `Request failed (${res.status})`);
  return body as T;
}

function show(kind: Kind, v: Setting['value']) {
  if (kind === 'bool') return v ? 'On' : 'Off';
  if (kind === 'cents') return `$${(Number(v) / 100).toFixed(2)}`;
  if (kind === 'emails') {
    const list = String(v || '').split(',').filter(Boolean);
    return list.length ? `${list.length} login${list.length === 1 ? '' : 's'}` : 'Nobody';
  }
  return String(v);
}

// The editable text for a setting's value.
function draftOf(s: Setting) {
  if (s.kind === 'cents') return (Number(s.value) / 100).toFixed(2);
  if (s.kind === 'emails') return String(s.value || '').split(',').filter(Boolean).join('\n');
  return String(s.value);
}

export default function ControlCenterPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [ready, setReady] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Network admins only (demo logins see it read-only).
  useEffect(() => {
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email?.toLowerCase() || '';
      if (!email) {
        window.location.href = '/login';
        return;
      }
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, approved, access_status')
        .eq('user_email', email)
        .maybeSingle();
      if (
        !roleData ||
        roleData.approved !== true ||
        roleData.access_status !== 'Active' ||
        (roleData.role !== 'admin' && roleData.role !== 'demo')
      ) {
        window.location.href = '/admin';
        return;
      }
      setIsReadOnly(roleData.role !== 'admin');
      setReady(true);
    })();
  }, []);

  const apply = useCallback((p: Payload) => {
    setData(p);
    setDrafts(Object.fromEntries(p.settings.map((s) => [s.key, draftOf(s)])));
  }, []);

  // Load only after the access check, so the two don't collide on the auth lock.
  useEffect(() => {
    if (!ready) return;
    rex<Payload>('/admin/control-center')
      .then(apply)
      .catch((e: Error) => setError(e.message));
  }, [ready, apply]);

  const save = async (s: Setting, value: Setting['value'] | string[] | null) => {
    setBusy(s.key);
    try {
      const p = await rex<Payload>(`/admin/control-center/${s.key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      apply(p);
      toast.success(value === null ? `${s.label} is back to the default` : `${s.label} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not save.');
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (s: Setting) => {
    const next = !s.value;
    if (s.key === 'provider_plan_gating_enabled') {
      const ok = await confirm({
        title: next ? 'Turn on Free vs Pro limits?' : 'Turn off Free vs Pro limits?',
        message: next
          ? 'Free accounts lose Ask Rex and certification once their free uses run out, until they upgrade to Pro.'
          : 'Every provider gets Ask Rex and certification, Free or Pro.',
        confirmLabel: next ? 'Turn on' : 'Turn off',
        destructive: next,
      });
      if (!ok) return;
    }
    void save(s, next);
  };

  const saveDraft = (s: Setting) => {
    const raw = (drafts[s.key] ?? '').trim();
    if (s.kind === 'emails') return void save(s, raw.split(/[\s,]+/).filter(Boolean));
    const n = Number(raw.replace(/^\$/, ''));
    if (raw === '' || Number.isNaN(n)) return void toast.error(s.kind === 'cents' ? 'Enter an amount.' : 'Enter a number.');
    void save(s, s.kind === 'cents' ? Math.round(n * 100) : n);
  };

  if (!ready) return <ListPageSkeleton columns={3} rows={6} />;

  const canEdit = !isReadOnly && !!data?.can_edit;
  const groups = data ? [...new Set(data.settings.map((s) => s.group))] : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/admin" className="text-sm text-brand-700">
          Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Control centre</h1>
        <p className="mt-1 text-sm text-slate-500">
          Platform switches for Rex. A change applies within about 30 seconds, with no deploy. Use default puts a
          setting back to how it was deployed.
        </p>
        {data && !data.can_edit ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only GlasWeld management can change these. You can see them here.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}
      {!data && !error ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h2>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {data!.settings
              .filter((s) => s.group === g)
              .map((s) => {
                const dirty = drafts[s.key] !== draftOf(s);
                return (
                  <div key={s.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 sm:max-w-md">
                      <div className="font-medium text-slate-900">{s.label}</div>
                      <p className="mt-0.5 text-sm text-slate-500">{s.help}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Default {show(s.kind, s.default)}
                        {s.changed && s.updated_by
                          ? ` · changed by ${s.updated_by}${
                              s.updated_at ? ` on ${new Date(s.updated_at).toLocaleDateString('en-US')}` : ''
                            }`
                          : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-64 sm:items-end">
                      {s.kind === 'bool' ? (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!!s.value}
                          aria-label={s.label}
                          disabled={!canEdit || busy === s.key}
                          onClick={() => void toggle(s)}
                          className={`relative h-6 w-11 self-end rounded-full transition disabled:opacity-50 ${
                            s.value ? 'bg-brand-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                              s.value ? 'left-[22px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      ) : s.kind === 'emails' ? (
                        <textarea
                          value={drafts[s.key] ?? ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                          disabled={!canEdit}
                          rows={3}
                          placeholder="One email per line"
                          aria-label={s.label}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
                        />
                      ) : (
                        <div className="flex items-center gap-1 self-end">
                          {s.kind === 'cents' ? <span className="text-sm text-slate-500">$</span> : null}
                          <input
                            inputMode={s.kind === 'cents' ? 'decimal' : 'numeric'}
                            value={drafts[s.key] ?? ''}
                            onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                            disabled={!canEdit}
                            aria-label={s.label}
                            className="h-9 w-28 rounded-lg border border-slate-300 px-3 text-right text-sm tabular-nums disabled:bg-slate-50"
                          />
                        </div>
                      )}
                      {canEdit ? (
                        <div className="flex justify-end gap-2">
                          {s.changed ? (
                            <button
                              type="button"
                              disabled={busy === s.key}
                              onClick={() => void save(s, null)}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                            >
                              Use default
                            </button>
                          ) : null}
                          {s.kind !== 'bool' && dirty ? (
                            <button
                              type="button"
                              disabled={busy === s.key}
                              onClick={() => saveDraft(s)}
                              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                            >
                              {busy === s.key ? 'Saving…' : 'Save'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
