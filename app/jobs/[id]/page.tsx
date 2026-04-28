'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  created_at: string;
  assigned_account_id: string | null;
  assigned_account_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_zip: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  job_status: string | null;
  failure_reason: string | null;
  failure_notes: string | null;
  payment_status: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  amount_outstanding: number | null;
  completed_at: string | null;
  invoice_date: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  loss_date: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  job_id: string;
  account_id: string | null;
  account_name: string | null;
  account_street: string | null;
  account_city: string | null;
  account_state: string | null;
  account_postal_code: string | null;
  account_email: string | null;
  account_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  vehicle: string | null;
  vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  status: string | null;
  payment_status: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  loss_date: string | null;
  submission_status: string | null;
  submission_method: string | null;
  gateway_provider: string | null;
  gateway_account_id: string | null;
  created_at: string;
};

type AccountRow = {
  id: string;
  account_name: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  company_email: string | null;
  company_phone: string | null;
};

type PaymentSettingsRow = {
  gateway_provider: string | null;
  gateway_account_id: string | null;
  insurance_submission_method: string | null;
};

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function invoiceNumber() {
  return `INV-${Date.now()}`;
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [job, setJob] = useState<JobRow | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadPage() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;

    const { data: shopUser } = await supabase
      .from('shop_users')
      .select('account_id')
      .eq('user_email', email)
      .maybeSingle();

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (shopUser?.account_id && jobData?.assigned_account_id !== shopUser.account_id) {
      setBlocked(true);
      setLoading(false);
      return;
    }

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*')
      .eq('job_id', id)
      .maybeSingle();

    setJob((jobData as JobRow) || null);
    setInvoice((invoiceData as InvoiceRow | null) || null);
    setLoading(false);
  }

  async function generateInvoice() {
    if (!job) return;

    setWorking(true);

    try {
      let account: AccountRow | null = null;
      let settings: PaymentSettingsRow | null = null;

      if (job.assigned_account_id) {
        const [{ data: accountData }, { data: settingsData }] = await Promise.all([
          supabase
            .from('accounts')
            .select('id, account_name, street, city, state, postal_code, company_email, company_phone')
            .eq('id', job.assigned_account_id)
            .maybeSingle(),
          supabase
            .from('account_payment_settings')
            .select('gateway_provider, gateway_account_id, insurance_submission_method')
            .eq('account_id', job.assigned_account_id)
            .maybeSingle(),
        ]);

        account = (accountData as AccountRow | null) || null;
        settings = (settingsData as PaymentSettingsRow | null) || null;
      }

      const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
        .filter(Boolean)
        .join(' ');

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber(),
          job_id: job.id,
          account_id: job.assigned_account_id,

          account_name: account?.account_name || job.assigned_account_name,
          account_street: account?.street || null,
          account_city: account?.city || null,
          account_state: account?.state || null,
          account_postal_code: account?.postal_code || null,
          account_email: account?.company_email || null,
          account_phone: account?.company_phone || null,

          customer_name: job.customer_name,
          customer_email: job.customer_email,
          customer_phone: job.customer_phone,

          vehicle,
          vin: job.vehicle_vin,
          damage_type: job.damage_type,
          damage_notes: job.damage_notes,

          invoice_amount: Number(job.invoice_amount || 0),
          amount_paid: Number(job.amount_paid || 0),

          insurance_carrier: job.insurance_carrier,
          claim_number: job.claim_number,
          policy_number: job.policy_number,
          loss_date: job.loss_date,

          submission_method: settings?.insurance_submission_method || 'Not Set',
          gateway_provider: settings?.gateway_provider || null,
          gateway_account_id: settings?.gateway_account_id || null,
        })
        .select('*')
        .single();

      if (error) {
        window.alert('Could not generate invoice.');
        return;
      }

      if (data?.id) {
        await supabase.from('invoice_events').insert({
          invoice_id: data.id,
          event_type: 'Created',
          note: 'Invoice generated from Job Detail screen.',
        });
      }

      setInvoice(data as InvoiceRow);
    } finally {
      setWorking(false);
    }
  }

  async function markSubmittedToInsurance() {
    if (!invoice) return;

    setWorking(true);

    await supabase
      .from('invoices')
      .update({
        submission_status: 'Submitted',
        status: invoice.status === 'Draft' ? 'Sent' : invoice.status,
      })
      .eq('id', invoice.id);

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Insurance Submitted',
      note: 'Marked as submitted. Email or EDI integration will be added later.',
    });

    setWorking(false);
    await loadPage();
  }

  async function startPaymentWorkflow() {
    if (!invoice) return;

    setWorking(true);

    await supabase
      .from('invoices')
      .update({
        payment_status: 'Payment Link Pending',
      })
      .eq('id', invoice.id);

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Payment Requested',
      note: 'Gateway placeholder triggered. Processor integration will be added later.',
    });

    setWorking(false);
    await loadPage();
  }

  if (loading) {
    return <div className="p-6 text-slate-600">Loading job...</div>;
  }

  if (blocked) {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <p className="mt-2 text-slate-500">
          You do not have permission to view this job.
        </p>
        <Link href="/jobs" className="mt-4 inline-block text-blue-600 underline">
          Back to Jobs
        </Link>
      </div>
    );
  }

  if (!job) {
    return <div className="p-6 text-slate-600">Job not found.</div>;
  }

  const outstanding = Number(job.invoice_amount || 0) - Number(job.amount_paid || 0);

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="flex items-center gap-2 text-sm text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{job.customer_name || 'Job'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {job.assigned_account_name || 'Unassigned'} · {job.job_status || 'No status'}
          </p>
        </div>

        {!invoice ? (
          <button
            type="button"
            disabled={working}
            onClick={() => void generateInvoice()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? 'Creating...' : 'Generate Invoice'}
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold">Job Summary</h2>
        <div><strong>Shop:</strong> {job.assigned_account_name || 'Unassigned'}</div>
        <div><strong>Status:</strong> {job.job_status || '—'}</div>
        <div><strong>Vehicle:</strong> {[job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ') || '—'}</div>
        <div><strong>VIN:</strong> {job.vehicle_vin || '—'}</div>
        <div><strong>Damage:</strong> {job.damage_type || '—'}</div>
        <div><strong>Notes:</strong> {job.damage_notes || '—'}</div>
        <div><strong>Invoice:</strong> {money(job.invoice_amount)}</div>
        <div><strong>Paid:</strong> {money(job.amount_paid)}</div>
        <div><strong>Outstanding:</strong> {money(outstanding)}</div>
      </div>

      {invoice ? (
        <div className="rounded-xl border bg-white p-6 space-y-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Invoice {invoice.invoice_number || ''}
              </h2>
              <p className="text-sm text-slate-500">
                Gateway and insurance delivery are stored per account and ready for future integration.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={working}
                onClick={() => void markSubmittedToInsurance()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Submit to Insurance
              </button>

              <button
                type="button"
                disabled={working}
                onClick={() => void startPaymentWorkflow()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Collect Payment
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Invoice Status
              </div>
              <div className="mt-1 font-semibold">{invoice.status || 'Draft'}</div>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Insurance
              </div>
              <div className="mt-1 font-semibold">
                {invoice.submission_status || 'Not Submitted'}
              </div>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Payment
              </div>
              <div className="mt-1 font-semibold">
                {invoice.payment_status || 'Not Ready'}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="font-semibold">Account / Shop Info</h3>
              <div>{invoice.account_name || '—'}</div>
              <div>{invoice.account_street || '—'}</div>
              <div>
                {[invoice.account_city, invoice.account_state, invoice.account_postal_code]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </div>
              <div>{invoice.account_phone || '—'}</div>
              <div>{invoice.account_email || '—'}</div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Insurance / Claim Info</h3>
              <div><strong>Carrier:</strong> {invoice.insurance_carrier || '—'}</div>
              <div><strong>Claim #:</strong> {invoice.claim_number || '—'}</div>
              <div><strong>Policy #:</strong> {invoice.policy_number || '—'}</div>
              <div><strong>Loss Date:</strong> {invoice.loss_date || '—'}</div>
              <div><strong>Submission Method:</strong> {invoice.submission_method || 'Not Set'}</div>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-4">
            <h3 className="font-semibold">Future Gateway Routing</h3>
            <p className="mt-1 text-sm text-slate-600">
              Gateway Provider: {invoice.gateway_provider || 'Not configured'} · Gateway Account: {invoice.gateway_account_id || 'Not configured'}
            </p>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Invoice Amount</h3>
            <div className="mt-2 text-2xl font-semibold">{money(invoice.invoice_amount)}</div>
            <div className="text-sm text-slate-500">
              Paid: {money(invoice.amount_paid)} · Unpaid:{' '}
              {money(Number(invoice.invoice_amount || 0) - Number(invoice.amount_paid || 0))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}