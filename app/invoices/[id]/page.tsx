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

  useEffect(() => {
    loadData();
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

  if (loading) return <div className="p-6">Loading...</div>;
  if (!invoice) return <div className="p-6">Invoice not found</div>;

  const outstanding =
    Number(invoice.invoice_amount || 0) -
    Number(invoice.amount_paid || 0);

  return (
    <div className="bg-white min-h-screen p-10 print:p-6">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="flex justify-between items-start border-b pb-4">
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

        {/* ACCOUNT + CUSTOMER */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="font-semibold mb-2">From</h2>
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
            <h2 className="font-semibold mb-2">To</h2>
            <div>{invoice.customer_name}</div>
            <div className="text-sm text-gray-500">
              {invoice.customer_email || '—'}
            </div>
            <div className="text-sm text-gray-500">
              {invoice.customer_phone || '—'}
            </div>
          </div>
        </div>

        {/* JOB INFO */}
        <div className="border rounded-xl p-4 space-y-2">
          <h2 className="font-semibold">Job Details</h2>
          <div><strong>Vehicle:</strong> {invoice.vehicle}</div>
          <div><strong>VIN:</strong> {invoice.vin || '—'}</div>
          <div><strong>Damage:</strong> {invoice.damage_type || '—'}</div>
          <div><strong>Notes:</strong> {invoice.damage_notes || '—'}</div>
        </div>

        {/* INSURANCE */}
        <div className="border rounded-xl p-4 space-y-2">
          <h2 className="font-semibold">Insurance</h2>
          <div><strong>Carrier:</strong> {invoice.insurance_carrier || '—'}</div>
          <div><strong>Claim #:</strong> {invoice.claim_number || '—'}</div>
          <div><strong>Policy #:</strong> {invoice.policy_number || '—'}</div>
          <div><strong>Loss Date:</strong> {invoice.loss_date || '—'}</div>
        </div>

        {/* PHOTOS */}
        {photos.length > 0 && (
          <div className="border rounded-xl p-4 space-y-4">
            <h2 className="font-semibold">Repair Photos</h2>

            <div>
              <div className="font-semibold mb-2">Before</div>
              <div className="grid grid-cols-3 gap-2">
                {photos.filter(p => p.type === 'before').map(p => (
                  <img key={p.id} src={p.url} className="rounded" />
                ))}
              </div>
            </div>

            <div>
              <div className="font-semibold mb-2">After</div>
              <div className="grid grid-cols-3 gap-2">
                {photos.filter(p => p.type === 'after').map(p => (
                  <img key={p.id} src={p.url} className="rounded" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TOTALS */}
        <div className="border-t pt-4 space-y-2 text-lg">
          <div><strong>Total:</strong> {money(invoice.invoice_amount)}</div>
          <div><strong>Paid:</strong> {money(invoice.amount_paid)}</div>
          <div><strong>Outstanding:</strong> {money(outstanding)}</div>
        </div>

        {/* PRINT BUTTON */}
        <div>
          <button
            onClick={() => window.print()}
            className="bg-black text-white px-4 py-2 rounded"
          >
            Print / Save PDF
          </button>
        </div>

      </div>
    </div>
  );
}