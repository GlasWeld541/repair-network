'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function money(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export default function InvoicePage() {
  const params = useParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void loadData();
  }, [id]);

  async function loadData() {
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

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(`/api/invoices/${id}/pdf`, {
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
    });

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

  if (loading) return <div className="p-6">Loading...</div>;
  if (!invoice) return <div className="p-6">Invoice not found</div>;

  const outstanding =
    Number(invoice.invoice_amount || 0) -
    Number(invoice.amount_paid || 0);

  return (
    <div className="min-h-screen bg-white p-10 print:p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold">
              GlasWeld Repair Network
            </h1>
            <div className="text-sm text-gray-500">
              Claims Control Platform
            </div>
          </div>

          <div className="text-right">
            <div className="text-xl font-semibold">
              Invoice
            </div>
            <div className="text-gray-600">
              {invoice.invoice_number}
            </div>
            <div className="text-sm text-gray-500">
              {new Date(invoice.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-2 font-semibold">From</h2>
            <div>{invoice.account_name}</div>
            <div className="text-sm text-gray-500">
              {invoice.account_email || '—'}
            </div>
            <div className="text-sm text-gray-500">
              {invoice.account_phone || '—'}
            </div>
            <div className="text-sm text-gray-500">
              {invoice.account_address || '—'}
            </div>
          </div>

          <div>
            <h2 className="mb-2 font-semibold">To</h2>
            <div>{invoice.customer_name}</div>
            <div className="text-sm text-gray-500">
              {invoice.customer_email || '—'}
            </div>
            <div className="text-sm text-gray-500">
              {invoice.customer_phone || '—'}
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border p-4">
          <h2 className="font-semibold">Job Details</h2>
          <div><strong>Vehicle:</strong> {invoice.vehicle}</div>
          <div><strong>VIN:</strong> {invoice.vin || '—'}</div>
          <div><strong>Damage:</strong> {invoice.damage_type || '—'}</div>
          <div><strong>Notes:</strong> {invoice.damage_notes || '—'}</div>
        </div>

        <div className="space-y-2 rounded-xl border p-4">
          <h2 className="font-semibold">Insurance</h2>
          <div><strong>Carrier:</strong> {invoice.insurance_carrier || '—'}</div>
          <div><strong>Claim #:</strong> {invoice.claim_number || '—'}</div>
          <div><strong>Policy #:</strong> {invoice.policy_number || '—'}</div>
          <div><strong>Loss Date:</strong> {invoice.loss_date || '—'}</div>
        </div>

        {photos.length > 0 ? (
          <div className="space-y-4 rounded-xl border p-4">
            <h2 className="font-semibold">Repair Photos</h2>

            <div>
              <div className="mb-2 font-semibold">Before</div>
              <div className="grid grid-cols-3 gap-2">
                {photos.filter((photo) => photo.type === 'before').map((photo) => (
                  <img key={photo.id} src={photo.url} className="rounded" alt="Before repair" />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 font-semibold">After</div>
              <div className="grid grid-cols-3 gap-2">
                {photos.filter((photo) => photo.type === 'after').map((photo) => (
                  <img key={photo.id} src={photo.url} className="rounded" alt="After repair" />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 border-t pt-4 text-lg">
          <div><strong>Total:</strong> {money(invoice.invoice_amount)}</div>
          <div><strong>Paid:</strong> {money(invoice.amount_paid)}</div>
          <div><strong>Outstanding:</strong> {money(outstanding)}</div>
        </div>

        <div className="flex gap-3 print:hidden">
          <button
            onClick={() => void downloadPdf()}
            disabled={downloading}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {downloading ? 'Generating...' : 'Download PDF'}
          </button>

          <button
            onClick={() => window.print()}
            className="rounded border px-4 py-2"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}