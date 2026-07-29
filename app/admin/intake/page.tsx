'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Eye, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ProviderPickerModal from '@/components/provider-picker';
import { useToast } from '@/components/ui/notifications';

type Intake = {
  id: string;
  lead_type: string;
  source: string;
  intake_status: string;
  triage_result: string;
  payment_path: string;
  routing_status: string;
  assigned_account_id: string | null;
  assigned_job_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  latitude: number | null;
  longitude: number | null;
  damage_location: string | null;
  damage_size: string | null;
  damage_notes: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  agent_name: string | null;
  agent_email: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  landing_page: string | null;
  created_at: string;
};

type Account = {
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
  repair_platform_fee_bps: number | null;
  replacement_platform_fee_bps: number | null;
  consumer_repair_enabled: boolean | null;
  consumer_replacement_enabled: boolean | null;
  active: boolean | null;
};

type Photo = {
  id: string;
  consumer_intake_id: string;
  file_url: string;
  file_name: string;
};

const TRIAGE_OPTIONS = [
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'repair', label: 'Repair' },
  { value: 'replacement', label: 'Replacement' },
  { value: 'not_serviceable', label: 'Not Serviceable' },
];

const PAYMENT_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'cash', label: 'Cash' },
  { value: 'insurance', label: 'Insurance' },
];

function bpsLabel(value: number | null | undefined) {
  return `${(Number(value || 0) / 100).toFixed(2)}%`;
}

function statusClass(status: string) {
  if (status === 'assigned' || status === 'scheduled') return 'border-brand-200 bg-brand-50 text-brand-700';
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'canceled' || status === 'not_serviceable') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

const PAGE_SIZE = 8;

export default function AdminConsumerIntakePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selection, setSelection] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeCounts, setActiveCounts] = useState<Record<string, number>>({});
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [origins, setOrigins] = useState<
    Record<string, { latitude: number; longitude: number } | null>
  >({});
  const [geocodingId, setGeocodingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const isDemo = role === 'demo';

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

    setRole(roleData.role);

    const [{ data: intakeRows }, { data: accountRows }, { data: photoRows }, { data: jobRows }] =
      await Promise.all([
        supabase
          .from('consumer_intakes')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('accounts')
          .select('id, account_name, city, state, postal_code, latitude, longitude, company_phone, company_email, glasweld_certified, uses_onyx, uses_zoom_injector, repair_only, repair_platform_fee_bps, replacement_platform_fee_bps, consumer_repair_enabled, consumer_replacement_enabled, active')
          .order('account_name'),
        supabase
          .from('consumer_intake_photos')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('jobs')
          .select('assigned_account_id, job_status')
          .not('assigned_account_id', 'is', null),
      ]);

    // Count providers currently busy on a job (anything not finished/canceled) so the
    // picker can exclude them by default.
    const counts: Record<string, number> = {};
    ((jobRows as { assigned_account_id: string | null; job_status: string | null }[]) || []).forEach(
      (job) => {
        if (!job.assigned_account_id) return;
        const status = job.job_status || 'New';
        if (status === 'Completed' || status === 'Canceled') return;
        counts[job.assigned_account_id] = (counts[job.assigned_account_id] || 0) + 1;
      }
    );

    setIntakes((intakeRows as Intake[]) || []);
    setAccounts((accountRows as Account[]) || []);
    setPhotos((photoRows as Photo[]) || []);
    setActiveCounts(counts);
    setLoading(false);
  }

  function getSelected(intake: Intake, field: string) {
    return selection[intake.id]?.[field] ?? String((intake as any)[field] || '');
  }

  function updateSelection(intakeId: string, field: string, value: string) {
    if (isDemo) return;

    setSelection((current) => ({
      ...current,
      [intakeId]: {
        ...current[intakeId],
        [field]: value,
      },
    }));
  }

  function photosForIntake(intakeId: string) {
    return photos.filter((photo) => photo.consumer_intake_id === intakeId);
  }

  // Resolve the customer's coordinates once per intake (cached in state) so the picker can
  // rank providers by real distance. Uses stored lat/lng when present, else geocodes the
  // city/state/ZIP via the server route. Fails soft to null → picker falls back to ranking.
  async function ensureOrigin(intake: Intake) {
    if (intake.id in origins) return;

    if (intake.latitude != null && intake.longitude != null) {
      setOrigins((o) => ({
        ...o,
        [intake.id]: { latitude: intake.latitude!, longitude: intake.longitude! },
      }));
      return;
    }

    const query = [intake.city, intake.state, intake.postal_code].filter(Boolean).join(', ');
    if (!query) {
      setOrigins((o) => ({ ...o, [intake.id]: null }));
      return;
    }

    setGeocodingId(intake.id);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const coords =
        data?.latitude != null && data?.longitude != null
          ? { latitude: Number(data.latitude), longitude: Number(data.longitude) }
          : null;
      setOrigins((o) => ({ ...o, [intake.id]: coords }));
    } catch {
      setOrigins((o) => ({ ...o, [intake.id]: null }));
    } finally {
      setGeocodingId((cur) => (cur === intake.id ? null : cur));
    }
  }

  function togglePicker(intake: Intake) {
    const next = openPickerId === intake.id ? null : intake.id;
    setOpenPickerId(next);
    if (next) void ensureOrigin(intake);
  }

  function accountOptions(triageResult: string) {
    return accounts.filter((account) => {
      // Disabled shops are out of the network — never route/assign to them.
      if (account.active === false) return false;
      if (triageResult === 'replacement') return account.consumer_replacement_enabled === true;
      if (triageResult === 'repair') return account.consumer_repair_enabled !== false;
      return true;
    });
  }

  function rankedAccountOptions(intake: Intake, triageResult: string) {
    const intakeState = String(intake.state || '').trim().toLowerCase();
    const intakeCity = String(intake.city || '').trim().toLowerCase();
    const intakeZip = String(intake.postal_code || '').trim();

    return accountOptions(triageResult)
      .map((account) => {
        let score = 0;
        const accountState = String(account.state || '').trim().toLowerCase();
        const accountCity = String(account.city || '').trim().toLowerCase();
        const accountZip = String(account.postal_code || '').trim();

        if (intakeState && accountState && intakeState === accountState) score += 4;
        if (intakeCity && accountCity && intakeCity === accountCity) score += 2;
        if (intakeZip && accountZip && intakeZip.slice(0, 3) === accountZip.slice(0, 3)) score += 1;

        return { account, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.account.account_name || '').localeCompare(String(b.account.account_name || ''));
      })
      .map((row) => row.account);
  }

  function suggestedAccount(intake: Intake, triageResult: string) {
    return rankedAccountOptions(intake, triageResult)[0] || null;
  }

  function selectedAccount(intake: Intake) {
    const accountId = getSelected(intake, 'assigned_account_id');
    return accounts.find((account) => account.id === accountId) || null;
  }

  function feeBpsFor(intake: Intake) {
    const account = selectedAccount(intake);
    const triageResult = getSelected(intake, 'triage_result') || 'repair';

    if (triageResult === 'replacement') {
      return Number(account?.replacement_platform_fee_bps ?? 700);
    }

    if (triageResult === 'repair') {
      return Number(account?.repair_platform_fee_bps ?? 300);
    }

    return 0;
  }

  async function saveTriage(intake: Intake) {
    if (isDemo) return;

    setBusyId(`save-${intake.id}`);

    const { error } = await supabase
      .from('consumer_intakes')
      .update({
        triage_result: getSelected(intake, 'triage_result') || 'needs_review',
        payment_path: getSelected(intake, 'payment_path') || 'unknown',
        intake_status:
          getSelected(intake, 'triage_result') === 'not_serviceable'
            ? 'not_serviceable'
            : 'reviewing',
        assigned_account_id: getSelected(intake, 'assigned_account_id') || null,
        routing_status: getSelected(intake, 'assigned_account_id')
          ? 'manually_assigned'
          : 'needs_review',
      })
      .eq('id', intake.id);

    setBusyId(null);

    if (error) {
      toast.error(`Could not save triage: ${error.message}`);
      return;
    }

    await load();
  }

  async function createJob(intake: Intake) {
    if (isDemo) return;

    const triageResult = getSelected(intake, 'triage_result');
    const paymentPath = getSelected(intake, 'payment_path') || 'unknown';
    const account =
      selectedAccount(intake) ||
      suggestedAccount(intake, triageResult);

    if (!account) {
      toast.error('Select an account before creating the job.');
      return;
    }

    if (triageResult !== 'repair' && triageResult !== 'replacement') {
      toast.error('Select repair or replacement before creating the job.');
      return;
    }

    setBusyId(`job-${intake.id}`);

    const vehicle = [intake.vehicle_year, intake.vehicle_make, intake.vehicle_model]
      .filter(Boolean)
      .join(' ');
    const feeBps = feeBpsFor(intake);
    const marketingSource = intake.gclid ? 'google_ads' : intake.utm_source || intake.source;

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        consumer_intake_id: intake.id,
        intake_origin: intake.lead_type === 'agent' ? 'agent' : 'consumer',
        service_type: triageResult,
        payment_path: paymentPath,
        platform_fee_bps: feeBps,
        platform_fee_status: 'pending',
        marketing_source: marketingSource,
        marketing_campaign: intake.utm_campaign,
        gclid: intake.gclid,
        landing_page: intake.landing_page,
        assigned_account_id: account.id,
        assigned_account_name: account.account_name,
        customer_name: intake.customer_name,
        customer_phone: intake.customer_phone,
        customer_email: intake.customer_email,
        vehicle_year: intake.vehicle_year,
        vehicle_make: intake.vehicle_make,
        vehicle_model: intake.vehicle_model,
        vehicle_vin: intake.vehicle_vin,
        damage_type: triageResult === 'replacement' ? 'Replacement' : intake.damage_location,
        damage_notes: [
          intake.damage_size ? `Size: ${intake.damage_size}` : '',
          intake.damage_notes || '',
        ]
          .filter(Boolean)
          .join('\n'),
        insurance_carrier: intake.insurance_carrier,
        claim_number: intake.claim_number,
        policy_number: intake.policy_number,
        job_status: 'New',
        invoice_amount: 0,
        amount_paid: 0,
        invoice_date: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single();

    if (jobError || !job?.id) {
      setBusyId(null);
      toast.error(`Could not create job: ${jobError?.message || 'Unknown error'}`);
      return;
    }

    const intakePhotos = photosForIntake(intake.id);

    if (intakePhotos.length) {
      await supabase.from('job_photos').insert(
        intakePhotos.map((photo) => ({
          job_id: job.id,
          type: 'before',
          url: photo.file_url,
        }))
      );
    }

    await supabase
      .from('consumer_intakes')
      .update({
        assigned_account_id: account.id,
        assigned_job_id: job.id,
        intake_status: 'assigned',
        routing_status: 'manually_assigned',
        triage_result: triageResult,
        payment_path: paymentPath,
      })
      .eq('id', intake.id);

    await supabase.from('notification_events').insert([
      {
        event_type: 'Consumer Job Assigned',
        audience: 'shop',
        consumer_intake_id: intake.id,
        job_id: job.id,
        account_id: account.id,
        status: 'pending',
        subject: `New consumer ${triageResult} job: ${intake.customer_name}`,
        body: 'A consumer-first intake was reviewed and assigned to this account.',
        metadata: {
          payment_path: paymentPath,
          source: marketingSource,
        },
      },
      {
        event_type: 'Consumer Job Assigned',
        audience: 'customer',
        consumer_intake_id: intake.id,
        job_id: job.id,
        account_id: account.id,
        recipient_email: intake.customer_email,
        status: 'pending',
        subject: 'Your windshield review has been routed',
        body: `Your windshield review has been routed for ${triageResult}. The assigned provider is ${account.account_name || 'your repair network provider'}.`,
        metadata: {
          customer_phone: intake.customer_phone,
          payment_path: paymentPath,
          assigned_account_name: account.account_name,
        },
      },
    ]);

    setBusyId(null);
    await load();
  }

  const needsReview = useMemo(
    () => intakes.filter((intake) => !intake.assigned_job_id && intake.intake_status !== 'not_serviceable'),
    [intakes]
  );

  const openIntake = openPickerId ? intakes.find((i) => i.id === openPickerId) || null : null;
  const openTriage = openIntake
    ? getSelected(openIntake, 'triage_result') || 'needs_review'
    : 'needs_review';

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading consumer intake...</div>;
  }

  const totalPages = Math.max(1, Math.ceil(intakes.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pagedIntakes = intakes.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-brand-700">
            Back to Admin
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">
            Consumer & Agent Intake
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Triage public leads, assign repair or replacement partners, and create routed jobs.
          </p>
        </div>

        {isDemo ? (
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-soft">
            <Eye className="h-4 w-4 text-slate-500" />
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Demo View
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Needs Review" value={String(needsReview.length)} tone="amber" />
        <Metric label="Total Intakes" value={String(intakes.length)} />
        <Metric label="Consumer" value={String(intakes.filter((row) => row.lead_type === 'consumer').length)} tone="brand" />
        <Metric label="Agent" value={String(intakes.filter((row) => row.lead_type === 'agent').length)} tone="green" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Triage Queue</h2>
          <span className="text-sm text-slate-500">{intakes.length} total</span>
        </div>

        <div className="divide-y divide-slate-100">
          {pagedIntakes.map((intake) => {
            const triageResult = getSelected(intake, 'triage_result') || 'needs_review';
            const intakePhotos = photosForIntake(intake.id);
            const options = rankedAccountOptions(intake, triageResult);
            const recommendedAccount = suggestedAccount(intake, triageResult);
            const selectedPartnerId = getSelected(intake, 'assigned_account_id');
            const selectedPartner =
              accounts.find((account) => account.id === selectedPartnerId) || null;

            const isOpen = expanded.has(intake.id);
            return (
              <div key={intake.id}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(intake.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                      isOpen ? 'rotate-90' : ''
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {intake.customer_name || 'Unnamed'}
                      </span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusClass(intake.intake_status)}`}>
                        {intake.intake_status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {intake.lead_type}
                      </span>
                      {intake.assigned_job_id ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          job created
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {[
                        [intake.city, intake.state].filter(Boolean).join(', '),
                        [intake.vehicle_year, intake.vehicle_make, intake.vehicle_model]
                          .filter(Boolean)
                          .join(' '),
                      ]
                        .filter(Boolean)
                        .join('  ·  ') || 'No location / vehicle'}
                    </div>
                  </div>
                </button>

                {isOpen ? (
                  <div className="grid gap-5 px-5 pb-5 xl:grid-cols-[1.1fr_1.4fr]">
                    <div>
                      <div className="text-sm text-slate-600">
                        <div>{intake.customer_phone || '-'} {intake.customer_email ? `· ${intake.customer_email}` : ''}</div>
                        <div>{[intake.city, intake.state, intake.postal_code].filter(Boolean).join(', ') || '-'}</div>
                        <div>{[intake.vehicle_year, intake.vehicle_make, intake.vehicle_model].filter(Boolean).join(' ') || '-'}</div>
                      </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <div><b>Damage:</b> {[intake.damage_location, intake.damage_size].filter(Boolean).join(' · ') || '-'}</div>
                    <div className="mt-1 whitespace-pre-wrap">{intake.damage_notes || 'No notes.'}</div>
                    <div className="mt-2"><b>Insurance:</b> {intake.insurance_carrier || '-'}</div>
                    {intake.agent_name || intake.agent_email ? (
                      <div className="mt-1"><b>Agent:</b> {[intake.agent_name, intake.agent_email].filter(Boolean).join(' · ')}</div>
                    ) : null}
                  </div>

                  {intakePhotos.length ? (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {intakePhotos.map((photo) => (
                        <a key={photo.id} href={photo.file_url} target="_blank" rel="noreferrer">
                          <img
                            src={photo.file_url}
                            alt={photo.file_name}
                            className="aspect-square rounded-xl border border-slate-200 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Triage
                      </span>
                      <select
                        value={triageResult}
                        disabled={isDemo}
                        onChange={(e) => updateSelection(intake.id, 'triage_result', e.target.value)}
                      >
                        {TRIAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Payment Path
                      </span>
                      <select
                        value={getSelected(intake, 'payment_path') || 'unknown'}
                        disabled={isDemo}
                        onChange={(e) => updateSelection(intake.id, 'payment_path', e.target.value)}
                      >
                        {PAYMENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-1 md:col-span-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {triageResult === 'replacement' ? 'Replacement Partner' : triageResult === 'repair' ? 'Repair Partner' : 'Assigned Partner'}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                          {selectedPartner ? (
                            <span className="font-medium text-slate-900">
                              {selectedPartner.account_name || 'Unnamed provider'}
                              <span className="font-normal text-slate-500">
                                {[selectedPartner.city, selectedPartner.state].filter(Boolean).length
                                  ? ` — ${[selectedPartner.city, selectedPartner.state].filter(Boolean).join(', ')}`
                                  : ''}
                              </span>
                            </span>
                          ) : recommendedAccount ? (
                            <span className="text-slate-500">
                              Suggested: {recommendedAccount.account_name || 'Unnamed provider'} — Create Job uses this unless you choose another.
                            </span>
                          ) : (
                            <span className="text-slate-400">No provider selected.</span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={isDemo}
                          onClick={() => togglePicker(intake)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {selectedPartner ? 'Change provider' : 'Choose provider'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600 md:grid-cols-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Source</div>
                      <div className="mt-1">{intake.gclid ? 'google_ads' : intake.utm_source || intake.source}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Campaign</div>
                      <div className="mt-1">{intake.utm_campaign || '-'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fee</div>
                      <div className="mt-1">{bpsLabel(feeBpsFor(intake))}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {intake.assigned_job_id ? (
                      <Link
                        href={`/jobs/${intake.assigned_job_id}`}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Open Job
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={isDemo || busyId === `save-${intake.id}`}
                      onClick={() => void saveTriage(intake)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save Triage
                    </button>
                    <button
                      type="button"
                      disabled={isDemo || Boolean(intake.assigned_job_id) || busyId === `job-${intake.id}`}
                      onClick={() => void createJob(intake)}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === `job-${intake.id}`
                        ? 'Creating...'
                        : selectedPartnerId
                          ? 'Create Job'
                          : 'Create With Suggested'}
                    </button>
                  </div>
                </div>
              </div>
                ) : null}
              </div>
            );
          })}

          {!intakes.length ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No consumer or agent intakes yet.
            </div>
          ) : null}
        </div>

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm">
            <span className="text-slate-500">
              Page {pageSafe + 1} of {totalPages} · showing {pagedIntakes.length} of {intakes.length}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pageSafe === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={pageSafe >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {openIntake ? (
        <ProviderPickerModal
          open
          onClose={() => setOpenPickerId(null)}
          customerLocation={
            [openIntake.city, openIntake.state, openIntake.postal_code].filter(Boolean).join(', ') || undefined
          }
          accounts={rankedAccountOptions(openIntake, openTriage)}
          activeCounts={activeCounts}
          origin={origins[openIntake.id] ?? null}
          geocoding={geocodingId === openIntake.id}
          selectedId={getSelected(openIntake, 'assigned_account_id')}
          onSelect={(id) => updateSelection(openIntake.id, 'assigned_account_id', id)}
        />
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brand' | 'amber' | 'green';
}) {
  const color =
    tone === 'brand'
      ? 'text-brand-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'green'
          ? 'text-emerald-700'
          : 'text-slate-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
