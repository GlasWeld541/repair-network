'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Pencil } from 'lucide-react';
import heic2any from 'heic2any';
import { supabase } from '@/lib/supabase';

const JOB_STATUSES = ['New', 'In Progress', 'Submitted', 'Completed', 'Canceled'];
const DAMAGE_TYPES = ['Combo Break', 'Bullseye', 'Star Break', 'Crack', 'Pit', 'Other'];

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

  const [role, setRole] = useState<string | null>(null);
  const [job, setJob] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [chargeAmount, setChargeAmount] = useState<number>(0);
  const [savedMessage, setSavedMessage] = useState('');

  const [editing, setEditing] = useState<EditableTarget>(null);
  const [draftValue, setDraftValue] = useState('');

  const isReadOnly = role === 'demo';

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

    setRole(roleData.role);

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

  async function updateJobField(field: string, value: string | number | null) {
    if (!job || isReadOnly) return;

    const { error } = await supabase
      .from('jobs')
      .update({ [field]: value === '' ? null : value })
      .eq('id', job.id);

    if (error) {
      window.alert(`Could not update job: ${error.message}`);
      return;
    }

    setJob({ ...job, [field]: value === '' ? null : value });
    flashSaved();
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

  async function uploadPhoto(file: File, type: 'before' | 'after') {
    if (isReadOnly) return;

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
        window.alert(`Upload failed: ${uploadError.message}`);
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
        window.alert(`Photo saved to storage, but could not attach to job: ${insertError.message}`);
        setWorking(false);
        return;
      }

      await loadPage();
      setWorking(false);
      flashSaved('Photo uploaded');
    } catch (err: any) {
      window.alert(`Upload error: ${err?.message || String(err)}`);
      setWorking(false);
    }
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
      window.alert('Could not generate invoice.');
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
      window.alert('Enter a charge amount greater than $0.00.');
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
        job_status: newOutstanding <= 0 ? 'Completed' : job.job_status,
      })
      .eq('id', job.id);

    await supabase.from('invoice_events').insert({
      invoice_id: invoice.id,
      event_type: 'Payment Recorded',
      note: `Payment recorded for ${money(amountToCharge)}. Gateway integration will be added later.`,
    });

    setWorking(false);
    await loadPage();
    flashSaved('Payment recorded');
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
  const latestEvent = events[0];

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
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

        {isReadOnly ? (
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Demo View Only
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <EditableTitle
            value={job.customer_name || ''}
            onEdit={() => startEdit('customer_name', job.customer_name)}
            isEditing={editing?.field === 'customer_name'}
            draftValue={draftValue}
            setDraftValue={setDraftValue}
            onSave={() => void saveDraftField('customer_name')}
            onCancel={() => setEditing(null)}
            readOnly={isReadOnly}
          />

          <p className="mt-1 text-sm text-slate-500">
            Job detail, photos, invoice, insurance submission, and payment tracking.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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

          {!isReadOnly ? (
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
              <Info label="Shop" value={job.assigned_account_name} />
              <EditableSelect
                label="Job Status"
                value={job.job_status || 'New'}
                options={JOB_STATUSES}
                onSave={(value) => void updateJobField('job_status', value)}
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
          <PhotoColumn
            title="Before"
            photos={beforePhotos}
            working={working}
            onUpload={(file) => uploadPhoto(file, 'before')}
            readOnly={isReadOnly}
          />

          <PhotoColumn
            title="After"
            photos={afterPhotos}
            working={working}
            onUpload={(file) => uploadPhoto(file, 'after')}
            readOnly={isReadOnly}
          />
        </div>

        {working ? (
          <div className="mt-4 text-sm text-slate-500">Working...</div>
        ) : null}
      </Section>
    </div>
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

function StatusStat({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Status
      </div>

      {readOnly ? (
        <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 rounded border border-slate-300 px-2 py-1 text-xl font-semibold text-slate-900"
        >
          {JOB_STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
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

function PhotoColumn({
  title,
  photos,
  working,
  onUpload,
  readOnly,
}: {
  title: string;
  photos: any[];
  working: boolean;
  onUpload: (file: File) => Promise<void>;
  readOnly: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold text-slate-900">{title}</h3>

        {!readOnly ? (
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
        ) : (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
            View Only
          </span>
        )}
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