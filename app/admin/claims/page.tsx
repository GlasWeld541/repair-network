'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ClaimIntake = {
  id: string;
  carrier_id: string;
  assigned_account_id: string | null;
  assigned_job_id: string | null;
  claim_number: string | null;
  policy_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  loss_date: string | null;
  loss_city: string | null;
  loss_state: string | null;
  loss_postal_code: string | null;
  intake_status: string;
  carrier_visible_status: string;
  assignment_status: string;
  source: string;
  duplicate_warning: boolean | null;
  duplicate_reason: string | null;
  duplicate_of_claim_id: string | null;
  created_at: string;
};

type Carrier = {
  id: string;
  organization_name: string;
};

type Account = {
  id: string;
  account_name: string | null;
};

type ClaimEvent = {
  id: string;
  claim_intake_id: string;
  event_type: string;
  note: string | null;
  visible_to_carrier: boolean;
  created_at: string;
};

type RoutingAudit = {
  id: string;
  claim_intake_id: string;
  routing_method: string;
  selected_account_id: string | null;
  selected_distance_miles: number | null;
  candidate_count: number;
  notes: string | null;
  created_at: string;
};

type NotificationEvent = {
  id: string;
  event_type: string;
  audience: string;
  claim_intake_id: string | null;
  status: string;
  subject: string | null;
  created_at: string;
};

function statusClass(status: string) {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Assigned' || status === 'In Progress') return 'border-brand-200 bg-brand-50 text-brand-700';
  if (status === 'Canceled') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function AdminClaimsPage() {
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimIntake[]>([]);
  const [events, setEvents] = useState<ClaimEvent[]>([]);
  const [audits, setAudits] = useState<RoutingAudit[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const isDemo = currentRole === 'demo';

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

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
      window.location.href = '/';
      return;
    }

    setCurrentRole(roleData.role);

    const [
      { data: claimRows },
      { data: carrierRows },
      { data: accountRows },
      { data: eventRows },
      { data: auditRows },
      { data: notificationRows },
    ] =
      await Promise.all([
        supabase
          .from('claim_intakes')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('carrier_organizations')
          .select('id, organization_name')
          .order('organization_name'),
        supabase
          .from('accounts')
          .select('id, account_name')
          .order('account_name'),
        supabase
          .from('claim_status_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('claim_routing_audits')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('notification_events')
          .select('id, event_type, audience, claim_intake_id, status, subject, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

    setClaims((claimRows as ClaimIntake[]) || []);
    setEvents((eventRows as ClaimEvent[]) || []);
    setAudits((auditRows as RoutingAudit[]) || []);
    setNotifications((notificationRows as NotificationEvent[]) || []);
    setCarriers((carrierRows as Carrier[]) || []);
    setAccounts((accountRows as Account[]) || []);
    setLoading(false);
  }

  function carrierName(carrierId: string) {
    return carriers.find((carrier) => carrier.id === carrierId)?.organization_name || 'Unknown carrier';
  }

  function accountName(accountId: string | null) {
    if (!accountId) return 'Unassigned';
    return accounts.find((account) => account.id === accountId)?.account_name || 'Unknown account';
  }

  function selectedAccountForClaim(claim: ClaimIntake) {
    return selectedAccounts[claim.id] || claim.assigned_account_id || '';
  }

  function eventsForClaim(claimId: string) {
    return events.filter((event) => event.claim_intake_id === claimId).slice(0, 4);
  }

  function auditForClaim(claimId: string) {
    return audits.find((audit) => audit.claim_intake_id === claimId);
  }

  async function assignClaim(claim: ClaimIntake) {
    if (isDemo) return;

    const accountId = selectedAccountForClaim(claim);
    const account = accounts.find((row) => row.id === accountId);

    if (!account) {
      window.alert('Select a repair account first.');
      return;
    }

    setBusyId(claim.id);

    let jobId = claim.assigned_job_id;

    if (!jobId) {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          claim_intake_id: claim.id,
          carrier_id: claim.carrier_id,
          claim_source: claim.source,
          assigned_account_id: account.id,
          assigned_account_name: account.account_name,
          customer_name: claim.customer_name,
          customer_phone: claim.customer_phone,
          customer_email: claim.customer_email,
          vehicle_year: claim.vehicle_year,
          vehicle_make: claim.vehicle_make,
          vehicle_model: claim.vehicle_model,
          vehicle_vin: claim.vehicle_vin,
          damage_type: claim.damage_type,
          damage_notes: claim.damage_notes,
          insurance_carrier: carrierName(claim.carrier_id),
          claim_number: claim.claim_number,
          policy_number: claim.policy_number,
          loss_date: claim.loss_date,
          job_status: 'New',
          invoice_amount: 0,
          amount_paid: 0,
          invoice_date: new Date().toISOString().slice(0, 10),
        })
        .select('id')
        .single();

      if (jobError || !job?.id) {
        setBusyId(null);
        window.alert(`Could not create job: ${jobError?.message || 'Unknown error'}`);
        return;
      }

      jobId = job.id as string;
    }

    const { error } = await supabase
      .from('claim_intakes')
      .update({
        assigned_account_id: account.id,
        assigned_job_id: jobId,
        intake_status: 'assigned',
        carrier_visible_status: 'Assigned',
        assignment_status: 'Manually Assigned',
      })
      .eq('id', claim.id);

    await supabase.from('claim_status_events').insert({
      claim_intake_id: claim.id,
      event_type: 'Claim Assigned',
      visible_to_carrier: true,
      note: 'Claim was assigned into the repair network.',
    });

    await supabase.from('claim_routing_audits').insert({
      claim_intake_id: claim.id,
      routing_method: 'manual_override',
      selected_account_id: account.id,
      notes: 'Admin manually assigned or updated the claim assignment.',
    });

    await supabase.from('notification_events').insert([
      {
        event_type: 'Claim Assigned',
        audience: 'shop',
        claim_intake_id: claim.id,
        job_id: jobId,
        account_id: account.id,
        carrier_id: claim.carrier_id,
        status: 'pending',
        subject: `New routed claim: ${claim.customer_name}`,
        body: 'A carrier claim was manually assigned to this shop.',
      },
      {
        event_type: 'Claim Assigned',
        audience: 'carrier',
        claim_intake_id: claim.id,
        job_id: jobId,
        carrier_id: claim.carrier_id,
        status: 'pending',
        subject: `Claim assigned: ${claim.customer_name}`,
        body: 'Your claim has been assigned in the repair network.',
      },
    ]);

    setBusyId(null);

    if (error) {
      window.alert(`Could not update claim: ${error.message}`);
      return;
    }

    await load();
  }

  async function updateVisibleStatus(claim: ClaimIntake, status: string) {
    if (isDemo) return;

    const { error } = await supabase
      .from('claim_intakes')
      .update({
        carrier_visible_status: status,
        intake_status: status.toLowerCase().replace(/\s+/g, '_'),
      })
      .eq('id', claim.id);

    if (error) {
      window.alert(`Could not update status: ${error.message}`);
      return;
    }

    await supabase.from('claim_status_events').insert({
      claim_intake_id: claim.id,
      event_type: status,
      visible_to_carrier: true,
      note: `Carrier-facing status updated to ${status}.`,
    });

    await supabase.from('notification_events').insert({
      event_type: 'Claim Status Updated',
      audience: 'carrier',
      claim_intake_id: claim.id,
      carrier_id: claim.carrier_id,
      status: 'pending',
      subject: `Claim status updated: ${status}`,
      body: `Carrier-facing claim status was updated to ${status}.`,
    });

    await load();
  }

  const needsReview = useMemo(
    () => claims.filter((claim) => !claim.assigned_job_id),
    [claims]
  );

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading claims...</div>;

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Claims Intake</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review carrier and TPA submissions, route claims, and publish carrier-facing status.
          </p>
        </div>

        {isDemo ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Demo View Only
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Needs Review" value={String(needsReview.length)} tone="amber" />
        <Metric label="Total Claims" value={String(claims.length)} />
        <Metric label="Pending Notifications" value={String(notifications.filter((event) => event.status === 'pending').length)} tone="brand" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Claims Queue</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1350px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Carrier / TPA</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Claim</th>
                <th className="px-4 py-3">Loss Area</th>
                <th className="px-4 py-3">Assigned Job</th>
                <th className="px-4 py-3">Carrier Status</th>
                <th className="px-4 py-3">Assign</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">{claim.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">{carrierName(claim.carrier_id)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{claim.customer_name}</div>
                    <div className="text-xs text-slate-500">{claim.customer_phone || claim.customer_email || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{claim.claim_number || '-'}</div>
                    <div className="text-xs text-slate-500">{claim.policy_number || '-'}</div>
                    {claim.duplicate_warning ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        Possible duplicate: {claim.duplicate_reason || 'similar claim found'}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {[claim.loss_city, claim.loss_state, claim.loss_postal_code].filter(Boolean).join(', ') || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {claim.assigned_job_id ? (
                      <Link href={`/jobs/${claim.assigned_job_id}`} className="text-brand-700 hover:underline">
                        Open Job
                      </Link>
                    ) : (
                      <span className="text-amber-700">Needs review</span>
                    )}
                    <div className="text-xs text-slate-500">
                      {accountName(claim.assigned_account_id)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(claim.carrier_visible_status)}`}>
                      {claim.carrier_visible_status}
                    </div>
                    <select
                      value={claim.carrier_visible_status}
                      onChange={(e) => void updateVisibleStatus(claim, e.target.value)}
                      disabled={isDemo}
                      className="block h-9 min-w-[150px]"
                    >
                      {['Received', 'Assigned', 'In Progress', 'Submitted', 'Completed', 'Canceled'].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <select
                        value={selectedAccountForClaim(claim)}
                        onChange={(e) =>
                          setSelectedAccounts((current) => ({
                            ...current,
                            [claim.id]: e.target.value,
                          }))
                        }
                        disabled={isDemo}
                        className="h-9 min-w-[230px]"
                      >
                        <option value="">Select account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.account_name || 'Unnamed Account'}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={isDemo || busyId === claim.id}
                        onClick={() => void assignClaim(claim)}
                        className="h-9 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {claim.assigned_job_id ? 'Update' : 'Create Job'}
                      </button>
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Timeline
                      </div>
                      <div className="mt-2 space-y-2">
                        {eventsForClaim(claim.id).map((event) => (
                          <div key={event.id} className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-900">{event.event_type}</span>
                            {' '}
                            {event.created_at.slice(0, 10)}
                          </div>
                        ))}
                        {!eventsForClaim(claim.id).length ? (
                          <div className="text-xs text-slate-500">No timeline yet.</div>
                        ) : null}
                      </div>
                    </div>
                    {auditForClaim(claim.id) ? (
                      <div className="mt-2 text-xs text-slate-500">
                        Route: {auditForClaim(claim.id)?.routing_method.replace('_', ' ')}
                        {auditForClaim(claim.id)?.selected_distance_miles
                          ? `, ${Number(auditForClaim(claim.id)?.selected_distance_miles).toFixed(1)} mi`
                          : ''}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!claims.length ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No claims have been submitted yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Notification Queue</h2>
          <p className="mt-1 text-sm text-slate-500">
            These events are queued for email/SMS wiring once provider credentials are added.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {notifications.map((event) => (
                <tr key={event.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{event.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">{event.audience}</td>
                  <td className="px-4 py-3">{event.event_type}</td>
                  <td className="px-4 py-3">{event.subject || '-'}</td>
                  <td className="px-4 py-3">{event.status}</td>
                </tr>
              ))}
              {!notifications.length ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    No notification events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-slate-900">EDI/API Intake</h2>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700">
          POST /api/claims/submit
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Manual portal, JSON API, and future EDI-translated claims all use this same intake path, so duplicate detection, geocoding, nearest greenlit routing, fallback rules, timeline, audit, and notifications stay consistent.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'amber' }) {
  const color = tone === 'brand' ? 'text-brand-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
