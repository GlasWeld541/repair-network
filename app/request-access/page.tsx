'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function RequestAccessPage() {
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    company_name: '',
    company_type: 'Insurance Carrier',
    requested_role: 'carrier',
    phone: '',
    website: '',
    notes: '',
  });

  async function submitRequest() {
    if (!form.email.trim()) {
      window.alert('Email is required.');
      return;
    }

    setSaving(true);

    const { error } = await supabase.from('user_access_requests').insert({
      ...form,
      email: form.email.trim().toLowerCase(),
      status: 'Pending',
    });

    setSaving(false);

    if (error) {
      window.alert(`Could not submit request: ${error.message}`);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
          <h1 className="text-3xl font-semibold text-ink">Request received</h1>
          <p className="mt-3 text-slate-600">
            Your access request has been submitted. An administrator will review it before access is granted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
        <h1 className="text-3xl font-semibold text-ink">Request Access</h1>
        <p className="mt-2 text-sm text-slate-500">
          Tell us who you are and what type of access you need.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {[
            ['Name', 'name'],
            ['Email', 'email'],
            ['Company', 'company_name'],
            ['Phone', 'phone'],
            ['Website', 'website'],
          ].map(([label, key]) => (
            <label key={key} className="space-y-1">
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <input
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          ))}

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Company Type</span>
            <select
              value={form.company_type}
              onChange={(e) => setForm((c) => ({ ...c, company_type: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option>Insurance Carrier</option>
              <option>TPA</option>
              <option>Repair Shop</option>
              <option>Internal / Admin</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Requested Role</span>
            <select
              value={form.requested_role}
              onChange={(e) => setForm((c) => ({ ...c, requested_role: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="carrier">Carrier / TPA</option>
              <option value="shop">Repair Shop</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-700">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
              className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Tell us why you need access."
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submitRequest()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </div>
  );
}