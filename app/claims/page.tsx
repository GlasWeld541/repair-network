'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type ClaimIntake = {
  id: string;
  claim_number: string | null;
  policy_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  vehicle_year: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  loss_date: string | null;
  loss_city: string | null;
  loss_state: string | null;
  carrier_visible_status: string;
  created_at: string;
};

type ClaimForm = {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  claim_number: string;
  policy_number: string;
  loss_date: string;
  vehicle_year: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_vin: string;
  damage_type: string;
  damage_notes: string;
  loss_street: string;
  loss_city: string;
  loss_state: string;
  loss_postal_code: string;
  preferred_contact_method: string;
  notes: string;
};

const EMPTY_FORM: ClaimForm = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  claim_number: '',
  policy_number: '',
  loss_date: '',
  vehicle_year: '',
  vehicle_make: '',
  vehicle_model: '',
  vehicle_vin: '',
  damage_type: '',
  damage_notes: '',
  loss_street: '',
  loss_city: '',
  loss_state: '',
  loss_postal_code: '',
  preferred_contact_method: '',
  notes: '',
};

function statusClass(status: string) {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'Assigned' || status === 'In Progress') return 'border-brand-200 bg-brand-50 text-brand-700';
  if (status === 'Canceled') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function CarrierClaimsPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [claims, setClaims] = useState<ClaimIntake[]>([]);
  const [form, setForm] = useState<ClaimForm>(EMPTY_FORM);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email?.toLowerCase() || '';

    if (!email) {
      window.location.href = '/login';
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, approved, access_status, carrier_id')
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

    if (roleData.role === 'admin' || roleData.role === 'demo') {
      window.location.href = '/admin/claims';
      return;
    }

    if (roleData.role !== 'carrier' || !roleData.carrier_id) {
      window.location.href = '/';
      return;
    }

    const { data } = await supabase
      .from('claim_intakes')
      .select(
        'id, claim_number, policy_number, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, loss_date, loss_city, loss_state, carrier_visible_status, created_at'
      )
      .eq('carrier_id', roleData.carrier_id)
      .order('created_at', { ascending: false });

    setClaims((data as ClaimIntake[]) || []);
    setLoading(false);
  }

  function updateField(field: keyof ClaimForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitClaim() {
    if (!form.customer_name.trim()) {
      window.alert('Customer name is required.');
      return;
    }

    setSubmitting(true);
    setMessage('');

    const response = await fetch('/api/claims/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, source: 'manual' }),
    });

    const result = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      window.alert(result.error || 'Claim could not be submitted.');
      return;
    }

    setForm(EMPTY_FORM);
    setMessage(
      result.assigned
        ? 'Claim submitted and assigned.'
        : 'Claim submitted for routing review.'
    );
    await load();
  }

  const openClaims = useMemo(
    () => claims.filter((claim) => claim.carrier_visible_status !== 'Completed'),
    [claims]
  );

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading claims...</div>;

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Claims</h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit claims and view claim-facing status updates.
        </p>
      </div>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-semibold text-slate-900">Submit Claim</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={form.customer_name} onChange={(e) => updateField('customer_name', e.target.value)} placeholder="Customer name" className="h-11" />
          <input value={form.customer_phone} onChange={(e) => updateField('customer_phone', e.target.value)} placeholder="Customer phone" className="h-11" />
          <input value={form.customer_email} onChange={(e) => updateField('customer_email', e.target.value)} placeholder="Customer email" className="h-11" />
          <input value={form.claim_number} onChange={(e) => updateField('claim_number', e.target.value)} placeholder="Claim number" className="h-11" />
          <input value={form.policy_number} onChange={(e) => updateField('policy_number', e.target.value)} placeholder="Policy number" className="h-11" />
          <input type="date" value={form.loss_date} onChange={(e) => updateField('loss_date', e.target.value)} className="h-11" />
          <input value={form.vehicle_year} onChange={(e) => updateField('vehicle_year', e.target.value)} placeholder="Vehicle year" className="h-11" />
          <input value={form.vehicle_make} onChange={(e) => updateField('vehicle_make', e.target.value)} placeholder="Vehicle make" className="h-11" />
          <input value={form.vehicle_model} onChange={(e) => updateField('vehicle_model', e.target.value)} placeholder="Vehicle model" className="h-11" />
          <input value={form.vehicle_vin} onChange={(e) => updateField('vehicle_vin', e.target.value)} placeholder="VIN" className="h-11" />
          <input value={form.loss_street} onChange={(e) => updateField('loss_street', e.target.value)} placeholder="Loss street" className="h-11" />
          <input value={form.loss_city} onChange={(e) => updateField('loss_city', e.target.value)} placeholder="Loss city" className="h-11" />
          <input value={form.loss_state} onChange={(e) => updateField('loss_state', e.target.value.toUpperCase().slice(0, 2))} placeholder="State" className="h-11" />
          <input value={form.loss_postal_code} onChange={(e) => updateField('loss_postal_code', e.target.value)} placeholder="ZIP" className="h-11" />
          <input value={form.damage_type} onChange={(e) => updateField('damage_type', e.target.value)} placeholder="Damage type" className="h-11" />
          <input value={form.preferred_contact_method} onChange={(e) => updateField('preferred_contact_method', e.target.value)} placeholder="Preferred contact method" className="h-11" />
          <button type="button" disabled={submitting} onClick={() => void submitClaim()} className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-soft hover:bg-brand-700 disabled:opacity-60">
            {submitting ? 'Submitting...' : 'Submit Claim'}
          </button>
          <textarea value={form.damage_notes} onChange={(e) => updateField('damage_notes', e.target.value)} placeholder="Damage notes" className="min-h-24 xl:col-span-2" />
          <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Notes" className="min-h-24 xl:col-span-2" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Claim Status</h2>
          <div className="text-sm text-slate-500">{openClaims.length} open</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[950px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Claim</th>
                <th className="px-4 py-3">Policy</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Loss Area</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{claim.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{claim.customer_name}</td>
                  <td className="px-4 py-3">{claim.claim_number || '-'}</td>
                  <td className="px-4 py-3">{claim.policy_number || '-'}</td>
                  <td className="px-4 py-3">{[claim.vehicle_year, claim.vehicle_make, claim.vehicle_model].filter(Boolean).join(' ') || '-'}</td>
                  <td className="px-4 py-3">{[claim.loss_city, claim.loss_state].filter(Boolean).join(', ') || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(claim.carrier_visible_status)}`}>
                      {claim.carrier_visible_status}
                    </span>
                  </td>
                </tr>
              ))}
              {!claims.length ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No claims submitted yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
