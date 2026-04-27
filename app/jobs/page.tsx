'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function JobsPage() {
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    customer_zip: '',
    vehicle: '',
    damage_type: '',
  });

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  async function createJob() {
    setSaving(true);
    setSuccess('');

    const { error } = await supabase.from('jobs').insert({
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_email: form.customer_email,
      customer_zip: form.customer_zip,
      vehicle_year: '',
      vehicle_make: '',
      vehicle_model: form.vehicle,
      damage_type: form.damage_type,
    });

    setSaving(false);

    if (error) {
      alert('Error creating job');
      return;
    }

    setSuccess('Job created');

    setForm({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      customer_zip: '',
      vehicle: '',
      damage_type: '',
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Create Job</h1>

      <input
        placeholder="Customer Name"
        className="w-full border p-2"
        value={form.customer_name}
        onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
      />

      <input
        placeholder="Phone"
        className="w-full border p-2"
        value={form.customer_phone}
        onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
      />

      <input
        placeholder="Email"
        className="w-full border p-2"
        value={form.customer_email}
        onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
      />

      <input
        placeholder="ZIP Code"
        className="w-full border p-2"
        value={form.customer_zip}
        onChange={(e) => setForm({ ...form, customer_zip: e.target.value })}
      />

      <input
        placeholder="Vehicle (ex: 2020 Ford F150)"
        className="w-full border p-2"
        value={form.vehicle}
        onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
      />

      <input
        placeholder="Damage Type"
        className="w-full border p-2"
        value={form.damage_type}
        onChange={(e) => setForm({ ...form, damage_type: e.target.value })}
      />

      <button
        onClick={createJob}
        disabled={saving}
        className="bg-black text-white px-4 py-2"
      >
        {saving ? 'Saving...' : 'Create Job'}
      </button>

      {success && <p className="text-green-600">{success}</p>}
    </div>
  );
}
