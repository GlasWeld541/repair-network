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

    // keep job in sync (still needed for reporting)
    await supabase
      .from('jobs')
      .update({
        amount_paid: newPaid,
        amount_outstanding: newOutstanding,
        payment_status: paymentStatus,
      })
      .eq('id', job.id);

    setWorking(false);
    await loadPage();
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!job) return <div className="p-6">Job not found</div>;

  // 🔥 SINGLE SOURCE OF TRUTH
  const displayInvoiceAmount = invoice?.invoice_amount ?? job.invoice_amount;
  const displayPaid = invoice?.amount_paid ?? job.amount_paid;
  const displayOutstanding =
    Number(displayInvoiceAmount || 0) - Number(displayPaid || 0);

  return (
    <div className="space-y-6">
      <Link href="/jobs" className="flex items-center gap-2 text-sm text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      <h1 className="text-2xl font-semibold">{job.customer_name}</h1>

      {/* 🔥 FIXED SUMMARY */}
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
        <div><strong>Invoice:</strong> {money(displayInvoiceAmount)}</div>
        <div><strong>Paid:</strong> {money(displayPaid)}</div>
        <div><strong>Outstanding:</strong> {money(displayOutstanding)}</div>
      </div>

      {invoice ? (
        <div className="rounded-xl border bg-white p-6 space-y-5">

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-500">Invoice Status</div>
              <div className="mt-1 font-semibold">{invoice.status || 'Draft'}</div>
            </div>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-xs uppercase text-slate-500">Payment</div>
              <div className="mt-1 font-semibold">
                {invoice.payment_status || 'Not Ready'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-4 md:items-end">

              <div>
                <div className="text-xs uppercase text-slate-500">Invoice</div>
                <div className="mt-1 font-semibold">
                  {money(displayInvoiceAmount)}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase text-slate-500">Paid</div>
                <div className="mt-1 font-semibold">
                  {money(displayPaid)}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase text-slate-500">
                  Charge Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(Number(e.target.value))}
                  className="mt-1 h-10 w-full rounded border px-3"
                />
                <div className="text-xs mt-1">
                  Balance: {money(displayOutstanding)}
                </div>
              </div>

              <button
                onClick={() => void collectPayment()}
                className="h-10 rounded bg-emerald-600 text-white"
              >
                Charge
              </button>

            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}