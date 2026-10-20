'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadAccountNames } from '@/lib/load-all-accounts';
import { ListPageSkeleton } from '@/components/ui/skeleton';
import { useConfirm, useToast } from '@/components/ui/notifications';

/**
 * Every Rex repair score waiting on an admin, in one place.
 *
 * A Rex score only counts toward a provider's rating (the "Repair ★" badge in the provider picker)
 * once an admin approves it. Until now that meant opening each job one at a time, so scores sat in
 * "pending" and providers looked unrated. Approving or rejecting here writes the same
 * repair_score_status the job page does, and the database trigger
 * (sql/provider_repair_score_rollup.sql) re-averages the provider straight away.
 */

type ScoreStatus = 'pending' | 'approved' | 'rejected';

type ScoredJob = {
  id: string;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  customer_name: string | null;
  tech_name: string | null;
  vehicle_year: string | number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  repair_score: number;
  repair_score_why: string | null;
  repair_score_detail: { issues?: string[]; strengths?: string[] } | null;
  repair_score_status: ScoreStatus | null;
  repair_scored_at: string | null;
};

type Photo = { job_id: string; type: string | null; photo_type: string | null; url: string | null; file_url: string | null };

const PASS_LINE = 6;

const STATUS: Record<ScoreStatus, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  approved: { label: 'Approved', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
};

const dateOnly = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : '';

export default function AdminScoresPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [jobs, setJobs] = useState<ScoredJob[]>([]);
  const [photos, setPhotos] = useState<Map<string, { before?: string; after?: string }>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [statusFilter, setStatusFilter] = useState<ScoreStatus | 'all'>('pending');
  // Review one shop at a time, or the weak repairs first.
  const [providerFilter, setProviderFilter] = useState('');
  const [belowPassOnly, setBelowPassOnly] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    void load();
  }, []);

  async function load() {
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

    const [{ data: jobRows }] = await Promise.all([
      supabase
        .from('jobs')
        .select(
          'id, assigned_account_id, assigned_account_name, customer_name, tech_name, vehicle_year, vehicle_make, vehicle_model, repair_score, repair_score_why, repair_score_detail, repair_score_status, repair_scored_at'
        )
        .not('repair_score', 'is', null)
        .order('repair_scored_at', { ascending: false, nullsFirst: false })
        .limit(1000),
    ]);
    const rows = (jobRows as ScoredJob[]) || [];
    setJobs(rows);
    setNames(await loadAccountNames(rows.map((j) => j.assigned_account_id)));

    // One before + one after thumbnail per job, so a score can be sanity-checked without opening it.
    const ids = rows.map((j) => j.id);
    const thumbs = new Map<string, { before?: string; after?: string }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: photoRows } = await supabase
        .from('job_photos')
        .select('job_id, type, photo_type, url, file_url')
        .in('job_id', ids.slice(i, i + 200));
      for (const p of (photoRows as Photo[]) || []) {
        const src = p.url || p.file_url;
        const kind = (p.type || p.photo_type || '').toLowerCase();
        if (!src || (kind !== 'before' && kind !== 'after')) continue;
        const t = thumbs.get(p.job_id) || {};
        if (!t[kind]) t[kind] = src;
        thumbs.set(p.job_id, t);
      }
    }
    setPhotos(thumbs);
    setLoading(false);
  }

  const counts = useMemo(() => {
    const c: Record<ScoreStatus, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const j of jobs) c[j.repair_score_status || 'pending'] += 1;
    return c;
  }, [jobs]);

  const providerOf = (j: ScoredJob) =>
    (j.assigned_account_id && names.get(j.assigned_account_id)) || j.assigned_account_name || 'Unassigned';

  const providerOptions = useMemo(
    () => [...new Set(jobs.map(providerOf))].sort((a, b) => a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, names]
  );

  const rows = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (statusFilter === 'all' || (j.repair_score_status || 'pending') === statusFilter) &&
          (!providerFilter || providerOf(j) === providerFilter) &&
          (!belowPassOnly || j.repair_score < PASS_LINE)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, statusFilter, providerFilter, belowPassOnly, names]
  );

  async function review(ids: string[], action: 'approve' | 'reject') {
    if (isReadOnly || ids.length === 0) return;
    const status: ScoreStatus = action === 'approve' ? 'approved' : 'rejected';
    setBusy((b) => new Set([...b, ...ids]));
    const { error } = await supabase.from('jobs').update({ repair_score_status: status }).in('id', ids);
    setBusy((b) => {
      const next = new Set(b);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (error) {
      toast.error(`Could not update the review: ${error.message}`);
      return;
    }
    setJobs((js) => js.map((j) => (ids.includes(j.id) ? { ...j, repair_score_status: status } : j)));
    toast.success(
      ids.length === 1
        ? action === 'approve'
          ? 'Score approved'
          : 'Score rejected'
        : `${ids.length} scores ${action === 'approve' ? 'approved' : 'rejected'}`
    );
  }

  async function approveAllPending() {
    const pending = rows.filter((j) => (j.repair_score_status || 'pending') === 'pending').map((j) => j.id);
    if (!pending.length) return;
    const ok = await confirm({
      title: `Approve ${pending.length} pending score${pending.length === 1 ? '' : 's'}?`,
      message: "Each approved score is added to its provider's repair rating straight away.",
      confirmLabel: 'Approve all',
    });
    if (ok) await review(pending, 'approve');
  }

  if (loading) {
    return <ListPageSkeleton withStats columns={6} rows={6} minWidth={1000} />;
  }

  const pendingShown = rows.filter((j) => (j.repair_score_status || 'pending') === 'pending').length;

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/admin" className="text-sm text-brand-700">
          Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">Repair scores</h1>
        <p className="mt-1 text-sm text-slate-500">
          Rex scores every finished repair from its before and after photos. A score only counts toward the
          provider&apos;s rating once it is approved here or on the job.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting for review" value={String(counts.pending)} tone={counts.pending ? 'text-amber-700' : 'text-slate-900'} />
        <Stat label="Approved" value={String(counts.approved)} tone="text-emerald-700" />
        <Stat label="Rejected" value={String(counts.rejected)} tone="text-slate-900" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ScoreStatus | 'all')}
            className="h-10"
          >
            <option value="pending">Waiting for review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All scores</option>
          </select>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="h-10 min-w-[200px]">
            <option value="">All providers</option>
            {providerOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={belowPassOnly}
              onChange={(e) => setBelowPassOnly(e.target.checked)}
              className="h-4 w-4"
            />
            Below pass line only
          </label>
          <span className="ml-auto text-sm text-slate-500">
            {rows.length} score{rows.length === 1 ? '' : 's'}
          </span>
          {!isReadOnly && pendingShown > 1 ? (
            <button
              type="button"
              onClick={() => void approveAllPending()}
              className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Approve all {pendingShown}
            </button>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Scored</th>
                <th className="px-4 py-3">Provider / job</th>
                <th className="px-4 py-3">Photos</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Why</th>
                <th className="px-4 py-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const status = j.repair_score_status || 'pending';
                const thumbs = photos.get(j.id) || {};
                const vehicle = [j.vehicle_year, j.vehicle_make, j.vehicle_model].filter(Boolean).join(' ');
                const issues = Array.isArray(j.repair_score_detail?.issues) ? j.repair_score_detail!.issues! : [];
                const working = busy.has(j.id);
                return (
                  <tr key={j.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{dateOnly(j.repair_scored_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {(j.assigned_account_id && names.get(j.assigned_account_id)) || j.assigned_account_name || 'Unassigned'}
                      </div>
                      <Link href={`/jobs/${j.id}`} className="text-xs text-brand-700 hover:underline">
                        Job {j.id.slice(0, 8)}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {[j.tech_name ? `Tech: ${j.tech_name}` : '', vehicle].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {(['before', 'after'] as const).map((k) =>
                          thumbs[k] ? (
                            <a key={k} href={thumbs[k]} target="_blank" rel="noreferrer" title={`${k} photo`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumbs[k]} alt={`${k} photo`} className="h-14 w-14 rounded-lg border border-slate-200 object-cover" />
                            </a>
                          ) : (
                            <div
                              key={k}
                              className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-400"
                            >
                              No {k}
                            </div>
                          )
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="text-xl font-semibold tabular-nums text-slate-900">
                        {j.repair_score}
                        <span className="text-sm font-normal text-slate-400"> / 10</span>
                      </div>
                      <div className={`text-xs font-medium ${j.repair_score >= PASS_LINE ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {j.repair_score >= PASS_LINE ? 'Pass' : 'Below pass line'}
                      </div>
                    </td>
                    <td className="max-w-[420px] px-4 py-3 text-xs text-slate-600">
                      {j.repair_score_why ? <p>{j.repair_score_why}</p> : null}
                      {issues.length ? (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {issues.slice(0, 3).map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS[status].tone}`}>
                        {STATUS[status].label}
                      </span>
                      {!isReadOnly ? (
                        <div className="mt-2 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void review([j.id], 'approve')}
                            disabled={working || status === 'approved'}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void review([j.id], 'reject')}
                            disabled={working || status === 'rejected'}
                            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    {statusFilter === 'pending' ? 'Nothing waiting for review.' : 'No scores match this filter.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
