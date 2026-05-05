'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import heic2any from 'heic2any';
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

function cleanFileName(fileName: string) {
  return fileName
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.\-_]/g, '')
    .toLowerCase();
}

function valueOrDash(value: string | null | undefined) {
  return value || '—';
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
      setChargeAmount(Number(Math.max(balance, 0).toFixed(2)));
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

  async function preparePhotoForUpload(file: File) {
    const fileName = file.name.toLowerCase();
    const isHeic =
      file.type === 'image/heic' ||
      file.type === 'image/heif' ||
      fileName.endsWith('.heic') ||
      fileName.endsWith('.heif');

    if (!isHeic) return file;

    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    });

    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;

    return new File(
      [convertedBlob],
      file.name.replace(/\.(heic|heif)$/i, '.jpg'),
      { type: 'image/jpeg' }
    );
  }

  async function uploadPhoto(file: File, type: 'before' | 'after') {
    try {
      setWorking(true);

      const uploadFile = await preparePhotoForUpload(file);
      const cleanName = cleanFileName(uploadFile.name || 'photo.jpg');
      const path = `${id}/${Date.now()}-${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(path, uploadFile, {
          contentType: uploadFile.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        alert(`Upload failed: ${uploadError.message}`);
        setWorking(false);
        return;
      }

      const { data } = supabase.storage.from('job-photos').getPublicUrl(path);

      const { error: insertError } = await supabase.from('job_photos').insert({
        job_id: id,
        type,
        url: data.publicUrl,
      });

      if (insertError) {
        alert(`Photo saved to storage, but could not attach to job: ${insertError.message}`);
        setWorking(false);
        return;
      }

      await loadPage();
      setWorking(false);
    } catch (err: any) {
      alert(`Upload error: ${err?.message || String(err)}`);
      setWorking(false);
    }
  }

  async function generateInvoice() {
    if (!job) return;

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

    if (error) {
      alert('Could not generate invoice.');
      setWorking(false);
      return;
    }

    setInvoice(data);
    setWorking(false);
    await loadPage();
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
    await loadPage();
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
        payment_status: paymentStatus,
      })
      .eq('id', job.id);

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Payment Recorded',
      note: `Payment recorded for ${money(amountToCharge)}. Gateway integration will be added later.`,
    });

    setWorking(false);
    await loadPage();
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading...</div>;
  if (!job) return <div className="p-6">Job not found</div>;

  const displayInvoiceAmount = invoice?.invoice_amount ?? job.invoice_amount;
  const displayPaid = invoice?.amount_paid ?? job.amount_paid;
  const displayOutstanding =
    Number(displayInvoiceAmount || 0) - Number(displayPaid || 0);

  const invoiceOutstanding = invoice
    ? Number(invoice.invoice_amount || 0) - Number(invoice.amount_paid || 0)
    : displayOutstanding;

  const vehicle = [job.vehicle_year, job.vehicle_make, job.vehicle_model]
    .filter(Boolean)
    .join(' ');

  const beforePhotos = photos.filter((photo) => photo.type === 'before');
  const afterPhotos = photos.filter((photo) => photo.type === 'after');

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <Link href="/jobs" className="inline-flex items-center gap-2 text-sm text-blue-600">
        <ArrowLeft className="h-4 w-4" />
        Back to Jobs
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">
            {valueOrDash(job.customer_name)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Job detail, photos, invoice, insurance submission, and payment tracking.
          </p>
        </div>

        {!invoice ? (
          <button
            onClick={() => void generateInvoice()}
            disabled={working}
            className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {working ? 'Generating...' : 'Generate Invoice'}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/invoices/${invoice.id}`}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open Invoice
            </Link>

            <Link
              href={`/api/invoices/${invoice.id}/pdf`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open PDF
            </Link>

            <button
              type="button"
              disabled={working}
              onClick={() => void submitToInsurance()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              Submit to Insurance
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Invoice" value={money(displayInvoiceAmount)} />
        <Stat label="Paid" value={money(displayPaid)} tone="green" />
        <Stat label="Outstanding" value={money(displayOutstanding)} tone="red" />
        <Stat label="Status" value={job.job_status || '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Job Information">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Shop" value={job.assigned_account_name} />
              <Info label="Job Status" value={job.job_status} />
              <Info label="Invoice Date" value={job.invoice_date} />
              <Info label="Damage Type" value={job.damage_type} />
              <Info label="Damage Notes" value={job.damage_notes} full />
            </div>
          </Section>

          <Section title="Customer & Vehicle">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Customer" value={job.customer_name} />
              <Info label="Customer Phone" value={job.customer_phone} />
              <Info label="Customer Email" value={job.customer_email} />
              <Info label="Vehicle" value={vehicle} />
              <Info label="VIN" value={job.vehicle_vin} />
            </div>
          </Section>

          <Section title="Insurance">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Carrier" value={job.insurance_carrier} />
              <Info label="Claim Number" value={job.claim_number} />
              <Info label="Policy Number" value={job.policy_number} />
              <Info label="Loss Date" value={job.loss_date} />
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

                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void collectPayment()}
                      className="h-10 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {working ? 'Working...' : 'Record Payment'}
                    </button>
                  </div>
                </div>
              </div>
            </Section>
          ) : null}
        </div>
      </div>

      <Section title="Photos">
        <div className="grid gap-6 lg:grid-cols-2">
          <PhotoColumn
            title="Before"
            photos={beforePhotos}
            working={working}
            onUpload={(file) => uploadPhoto(file, 'before')}
          />

          <PhotoColumn
            title="After"
            photos={afterPhotos}
            working={working}
            onUpload={(file) => uploadPhoto(file, 'after')}
          />
        </div>

        {working ? (
          <div className="mt-4 text-sm text-slate-500">Working...</div>
        ) : null}
      </Section>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Info({
  label,
  value,
  full = false,
}: {
  label: string;
  value: string | null | undefined;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
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

function PhotoColumn({
  title,
  photos,
  working,
  onUpload,
}: {
  title: string;
  photos: any[];
  working: boolean;
  onUpload: (file: File) => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold text-slate-900">{title}</h3>

        <label className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          Upload
          <input
            type="file"
            accept="image/*,.heic,.heif"
            disabled={working}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                void onUpload(e.target.files[0]);
                e.currentTarget.value = '';
              }
            }}
          />
        </label>
      </div>

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