'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ListPageSkeleton } from '@/components/ui/skeleton';
import { useConfirm, useToast } from '@/components/ui/notifications';
import { EnrollProviderModal } from '@/components/enroll-provider-modal';
import { AddStaffDialog, EditPersonDialog, ResetPasswordDialog, type EditablePerson } from '@/components/people-dialogs';

/**
 * Everyone in one list (10/12 call: centralize users; Trello #262/#264). GlasWeld staff and Rex
 * field techs used to live in the Rex admin, shop logins here, and independent techs were matched
 * to their account by email. This page shows all of them with their account, plan, access,
 * certification and scores, and the switches GlasWeld uses during onboarding: Pro/Free on the
 * account, a person's role and knowledge access, certification, and turning a login off or on.
 *
 * The data and the actions come from the Rex backend (/admin/people and the Rex user endpoints),
 * which accepts Network admins; staff changes keep the super-admin wall.
 */

const REX_API = process.env.NEXT_PUBLIC_REX_BACKEND_URL || 'https://backend-production-ad25.up.railway.app';
const PAGE_SIZE = 50;

type Person = {
  user_id: string | null;
  email: string;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  kind: 'staff' | 'provider';
  role_label: string;
  rex_role: 'admin' | 'cs_rep' | 'field_tech' | null;
  kb_tier: 'field' | 'pro' | 'cs_internal' | null;
  network_role: string | null;
  shop_role: string | null;
  access_status: string | null;
  active: boolean;
  account: { id: string; name: string | null; plan: 'free' | 'pro'; provider_type: string | null; active: boolean } | null;
  has_login: boolean;
  last_sign_in_at: string | null;
  certified?: boolean;
  cert_source?: string | null;
  cert_passed?: number;
  repairs_finished?: number;
  avg_score?: number | null;
  scored_repairs?: number;
};

type PeoplePage = {
  total: number;
  counts: { all: number; staff: number; providers: number };
  rows: Person[];
};

type Kind = 'all' | 'staff' | 'providers';
type Status = 'all' | 'active' | 'inactive' | 'never_signed_in';

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

const ago = (iso: string | null) => {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function AdminPeoplePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [ready, setReady] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [data, setData] = useState<PeoplePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [status, setStatus] = useState<Status>('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [editing, setEditing] = useState<EditablePerson | null>(null);
  const [resetting, setResetting] = useState<EditablePerson | null>(null);

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

  // Search after a short pause in typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, kind, status, page: String(page), page_size: String(PAGE_SIZE) });
      if (fresh) params.set('fresh', 'true');
      setData(await rex<PeoplePage>(`/admin/people?${params}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load people.');
    } finally {
      setLoading(false);
    }
  }, [query, kind, status, page]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const patchRow = (email: string, change: Partial<Person>) =>
    setData((d) => (d ? { ...d, rows: d.rows.map((r) => (r.email === email ? { ...r, ...change } : r)) } : d));

  async function act(key: string, run: () => Promise<unknown>, done: string, change?: [string, Partial<Person>]) {
    setBusy(key);
    try {
      await run();
      if (change) patchRow(change[0], change[1]);
      toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  const setPlan = (p: Person, plan: 'free' | 'pro') =>
    p.account &&
    act(
      `plan:${p.email}`,
      () => rex(`/admin/people/accounts/${p.account!.id}/plan`, { method: 'PATCH', body: JSON.stringify({ plan }) }),
      `${p.account.name || 'Account'} is now ${plan === 'pro' ? 'Pro' : 'Free'}`,
      [p.email, { account: { ...p.account, plan } }]
    );

  const setRole = (p: Person, role: string) =>
    p.user_id &&
    act(
      `role:${p.email}`,
      () => rex(`/admin/users/${p.user_id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
      'Role updated',
      [p.email, { rex_role: role as Person['rex_role'] }]
    );

  const setTier = (p: Person, tier: string) =>
    p.user_id &&
    act(
      `tier:${p.email}`,
      () => rex(`/admin/users/${p.user_id}/tier`, { method: 'PATCH', body: JSON.stringify({ tier: tier || null }) }),
      'Knowledge access updated',
      [p.email, { kb_tier: (tier || null) as Person['kb_tier'] }]
    );

  const setCertified = (p: Person, certified: boolean) =>
    p.user_id &&
    act(
      `cert:${p.email}`,
      () => rex(`/admin/users/${p.user_id}/certification`, { method: 'POST', body: JSON.stringify({ certified }) }),
      certified ? 'Marked certified' : 'Certification removed',
      [p.email, { certified }]
    );

  async function setActive(p: Person, active: boolean) {
    if (!active) {
      const ok = await confirm({
        title: `Turn off ${p.name || p.email}?`,
        message: 'They can no longer sign in. Their repairs, scores and history stay on their record. You can turn them back on any time.',
        confirmLabel: 'Turn off',
        destructive: true,
      });
      if (!ok) return;
    }
    // A provider login is switched on its Network access; a Rex user on their Rex role.
    const run = p.network_role
      ? () => rex(`/admin/people/logins/${encodeURIComponent(p.email)}/access`, { method: 'PATCH', body: JSON.stringify({ active }) })
      : () => rex(`/admin/users/${p.user_id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) });
    await act(`active:${p.email}`, run, active ? 'Turned on' : 'Turned off', [p.email, { active }]);
  }

  if (!ready) return <ListPageSkeleton withStats columns={7} rows={8} minWidth={1100} />;

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const chips: { key: Kind; label: string; count?: number }[] = [
    { key: 'all', label: 'Everyone', count: data?.counts.all },
    { key: 'staff', label: 'GlasWeld staff', count: data?.counts.staff },
    { key: 'providers', label: 'Providers', count: data?.counts.providers },
  ];

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/admin" className="text-sm text-brand-700">
          Back to Admin
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-slate-900">People</h1>
          {!isReadOnly ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddingStaff(true)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Add staff user
              </button>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Add provider
              </button>
            </div>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Everyone who uses Rex or the Network: GlasWeld staff, shop owners and technicians, and independent techs. Change
          a provider&apos;s plan, a person&apos;s role or knowledge access, certification, or turn a login off, all from
          here.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setKind(c.key);
                setPage(1);
              }}
              className={`h-9 rounded-full border px-4 text-sm font-medium ${
                kind === c.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {c.label}
              {c.count != null ? <span className="ml-1.5 opacity-75">{c.count.toLocaleString()}</span> : null}
            </button>
          ))}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setPage(1);
            }}
            className="h-9 w-auto py-1"
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Turned off</option>
            <option value="never_signed_in">Never signed in</option>
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or account"
            className="h-9 w-auto min-w-[260px] flex-1 py-1"
          />
        </div>

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
        {loading && data ? <p className="mt-3 text-xs text-slate-500">Updating…</p> : null}

        <div className={`mt-5 overflow-x-auto transition-opacity ${loading && data ? 'opacity-50' : ''}`}>
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Person</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Account &amp; plan</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Knowledge access</th>
                <th className="px-3 py-2 font-medium">Certified</th>
                <th className="px-3 py-2 text-right font-medium">Repairs</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Last sign-in</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Loading people…
                  </td>
                </tr>
              ) : data && data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    No one matches.
                  </td>
                </tr>
              ) : (
                data?.rows.map((p) => (
                  <tr key={p.email} className={p.active ? '' : 'bg-slate-50/70 text-slate-500'}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{p.name || p.email}</div>
                      {p.name ? <div className="text-xs text-slate-500">{p.email}</div> : null}
                      {!p.has_login ? (
                        <span className="mt-1 inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                          Invited, no login yet
                        </span>
                      ) : null}
                      {!isReadOnly && p.user_id ? (
                        <div className="mt-1 flex gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => setEditing({ user_id: p.user_id!, email: p.email, first_name: p.first_name, last_name: p.last_name })}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetting({ user_id: p.user_id!, email: p.email })}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            Reset password
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {p.rex_role && p.user_id && !p.network_role ? (
                        <select
                          value={p.rex_role}
                          disabled={isReadOnly || busy === `role:${p.email}`}
                          onChange={(e) => void setRole(p, e.target.value)}
                          className="h-8 w-auto rounded-lg py-0 pl-2 pr-7"
                        >
                          <option value="field_tech">Field tech</option>
                          <option value="cs_rep">CS rep</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="text-slate-700">{p.role_label}</span>
                      )}
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">
                        {p.kind === 'staff' ? 'GlasWeld' : 'Provider'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {p.account ? (
                        <div className="space-y-1">
                          <Link href={`/accounts/${p.account.id}`} className="text-brand-700 hover:underline">
                            {p.account.name || 'Unnamed account'}
                          </Link>
                          <select
                            value={p.account.plan}
                            disabled={isReadOnly || busy === `plan:${p.email}`}
                            onChange={(e) => void setPlan(p, e.target.value as 'free' | 'pro')}
                            className="block h-8 w-auto rounded-lg py-0 pl-2 pr-7"
                          >
                            <option value="free">Free</option>
                            <option value="pro">Pro</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {p.rex_role && p.user_id && !p.account ? (
                        <select
                          value={p.kb_tier || ''}
                          disabled={isReadOnly || busy === `tier:${p.email}`}
                          onChange={(e) => void setTier(p, e.target.value)}
                          className="h-8 w-auto rounded-lg py-0 pl-2 pr-7"
                        >
                          <option value="field">Field</option>
                          <option value="pro">Pro</option>
                          <option value="cs_internal">CS internal</option>
                          <option value="">Everything</option>
                        </select>
                      ) : p.account ? (
                        <span className="text-xs text-slate-500">Follows the plan</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {p.user_id ? (
                        <>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 p-0"
                            checked={!!p.certified}
                            disabled={isReadOnly || busy === `cert:${p.email}`}
                            onChange={(e) => void setCertified(p, e.target.checked)}
                          />
                          <span className={p.certified ? 'text-emerald-700' : 'text-slate-500'}>
                            {p.certified ? 'Certified' : 'No'}
                          </span>
                        </label>
                        {p.certified ? (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {p.cert_source === 'manual' ? 'Granted by an admin' : 'Passed the course'}
                          </div>
                        ) : p.cert_passed ? (
                          <div className="mt-0.5 text-xs text-slate-500">{p.cert_passed} of 6 modules passed</div>
                        ) : null}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {p.repairs_finished ?? 0}
                      {p.avg_score != null ? (
                        <div className={`text-xs ${p.avg_score >= 6 ? 'text-slate-500' : 'text-rose-600'}`}>
                          avg {p.avg_score.toFixed(1)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{ago(p.last_sign_in_at) || <span className="text-slate-400">Never</span>}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            p.active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {p.active ? 'Active' : 'Off'}
                        </span>
                        {!isReadOnly && (p.network_role || p.rex_role) ? (
                          <button
                            type="button"
                            disabled={busy === `active:${p.email}`}
                            onClick={() => void setActive(p, !p.active)}
                            className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
                          >
                            {p.active ? 'Turn off' : 'Turn on'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > PAGE_SIZE ? (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((n) => n - 1)}
                className="h-9 rounded-lg border border-slate-200 px-3 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pages || loading}
                onClick={() => setPage((n) => n + 1)}
                className="h-9 rounded-lg border border-slate-200 px-3 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <AddStaffDialog
        open={addingStaff}
        rex={rex}
        onClose={() => setAddingStaff(false)}
        onCreated={() => {
          setAddingStaff(false);
          void load(true);
        }}
      />
      <EditPersonDialog
        person={editing}
        rex={rex}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load(true);
        }}
      />
      <ResetPasswordDialog person={resetting} rex={rex} onClose={() => setResetting(null)} onSaved={() => setResetting(null)} />
      <EnrollProviderModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          void load(true);
        }}
      />
    </div>
  );
}
