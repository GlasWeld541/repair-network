'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type JobRow = {
  id: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string | null;
  damage_type: string | null;
  damage_notes: string | null;
  job_status: string | null;
  assigned_account_name: string | null;
  failure_reason: string | null;
  failure_notes: string | null;
  payment_status: string | null;
  billing_path: string | null;
  insurance_carrier: string | null;
  claim_number: string | null;
  policy_number: string | null;
  loss_date: string | null;
  invoice_amount: number | null;
  amount_paid: number | null;
  amount_outstanding: number | null;
  completed_at: string | null;
  invoice_date: string | null;
};

type JobPhoto = {
  id: string;
  created_at: string;
  job_id: string;
  photo_type: 'before' | 'after';
  file_path: string;
  file_url: string | null;
  uploaded_by_email: string | null;
};

const JOB_STATUSES = [
  'New',
  'Assigned',
  'Accepted',
  'Scheduled',
  'In Progress',
  'Repaired',
  'Could Not Repair',
  'Completed',
  'Declined',
  'Cancelled',
];

const PAYMENT_STATUSES = [
  'Unpaid',
  'Paid by Customer Card',
  'Cash Collected',
  'Check Collected',
  'Sent to Insurance',
  'Insurance Paid',
  'Denied',
  'Written Off',
];

const FAILURE_REASONS = [
  '',
  'Crack spread during repair',
  'Damage too large',
  'Edge crack',
  'Contamination',
  'Poor prior repair',
  'Customer declined after inspection',
  'Other',
];

function currency(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function parseAmount(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [job, setJob] = useState<JobRow | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<'before' | 'after' | null>(null);

  useEffect(() => {
    void loadJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadJob() {
    const [{ data: jobData }, { data: photoData }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('job_photos').select('*').eq('job_id', id).order('created_at', { ascending: false }),
    ]);

    setJob((jobData as JobRow) ?? null);
    setPhotos((photoData as JobPhoto[]) ?? []);
  }

  async function updateJob(patch: Partial<JobRow>) {
    if (!job) return;

    setSaving(true);

    const { error } = await supabase.from('jobs').update(patch).eq('id', job.id);

    setSaving(false);

    if (error) {
      window.alert('Could not update job.');
      return;
    }

    await loadJob();
  }

  async function uploadPhoto(photoType: 'before' | 'after', file: File | null) {
    if (!job || !file) return;

    setUploadingType(photoType);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const filePath = `${job.id}/${photoType}-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from('job-photos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      setUploadingType(null);
      window.alert(uploadError.message || 'Could not upload photo.');
      return;
    }

    const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(filePath);

    const { error: insertError } = await supabase.from('job_photos').insert({
      job_id: job.id,
      photo_type: photoType,
      file_path: filePath,
      file_url: urlData.publicUrl,
      uploaded_by_email: user?.email ?? null,
    });

    setUploadingType(null);

    if (insertError) {
      window.alert('Photo uploaded, but could not save photo record.');
      return;
    }

    await loadJob();
  }

  const beforePhotos = photos.filter((photo) => photo.photo_type === 'before');
  const afterPhotos = photos.filter((photo) => photo.photo_type === 'after');

  if (!job) {
    return <div className="p-6 text-slate-600">Loading job...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/jobs" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:text-teal-900">
          <ArrowLeft className="h-4 w-4" />
          Back to jobs
        </Link>

        <h1 className="text-3xl font-semibold text-slate-900">
          {job.customer_name || 'Job Detail'}
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          {job.assigned_account_name || 'Unassigned'} · Created {new Date(job.created_at).toLocaleDateString()}
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Job Details</h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer Name</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.customer_name || ''} onChange={(e) => setJob({ ...job, customer_name: e.target.value })} onBlur={(e) => void updateJob({ customer_name: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Phone</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.customer_phone || ''} onChange={(e) => setJob({ ...job, customer_phone: e.target.value })} onBlur={(e) => void updateJob({ customer_phone: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.customer_email || ''} onChange={(e) => setJob({ ...job, customer_email: e.target.value })} onBlur={(e) => void updateJob({ customer_email: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">ZIP</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.customer_zip || ''} onChange={(e) => setJob({ ...job, customer_zip: e.target.value })} onBlur={(e) => void updateJob({ customer_zip: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vehicle Year</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.vehicle_year || ''} onChange={(e) => setJob({ ...job, vehicle_year: e.target.value })} onBlur={(e) => void updateJob({ vehicle_year: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vehicle Make</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.vehicle_make || ''} onChange={(e) => setJob({ ...job, vehicle_make: e.target.value })} onBlur={(e) => void updateJob({ vehicle_make: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vehicle Model</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.vehicle_model || ''} onChange={(e) => setJob({ ...job, vehicle_model: e.target.value })} onBlur={(e) => void updateJob({ vehicle_model: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">VIN</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.vehicle_vin || ''} onChange={(e) => setJob({ ...job, vehicle_vin: e.target.value })} onBlur={(e) => void updateJob({ vehicle_vin: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Damage Type</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.damage_type || ''} onChange={(e) => setJob({ ...job, damage_type: e.target.value })} onBlur={(e) => void updateJob({ damage_type: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Job Status</span>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.job_status || 'New'} onChange={(e) => void updateJob({ job_status: e.target.value })}>
              {JOB_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Payment Status</span>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.payment_status || 'Unpaid'} onChange={(e) => void updateJob({ payment_status: e.target.value })}>
              {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date Completed</span>
            <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.completed_at || ''} onChange={(e) => void updateJob({ completed_at: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invoice Date</span>
            <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.invoice_date || ''} onChange={(e) => void updateJob({ invoice_date: e.target.value || null })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invoice Amount</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.invoice_amount ?? 0} onChange={(e) => setJob({ ...job, invoice_amount: parseAmount(e.target.value) })} onBlur={(e) => void updateJob({ invoice_amount: parseAmount(e.target.value) })} />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Amount Paid</span>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.amount_paid ?? 0} onChange={(e) => setJob({ ...job, amount_paid: parseAmount(e.target.value) })} onBlur={(e) => void updateJob({ amount_paid: parseAmount(e.target.value) })} />
          </label>

          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Outstanding</span>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-rose-700">
              {currency(job.amount_outstanding)}
            </div>
          </div>

          {job.job_status === 'Could Not Repair' ? (
            <>
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Failure Reason</span>
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2" value={job.failure_reason || ''} onChange={(e) => void updateJob({ failure_reason: e.target.value || null })}>
                  {FAILURE_REASONS.map((reason) => <option key={reason || 'empty'} value={reason}>{reason || 'Select reason'}</option>)}
                </select>
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Failure Notes</span>
                <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2" value={job.failure_notes || ''} onChange={(e) => setJob({ ...job, failure_notes: e.target.value })} onBlur={(e) => void updateJob({ failure_notes: e.target.value || null })} />
              </label>
            </>
          ) : null}

          <label className="space-y-1 md:col-span-2 xl:col-span-3">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Damage Notes</span>
            <textarea className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2" value={job.damage_notes || ''} onChange={(e) => setJob({ ...job, damage_notes: e.target.value })} onBlur={(e) => void updateJob({ damage_notes: e.target.value || null })} />
          </label>
        </div>

        {saving ? <p className="mt-4 text-sm text-slate-500">Saving...</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <PhotoSection
          title="Before Photos"
          type="before"
          photos={beforePhotos}
          uploadingType={uploadingType}
          onUpload={uploadPhoto}
        />

        <PhotoSection
          title="After Photos"
          type="after"
          photos={afterPhotos}
          uploadingType={uploadingType}
          onUpload={uploadPhoto}
        />
      </section>
    </div>
  );
}

function PhotoSection({
  title,
  type,
  photos,
  uploadingType,
  onUpload,
}: {
  title: string;
  type: 'before' | 'after';
  photos: JobPhoto[];
  uploadingType: 'before' | 'after' | null;
  onUpload: (type: 'before' | 'after', file: File | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <Upload className="h-4 w-4" />
          {uploadingType === type ? 'Uploading...' : 'Upload'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploadingType === type}
            onChange={(e) => onUpload(type, e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {photos.map((photo) => (
          <a
            key={photo.id}
            href={photo.file_url || '#'}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
          >
            {photo.file_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.file_url} alt={photo.photo_type} className="h-48 w-full object-cover" />
            ) : null}
            <div className="px-3 py-2 text-xs text-slate-500">
              {new Date(photo.created_at).toLocaleString()}
            </div>
          </a>
        ))}

        {!photos.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No {type} photos uploaded yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}
