'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';

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

  const [job, setJob] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [chargeAmount, setChargeAmount] = useState<number>(0);

  useEffect(() => {
    void loadPage();
  }, [id]);

  useEffect(() => {
    if (invoice) {
      const balance =
        Number(invoice.invoice_amount || 0) - Number(invoice.amount_paid || 0);
      setChargeAmount(Number(balance.toFixed(2)));
    }
  }, [invoice]);

  async function loadPage() {
    setLoading(true);

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*')
      .eq('job_id', id)
      .maybeSingle();

    const { data: photoData } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', id);

    setJob(jobData);
    setInvoice(invoiceData);
    setPhotos(photoData || []);
    setLoading(false);
  }

  async function uploadPhoto(file: File, type: 'before' | 'after') {
    const path = `${id}/${Date.now()}-${file.name}`;

    const { error } = await supabase.storage
      .from('job-photos')
      .upload(path, file);

    if (error) {
      alert('Upload failed');
      return;
    }

    const { data } = supabase.storage.from('job-photos').getPublicUrl(path);

    await supabase.from('job_photos').insert({
      job_id: id,
      type,
      url: data.publicUrl,
    });

    void loadPage();
  }

  async function generateInvoice() {
    if (!job) return;

    setWorking(true);

    const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
      .filter(Boolean)
      .join(' ');

    const { data } = await supabase
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
        damage_type: job.damage_type,
        damage_notes: job.damage_notes,
        invoice_amount: job.invoice_amount || 0,
        amount_paid: job.amount_paid || 0,
        insurance_carrier: job.insurance_carrier,
        claim_number: job.claim_number,
        policy_number: job.policy_number,
        loss_date: job.loss_date,
      })
      .select('*')
      .single();

    setInvoice(data);
    setWorking(false);
  }

  async function submitToInsurance() {
    if (!invoice) return;

    setWorking(true);

    await supabase
      .from('invoices')
      .update({
        submission_status: 'Submitted',
        status: 'Sent',
      })
      .eq('id', invoice.id);

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Insurance Submitted',
      note: 'Marked as submitted. Email or EDI integration will be added later.',
    });

    setWorking(false);
    void loadPage();
  }

  async function collectPayment() {
    if (!invoice || !job) return;

    const amountToCharge = Number(chargeAmount || 0);

    if (amountToCharge <= 0) {
      alert('Enter a charge amount greater than $0.00.');
      return;
    }

    setWorking(true);

    const invoiceTotal = Number(invoice.invoice_amount || 0);
    const currentPaid = Number(invoice.amount_paid || 0);
    const newPaid = Number((currentPaid + amountToCharge).toFixed(2));
    const newOutstanding = Number(Math.max(invoiceTotal - newPaid, 0).toFixed(2));
    const paymentStatus = newOutstanding <= 0 ? 'Paid' : 'Partial Payment';

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
        amount_outstanding: newOutstanding,
        payment_status: paymentStatus,
      })
      .eq('id', job.id);

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Payment Recorded',
      note: `Payment recorded for ${money(amountToCharge)}. Gateway integration will be added later.`,
    });

    setWorking(false);
    void loadPage();
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!job) return <div className="p-6">Job not found</div>;

  const jobOutstanding =
    Number(job.invoice_amount || 0) - Number(job.amount_paid || 0);

  const invoiceOutstanding = invoice
    ? Number(invoice.invoice_amount || 0) - Number(invoice.amount_paid || 0)
    : jobOutstanding;

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="flex items-center gap-2 text-sm text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      <h1 className="text-2xl font-semibold">{job.customer_name}</h1>

      <div className="rounded-xl border bg-white p-6 space-y-2">
        <div><strong>Shop:</strong> {job.assigned_account_name}</div>
        <div><strong>Status:</strong> {job.job_status}</div>
        <div>
          <strong>Vehicle:</strong>{' '}
          {[job.vehicle_year, job.vehicle_make, job.vehicle_model]
            .filter(Boolean)
            .join(' ')}
        </div>
        <div><strong>Damage:</strong> {job.damage_type}</div>
        <div><strong>Invoice:</strong> {money(job.invoice_amount)}</div>
        <div><strong>Paid:</strong> {money(job.amount_paid)}</div>
        <div><strong>Outstanding:</strong> {money(jobOutstanding)}</div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold mb-4">Photos</h2>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold">Before</h3>
            <input
              type="file"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  void uploadPhoto(e.target.files[0], 'before');
                }
              }}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              {photos
                .filter((photo) => photo.type === 'before')
                .map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.url}
                    className="rounded"
                    alt="Before repair"
                  />
                ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold">After</h3>
            <input
              type="file"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  void uploadPhoto(e.target.files[0], 'after');
                }
              }}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              {photos
                .filter((photo) => photo.type === 'after')
                .map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.url}
                    className="rounded"
                    alt="After repair"
                  />
                ))}
            </div>
          </div>
        </div>
      </div>

      {!invoice ? (
        <button
          onClick={() => void generateInvoice()}
          disabled={working}
          className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-60"
        >
          {working ? 'Generating...' : 'Generate Invoice'}
        </button>
      ) : null}

      {invoice ? (
        <div className="rounded-xl border bg-white p-6 space-y-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                Invoice {invoice.invoice_number}
              </h2>
              <p className="text-sm text-slate-500">
                Customer, insurance, and payment actions for this job.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/invoices/${invoice.id}`}
                className="rounded bg-black px-4 py-2 text-sm text-white"
              >
                Open Invoice
              </Link>

              <Link
                href={`/api/invoices/${invoice.id}/pdf`}
                className="rounded border px-4 py-2 text-sm"
              >
                Open PDF
              </Link>

              <button
                type="button"
                disabled={working}
                onClick={() => void submitToInsurance()}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                Submit to Insurance
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

          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-4 md:items-end">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Invoice Amount
                </div>
                <div className="mt-1 font-semibold">
                  {money(invoice.invoice_amount)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Paid
                </div>
                <div className="mt-1 font-semibold">
                  {money(invoice.amount_paid)}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Charge Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded border border-slate-300 px-3 text-sm"
                />
                <div className="mt-1 text-xs text-slate-500">
                  Balance: {money(invoiceOutstanding)}
                </div>
              </div>

              <button
                type="button"
                disabled={working}
                onClick={() => void collectPayment()}
                className="h-10 rounded bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {working ? 'Working...' : 'Charge'}
              </button>
            </div>
          </div>

          <div>
            <strong>Customer:</strong> {invoice.customer_name}
          </div>
        </div>
      ) : null}
    </div>
  );
}