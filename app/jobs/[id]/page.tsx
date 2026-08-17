'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import BeforeAfterSlider from '@/components/before-after-slider';
import ProviderPickerModal from '@/components/provider-picker';
import { useToast } from '@/components/ui/notifications';
import { DetailPageSkeleton } from '@/components/ui/skeleton';

const JOB_STATUSES = ['New', 'In Progress', 'Submitted', 'Completed', 'Canceled'];
const DAMAGE_TYPES = ['Combo Break', 'Bullseye', 'Star Break', 'Crack', 'Pit', 'Other'];
const SERVICE_TYPES = ['repair', 'replacement', 'unknown'];
const PAYMENT_PATHS = ['unknown', 'cash', 'insurance'];
// Reporting only — how the customer actually paid. Distinct from payment_path (which drives
// the customer-owes math). Optional; the platform fee is ALWAYS the full invoice total.
const PAYMENT_METHODS = ['cash', 'card', 'insurance', 'financing'];
type EditableTarget = { table: 'jobs'; field: string } | null;

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function invoiceNumber() {
  return `INV-${Date.now()}`;
}

function valueOrDash(value: string | null | undefined) {
  return value || '—';
}

function carrierStatusFromJobStatus(status: string | number | null) {
  if (status === 'Completed') return 'Completed';
  if (status === 'Submitted') return 'Submitted';
  if (status === 'In Progress') return 'In Progress';
  if (status === 'Canceled') return 'Canceled';
  return 'Assigned';
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const toast = useToast();

  const [role, setRole] = useState<string | null>(null);
  const [job, setJob] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [chargeAmount, setChargeAmount] = useState<number>(0);
  const [savedMessage, setSavedMessage] = useState('');

  // Provider (re)assignment — admins can swap the assigned shop while the job is still
  // 'New' (before work starts); it locks once In Progress. Loaded lazily for admins only.
  const [accounts, setAccounts] = useState<any[]>([]);
  const [activeCounts, setActiveCounts] = useState<Record<string, number>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  // Customer origin for the provider picker's distance ranking (best-match / nearest),
  // geocoded from the job's customer city/state/ZIP — same as the intake picker.
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const [editing, setEditing] = useState<EditableTarget>(null);
  const [draftValue, setDraftValue] = useState('');

  // Only admins edit a job (status, fields, invoice, payments). A shop viewing a
  // routed job — and the demo role — get a read-only view. RLS is the real backstop:
  // shops have no write policy on network.jobs, so any write would fail server-side too.
  const isReadOnly = role !== 'admin';

  useEffect(() => {
    void loadPage();
  }, [id]);

  useEffect(() => {
    if (invoice) {
      const balance =
        Number(invoice.invoice_amount || 0) - Number(invoice.amount_paid || 0);
      setChargeAmount(Number(Math.max(balance, 0).toFixed(2)));
    }
  }, [invoice]);

  // Geocode the customer location so the provider picker can rank by real distance
  // (best-match / nearest). Fails soft to null → the picker falls back to "By region".
  useEffect(() => {
    const query = [job?.customer_city, job?.customer_state, job?.customer_zip]
      .filter(Boolean)
      .join(', ');
    if (!query) {
      setOrigin(null);
      return;
    }
    let cancelled = false;
    setGeocoding(true);
    fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setOrigin(
          d?.latitude != null && d?.longitude != null
            ? { latitude: Number(d.latitude), longitude: Number(d.longitude) }
            : null
        );
      })
      .catch(() => {
        if (!cancelled) setOrigin(null);
      })
      .finally(() => {
        if (!cancelled) setGeocoding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job?.customer_city, job?.customer_state, job?.customer_zip]);

  function flashSaved(message = 'Saved') {
    setSavedMessage(message);
    window.setTimeout(() => setSavedMessage(''), 1800);
  }

  async function loadPage() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status')
      .eq('user_email', email)
      .maybeSingle();

    if (!roleData || !roleData.approved || roleData.access_status !== 'Active') {
      window.location.href = '/login';
      return;
    }

    if (roleData.role === 'carrier') {
      window.location.href = '/claims';
      return;
    }

    setRole(roleData.role);

    // maybeSingle (not single) so an RLS miss — a shop opening a job that isn't
    // theirs — returns null cleanly (→ "Job not found") instead of throwing.
    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*')
      .eq('job_id', id)
      .maybeSingle();

    const { data: photoData } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', id);

    // Providers + current job load, for admin reassignment (busy = active jobs, so the
    // picker can flag over-loaded shops). Shops/carriers never reassign, so skip the fetch.
    if (roleData.role === 'admin') {
      const [{ data: accountRows }, { data: jobRows }] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, account_name, city, state, postal_code, latitude, longitude, company_phone, company_email, glasweld_certified, uses_onyx, uses_zoom_injector, repair_only, consumer_repair_enabled, consumer_replacement_enabled, active, provider_type, repair_platform_fee_bps, replacement_platform_fee_bps')
          .order('account_name'),
        supabase
          .from('jobs')
          .select('assigned_account_id, job_status')
          .not('assigned_account_id', 'is', null),
      ]);

      const counts: Record<string, number> = {};
      ((jobRows as { assigned_account_id: string | null; job_status: string | null }[]) || []).forEach(
        (j) => {
          if (!j.assigned_account_id) return;
          const st = j.job_status || 'New';
          if (st === 'Completed' || st === 'Canceled') return;
          counts[j.assigned_account_id] = (counts[j.assigned_account_id] || 0) + 1;
        },
      );
      setAccounts((accountRows as any[]) || []);
      setActiveCounts(counts);
    }

    let eventData: any[] = [];

    if (invoiceData?.id) {
      const { data } = await supabase
        .from('invoice_events')
        .select('*')
        .eq('invoice_id', invoiceData.id)
        .order('created_at', { ascending: false })
        .limit(8);

      eventData = data || [];
    }

    setJob(jobData);
    setInvoice(invoiceData);
    setPhotos(photoData || []);
    setEvents(eventData);
    setLoading(false);
  }

  // Keep an already-generated invoice's technician in sync with the job's.
  async function syncInvoiceTechName(techName: string | null | undefined) {
    if (!invoice?.id) return;
    await supabase
      .from('invoices')
      .update({ tech_name: String(techName || '').trim() || null })
      .eq('id', invoice.id);
  }

  // Swap the assigned shop — allowed at any point mid-job (New / In Progress / Submitted),
  // just not on a Completed or Canceled job (those are closed, billed records; reassigning
  // would misattribute the invoice + platform fee). Re-prices platform_fee_bps to the NEW
  // provider's rate for the job's service type so billing follows whoever actually does the
  // work (independent techs are fee-exempt → their stored 0 is preserved). Writes both the
  // id and the denormalized name the rest of the UI reads.
  async function reassignProvider(accountId: string) {
    setPickerOpen(false);
    if (!job || isReadOnly || reassignBlocked) return;
    const account = accounts.find((a) => a.id === accountId);
    if (!account || accountId === job.assigned_account_id) return;

    const feeBps =
      job.service_type === 'replacement'
        ? Number(account.replacement_platform_fee_bps ?? 500)
        : job.service_type === 'repair'
          ? Number(account.repair_platform_fee_bps ?? 500)
          : Number(job.platform_fee_bps ?? 0);

    setWorking(true);
    const { error } = await supabase
      .from('jobs')
      .update({
        assigned_account_id: account.id,
        assigned_account_name: account.account_name,
        platform_fee_bps: feeBps,
      })
      .eq('id', job.id);
    setWorking(false);

    if (error) {
      toast.error(`Could not reassign provider: ${error.message}`);
      return;
    }
    setJob({
      ...job,
      assigned_account_id: account.id,
      assigned_account_name: account.account_name,
      platform_fee_bps: feeBps,
    });
    flashSaved('Provider reassigned');
  }

  // Save an editable money figure on the job. When editing the price and an invoice already
  // exists, sync it onto the invoice row too, since display + the completion billing event
  // read the invoice's invoice_amount first — otherwise the edit wouldn't take effect.
  async function saveMoney(field: 'invoice_amount' | 'insurance_amount', value: number | null) {
    if (!job || isReadOnly) return;
    if (Number(job[field] ?? null) === Number(value ?? null)) return; // no-op

    setWorking(true);
    const { error } = await supabase.from('jobs').update({ [field]: value }).eq('id', job.id);
    if (!error && field === 'invoice_amount' && invoice?.id) {
      const { error: invErr } = await supabase
        .from('invoices')
        .update({ invoice_amount: value })
        .eq('id', invoice.id);
      if (!invErr) setInvoice({ ...invoice, invoice_amount: value });
    }
    setWorking(false);

    if (error) {
      toast.error(`Could not save: ${error.message}`);
      return;
    }
    setJob({ ...job, [field]: value });
    flashSaved();
  }

  async function updateJobField(field: string, value: string | number | null) {
    if (!job || isReadOnly) return;

    const previousStatus = job.job_status;

    // A job can't be completed without naming the technician who did the repair — it
    // flows onto the invoice. Gate BEFORE the write so the status change is blocked.
    // Covers the Mark Complete button and both status dropdowns (all route through here).
    if (
      field === 'job_status' &&
      value === 'Completed' &&
      previousStatus !== 'Completed' &&
      !String(job.tech_name || '').trim()
    ) {
      toast.error('Enter the technician name before marking this job complete.');
      return;
    }

    const { error } = await supabase
      .from('jobs')
      .update({ [field]: value === '' ? null : value })
      .eq('id', job.id);

    if (error) {
      toast.error(`Could not update job: ${error.message}`);
      return;
    }

    const nextJob = { ...job, [field]: value === '' ? null : value };

    setJob(nextJob);

    // Editing the technician on a job that already has an invoice → keep the invoice current.
    if (field === 'tech_name') {
      await syncInvoiceTechName(nextJob.tech_name);
    }

    if (
      field === 'job_status' &&
      value === 'Completed' &&
      previousStatus !== 'Completed'
    ) {
      await recordCompletedJobBillingEvent(nextJob);
      await syncInvoiceTechName(nextJob.tech_name);
    }

    if (field === 'job_status' && nextJob.claim_intake_id) {
      const carrierStatus = carrierStatusFromJobStatus(value);

      await supabase
        .from('claim_intakes')
        .update({
          carrier_visible_status: carrierStatus,
          intake_status: carrierStatus.toLowerCase().replace(/\s+/g, '_'),
        })
        .eq('id', nextJob.claim_intake_id);

      await supabase.from('claim_status_events').insert({
        claim_intake_id: nextJob.claim_intake_id,
        event_type: carrierStatus,
        visible_to_carrier: true,
        note: `Job status updated to ${carrierStatus}.`,
      });
    }

    flashSaved();
  }

  async function recordCompletedJobBillingEvent(completedJob = job) {
    if (!completedJob?.assigned_account_id || isReadOnly) return;

    const { data: userData } = await supabase.auth.getUser();
    const userEmail = userData.user?.email?.toLowerCase() || null;

    const { data: accountBilling } = await supabase
      .from('accounts')
      .select('billing_enabled, repair_platform_fee_bps, replacement_platform_fee_bps')
      .eq('id', completedJob.assigned_account_id)
      .maybeSingle();

    if (accountBilling?.billing_enabled === false) return;

    const invoiceAmount = Number(
      invoice?.invoice_amount ?? completedJob.invoice_amount ?? 0
    );

    const serviceType = completedJob.service_type || 'repair';
    const percentageBps = Number(
      completedJob.platform_fee_bps ||
        (serviceType === 'replacement'
          ? accountBilling?.replacement_platform_fee_bps
          : accountBilling?.repair_platform_fee_bps) ||
        0
    );
    const percentageFeeCents = Math.round(
      (invoiceAmount * 100 * percentageBps) / 10000
    );
    const eventType = 'platform_revenue_share';

    if (percentageFeeCents <= 0) return;

    await supabase
      .from('jobs')
      .update({
        platform_fee_bps: percentageBps,
        platform_fee_cents: percentageFeeCents,
        platform_fee_status: 'pending',
      })
      .eq('id', completedJob.id);

    const { error } = await supabase.from('billing_events').upsert(
      {
        billing_key: `${eventType}:${completedJob.id}`,
        account_id: completedJob.assigned_account_id,
        job_id: completedJob.id,
        invoice_id: invoice?.id ?? null,
        event_type: eventType,
        description: `${serviceType === 'replacement' ? 'Replacement' : 'Repair'} platform revenue share`,
        amount_cents: percentageFeeCents,
        status: 'pending',
        created_by_email: userEmail,
        metadata: {
          customer_name: completedJob.customer_name,
          invoice_amount: invoiceAmount,
          assigned_account_name: completedJob.assigned_account_name,
          intake_origin: completedJob.intake_origin || 'admin',
          service_type: serviceType,
          payment_path: completedJob.payment_path || 'unknown',
          payment_method: completedJob.payment_method || null,
          platform_fee_bps: percentageBps,
        },
      },
      { onConflict: 'billing_key' }
    );

    if (error) {
      console.warn('Completed job billing event was not recorded.', error.message);
    }
  }

  async function saveDraftField(field: string) {
    if (isReadOnly) return;

    await updateJobField(field, draftValue.trim() || null);
    setEditing(null);
  }

  function startEdit(field: string, value: string | null | undefined) {
    if (isReadOnly) return;

    setEditing({ table: 'jobs', field });
    setDraftValue(value || '');
  }

  async function scoreRepair(silent = false) {
    if (isReadOnly) return;

    try {
      setScoring(true);
      const res = await fetch(`/api/jobs/${id}/score-repair`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) toast.error(data?.error || 'Could not score this repair.');
        return;
      }
      await loadPage();
      if (!silent) flashSaved('Rex scored the repair');
    } catch (err: any) {
      if (!silent) toast.error(`Scoring error: ${err?.message || String(err)}`);
    } finally {
      setScoring(false);
    }
  }

  async function reviewScore(action: 'approve' | 'reject') {
    if (isReadOnly) return;

    const { error } = await supabase
      .from('jobs')
      .update({ repair_score_status: action === 'approve' ? 'approved' : 'rejected' })
      .eq('id', id);

    if (error) {
      toast.error(`Could not update the review: ${error.message}`);
      return;
    }

    await loadPage();
    flashSaved(action === 'approve' ? 'Score approved' : 'Score rejected');
  }

  async function generateInvoice() {
    if (!job || isReadOnly) return;

    setWorking(true);

    const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
      .filter(Boolean)
      .join(' ');

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber(),
        job_id: job.id,
        account_id: job.assigned_account_id,
        account_name: job.assigned_account_name,
        customer_name: job.customer_name,
        customer_email: job.customer_email,
        customer_phone: job.customer_phone,
        vehicle,
        vin: job.vehicle_vin,
        tech_name: job.tech_name,
        damage_type: job.damage_type,
        damage_notes: job.damage_notes,
        invoice_amount: job.invoice_amount || 0,
        amount_paid: job.amount_paid || 0,
        insurance_carrier: job.insurance_carrier,
        claim_number: job.claim_number,
        policy_number: job.policy_number,
        loss_date: job.loss_date,
        status: 'Draft',
        payment_status:
          Number(job.amount_paid || 0) >= Number(job.invoice_amount || 0)
            ? 'Paid'
            : 'Unpaid',
      })
      .select('*')
      .single();

    if (error) {
      toast.error('Could not generate invoice.');
      setWorking(false);
      return;
    }

    await supabase.from('invoice_events').insert({
      invoice_id: data.id,
      event_type: 'Invoice Generated',
      note: 'Invoice generated from job detail page.',
    });

    await updateJobField('job_status', 'In Progress');

    setInvoice(data);
    setWorking(false);
    await loadPage();
    flashSaved('Invoice generated');
  }

  async function submitToInsurance() {
    if (!invoice || isReadOnly) return;

    setWorking(true);

    await supabase
      .from('invoices')
      .update({
        submission_status: 'Submitted',
        status: 'Sent',
      })
      .eq('id', invoice.id);

    await supabase
      .from('jobs')
      .update({
        job_status: 'Submitted',
      })
      .eq('id', id);

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Insurance Submitted',
      note: 'Marked as submitted. Email or EDI integration will be added later.',
    });

    setWorking(false);
    await loadPage();
    flashSaved('Submitted to insurance');
  }

  async function markComplete() {
    if (isReadOnly) return;

    await updateJobField('job_status', 'Completed');
    await loadPage();
  }

  async function collectPayment(amountOverride?: number) {
    if (!invoice || !job || isReadOnly) return;

    const amountToCharge = Number(amountOverride ?? chargeAmount ?? 0);

    if (amountToCharge <= 0) {
      toast.error('Enter a charge amount greater than $0.00.');
      return;
    }

    setWorking(true);

    const invoiceTotal = Number(invoice.invoice_amount || 0);
    const currentPaid = Number(invoice.amount_paid || 0);
    const newPaid = Number((currentPaid + amountToCharge).toFixed(2));
    const newOutstanding = Number(Math.max(invoiceTotal - newPaid, 0).toFixed(2));
    const paymentStatus = newOutstanding <= 0 ? 'Paid' : 'Partial Payment';
    // Never block collecting money — but auto-complete only when the technician is named
    // (completion requires it). A paid-in-full job without a tech waits for Mark Complete.
    const canComplete = newOutstanding <= 0 && !!String(job.tech_name || '').trim();

    await supabase
      .from('invoices')
      .update({
        amount_paid: newPaid,
        payment_status: paymentStatus,
        status: newOutstanding <= 0 ? 'Paid' : invoice.status || 'Sent',
      })
      .eq('id', invoice.id);

    await supabase
      .from('jobs')
      .update({
        amount_paid: newPaid,
        payment_status: paymentStatus,
        job_status: canComplete ? 'Completed' : job.job_status,
      })
      .eq('id', job.id);

    if (canComplete && job.job_status !== 'Completed') {
      await recordCompletedJobBillingEvent({
        ...job,
        amount_paid: newPaid,
        payment_status: paymentStatus,
        job_status: 'Completed',
      });
      await syncInvoiceTechName(job.tech_name);
    }

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Payment Recorded',
      note: `Payment recorded for ${money(amountToCharge)}. Gateway integration will be added later.`,
    });

    if (newOutstanding <= 0 && !canComplete) {
      toast.info(
        'Payment collected. Enter the technician name, then Mark Complete to finish the job.',
      );
    }

    setWorking(false);
    await loadPage();
    flashSaved('Payment recorded');
  }

  if (loading) return <DetailPageSkeleton cards={4} />;
  if (!job) return <div className="p-6">Job not found</div>;

  const displayInvoiceAmount = invoice?.invoice_amount ?? job.invoice_amount;
  const displayPaid = invoice?.amount_paid ?? job.amount_paid;
  const displayOutstanding =
    Number(displayInvoiceAmount || 0) - Number(displayPaid || 0);

  const invoiceOutstanding = invoice
    ? Number(invoice.invoice_amount || 0) - Number(invoice.amount_paid || 0)
    : displayOutstanding;

  // Per-job money math: price (invoice) − what insurance covers = what the customer pays
  // out of pocket ("to collect"). Price is invoice-row-aware; insurance is a job field.
  const price = Number(displayInvoiceAmount || 0);
  const insuranceCovers = Number(job.insurance_amount || 0);
  const customerOwes = Math.max(price - insuranceCovers, 0);

  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
    .filter(Boolean)
    .join(' ');

  const beforePhotos = photos.filter((photo) => photo.type === 'before');
  const afterPhotos = photos.filter((photo) => photo.type === 'after');
  const latestEvent = events[0];

  // A job can be handed to a different provider at any point mid-job — only a Completed or
  // Canceled job is locked (closed, billed records; reassigning would misattribute the
  // invoice + fee). Only admins get the fetched accounts, so the control never renders for
  // shops/carriers.
  const reassignBlocked = job.job_status === 'Completed' || job.job_status === 'Canceled';
  const canReassign = !isReadOnly && !reassignBlocked;
  // A repair-only shop can't take a replacement (and vice-versa); mirror the intake filter.
  const eligibleProviders = accounts.filter((a) => {
    if (a.active === false) return false;
    if (job.service_type === 'replacement') return a.consumer_replacement_enabled === true;
    if (job.service_type === 'repair') return a.consumer_repair_enabled !== false;
    return true;
  });

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-4 py-6 sm:px-6">
      <ProviderPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        customerLocation={
          [job.customer_city, job.customer_state, job.customer_zip]
            .filter(Boolean)
            .join(', ') || undefined
        }
        accounts={eligibleProviders}
        activeCounts={activeCounts}
        origin={origin}
        geocoding={geocoding}
        selectedId={job.assigned_account_id || ''}
        onSelect={(id) => void reassignProvider(id)}
      />
      <div className="flex items-center justify-between">
        <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-brand-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Link>

        {savedMessage ? (
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            <Check className="h-4 w-4" />
            {savedMessage}
          </div>
        ) : null}

        {role === 'demo' || role === 'shop' ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {role === 'shop' ? 'Provider view' : 'Demo View Only'}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          {/* Display-only title. customer_name is edited in the Customer & Vehicle section;
              wiring the title to the same shared `editing.field` too rendered TWO autoFocus
              inputs, whose focus race blurred the field and dropped it out of edit mode. */}
          <EditableTitle
            value={job.customer_name || ''}
            onEdit={() => {}}
            isEditing={false}
            draftValue={draftValue}
            setDraftValue={setDraftValue}
            onSave={() => {}}
            onCancel={() => {}}
            readOnly
          />

          <p className="mt-1 text-sm text-slate-500">
            Job detail, photos, invoice, insurance submission, and payment tracking.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Printable job assignment sheet — available to every viewer (a shop prints
              their assigned job to work it on paper), not just admins. Opens inline so
              the browser's PDF viewer can print it directly. */}
          <a
            href={`/api/jobs/${job.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Print Job
          </a>

          {!invoice && !isReadOnly ? (
            <button
              onClick={() => void generateInvoice()}
              disabled={working}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {working ? 'Generating...' : 'Generate Invoice'}
            </button>
          ) : null}

          {invoice ? (
            <>
              <Link
                href={`/invoices/${invoice.id}`}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open Invoice
              </Link>

              <Link
                href={`/api/invoices/${invoice.id}/pdf`}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open PDF
              </Link>

              {!isReadOnly ? (
                <button
                  type="button"
                  disabled={working}
                  onClick={() => void submitToInsurance()}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  Submit to Insurance
                </button>
              ) : null}
            </>
          ) : null}

          {job.job_status === 'Completed' ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              <Check className="h-4 w-4" />
              Completed
            </span>
          ) : !isReadOnly ? (
            <button
              type="button"
              disabled={working}
              onClick={() => void markComplete()}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              Mark Complete
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Invoice" value={money(displayInvoiceAmount)} />
        <Stat label="Paid" value={money(displayPaid)} tone="green" />
        <Stat label="Outstanding" value={money(displayOutstanding)} tone="red" />
        <StatusStat
          value={job.job_status || 'New'}
          onChange={(value) => void updateJobField('job_status', value)}
          readOnly={isReadOnly}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Job Information">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Shop
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-900">
                    {valueOrDash(job.assigned_account_name)}
                  </span>
                  {canReassign ? (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      disabled={working}
                      className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Change
                    </button>
                  ) : null}
                </div>
                {!isReadOnly && reassignBlocked ? (
                  <div className="mt-0.5 text-xs text-slate-400">
                    Locked — {(job.job_status || '').toLowerCase()} jobs can't be reassigned.
                  </div>
                ) : null}
              </div>
              <EditableSelect
                label="Job Status"
                value={job.job_status || 'New'}
                options={JOB_STATUSES}
                onSave={(value) => void updateJobField('job_status', value)}
                readOnly={isReadOnly}
              />
              <EditableSelect
                label="Service Type"
                value={job.service_type || 'repair'}
                options={SERVICE_TYPES}
                onSave={(value) => void updateJobField('service_type', value)}
                readOnly={isReadOnly}
              />
              <EditableSelect
                label="Payment Path"
                value={job.payment_path || 'unknown'}
                options={PAYMENT_PATHS}
                onSave={(value) => void updateJobField('payment_path', value)}
                readOnly={isReadOnly}
              />
              <EditableSelect
                label="Payment Method (optional)"
                value={job.payment_method || ''}
                options={PAYMENT_METHODS}
                onSave={(value) => void updateJobField('payment_method', value || null)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Invoice Date"
                value={job.invoice_date}
                type="date"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                field="invoice_date"
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Technician (required to complete)"
                value={job.tech_name}
                field="tech_name"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <EditableSelect
                label="Damage Type"
                value={job.damage_type || ''}
                options={DAMAGE_TYPES}
                onSave={(value) => void updateJobField('damage_type', value)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Damage Notes"
                value={job.damage_notes}
                field="damage_notes"
                large
                full
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
            </div>
          </Section>

          <Section title="Money">
            <div className="grid gap-4 sm:grid-cols-3">
              <MoneyInput
                label="Price (invoice)"
                value={price}
                onSave={(v) => void saveMoney('invoice_amount', v)}
                readOnly={isReadOnly}
                working={working}
              />
              <MoneyInput
                label="Insurance covers"
                value={insuranceCovers}
                onSave={(v) => void saveMoney('insurance_amount', v)}
                readOnly={isReadOnly}
                working={working}
              />
              <ComputedMoney label="Customer owes" value={customerOwes} tone="brand" hint="Price − insurance" />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <ComputedMoney label="Paid" value={Number(displayPaid || 0)} tone="green" small />
              <ComputedMoney label="Outstanding" value={displayOutstanding} tone="red" small hint="Price − paid" />
            </div>
          </Section>

          <Section title="Customer & Vehicle">
            <div className="grid gap-4 md:grid-cols-2">
              <EditableField
                label="Customer"
                value={job.customer_name}
                field="customer_name"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Customer Phone"
                value={job.customer_phone}
                field="customer_phone"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Customer Email"
                value={job.customer_email}
                field="customer_email"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <div className="grid grid-cols-3 gap-2">
                <EditableField
                  label="Year"
                  value={job.vehicle_year}
                  field="vehicle_year"
                  editing={editing}
                  draftValue={draftValue}
                  setDraftValue={setDraftValue}
                  startEdit={startEdit}
                  saveDraftField={saveDraftField}
                  cancel={() => setEditing(null)}
                  readOnly={isReadOnly}
                />
                <EditableField
                  label="Make"
                  value={job.vehicle_make}
                  field="vehicle_make"
                  editing={editing}
                  draftValue={draftValue}
                  setDraftValue={setDraftValue}
                  startEdit={startEdit}
                  saveDraftField={saveDraftField}
                  cancel={() => setEditing(null)}
                  readOnly={isReadOnly}
                />
                <EditableField
                  label="Model"
                  value={job.vehicle_model}
                  field="vehicle_model"
                  editing={editing}
                  draftValue={draftValue}
                  setDraftValue={setDraftValue}
                  startEdit={startEdit}
                  saveDraftField={saveDraftField}
                  cancel={() => setEditing(null)}
                  readOnly={isReadOnly}
                />
              </div>
              <EditableField
                label="VIN"
                value={job.vehicle_vin}
                field="vehicle_vin"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
            </div>
          </Section>

          <Section title="Insurance">
            <div className="grid gap-4 md:grid-cols-2">
              <EditableField
                label="Carrier"
                value={job.insurance_carrier}
                field="insurance_carrier"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Claim Number"
                value={job.claim_number}
                field="claim_number"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Policy Number"
                value={job.policy_number}
                field="policy_number"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
              <EditableField
                label="Loss Date"
                value={job.loss_date}
                type="date"
                field="loss_date"
                editing={editing}
                draftValue={draftValue}
                setDraftValue={setDraftValue}
                startEdit={startEdit}
                saveDraftField={saveDraftField}
                cancel={() => setEditing(null)}
                readOnly={isReadOnly}
              />
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Quick View">
            <div className="space-y-4">
              <Quick label="Customer" value={job.customer_name} />
              <Quick label="Shop" value={job.assigned_account_name} />
              <Quick label="Vehicle" value={vehicle} />
              <Quick label="Insurance" value={job.insurance_carrier} />
              <Quick label="Origin" value={job.intake_origin || 'admin'} />
              <Quick label="Service" value={job.service_type || 'repair'} />
              <Quick label="Payment Path" value={job.payment_path || 'unknown'} />
              {job.payment_method ? (
                <Quick label="Payment Method" value={job.payment_method} />
              ) : null}
              <Quick
                label="Platform Fee"
                value={
                  job.platform_fee_cents
                    ? money(Number(job.platform_fee_cents) / 100)
                    : `${(Number(job.platform_fee_bps || 0) / 100).toFixed(2)}%`
                }
              />
              <Quick
                label="Last Activity"
                value={
                  latestEvent
                    ? `${latestEvent.event_type || 'Activity'}`
                    : 'No activity yet'
                }
              />
            </div>
          </Section>

          {invoice ? (
            <Section title={`Invoice ${invoice.invoice_number || ''}`}>
              <div className="space-y-4">
                <Quick label="Invoice Status" value={invoice.status || 'Draft'} />
                <Quick
                  label="Insurance"
                  value={invoice.submission_status || 'Not Submitted'}
                />
                <Quick label="Payment" value={invoice.payment_status || 'Not Ready'} />

                {!isReadOnly ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Charge Amount
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={chargeAmount}
                          onChange={(e) => setChargeAmount(Number(e.target.value))}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
                        />
                        <div className="mt-1 text-xs text-slate-500">
                          Balance: {money(invoiceOutstanding)}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <button
                          type="button"
                          disabled={working || invoiceOutstanding <= 0}
                          onClick={() => void collectPayment(invoiceOutstanding)}
                          className="h-10 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Pay Full Balance
                        </button>

                        <button
                          type="button"
                          disabled={working}
                          onClick={() => void collectPayment()}
                          className="h-10 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {working ? 'Working...' : 'Record Custom Payment'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    Payments are disabled in demo view.
                  </div>
                )}
              </div>
            </Section>
          ) : null}

          {events.length ? (
            <Section title="Timeline">
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {event.event_type || 'Activity'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {(event.created_at || '').slice(0, 19).replace('T', ' ')}
                    </div>
                    {event.note ? (
                      <div className="mt-1 text-sm text-slate-600">{event.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      </div>

      <Section title="Photos">
        <div className="grid gap-6 lg:grid-cols-2">
          <PhotoColumn title="Before" photos={beforePhotos} />

          <PhotoColumn title="After" photos={afterPhotos} />
        </div>

        {beforePhotos.length && afterPhotos.length ? (
          <div className="mt-6">
            <div className="mb-2 text-sm font-semibold text-slate-900">
              Before / after comparison
            </div>
            <div className="max-w-xl">
              <BeforeAfterSlider
                beforeUrl={beforePhotos[beforePhotos.length - 1].url}
                afterUrl={afterPhotos[afterPhotos.length - 1].url}
              />
            </div>
          </div>
        ) : null}

        {working ? (
          <div className="mt-4 text-sm text-slate-500">Working...</div>
        ) : null}
      </Section>

      {/* Shop's Jobs-Ledger view: show that the Rex repair is done + where it stands,
          WITHOUT the numeric score (kept admin-only, matching Rex's tech redaction). */}
      {role === 'shop' && (job.repair_scored_at || job.job_status === 'Completed') ? (
        <Section title="Repair status">
          {job.job_status === 'Completed' ? (
            <p className="text-sm font-medium text-emerald-700">
              Completed — this repair is closed out. Thanks!
            </p>
          ) : (
            <p className="text-sm text-slate-600">
              Repair completed and submitted for GlasWeld review. It'll be marked complete
              once reviewed.
            </p>
          )}
        </Section>
      ) : null}

      {/* Rex score stays admin-gated until trusted — not shown to the shop yet. */}
      {role !== 'shop' ? (
      <Section title="Rex repair score">
        {job.repair_score != null ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-3xl font-semibold text-slate-900">
                {job.repair_score}
                <span className="text-lg font-normal text-slate-400"> / 10</span>
              </div>
              <span className="text-xs text-slate-500">pass line 6</span>
              <ScoreStatusBadge status={job.repair_score_status} />
            </div>

            {job.repair_score_why ? (
              <p className="text-sm text-slate-600">{job.repair_score_why}</p>
            ) : null}

            {Array.isArray(job.repair_score_detail?.issues) &&
            job.repair_score_detail.issues.length ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Issues
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {job.repair_score_detail.issues.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {Array.isArray(job.repair_score_detail?.strengths) &&
            job.repair_score_detail.strengths.length ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Strengths
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                  {job.repair_score_detail.strengths.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {!isReadOnly ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void scoreRepair()}
                  disabled={scoring}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {scoring ? 'Scoring…' : 'Re-run'}
                </button>
                {role === 'admin' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void reviewScore('approve')}
                      disabled={job.repair_score_status === 'approved'}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void reviewScore('reject')}
                      disabled={job.repair_score_status === 'rejected'}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* The Rex repair is in — completing the job here records the platform fee
                (tech name is pre-filled by Rex, so the completion gate passes). */}
            {job.job_status !== 'Completed' ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span>Repair is in. Marking the job complete records the platform fee.</span>
                {!isReadOnly ? (
                  <button
                    type="button"
                    onClick={() => void markComplete()}
                    disabled={working}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Mark complete
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              {beforePhotos.length && afterPhotos.length
                ? 'Not scored yet. Run Rex to grade this repair from the before/after photos.'
                : 'Upload a before and an after photo to score this repair with Rex.'}
            </p>
            {!isReadOnly ? (
              <button
                type="button"
                onClick={() => void scoreRepair()}
                disabled={scoring || !(beforePhotos.length && afterPhotos.length)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {scoring ? 'Scoring…' : 'Run Rex score'}
              </button>
            ) : null}
          </div>
        )}
      </Section>
      ) : null}
    </div>
  );
}

function ScoreStatusBadge({ status }: { status: string | null | undefined }) {
  const s = status || 'pending';
  const styles: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${
        styles[s] || styles.pending
      }`}
    >
      {s}
    </span>
  );
}

function EditableTitle({
  value,
  isEditing,
  draftValue,
  setDraftValue,
  onEdit,
  onSave,
  onCancel,
  readOnly,
}: {
  value: string;
  isEditing: boolean;
  draftValue: string;
  setDraftValue: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  readOnly: boolean;
}) {
  if (readOnly) {
    return (
      <div className="text-3xl font-semibold text-slate-900">
        {value || 'Unnamed Job'}
      </div>
    );
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') onCancel();
        }}
        className="rounded border border-slate-300 px-3 py-2 text-3xl font-semibold"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className="rounded text-left text-3xl font-semibold text-slate-900 hover:bg-slate-100"
    >
      {value || 'Unnamed Job'}
    </button>
  );
}

function EditableField({
  label,
  value,
  field,
  editing,
  draftValue,
  setDraftValue,
  startEdit,
  saveDraftField,
  cancel,
  type = 'text',
  large = false,
  full = false,
  readOnly,
}: {
  label: string;
  value: string | null | undefined;
  field: string;
  editing: EditableTarget;
  draftValue: string;
  setDraftValue: (value: string) => void;
  startEdit: (field: string, value: string | null | undefined) => void;
  saveDraftField: (field: string) => void;
  cancel: () => void;
  type?: string;
  large?: boolean;
  full?: boolean;
  readOnly: boolean;
}) {
  const isEditing = editing?.field === field;

  if (readOnly) {
    return (
      <div className={full ? 'md:col-span-2' : ''}>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>
        <div className="mt-1 text-sm text-slate-900">{valueOrDash(value)}</div>
      </div>
    );
  }

  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>

      {isEditing ? (
        large ? (
          <textarea
            autoFocus
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => saveDraftField(field)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancel();
            }}
            className="mt-1 min-h-[90px] w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        ) : (
          <input
            autoFocus
            type={type}
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={() => saveDraftField(field)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') cancel();
            }}
            className="mt-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
        )
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => startEdit(field, value)}
            className="rounded px-1 py-1 text-left text-sm text-slate-900 hover:bg-slate-100"
          >
            {valueOrDash(value)}
          </button>
          <Pencil className="h-3.5 w-3.5 text-slate-400" />
        </div>
      )}
    </div>
  );
}

function EditableSelect({
  label,
  value,
  options,
  onSave,
  readOnly,
}: {
  label: string;
  value: string;
  options: string[];
  onSave: (value: string) => void;
  readOnly: boolean;
}) {
  if (readOnly) {
    return (
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {label}
        </div>
        <div className="mt-1 text-sm text-slate-900">{value || '—'}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>

      <select
        value={value || ''}
        onChange={(e) => onSave(e.target.value)}
        className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

// Color-code each job status so the Status card reads at a glance and the dropdown
// matches the rest of the metric cards instead of a raw native <select>.
const STATUS_TONES: Record<
  string,
  { dot: string; text: string; bg: string; border: string; ring: string }
> = {
  New: {
    dot: 'bg-slate-400', text: 'text-slate-700', bg: 'bg-slate-50',
    border: 'border-slate-200', ring: 'focus:ring-slate-300',
  },
  'In Progress': {
    dot: 'bg-amber-500', text: 'text-amber-800', bg: 'bg-amber-50',
    border: 'border-amber-200', ring: 'focus:ring-amber-300',
  },
  Submitted: {
    dot: 'bg-blue-500', text: 'text-blue-800', bg: 'bg-blue-50',
    border: 'border-blue-200', ring: 'focus:ring-blue-300',
  },
  Completed: {
    dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-50',
    border: 'border-emerald-200', ring: 'focus:ring-emerald-300',
  },
  Canceled: {
    dot: 'bg-rose-500', text: 'text-rose-800', bg: 'bg-rose-50',
    border: 'border-rose-200', ring: 'focus:ring-rose-300',
  },
};

function StatusStat({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  const tone = STATUS_TONES[value] ?? STATUS_TONES.New;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Status
      </div>

      {readOnly ? (
        <div className="mt-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${tone.border} ${tone.bg} ${tone.text}`}
          >
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
            {value}
          </span>
        </div>
      ) : (
        <div className="relative mt-3">
          <span
            className={`pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${tone.dot}`}
          />
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full cursor-pointer appearance-none rounded-xl border py-2.5 pl-8 pr-9 text-base font-semibold shadow-sm outline-none transition focus:ring-2 ${tone.border} ${tone.bg} ${tone.text} ${tone.ring}`}
          >
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status} className="bg-white font-medium text-slate-900">
                {status}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'green' | 'red';
}) {
  const color =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'red'
        ? 'text-rose-700'
        : 'text-slate-900';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-900">
        {valueOrDash(value)}
      </div>
    </div>
  );
}

function Quick({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-slate-900">
        {valueOrDash(value)}
      </div>
    </div>
  );
}

// An editable dollar amount (blur to save). Shows a read-only figure in demo/shop views.
function MoneyInput({
  label,
  value,
  onSave,
  readOnly,
  working,
}: {
  label: string;
  value: number;
  onSave: (v: number | null) => void;
  readOnly: boolean;
  working: boolean;
}) {
  const [draft, setDraft] = useState<string>(value ? String(value) : '');
  useEffect(() => {
    setDraft(value ? String(value) : '');
  }, [value]);

  if (readOnly) return <ComputedMoney label={label} value={value} />;

  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-2 focus-within:border-brand-500">
        <span className="text-slate-400">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={draft}
          disabled={working}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const t = draft.trim();
            const n = t === '' ? null : Number(t);
            if (n !== null && !Number.isFinite(n)) return;
            onSave(n);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="h-9 w-full border-0 bg-transparent px-1 text-sm outline-none focus:ring-0 disabled:opacity-60"
        />
      </div>
    </label>
  );
}

// A read-only derived money figure (customer-owes / paid / outstanding).
function ComputedMoney({
  label,
  value,
  tone,
  small,
  hint,
}: {
  label: string;
  value: number;
  tone?: 'green' | 'red' | 'brand';
  small?: boolean;
  hint?: string;
}) {
  const color =
    tone === 'green'
      ? 'text-emerald-700'
      : tone === 'red'
        ? 'text-rose-700'
        : tone === 'brand'
          ? 'text-brand-700'
          : 'text-slate-900';
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-1 font-semibold ${small ? 'text-base' : 'text-lg'} ${color}`}>
        {money(value)}
      </div>
      {hint ? <div className="text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

function PhotoColumn({
  title,
  photos,
}: {
  title: string;
  photos: any[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {photos.map((photo) => (
          <a
            key={photo.id}
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-slate-200 bg-white"
          >
            <img
              src={photo.url}
              className="h-40 w-full object-cover"
              alt={`${title} repair`}
            />
          </a>
        ))}

        {!photos.length ? (
          <div className="col-span-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No {title.toLowerCase()} photos yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
