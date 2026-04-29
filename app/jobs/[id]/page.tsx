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

  // 🔥 NEW
  const [chargeAmount, setChargeAmount] = useState<number>(0);

  useEffect(() => {
    void loadPage();
  }, [id]);

  useEffect(() => {
    if (invoice) {
      const outstanding =
        Number(invoice.invoice_amount || 0) -
        Number(invoice.amount_paid || 0);

      setChargeAmount(outstanding);
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

    const { data } = supabase.storage
      .from('job-photos')
      .getPublicUrl(path);

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

    setWorking(false);
    void loadPage();
  }

  async function collectPayment() {
    if (!invoice) return;

    setWorking(true);

    // 🔥 USE ENTERED AMOUNT
    const newPaid =
      Number(invoice.amount_paid || 0) + Number(chargeAmount || 0);

    await supabase
      .from('invoices')
      .update({
        amount_paid: newPaid,
        payment_status: 'Paid',
      })
      .eq('id', invoice.id);

    setWorking(false);
    void loadPage();
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!job) return <div className="p-6">Job not found</div>;

  const outstanding =
    Number(job.invoice_amount || 0) - Number(job.amount_paid || 0);

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
        <div><strong>Vehicle:</strong> {[job.vehicle_year, job.vehicle_make, job.vehicle_model].filter(Boolean).join(' ')}</div>
        <div><strong>Damage:</strong> {job.damage_type}</div>
        <div><strong>Invoice:</strong> {money(job.invoice_amount)}</div>
        <div><strong>Paid:</strong> {money(job.amount_paid)}</div>
        <div><strong>Outstanding:</strong> {money(outstanding)}</div>
      </div>

      {!invoice ? (
        <button
          onClick={() => void generateInvoice()}
          className="rounded bg-indigo-600 px-4 py-2 text-white"
        >
          Generate Invoice
        </button>
      ) : (
        <div className="rounded-xl border bg-white p-6 space-y-5">

          <h2 className="text-lg font-semibold">
            Invoice {invoice.invoice_number}
          </h2>

          {/* 🔥 NEW CHARGE INPUT */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Charge Amount:</label>
            <input
              type="number"
              value={chargeAmount}
              onChange={(e) => setChargeAmount(Number(e.target.value))}
              className="border rounded px-3 py-1 w-32"
            />
          </div>

          <div className="flex gap-2">
            <Link
              href={`/invoices/${invoice.id}`}
              className="bg-black text-white px-4 py-2 rounded"
            >
              Open Invoice
            </Link>

            <Link
              href={`/api/invoices/${invoice.id}/pdf`}
              className="border px-4 py-2 rounded"
            >
              Open PDF
            </Link>

            <button
              onClick={() => void submitToInsurance()}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Submit to Insurance
            </button>

            <button
              onClick={() => void collectPayment()}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Charge
            </button>
          </div>

          <div>
            <strong>Amount:</strong> {money(invoice.invoice_amount)}
          </div>
        </div>
      )}
    </div>
  );
}