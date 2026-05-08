'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, ExternalLink, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function statusColor(balance: number) {
  if (balance <= 0) {
    return 'text-emerald-700';
  }

  return 'text-amber-700';
}

export default function InvoicePage() {
  const params = useParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const isReadOnly = currentRole === 'demo';

  useEffect(() => {
    void loadData();
  }, [id]);

  async function loadData() {
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
      roleData.access_status !== 'Active'
    ) {
      window.location.href = '/login';
      return;
    }

    setCurrentRole(roleData.role);

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (invoiceData?.job_id) {
      const { data: photoData } = await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', invoiceData.job_id);

      setPhotos(photoData || []);
    }

    setInvoice(invoiceData);
    setLoading(false);
  }

  async function downloadPdf() {
    setDownloading(true);

    const response = await fetch(`/api/invoices/${id}/pdf`);

    if (!response.ok) {
      window.alert('Could not generate PDF.');
      setDownloading(false);
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoice?.invoice_number || 'invoice'}.pdf`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.URL.revokeObjectURL(url);

    setDownloading(false);
  }

  function openPdf() {
    window.location.href = `/api/invoices/${id}/pdf`;
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Loading invoice...
      </div>
    );
  }

  if (!invoice) {
    return <div className="p-6">Invoice not found</div>;
  }

  const outstanding =
    Number(invoice.invoice_amount || 0) -
    Number(invoice.amount_paid || 0);

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href="/jobs"
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to Jobs
            </Link>

            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              Invoice
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Claims-ready invoice and repair documentation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isReadOnly ? (
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-soft">
                <Eye className="h-4 w-4 text-slate-500" />

                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Demo View
                </div>
              </div>
            ) : null}

            <button
              onClick={() => void downloadPdf()}
              disabled={downloading}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800 disabled:opacity-60"
            >
              <Download className="h-4 w-4" />

              {downloading ? 'Generating...' : 'Download PDF'}
            </button>

            <button
              onClick={openPdf}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Open PDF
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                GlasWeld Repair Network
              </h2>

              <div className="mt-1 text-sm text-slate-500">
                Claims Control Platform
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-semibold text-slate-900">
                Invoice
              </div>

              <div className="mt-1 text-slate-600">
                {invoice.invoice_number}
              </div>

              <div className="mt-1 text-sm text-slate-500">
                {new Date(invoice.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                From
              </div>

              <div className="mt-3 space-y-1">
                <div className="font-semibold text-slate-900">
                  {invoice.account_name}
                </div>

                <div className="text-sm text-slate-600">
                  {invoice.account_email || '—'}
                </div>

                <div className="text-sm text-slate-600">
                  {invoice.account_phone || '—'}
                </div>

                <div className="text-sm text-slate-600">
                  {invoice.account_address || '—'}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                To
              </div>

              <div className="mt-3 space-y-1">
                <div className="font-semibold text-slate-900">
                  {invoice.customer_name}
                </div>

                <div className="text-sm text-slate-600">
                  {invoice.customer_email || '—'}
                </div>

                <div className="text-sm text-slate-600">
                  {invoice.customer_phone || '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-semibold text-slate-900">
                Job Details
              </h3>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <span className="font-semibold text-slate-900">
                    Vehicle:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.vehicle || '—'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-slate-900">
                    VIN:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.vin || '—'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-slate-900">
                    Damage:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.damage_type || '—'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-slate-900">
                    Notes:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.damage_notes || '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-semibold text-slate-900">
                Insurance
              </h3>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <span className="font-semibold text-slate-900">
                    Carrier:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.insurance_carrier || '—'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-slate-900">
                    Claim #:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.claim_number || '—'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-slate-900">
                    Policy #:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.policy_number || '—'}
                  </span>
                </div>

                <div>
                  <span className="font-semibold text-slate-900">
                    Loss Date:
                  </span>{' '}
                  <span className="text-slate-600">
                    {invoice.loss_date || '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {photos.length > 0 ? (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
              <h3 className="text-lg font-semibold text-slate-900">
                Repair Photos
              </h3>

              <div className="mt-6 space-y-8">
                <div>
                  <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Before
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {photos
                      .filter((photo) => photo.type === 'before')
                      .map((photo) => (
                        <img
                          key={photo.id}
                          src={photo.url}
                          className="rounded-2xl border border-slate-200 object-cover shadow-soft"
                          alt="Before repair"
                        />
                      ))}
                  </div>
                </div>

                <div>
                  <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    After
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {photos
                      .filter((photo) => photo.type === 'after')
                      .map((photo) => (
                        <img
                          key={photo.id}
                          src={photo.url}
                          className="rounded-2xl border border-slate-200 object-cover shadow-soft"
                          alt="After repair"
                        />
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Total
                </div>

                <div className="mt-2 text-3xl font-semibold text-slate-900">
                  {money(invoice.invoice_amount)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Paid
                </div>

                <div className="mt-2 text-3xl font-semibold text-emerald-700">
                  {money(invoice.amount_paid)}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Outstanding
                </div>

                <div
                  className={`mt-2 text-3xl font-semibold ${statusColor(
                    outstanding
                  )}`}
                >
                  {money(outstanding)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}